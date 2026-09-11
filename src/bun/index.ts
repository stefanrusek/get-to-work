// Get To Work main process: wires calendar sync, scheduler, alert windows, tray, sounds, and shortcuts.
import { Utils } from "electrobun/main";
import pkg from "../../package.json";
import { installFileLogger } from "./log";
import { CalendarService } from "./calendar/eventkit";
import type { EventOccurrence } from "./calendar/types";
import { actions, nextAlert, planAlerts, tick, type PlannedAlert } from "./core/scheduler";
import { isPaused, SettingsStore } from "./core/settings";
import { startDevCommandChannel } from "./dev-commands";
import { native, nativeLibraryPath } from "./native";
import { listSystemSounds, playSound } from "./sound";
import { closeAlert, currentAlert, debugWindows, isShowing, onAlertAction, openExternal, pressKey, showAlert } from "./ui/alert-windows";
import { isSettingsOpen, openSettings, pushSettingsSnapshot, type SettingsHost } from "./ui/settings-window";
import { applyShortcuts } from "./ui/shortcuts";
import { TrayController, type TrayAction } from "./ui/tray";
import type { AlertPayload } from "../shared/alert-rpc";
import type { SettingsSnapshot } from "../shared/settings-rpc";

const logFile = installFileLogger(Utils.paths.userLogs);
console.log(`[gtw] v${pkg.version} starting; native lib: ${nativeLibraryPath}; log: ${logFile}`);
Utils.setDockIconVisible(false);

const dataDir = Utils.paths.userData;
const store = new SettingsStore(dataDir);
console.log("[gtw] data dir:", dataDir);

const calendar = new CalendarService();
const tray = new TrayController(handleTrayAction);

// ---------- helpers ----------

function toPayload(ev: EventOccurrence): AlertPayload {
	return {
		occurrenceKey: ev.key,
		title: ev.title,
		start: ev.start,
		end: ev.end,
		location: ev.location,
		joinUrl: ev.joinUrl,
		joinProvider: ev.joinProvider,
		calendarColor: calendar.calendarColor(ev.calendarId),
		snoozePresets: store.settings.snoozePresets,
	};
}

function present(alert: PlannedAlert) {
	console.log(`[gtw] alert (${alert.kind}) for "${alert.occurrence.title}"`);
	showAlert(toPayload(alert.occurrence));
	if (store.settings.sound.enabled) playSound(store.settings.sound.path, store.settings.sound.volume);
}

function upcoming(now: number): EventOccurrence[] {
	return calendar.events.filter((e) => e.end > now && !e.allDay).slice(0, 8);
}

function refreshTray(now = Date.now()) {
	const planned = planAlerts(calendar.events, store.settings, store.state, now);
	tray.update({
		now,
		authStatus: calendar.authStatus(),
		nextAlert: nextAlert(planned, now),
		upcoming: upcoming(now),
		paused: isPaused(store.settings, now),
		pausedUntil: store.settings.pausedUntil,
		lastSync: calendar.lastSync,
	});
}

function pauseFor(minutes: number) {
	store.update((s) => {
		s.pausedUntil = minutes < 0 ? -1 : Date.now() + minutes * 60_000;
	});
	if (isShowing()) closeAlert();
	refreshTray();
}

function pauseUntilTomorrow() {
	const t = new Date();
	t.setDate(t.getDate() + 1);
	t.setHours(6, 0, 0, 0);
	store.update((s) => {
		s.pausedUntil = t.getTime();
	});
	if (isShowing()) closeAlert();
	refreshTray();
}

function resume() {
	store.update((s) => {
		s.pausedUntil = null;
	});
	refreshTray();
}

function showNextNow() {
	const now = Date.now();
	const planned = planAlerts(calendar.events, store.settings, store.state, now);
	const next = nextAlert(planned, now) ?? planned[0] ?? null;
	if (!next) {
		Utils.showNotification({ title: "Get To Work", body: "No upcoming alerts." });
		return;
	}
	present(next);
}

function showEventByKey(key: string) {
	const ev = calendar.events.find((e) => e.key === key);
	if (!ev) return;
	if (ev.joinUrl) openExternal(ev.joinUrl);
	else showAlert(toPayload(ev));
}

