// Settings + runtime state persisted as JSON. Pure helpers are exported for tests; IO lives in SettingsStore.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface EventOverride {
	leadMinutes?: number;
	exclude?: boolean;
	/** Cached for display in the settings UI. */
	title?: string;
}

export interface Settings {
	version: 1;
	leadMinutes: number;
	alertAtStart: boolean;
	snoozePresets: number[];
	dismissWhenEventEnds: boolean;
	calendars: {
		/** calendarId -> enabled. Calendars not listed follow `defaultEnabled`. */
		enabled: Record<string, boolean>;
		defaultEnabled: boolean;
	};
	filters: {
		skipAllDay: boolean;
		skipDeclined: boolean;
		skipTentative: boolean;
		skipCanceled: boolean;
		requireAttendees: boolean;
		requireJoinLink: boolean;
		includeKeywords: string[];
		excludeKeywords: string[];
	};
	sound: {
		enabled: boolean;
		path: string;
		volume: number; // 0..1
	};
	shortcuts: {
		showNext: string;
		togglePause: string;
	};
	overrides: Record<string, EventOverride>;
	/** null = not paused; -1 = paused until resumed; otherwise epoch ms. */
	pausedUntil: number | null;
}

export interface State {
	/** occurrenceKey -> dismissed at (epoch ms). */
	dismissed: Record<string, number>;
	/** occurrenceKey -> re-alert at (epoch ms). */
	snoozed: Record<string, number>;
	/** `${occurrenceKey}#${kind}` -> fired at (epoch ms). */
	fired: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
	version: 1,
	leadMinutes: 1,
	alertAtStart: false,
	snoozePresets: [1, 5],
	dismissWhenEventEnds: true,
	calendars: { enabled: {}, defaultEnabled: true },
	filters: {
		skipAllDay: true,
		skipDeclined: true,
		skipTentative: false,
		skipCanceled: true,
		requireAttendees: false,
		requireJoinLink: false,
		includeKeywords: [],
		excludeKeywords: [],
	},
	sound: { enabled: true, path: "/System/Library/Sounds/Glass.aiff", volume: 1 },
	shortcuts: { showNext: "Control+Alt+Command+N", togglePause: "Control+Alt+Command+P" },
	overrides: {},
	pausedUntil: null,
};

export const EMPTY_STATE: State = { dismissed: {}, snoozed: {}, fired: {} };

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge a possibly partial/invalid object onto defaults, keeping only known keys with matching types. */
export function normalizeSettings(input: unknown): Settings {
	const src = isObj(input) ? input : {};
	const num = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
		typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
	const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
	const str = (v: unknown, d: string) => (typeof v === "string" && v.length > 0 ? v : d);
	const strList = (v: unknown, d: string[]) =>
		Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : d;

	const cal = isObj(src["calendars"]) ? src["calendars"] : {};
	const enabledRaw = isObj(cal["enabled"]) ? cal["enabled"] : {};
	const enabled: Record<string, boolean> = {};
	for (const [k, v] of Object.entries(enabledRaw)) if (typeof v === "boolean") enabled[k] = v;

	const f = isObj(src["filters"]) ? src["filters"] : {};
	const s = isObj(src["sound"]) ? src["sound"] : {};
	const sc = isObj(src["shortcuts"]) ? src["shortcuts"] : {};
	const ovRaw = isObj(src["overrides"]) ? src["overrides"] : {};
	const overrides: Record<string, EventOverride> = {};
	for (const [k, v] of Object.entries(ovRaw)) {
		if (!isObj(v)) continue;
		const o: EventOverride = {};
		if (typeof v["leadMinutes"] === "number") o.leadMinutes = num(v["leadMinutes"], 1, 0, 24 * 60);
		if (typeof v["exclude"] === "boolean") o.exclude = v["exclude"];
		if (typeof v["title"] === "string") o.title = v["title"];
		overrides[k] = o;
	}
	const presetsRaw = Array.isArray(src["snoozePresets"]) ? src["snoozePresets"] : DEFAULT_SETTINGS.snoozePresets;
	const presets = presetsRaw.filter((x): x is number => typeof x === "number" && x > 0 && x <= 24 * 60);
	const pausedRaw = src["pausedUntil"];
	const pausedUntil = pausedRaw === -1 ? -1 : typeof pausedRaw === "number" && pausedRaw > 0 ? pausedRaw : null;

	return {
		version: 1,
		leadMinutes: num(src["leadMinutes"], DEFAULT_SETTINGS.leadMinutes, 0, 24 * 60),
		alertAtStart: bool(src["alertAtStart"], DEFAULT_SETTINGS.alertAtStart),
		snoozePresets: presets.length >= 1 ? presets.slice(0, 4) : [...DEFAULT_SETTINGS.snoozePresets],
		dismissWhenEventEnds: bool(src["dismissWhenEventEnds"], DEFAULT_SETTINGS.dismissWhenEventEnds),
		calendars: { enabled, defaultEnabled: bool(cal["defaultEnabled"], true) },
		filters: {
			skipAllDay: bool(f["skipAllDay"], DEFAULT_SETTINGS.filters.skipAllDay),
			skipDeclined: bool(f["skipDeclined"], DEFAULT_SETTINGS.filters.skipDeclined),
			skipTentative: bool(f["skipTentative"], DEFAULT_SETTINGS.filters.skipTentative),
			skipCanceled: bool(f["skipCanceled"], DEFAULT_SETTINGS.filters.skipCanceled),
			requireAttendees: bool(f["requireAttendees"], DEFAULT_SETTINGS.filters.requireAttendees),
			requireJoinLink: bool(f["requireJoinLink"], DEFAULT_SETTINGS.filters.requireJoinLink),
			includeKeywords: strList(f["includeKeywords"], []),
			excludeKeywords: strList(f["excludeKeywords"], []),
		},
		sound: {
			enabled: bool(s["enabled"], DEFAULT_SETTINGS.sound.enabled),
			path: str(s["path"], DEFAULT_SETTINGS.sound.path),
			volume: num(s["volume"], DEFAULT_SETTINGS.sound.volume, 0, 1),
		},
		shortcuts: {
			showNext: str(sc["showNext"], DEFAULT_SETTINGS.shortcuts.showNext),
			togglePause: str(sc["togglePause"], DEFAULT_SETTINGS.shortcuts.togglePause),
		},
		overrides,
		pausedUntil,
	};
}

