// postBuild hook: add TCC usage strings + agent-app keys to Info.plist, then ad-hoc re-sign the bundle.
// Runs with ELECTROBUN_BUILD_DIR / ELECTROBUN_APP_NAME set by hutch. Safe no-op when no bundle is found.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { appendFileSync } from "node:fs";

function log(msg: string) {
	console.log(msg);
	try {
		appendFileSync(join(process.cwd(), "build", "post-build.log"), `${new Date().toISOString()} ${msg}\n`);
	} catch {
		/* ignore */
	}
}

const buildDir = process.env["ELECTROBUN_BUILD_DIR"] ?? join(process.cwd(), "build");
const appName = process.env["ELECTROBUN_APP_NAME"] ?? "Get To Work";

function findApps(dir: string, depth = 0): string[] {
	if (!existsSync(dir) || depth > 4) return [];
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		let st;
		try {
			st = statSync(p);
		} catch {
			continue;
		}
		if (!st.isDirectory()) continue;
		if (entry.endsWith(".app")) out.push(p);
		else out.push(...findApps(p, depth + 1));
	}
	return out;
}

const PLIST_KEYS: Record<string, { type: "string" | "bool"; value: string }> = {
	NSCalendarsFullAccessUsageDescription: {
		type: "string",
		value: `${appName} reads your calendar so it can show full-screen alerts before meetings.`,
	},
	NSCalendarsUsageDescription: {
		type: "string",
		value: `${appName} reads your calendar so it can show full-screen alerts before meetings.`,
	},
	NSRemindersFullAccessUsageDescription: {
		type: "string",
		value: `${appName} can alert you when timed reminders are due.`,
	},
	LSUIElement: { type: "bool", value: "true" },
	LSMinimumSystemVersion: { type: "string", value: "14.0" },
	NSSupportsAutomaticTermination: { type: "bool", value: "false" },
	NSSupportsSuddenTermination: { type: "bool", value: "false" },
};

export async function patchBundle(appPath: string) {
	const plist = join(appPath, "Contents", "Info.plist");
	if (!existsSync(plist)) throw new Error(`No Info.plist at ${plist}`);
	for (const [key, { type, value }] of Object.entries(PLIST_KEYS)) {
		const exists = (await $`/usr/libexec/PlistBuddy -c ${`Print :${key}`} ${plist}`.quiet().nothrow()).exitCode === 0;
		if (exists) {
			await $`/usr/libexec/PlistBuddy -c ${`Set :${key} ${value}`} ${plist}`.quiet();
		} else {
			await $`/usr/libexec/PlistBuddy -c ${`Add :${key} ${type} ${value}`} ${plist}`.quiet();
		}
	}
	// Ad-hoc sign every nested Mach-O then the bundle so the resource seal matches the patched plist.
	await $`codesign --force --deep --sign - ${appPath}`.quiet();
	const verify = await $`codesign --verify --deep --strict ${appPath}`.quiet().nothrow();
	if (verify.exitCode !== 0) {
		throw new Error(`codesign verify failed for ${appPath}:\n${verify.stderr.toString()}`);
	}
	log(`[post-build] patched Info.plist and ad-hoc signed ${appPath}`);
}

if (import.meta.main) {
	log(`[post-build] env=${process.env["ELECTROBUN_BUILD_ENV"]} buildDir=${buildDir} wrapper=${process.env["ELECTROBUN_WRAPPER_BUNDLE_PATH"] ?? "-"}`);
	const apps = findApps(buildDir).filter((p) => p.includes(appName) || p.endsWith(`${appName}.app`));
	log(`[post-build] found: ${apps.join(", ") || "(none)"}`);
	if (apps.length === 0) {
		log(`[post-build] no ${appName}.app found under ${buildDir}; skipping`);
	} else {
		for (const app of apps) await patchBundle(app);
	}
}