function testAlert() {
	const now = Date.now();
	showAlert({
		occurrenceKey: `test@${now}`,
		title: "Test alert – Design review",
		start: now + 60_000,
		end: now + 30 * 60_000,
		location: "https://zoom.us/j/123456789",
		joinUrl: "https://zoom.us/j/123456789",
		joinProvider: "Zoom",
		calendarColor: "#e11d48",
		snoozePresets: store.settings.snoozePresets,
	});
	if (store.settings.sound.enabled) playSound(store.settings.sound.path, store.settings.sound.volume);
}

const settingsHost: SettingsHost = {
	snapshot(focusEventId): SettingsSnapshot {
		const now = Date.now();
		return {
			settings: store.settings,
			calendars: calendar.calendars,
			authStatus: calendar.authStatus(),
			sounds: listSystemSounds(),
			version: pkg.version,
			upcoming: upcoming(now).map((e) => ({ key: e.key, id: e.id, title: e.title, start: e.start, end: e.end, joinUrl: e.joinUrl })),
			focusEventId,
		};
	},
	save(settings) {
		store.replace(settings);
	},
	setOverride({ eventId, leadMinutes, exclude, title }) {
		store.update((s) => {
			const o = { ...(s.overrides[eventId] ?? {}) };
			if (leadMinutes === null) delete o.leadMinutes;
			else if (typeof leadMinutes === "number") o.leadMinutes = leadMinutes;
			if (typeof exclude === "boolean") o.exclude = exclude;
			if (title) o.title = title;
			if (o.leadMinutes === undefined && !o.exclude) delete s.overrides[eventId];
			else s.overrides[eventId] = o;
		});
	},
	removeOverride(eventId) {
		store.update((s) => {
			delete s.overrides[eventId];
		});
	},
	requestAccess() {
		calendar.requestAccess();
		return calendar.authStatus();
	},
	previewSound(path, volume) {
		playSound(path, volume);
	},
	testAlert() {
		testAlert();
	},
};

function quit() {
	closeAlert();
	tray.remove();
	Utils.quit(0);
}

// ---------- event handlers ----------

function handleTrayAction(a: TrayAction) {
	switch (a.type) {
		case "grant-access":
			calendar.requestAccess();
			break;
		case "event":
			showEventByKey(a.key);
			break;
		case "show-next":
			showNextNow();
			break;
		case "pause":
			pauseFor(a.minutes);
			break;
		case "pause-until-tomorrow":
			pauseUntilTomorrow();
			break;
		case "resume":
			resume();
			break;
		case "sync":
			calendar.sync();
			refreshTray();
			break;
		case "settings":
			openSettings(settingsHost);
			break;
		case "test-alert":
			testAlert();
			break;
		case "quit":
			quit();
			break;
	}
}

onAlertAction((payload, action) => {
	const now = Date.now();
	const key = payload.occurrenceKey;
	console.log(`[gtw] alert action ${action.type}${action.type === "snooze" ? ` ${action.minutes}m` : ""} for "${payload.title}"`);
	switch (action.type) {
		case "dismiss":
			store.updateState((st) => Object.assign(st, actions.dismiss(st, key, now)));
			closeAlert();
			break;
		case "join":
			openExternal(action.url);
			store.updateState((st) => Object.assign(st, actions.dismiss(st, key, now)));
			closeAlert();
			break;
		case "snooze":
			store.updateState((st) => Object.assign(st, actions.snooze(st, key, action.minutes, now)));
			closeAlert();
			break;
		case "customize":
			closeAlert();
			openSettings(settingsHost, key.split("@")[0] ?? null);
			break;
	}
	refreshTray(now);
});

calendar.onChange(() => {
	refreshTray();
	if (isSettingsOpen()) pushSettingsSnapshot(settingsHost);
});
store.onChange((s) => {
	applyShortcuts(s.shortcuts, { showNext: showNextNow, togglePause: () => (isPaused(s, Date.now()) ? resume() : pauseFor(-1)) });
	refreshTray();
});

// ---------- loops ----------

