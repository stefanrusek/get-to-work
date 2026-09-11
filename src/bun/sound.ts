// Alert sounds via /usr/bin/afplay (no webview autoplay restrictions, no extra assets).
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const SYSTEM_SOUNDS_DIR = "/System/Library/Sounds";

export interface SoundOption {
	name: string;
	path: string;
}

export function listSystemSounds(): SoundOption[] {
	if (!existsSync(SYSTEM_SOUNDS_DIR)) return [];
	return readdirSync(SYSTEM_SOUNDS_DIR)
		.filter((f) => [".aiff", ".aif", ".wav", ".mp3", ".m4a", ".caf"].includes(extname(f).toLowerCase()))
		.sort()
		.map((f) => ({ name: basename(f, extname(f)), path: join(SYSTEM_SOUNDS_DIR, f) }));
}

let lastProc: ReturnType<typeof Bun.spawn> | null = null;

export function playSound(path: string, volume = 1): void {
	if (!path || !existsSync(path)) {
		console.warn("[sound] missing file:", path);
		return;
	}
	try {
		lastProc?.kill();
	} catch {
		/* ignore */
	}
	try {
		lastProc = Bun.spawn(["/usr/bin/afplay", "-v", String(Math.max(0, Math.min(1, volume))), path], {
			stdout: "ignore",
			stderr: "ignore",
		});
	} catch (err) {
		console.error("[sound] afplay failed", err);
	}
}
