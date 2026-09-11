// Pure helpers for the installer (tested without touching the system).
import { homedir } from "node:os";
import { join } from "node:path";

export const APP_NAME = "Get To Work";
export const BUNDLE_ID = "ai.sugarmaple.get-to-work";
export const LABEL = BUNDLE_ID;

export interface InstallPaths {
	home: string;
	applicationsDir: string;
	appPath: string;
	executable: string;
	launchAgentsDir: string;
	launchAgentPlist: string;
	logsDir: string;
	launchdLog: string;
	appLog: string;
	dataDirs: string[];
}

export function resolvePaths(home = homedir()): InstallPaths {
	const applicationsDir = join(home, "Applications");
	const appPath = join(applicationsDir, `${APP_NAME}.app`);
	const logsDir = join(home, "Library", "Logs", BUNDLE_ID);
	return {
		home,
		applicationsDir,
		appPath,
		executable: join(appPath, "Contents", "MacOS", "launcher"),
		launchAgentsDir: join(home, "Library", "LaunchAgents"),
		launchAgentPlist: join(home, "Library", "LaunchAgents", `${LABEL}.plist`),
		logsDir,
		launchdLog: join(logsDir, "launchd.log"),
		appLog: join(logsDir, "stable", "gtw.log"),
		dataDirs: [
			join(home, "Library", "Application Support", BUNDLE_ID),
			join(home, "Library", "Caches", BUNDLE_ID),
			logsDir,
		],
	};
}

function xml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function launchAgentPlist(p: Pick<InstallPaths, "executable" | "launchdLog">): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${xml(p.executable)}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ProcessType</key>
	<string>Interactive</string>
	<key>LimitLoadToSessionType</key>
	<string>Aqua</string>
	<key>StandardOutPath</key>
	<string>${xml(p.launchdLog)}</string>
	<key>StandardErrorPath</key>
	<string>${xml(p.launchdLog)}</string>
</dict>
</plist>
`;
}

export interface LaunchctlStatus {
	loaded: boolean;
	running: boolean;
	pid: number | null;
}

/** Parse `launchctl print gui/<uid>/<label>` output. */
export function parseLaunchctlPrint(text: string, exitCode: number): LaunchctlStatus {
	if (exitCode !== 0) return { loaded: false, running: false, pid: null };
	const pidMatch = text.match(/^\s*pid\s*=\s*(\d+)/m);
	const stateMatch = text.match(/^\s*state\s*=\s*(\w+)/m);
	const pid = pidMatch ? Number(pidMatch[1]) : null;
	const running = stateMatch ? stateMatch[1] === "running" : pid !== null;
	return { loaded: true, running, pid };
}

export type Command = "install" | "uninstall" | "start" | "stop" | "restart" | "status" | "logs" | "version" | "help";

export interface ParsedArgs {
	command: Command;
	purge: boolean;
	noLaunch: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.filter((a) => a.length > 0);
	const flags = new Set(args.filter((a) => a.startsWith("-")));
	const positional = args.filter((a) => !a.startsWith("-"));
	let command: Command = "install";
	const first = positional[0];
	if (flags.has("--version") || flags.has("-v")) command = "version";
	else if (flags.has("--help") || flags.has("-h")) command = "help";
	else if (first) {
		const known: Command[] = ["install", "uninstall", "start", "stop", "restart", "status", "logs", "version", "help"];
		if (!known.includes(first as Command)) throw new Error(`Unknown command: ${first}`);
		command = first as Command;
	}
	return { command, purge: flags.has("--purge"), noLaunch: flags.has("--no-launch") };
}

export const HELP = `get-to-work – unmissable full-screen meeting alerts for macOS

Usage: get-to-work [command] [flags]

Commands:
  install      Install to ~/Applications, register at login, and start (default)
  uninstall    Stop, unregister, and delete the app   (--purge also removes settings & logs)
  start        Start the app now
  stop         Stop the app
  restart      Restart the app
  status       Show whether the app is installed and running
  logs         Print recent log lines
  version      Print the version

Flags:
  --no-launch  With install: don't start the app right away
  --purge      With uninstall: also delete settings, cache, and logs
`;
