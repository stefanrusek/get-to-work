// Single-binary installer: embeds Get To Work.app (tar.gz) and manages the LaunchAgent.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { APP_NAME, HELP, LABEL, launchAgentPlist, parseArgs, parseLaunchctlPrint, resolvePaths, type InstallPaths } from "./lib";
// @ts-ignore embedded at compile time by `bun build --compile`
import appTar from "../build/app.tar.gz" with { type: "file" };

const uid = process.getuid?.() ?? 501;
const domain = `gui/${uid}`;
const target = `${domain}/${LABEL}`;

async function run(cmd: string[], opts: { allowFail?: boolean; quiet?: boolean } = {}): Promise<{ code: number; out: string; err: string }> {
	const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	const code = await proc.exited;
	if (code !== 0 && !opts.allowFail) {
		throw new Error(`${cmd.join(" ")} failed (${code}): ${err.trim() || out.trim()}`);
	}
	return { code, out, err };
}

async function status(p: InstallPaths) {
	const r = await run(["launchctl", "print", target], { allowFail: true });
	return { installed: existsSync(p.appPath), agent: existsSync(p.launchAgentPlist), ...parseLaunchctlPrint(r.out, r.code) };
}

async function stop(p: InstallPaths) {
	await run(["launchctl", "bootout", target], { allowFail: true });
	await run(["pkill", "-f", p.appPath], { allowFail: true });
}

async function start(p: InstallPaths) {
	if (!existsSync(p.launchAgentPlist)) throw new Error(`Not installed (missing ${p.launchAgentPlist}). Run: get-to-work install`);
	await run(["launchctl", "bootout", target], { allowFail: true });
	await run(["launchctl", "bootstrap", domain, p.launchAgentPlist]);
	await run(["launchctl", "kickstart", "-k", target], { allowFail: true });
}

async function extractApp(p: InstallPaths) {
	mkdirSync(p.applicationsDir, { recursive: true });
	if (existsSync(p.appPath)) rmSync(p.appPath, { recursive: true, force: true });
	const bytes = new Uint8Array(await Bun.file(appTar).arrayBuffer());
	const proc = Bun.spawn(["tar", "-xzf", "-", "-C", p.applicationsDir], { stdin: bytes, stdout: "pipe", stderr: "pipe" });
	const err = await new Response(proc.stderr).text();
	if ((await proc.exited) !== 0) throw new Error(`tar failed: ${err}`);
	if (!existsSync(p.executable)) throw new Error(`Extraction did not produce ${p.executable}`);
	await run(["xattr", "-cr", p.appPath], { allowFail: true });
}

async function install(p: InstallPaths, noLaunch: boolean) {
	console.log(`Installing ${APP_NAME} v${pkg.version} to ${p.appPath}`);
	await stop(p);
	await extractApp(p);
	mkdirSync(p.launchAgentsDir, { recursive: true });
	mkdirSync(p.logsDir, { recursive: true });
	writeFileSync(p.launchAgentPlist, launchAgentPlist(p));
	console.log(`Registered login item: ${p.launchAgentPlist}`);
	if (noLaunch) {
		console.log("Installed. Start it with: get-to-work start");
		return;
	}
	await start(p);
	const s = await status(p);
	console.log(s.running ? `Running (pid ${s.pid}). Look for "GTW" in your menu bar.` : "Started via launchd; it should appear in your menu bar shortly.");
	console.log("On first launch macOS asks for Calendar access – click Allow so alerts can be scheduled.");
}

async function uninstall(p: InstallPaths, purge: boolean) {
	await stop(p);
	if (existsSync(p.launchAgentPlist)) rmSync(p.launchAgentPlist, { force: true });
	if (existsSync(p.appPath)) rmSync(p.appPath, { recursive: true, force: true });
	console.log(`Removed ${p.appPath} and the login item.`);
	if (purge) {
		for (const d of p.dataDirs) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
		console.log("Removed settings, cache, and logs.");
	} else {
		console.log("Settings kept. Use --purge to remove them too.");
	}
}

function logs(p: InstallPaths) {
	for (const f of [p.appLog, p.launchdLog]) {
		if (!existsSync(f)) continue;
		console.log(`==> ${f}`);
		const lines = readFileSync(f, "utf8").trimEnd().split("\n");
		console.log(lines.slice(-60).join("\n"));
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const p = resolvePaths();
	switch (args.command) {
		case "install":
			await install(p, args.noLaunch);
			break;
		case "uninstall":
			await uninstall(p, args.purge);
			break;
		case "start":
			await start(p);
			console.log("Started.");
			break;
		case "stop":
			await stop(p);
			console.log("Stopped.");
			break;
		case "restart":
			await stop(p);
			await start(p);
			console.log("Restarted.");
			break;
		case "status": {
			const s = await status(p);
			console.log(`app:        ${s.installed ? p.appPath : "not installed"}`);
			console.log(`login item: ${s.agent ? "registered" : "not registered"}`);
			console.log(`launchd:    ${s.loaded ? (s.running ? `running (pid ${s.pid})` : "loaded, not running") : "not loaded"}`);
			console.log(`logs:       ${join(p.logsDir, "")}`);
			break;
		}
		case "logs":
			logs(p);
			break;
		case "version":
			console.log(pkg.version);
			break;
		case "help":
			console.log(HELP);
			break;
	}
}

main().catch((err) => {
	console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
