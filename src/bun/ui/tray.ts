// Menu bar item: countdown title + upcoming events + pause/sync/settings/quit.
import { Tray, type MenuItemConfig } from "electrobun/main";
import type { EventOccurrence } from "../calendar/types";
import type { PlannedAlert } from "../core/scheduler";
import type { CalendarAuthStatus } from "../native";

export type TrayAction =
	| { type: "grant-access" }
	| { type: "event"; key: string }
	| { type: "show-next" }
	| { type: "pause"; minutes: number } // -1 = until resumed
	| { type: "pause-until-tomorrow" }
	| { type: "resume" }
	| { type: "sync" }
	| { type: "settings" }
	| { type: "test-alert" }
	| { type: "quit" };

export interface TrayModel {
	now: number;
	authStatus: CalendarAuthStatus;
	nextAlert: PlannedAlert | null;
	upcoming: EventOccurrence[];
	paused: boolean;
	pausedUntil: number | null;
	lastSync: number;
}

export function formatCountdown(ms: number): string {
	if (ms <= 0) return "now";
	const totalMin = Math.ceil(ms / 60_000);
	if (totalMin < 60) return `${totalMin}m`;
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
	const d = Math.floor(h / 24);
	return `${d}d`;
}

export function formatTime(ms: number): string {
	return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayLabel(ms: number, now: number): string {
	const d = new Date(ms);
	const n = new Date(now);
	const sameDay = d.toDateString() === n.toDateString();
	if (sameDay) return "";
	const tomorrow = new Date(n);
	tomorrow.setDate(n.getDate() + 1);
	if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow ";
	return `${d.toLocaleDateString([], { weekday: "short" })} `;
}

export function trayTitle(model: TrayModel): string {
	if (model.paused) return "⏸";
	if (model.authStatus !== "fullAccess") return "!";
	if (!model.nextAlert) return "";
	return formatCountdown(model.nextAlert.occurrence.start - model.now);
}

export function buildMenu(model: TrayModel): MenuItemConfig[] {
	const items: MenuItemConfig[] = [];
	if (model.authStatus !== "fullAccess") {
		items.push({
			type: "normal",
			label: model.authStatus === "notDetermined" ? "Grant calendar access…" : "Calendar access denied – open System Settings…",
			action: "grant-access",
		});
		items.push({ type: "divider" });
	}
	if (model.upcoming.length === 0) {
		items.push({ type: "normal", label: model.authStatus === "fullAccess" ? "No upcoming events" : "No calendar access", enabled: false });
	} else {
		for (const ev of model.upcoming.slice(0, 8)) {
			const started = ev.start <= model.now;
			const when = started ? "Now" : `${dayLabel(ev.start, model.now)}${formatTime(ev.start)}`;
			const join = ev.joinUrl ? "  ▶" : "";
			items.push({ type: "normal", label: `${when}  ${truncate(ev.title, 40)}${join}`, action: `event:${ev.key}` });
		}
	}
	items.push({ type: "divider" });
	items.push({ type: "normal", label: "Show next alert now", action: "show-next", enabled: model.nextAlert !== null });
	if (model.paused) {
		const until =
			model.pausedUntil === -1 || model.pausedUntil === null ? "until resumed" : `until ${formatTime(model.pausedUntil)}`;
		items.push({ type: "normal", label: `Resume alerts (paused ${until})`, action: "resume" });
	} else {
		items.push({
			type: "normal",
			label: "Pause alerts",
			submenu: [
				{ type: "normal", label: "For 30 minutes", action: "pause:30" },
				{ type: "normal", label: "For 1 hour", action: "pause:60" },
				{ type: "normal", label: "For 2 hours", action: "pause:120" },
				{ type: "normal", label: "Until tomorrow", action: "pause-until-tomorrow" },
				{ type: "normal", label: "Until I resume", action: "pause:-1" },
			],
		});
	}
	items.push({ type: "divider" });
	items.push({ type: "normal", label: "Sync now", action: "sync" });
	items.push({ type: "normal", label: "Test alert", action: "test-alert" });
	items.push({ type: "normal", label: "Settings…", action: "settings" });
	items.push({ type: "divider" });
	items.push({ type: "normal", label: "Quit Get To Work", action: "quit" });
	return items;
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function parseTrayAction(action: string | undefined): TrayAction | null {
	if (!action) return null;
	if (action.startsWith("event:")) return { type: "event", key: action.slice("event:".length) };
	if (action.startsWith("pause:")) return { type: "pause", minutes: Number(action.slice("pause:".length)) };
	switch (action) {
		case "grant-access":
		case "show-next":
		case "pause-until-tomorrow":
		case "resume":
		case "sync":
		case "settings":
		case "test-alert":
		case "quit":
			return { type: action };
	}
	return null;
}

export class TrayController {
	private tray: Tray;
	private lastTitle: string | null = null;
	private lastMenu = "";

	constructor(onAction: (a: TrayAction) => void) {
		this.tray = new Tray({ image: "views://icons/menubarTemplate.png", template: true, width: 18, height: 18 });
		this.tray.on("tray-clicked", (event: unknown) => {
			const e = event as { data?: { action?: string } };
			const a = parseTrayAction(e?.data?.action);
			if (a) onAction(a);
		});
	}

	update(model: TrayModel): void {
		const title = trayTitle(model);
		if (title !== this.lastTitle) {
			this.tray.setTitle(title ? ` ${title}` : "");
			this.lastTitle = title;
		}
		const menu = buildMenu(model);
		const sig = JSON.stringify(menu);
		if (sig !== this.lastMenu) {
			this.tray.setMenu(menu);
			this.lastMenu = sig;
		}
	}

	remove(): void {
		this.tray.remove();
	}
}
