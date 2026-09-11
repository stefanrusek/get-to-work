// Settings window (single instance) backed by views://settings.
import { BrowserView, BrowserWindow, Utils } from "electrobun/main";
import type { SettingsRPCSchema, SettingsSnapshot } from "../../shared/settings-rpc";

export interface SettingsHost {
	snapshot(focusEventId: string | null): SettingsSnapshot;
	save(settings: SettingsSnapshot["settings"]): void;
	setOverride(p: { eventId: string; leadMinutes?: number | null; exclude?: boolean; title?: string }): void;
	removeOverride(eventId: string): void;
	requestAccess(): string;
	previewSound(path: string, volume: number): void;
	testAlert(): void;
}

let win: BrowserWindow | null = null;
let rpc: SettingsRpc | null = null;
let focusEventId: string | null = null;

type SettingsRpc = ReturnType<typeof BrowserView.defineRPC<SettingsRPCSchema>>;

function makeRpc(host: SettingsHost): SettingsRpc {
	return BrowserView.defineRPC<SettingsRPCSchema>({
		maxRequestTime: 10_000,
		handlers: {
			requests: {
				getSnapshot: () => host.snapshot(focusEventId),
				saveSettings: ({ settings }) => {
					host.save(settings);
					return host.snapshot(focusEventId);
				},
				setOverride: (p) => {
					host.setOverride(p);
					return host.snapshot(focusEventId);
				},
				removeOverride: ({ eventId }) => {
					host.removeOverride(eventId);
					return host.snapshot(focusEventId);
				},
				requestAccess: () => host.requestAccess(),
				previewSound: ({ path, volume }) => host.previewSound(path, volume),
				testAlert: () => host.testAlert(),
				pickSoundFile: async () => {
					const picked = await Utils.openFileDialog({
						allowsMultipleSelection: false,
						canChooseDirectories: false,
						canChooseFiles: true,
					} as never);
					return Array.isArray(picked) && picked.length > 0 ? (picked[0] as string) : null;
				},
				close: (): void => {
					win?.close();
				},
			},
			messages: {},
		},
	});
}

export function openSettings(host: SettingsHost, focus: string | null = null): void {
	focusEventId = focus;
	if (win) {
		try {
			win.activate();
			win.show();
			rpc?.send.snapshot(host.snapshot(focusEventId));
			return;
		} catch {
			win = null;
		}
	}
	rpc = makeRpc(host);
	win = new BrowserWindow({
		title: "Get To Work Settings",
		url: "views://settings/index.html",
		rpc,
		frame: { width: 720, height: 640, x: 200, y: 120 },
		styleMask: { Resizable: true },
	});
	win.on("close", () => {
		win = null;
		rpc = null;
	});
}

/** Push a fresh snapshot to an open settings window (e.g. after a sync). */
export function pushSettingsSnapshot(host: SettingsHost): void {
	if (win && rpc) rpc.send.snapshot(host.snapshot(focusEventId));
}

export function isSettingsOpen(): boolean {
	return win !== null;
}