export function normalizeState(input: unknown): State {
	const src = isObj(input) ? input : {};
	const numMap = (v: unknown) => {
		const out: Record<string, number> = {};
		if (isObj(v)) for (const [k, n] of Object.entries(v)) if (typeof n === "number") out[k] = n;
		return out;
	};
	return { dismissed: numMap(src["dismissed"]), snoozed: numMap(src["snoozed"]), fired: numMap(src["fired"]) };
}

/** Drop state entries older than `maxAgeMs` (default 24h) relative to `now`. Returns a new object. */
export function pruneState(state: State, now: number, maxAgeMs = 24 * 60 * 60 * 1000): State {
	const keep = (m: Record<string, number>, isFuture = false) => {
		const out: Record<string, number> = {};
		for (const [k, t] of Object.entries(m)) {
			if (isFuture ? t > now - maxAgeMs : now - t < maxAgeMs) out[k] = t;
		}
		return out;
	};
	return { dismissed: keep(state.dismissed), snoozed: keep(state.snoozed, true), fired: keep(state.fired) };
}

export function isPaused(settings: Settings, now: number): boolean {
	if (settings.pausedUntil === null) return false;
	if (settings.pausedUntil === -1) return true;
	return settings.pausedUntil > now;
}

function readJson(path: string): unknown {
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		console.warn(`[settings] failed to read ${path}:`, err);
		return null;
	}
}

function writeJsonAtomic(path: string, value: unknown) {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(value, null, 2));
	renameSync(tmp, path);
}

export class SettingsStore {
	readonly settingsPath: string;
	readonly statePath: string;
	settings: Settings;
	state: State;
	private listeners = new Set<(s: Settings) => void>();

	constructor(dir: string) {
		this.settingsPath = join(dir, "settings.json");
		this.statePath = join(dir, "state.json");
		this.settings = normalizeSettings(readJson(this.settingsPath));
		this.state = normalizeState(readJson(this.statePath));
	}

	onChange(fn: (s: Settings) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	update(mutate: (s: Settings) => void): Settings {
		const next = normalizeSettings(structuredClone(this.settings));
		mutate(next);
		this.settings = normalizeSettings(next);
		writeJsonAtomic(this.settingsPath, this.settings);
		for (const l of this.listeners) l(this.settings);
		return this.settings;
	}

	replace(raw: unknown): Settings {
		return this.update((s) => Object.assign(s, normalizeSettings(raw)));
	}

	updateState(mutate: (st: State) => void): State {
		mutate(this.state);
		this.state = pruneState(this.state, Date.now());
		writeJsonAtomic(this.statePath, this.state);
		return this.state;
	}
}
