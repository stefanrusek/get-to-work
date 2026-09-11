// Release pipeline: hutch build → patch Info.plist + ad-hoc sign → tar.gz → bun --compile installer.
// Usage: bun scripts/package-installer.ts [--skip-build]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";
import pkg from "../package.json";
import { patchBundle } from "./post-build";

const root = resolve(import.meta.dir, "..");
const appName = "Get To Work";
const stableDir = join(root, "build", "stable-macos-arm64");
const wrapperPath = join(stableDir, `${appName}.app`); // Electrobun self-extracting wrapper
const innerDir = join(root, "build", "inner");
const appPath = join(innerDir, `${appName}.app`); // the real app, extracted from the wrapper payload
const tarPath = join(root, "build", "app.tar.gz");
const distDir = join(root, "dist");
const outFile = join(distDir, "get-to-work");
const skipBuild = process.argv.includes("--skip-build");

function findPayload(dir: string): string | null {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const st = statSync(p);
		if (st.isDirectory()) {
			const r = findPayload(p);
			if (r) return r;
		} else if (entry.endsWith(".tar.zst")) {
			return p;
		}
	}
	return null;
}

const bunVersion = Bun.version;
const [maj, min, patch] = bunVersion.split(".").map(Number);
if ((maj ?? 0) < 1 || ((maj ?? 0) === 1 && ((min ?? 0) < 4 || ((min ?? 0) === 4 && (patch ?? 0) < 1)))) {
	throw new Error(`Bun ${bunVersion} produces invalid macOS signatures for --compile; use Bun >= 1.4.1 (see .bun-version)`);
}

process.env["PATH"] = `${join(homedir(), ".hutch", "bin")}:${process.env["PATH"] ?? ""}`;
process.chdir(root);

if (!skipBuild) {
	console.log("[release] building app bundle with hutch…");
	rmSync(join(root, ".hutch", "locks", "electrobun-build.lock"), { force: true });
	await $`hutch electrobun build --env=stable`;
}
if (!existsSync(wrapperPath)) throw new Error(`Missing ${wrapperPath}`);

// Electrobun ships a self-extracting wrapper: a launcher plus a <hash>.tar.zst payload holding the real bundle.
// We ship the real bundle ourselves so the Info.plist patch survives (the wrapper would overwrite it on first run).
const payload = findPayload(wrapperPath);
if (!payload) throw new Error(`No .tar.zst payload found inside ${wrapperPath}`);
console.log(`[release] extracting inner app from ${payload}`);
rmSync(innerDir, { recursive: true, force: true });
mkdirSync(innerDir, { recursive: true });
const zstd = join(wrapperPath, "Contents", "MacOS", "zig-zstd");
if (existsSync(zstd)) {
	await $`${zstd} -d ${payload} -o ${join(innerDir, "app.tar")}`.nothrow().quiet();
}
if (!existsSync(join(innerDir, "app.tar"))) {
	await $`zstd -dc ${payload} -o ${join(innerDir, "app.tar")}`;
}
await $`tar -xf ${join(innerDir, "app.tar")} -C ${innerDir}`;
rmSync(join(innerDir, "app.tar"), { force: true });
if (!existsSync(appPath)) throw new Error(`Payload did not contain ${appPath}`);

await patchBundle(appPath);

console.log("[release] archiving bundle…");
rmSync(tarPath, { force: true });
await $`tar -czf ${tarPath} -C ${innerDir} ${`${appName}.app`}`;

console.log("[release] compiling installer with Bun", bunVersion);
mkdirSync(distDir, { recursive: true });
rmSync(outFile, { force: true });
await $`${process.execPath} build --compile --minify --target=bun-darwin-arm64 ${join(root, "installer/index.ts")} --outfile ${outFile}`;

const verify = await $`codesign --verify --strict ${outFile}`.nothrow().quiet();
if (verify.exitCode !== 0) throw new Error(`installer signature invalid:\n${verify.stderr.toString()}`);

const sha = createHash("sha256").update(readFileSync(outFile)).digest("hex");
writeFileSync(`${outFile}.sha256`, `${sha}  get-to-work\n`);
const mb = (statSync(outFile).size / 1e6).toFixed(1);
console.log(`[release] ${outFile} (${mb} MB, v${pkg.version})\n[release] sha256 ${sha}`);
