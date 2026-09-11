// Dev/automation channel: drop a JSON line into <userData>/commands.jsonl and it is executed then truncated.
// Lets tests and scripts trigger tray actions without clicking the menu bar.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DevCommand {
	action: string;
	[k: string]: unknown;
}

export function startDevCommandChannel(dataDir: string, handler: (cmd: DevCommand) => unknown, intervalMs = 500): () => void {
	const file = join(dataDir, "commands.jsonl");
	const outFile = join(dataDir, "commands.out.jsonl");
	const timer = setInterval(() => {
		if (!existsSync(file)) return;
		let text = "";
		try {
			text = readFileSync(file, "utf8");
			if (!text.trim()) return;
			writeFileSync(file, "");
		} catch {
			return;
		}
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			let cmd: DevCommand;
			try {
				cmd = JSON.parse(line) as DevCommand;
			} catch {
				continue;
			}
			let result: unknown;
			try {
				result = handler(cmd);
			} catch (err) {
				result = { error: err instanceof Error ? err.message : String(err) };
			}
			try {
				writeFileSync(outFile, `${JSON.stringify({ at: Date.now(), cmd, result })}\n`, { flag: "a" });
			} catch {
				/* ignore */
			}
			console.log("[dev-cmd]", cmd.action, JSON.stringify(result ?? null).slice(0, 500));
		}
	}, intervalMs);
	return () => clearInterval(timer);
}