function schedulerTick() {
	const now = Date.now();
	if (calendar.needsSync(now)) {
		calendar.sync(now);
	}
	const result = tick(calendar.events, store.settings, store.state, now);
	if (result.consumed.length > 0) {
		store.updateState((st) => Object.assign(st, actions.markFired(st, result.consumed, now)));
	}
	if (result.show) {
		const showing = currentAlert();
		// Don't replace an alert the user is looking at with one for a later event.
		if (!showing || result.show.occurrence.start <= (calendar.events.find((e) => e.key === showing.occurrenceKey)?.start ?? Infinity)) {
			present(result.show);
		}
	}
	// Auto-dismiss when the displayed event has ended.
	const showing = currentAlert();
	if (showing && store.settings.dismissWhenEventEnds && showing.end <= now && !showing.occurrenceKey.startsWith("test@")) {
		closeAlert();
	}
	// Auto-resume timed pauses.
	if (store.settings.pausedUntil !== null && store.settings.pausedUntil !== -1 && store.settings.pausedUntil <= now) {
		resume();
	}
}

setInterval(schedulerTick, 1000);
setInterval(() => refreshTray(), 30_000);

startDevCommandChannel(dataDir, (cmd) => {
	const now = Date.now();
	switch (cmd.action) {
		case "status":
			return {
				auth: calendar.authStatus(),
				events: calendar.events.length,
				calendars: calendar.calendars.map((c) => c.title),
				showing: currentAlert(),
				windows: debugWindows(),
				paused: isPaused(store.settings, now),
				next: nextAlert(planAlerts(calendar.events, store.settings, store.state, now), now)?.occurrence.title ?? null,
				dataDir,
			};
		case "events":
			return calendar.events.map((e) => ({ key: e.key, title: e.title, start: new Date(e.start).toISOString(), join: e.joinUrl }));
		case "sync":
			calendar.sync(now);
			refreshTray(now);
			return { events: calendar.events.length };
		case "grant-access":
			calendar.requestAccess();
			return calendar.authStatus();
		case "test-alert":
			testAlert();
			return "ok";
		case "close-alert":
			closeAlert();
			return "ok";
		case "alert-key":
			pressKey(String(cmd["key"] ?? "Escape"));
			return "ok";
		case "show-next":
			showNextNow();
			return "ok";
		case "pause":
			pauseFor(Number(cmd["minutes"] ?? -1));
			return store.settings.pausedUntil;
		case "resume":
			resume();
			return "ok";
		case "settings":
			return store.settings;
		case "open-settings":
			openSettings(settingsHost, (cmd["eventId"] as string | undefined) ?? null);
			return "ok";
		case "set":
			return store.replace({ ...store.settings, ...(cmd["settings"] as object) });
		case "state":
			return store.state;
		case "create-test-event": {
			const inMin = Number(cmd["inMinutes"] ?? 2);
			const start = now + inMin * 60_000;
			const r = native.createEvent({
				title: String(cmd["title"] ?? "GTW test meeting"),
				start,
				end: start + 15 * 60_000,
				location: cmd["location"] === undefined ? "https://zoom.us/j/123456789" : String(cmd["location"]),
				calendarId: cmd["calendarId"] as string | undefined,
				notes: cmd["notes"] as string | undefined,
				url: cmd["url"] as string | undefined,
			});
			calendar.sync(now);
			refreshTray(now);
			return r;
		}
		case "delete-event":
			return native.deleteEvent(String(cmd["id"]));
		case "reset-state":
			store.updateState((st) => Object.assign(st, { dismissed: {}, snoozed: {}, fired: {} }));
			return "ok";
		case "quit":
			quit();
			return "ok";
		default:
			return { error: `unknown action ${cmd.action}` };
	}
});

// ---------- startup ----------

applyShortcuts(store.settings.shortcuts, {
	showNext: showNextNow,
	togglePause: () => (isPaused(store.settings, Date.now()) ? resume() : pauseFor(-1)),
});

const status = calendar.authStatus();
console.log("[gtw] calendar auth:", status);
if (status === "notDetermined") {
	calendar.requestAccess();
} else {
	calendar.sync();
	console.log(`[gtw] synced ${calendar.events.length} events across ${calendar.calendars.length} calendars`);
}
refreshTray();
