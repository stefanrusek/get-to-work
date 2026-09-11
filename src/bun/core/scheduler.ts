// Pure alert planning. The runtime loop (in index.ts) calls `dueAlerts` every second and records results in State.
import type { EventOccurrence } from "../calendar/types";
import { isAlertable } from "./filters";
import { isPaused, type Settings, type State } from "./settings";

export type AlertKind = "lead" | "start" | "snooze";

export interface PlannedAlert {
	occurrence: EventOccurrence;
	kind: AlertKind;
	alertAt: number;
}

export function firedKey(occurrenceKey: string, kind: AlertKind): string {
	return `${occurrenceKey}#${kind}`;
}

export function leadMinutesFor(ev: EventOccurrence, settings: Settings): number {
	return settings.overrides[ev.id]?.leadMinutes ?? settings.leadMinutes;
}

/**
 * Every alert that could still fire for the given events, in time order.
 * Excludes alerts already fired, occurrences dismissed (unless a snooze is pending), and ended events.
 */
export function planAlerts(events: EventOccurrence[], settings: Settings, state: State, now: number): PlannedAlert[] {
	const out: PlannedAlert[] = [];
	for (const ev of events) {
		if (ev.end <= now) continue;
		if (!isAlertable(ev, settings)) continue;

		const snoozeAt = state.snoozed[ev.key];
		if (snoozeAt !== undefined) {
			out.push({ occurrence: ev, kind: "snooze", alertAt: snoozeAt });
			continue; // a pending snooze supersedes lead/start alerts for this occurrence
		}
		if (state.dismissed[ev.key] !== undefined) continue;

		const lead = leadMinutesFor(ev, settings);
		const leadAt = ev.start - lead * 60_000;
		if (state.fired[firedKey(ev.key, "lead")] === undefined) {
			out.push({ occurrence: ev, kind: "lead", alertAt: leadAt });
		}
		if (settings.alertAtStart && lead > 0 && state.fired[firedKey(ev.key, "start")] === undefined) {
			out.push({ occurrence: ev, kind: "start", alertAt: ev.start });
		}
	}
	out.sort((a, b) => a.alertAt - b.alertAt || a.occurrence.start - b.occurrence.start);
	return out;
}

/** Alerts whose time has come. Empty while paused (callers should mark them fired to avoid a burst on resume). */
export function dueAlerts(planned: PlannedAlert[], now: number): PlannedAlert[] {
	return planned.filter((p) => p.alertAt <= now);
}

/** The next alert still in the future, for the menu bar countdown. */
export function nextAlert(planned: PlannedAlert[], now: number): PlannedAlert | null {
	return planned.find((p) => p.alertAt > now) ?? null;
}

/** Pick the single alert to display when several are due: the one whose event starts soonest. */
export function pickToShow(due: PlannedAlert[]): PlannedAlert | null {
	if (due.length === 0) return null;
	return [...due].sort((a, b) => a.occurrence.start - b.occurrence.start || a.alertAt - b.alertAt)[0] ?? null;
}

export interface TickResult {
	show: PlannedAlert | null;
	/** Alerts consumed this tick (to be marked fired), including ones suppressed while paused. */
	consumed: PlannedAlert[];
	paused: boolean;
}

/** One scheduler tick over precomputed events. Does not mutate state; caller applies `consumed`. */
export function tick(events: EventOccurrence[], settings: Settings, state: State, now: number): TickResult {
	const planned = planAlerts(events, settings, state, now);
	const due = dueAlerts(planned, now);
	const paused = isPaused(settings, now);
	if (paused) return { show: null, consumed: due, paused };
	const show = pickToShow(due);
	return { show, consumed: due, paused };
}

/** State mutations for user actions. All return new State objects. */
export const actions = {
	markFired(state: State, alerts: PlannedAlert[], now: number): State {
		const fired = { ...state.fired };
		const snoozed = { ...state.snoozed };
		for (const a of alerts) {
			fired[firedKey(a.occurrence.key, a.kind)] = now;
			if (a.kind === "snooze") delete snoozed[a.occurrence.key];
		}
		return { ...state, fired, snoozed };
	},
	dismiss(state: State, occurrenceKey: string, now: number): State {
		const snoozed = { ...state.snoozed };
		delete snoozed[occurrenceKey];
		return { ...state, snoozed, dismissed: { ...state.dismissed, [occurrenceKey]: now } };
	},
	snooze(state: State, occurrenceKey: string, minutes: number, now: number): State {
		const fired = { ...state.fired };
		delete fired[firedKey(occurrenceKey, "snooze")];
		return { ...state, fired, snoozed: { ...state.snoozed, [occurrenceKey]: now + minutes * 60_000 } };
	},
	/** Forget everything about an occurrence so it can alert again (used by "show next alert now"). */
	reset(state: State, occurrenceKey: string): State {
		const fired = { ...state.fired };
		for (const k of Object.keys(fired)) if (k.startsWith(`${occurrenceKey}#`)) delete fired[k];
		const snoozed = { ...state.snoozed };
		delete snoozed[occurrenceKey];
		const dismissed = { ...state.dismissed };
		delete dismissed[occurrenceKey];
		return { fired, snoozed, dismissed };
	},
};
