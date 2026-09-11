// Mirrors console output to <userLogs>/gtw.log because release builds discard stdout.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_BYTES = 1_000_000;

export function installFileLogger(dir: string): string {
	const file = join(dir, "gtw.log");
	try {
		mkdirSync(dir, { recursive: true });
	} catch {
		/* ignore */
	}
	const write = (level: string, args: unknown[]) => {
		try {
			if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
			const line = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.stack ?? a.message : JSON.stringify(a))).join(" ");
			appendFileSync(file, `${new Date().toISOString()} ${level} ${line}\n`);
		} catch {
			/* ignore */
		}
	};
	for (const level of ["log", "info", "warn", "error"] as const) {
		const orig = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			orig(...args);
			write(level.toUpperCase(), args);
		};
	}
	process.on("uncaughtException", (err) => write("FATAL", [err]));
	process.on("unhandledRejection", (err) => write("FATAL", [err as Error]));
	return file;
}
