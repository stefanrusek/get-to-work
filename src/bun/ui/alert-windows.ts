// One screen-covering BrowserWindow per display, raised to screen-saver level via the native bridge.
import { BrowserView, BrowserWindow, Utils } from "electrobun/main";
import type { Pointer } from "bun:ffi";
import { native } from "../native";
import type { AlertPayload, AlertRPCSchema } from "../../shared/alert-rpc";

export type AlertAction =
	| { type: "dismiss" }
	| { type: "join"; url: string }
	| { type: "customize" }
	| { type: "snooze"; minutes: number };

type Listener = (payload: AlertPayload, action: AlertAction) => void;

interface AlertWindow {
	win: BrowserWindow<ReturnType<typeof makeRpc>>;
	rpc: ReturnType<typeof makeRpc>;
	screenIndex: number;
}

let windows: AlertWindow[] = [];
let current: AlertPayload | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function makeRpc() {
	return BrowserView.defineRPC<AlertRPCSchema>({
		maxRequestTime: 5000,
		handlers: {
			requests: {
				dismiss: () => {
					emit({ type: "dismiss" });
				},
				join: () => {
					if (current?.joinUrl) emit({ type: "join", url: current.joinUrl });
					else emit({ type: "dismiss" });
				},
				customize: () => {
					emit({ type: "customize" });
				},
				snooze: ({ minutes }) => {
					emit({ type: "snooze", minutes });
				},
			},
			messages: {},
		},
	});
}

function emit(action: AlertAction) {
	const payload = current;
	if (!payload) return;
	for (const l of listeners) {
		try {
			l(payload, action);
		} catch (err) {
			console.error("[alert] listener failed", err);
		}
	}
}

export function onAlertAction(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function isShowing(): boolean {
	return windows.length > 0;
}

export function currentAlert(): AlertPayload | null {
	return current;
}

function broadcast(fn: (rpc: ReturnType<typeof makeRpc>) => void) {
	for (const w of windows) {
		try {
			fn(w.rpc);
		} catch (err) {
			console.error("[alert] rpc send failed", err);
		}
	}
}

function createWindow(screenIndex: number, screen: { x: number; y: number; width: number; height: number }): AlertWindow {
	const rpc = makeRpc();
	const win = new BrowserWindow<ReturnType<typeof makeRpc>>({
		title: "Get To Work Alert",
		url: "views://alert/index.html",
		rpc,
		frame: { x: 0, y: 0, width: Math.max(400, screen.width), height: Math.max(300, screen.height) },
		titleBarStyle: "hiddenInset",
		styleMask: { Closable: false, Miniaturizable: false, Resizable: false },
		activate: true,
	});
	const ptr = win.ptr;
	if (ptr) {
		native.windowMakeAlert(ptr, screenIndex);
	} else {
		console.warn("[alert] window has no native pointer; falling back to Electrobun always-on-top");
		win.setAlwaysOnTop(true);
		win.setVisibleOnAllWorkspaces(true);
	}
	return { win, rpc, screenIndex };
}

/** Show (or replace the content of) the alert on every display. */
export function showAlert(payload: AlertPayload): void {
	current = payload;
	const screens = native.screens();
	const wanted = screens.length > 0 ? screens : [{ index: 0, x: 0, y: 0, width: 1280, height: 800 }];

	if (windows.length !== wanted.length) {
		closeWindowsOnly();
		windows = wanted.map((s) => createWindow(s.index, s));
	} else {
		for (const w of windows) {
			const p = w.win.ptr;
			if (p) native.windowFocus(p);
		}
	}

	// The view may still be loading; send now and again shortly after so both paths deliver.
	broadcast((rpc) => rpc.send.setAlert(payload));
	setTimeout(() => broadcast((rpc) => rpc.send.setAlert(payload)), 400);
	setTimeout(() => broadcast((rpc) => rpc.send.setAlert(payload)), 1500);

	if (!tickTimer) {
		tickTimer = setInterval(() => broadcast((rpc) => rpc.send.tick({ now: Date.now() })), 1000);
	}
}

function closeWindowsOnly() {
	for (const w of windows) {
		try {
			const p = w.win.ptr;
			if (p) native.windowMakeNormal(p);
			w.win.close();
		} catch (err) {
			console.error("[alert] close failed", err);
		}
	}
	windows = [];
}

export function closeAlert(): void {
	if (windows.length > 0) console.log("[alert] closing", windows.length, "window(s)");
	closeWindowsOnly();
	current = null;
	if (tickTimer) {
		clearInterval(tickTimer);
		tickTimer = null;
	}
}

/** Dev/automation: dispatch a key press to the alert views (only the first one acts, actions are global). */
export function pressKey(key: string): void {
	const first = windows[0];
	if (first) first.rpc.send.pressKey({ key });
}

export function debugWindows(): unknown[] {
	return windows.map((w) => {
		const p = w.win.ptr;
		return p ? { screenIndex: w.screenIndex, ...native.windowDebug(p) } : { screenIndex: w.screenIndex, ptr: null };
	});
}

export function openExternal(url: string): void {
	Utils.openExternal(url);
}

export type { Pointer };
