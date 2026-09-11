import { describe, expect, test } from "bun:test";
import { launchAgentPlist, parseArgs, parseLaunchctlPrint, resolvePaths } from "../installer/lib";

describe("installer lib", () => {
	test("resolvePaths lays out under the home dir", () => {
		const p = resolvePaths("/Users/x");
		expect(p.appPath).toBe("/Users/x/Applications/Get To Work.app");
		expect(p.executable).toBe("/Users/x/Applications/Get To Work.app/Contents/MacOS/launcher");
		expect(p.launchAgentPlist).toBe("/Users/x/Library/LaunchAgents/ai.sugarmaple.get-to-work.plist");
		expect(p.dataDirs).toHaveLength(3);
	});

	test("launch agent plist is valid and escapes paths", () => {
		const xml = launchAgentPlist({ executable: "/a/b & c/launcher", launchdLog: "/l/<x>.log" });
		expect(xml).toContain("<string>ai.sugarmaple.get-to-work</string>");
		expect(xml).toContain("<string>/a/b &amp; c/launcher</string>");
		expect(xml).toContain("<string>/l/&lt;x&gt;.log</string>");
		expect(xml).toContain("<key>RunAtLoad</key>\n\t<true/>");
	});

	test("parseLaunchctlPrint", () => {
		expect(parseLaunchctlPrint("", 113)).toEqual({ loaded: false, running: false, pid: null });
		const out = "gui/501/ai.sugarmaple.get-to-work = {\n\tactive count = 1\n\tpath = /x\n\tstate = running\n\n\tpid = 4242\n}";
		expect(parseLaunchctlPrint(out, 0)).toEqual({ loaded: true, running: true, pid: 4242 });
		expect(parseLaunchctlPrint("state = not running\n", 0)).toEqual({ loaded: true, running: false, pid: null });
	});

	test("parseArgs", () => {
		expect(parseArgs([])).toEqual({ command: "install", purge: false, noLaunch: false });
		expect(parseArgs(["uninstall", "--purge"])).toEqual({ command: "uninstall", purge: true, noLaunch: false });
		expect(parseArgs(["--version"]).command).toBe("version");
		expect(parseArgs(["install", "--no-launch"]).noLaunch).toBe(true);
		expect(() => parseArgs(["bogus"])).toThrow(/Unknown command/);
	});
});
