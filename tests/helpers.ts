import type { EventOccurrence } from "../src/bun/calendar/types";
import { occurrenceKey } from "../src/bun/calendar/types";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "../src/bun/core/settings";

export const T0 = Date.UTC(2026, 8, 11, 15, 0, 0); // 2026-09-11T15:00Z

export function ev(partial: Partial<EventOccurrence> & { id: string; start: number }): EventOccurrence {
	const base: EventOccurrence = {
		key: occurrenceKey(partial.id, partial.start),
		id: partial.id,
		calendarId: "cal-1",
		title: "Standup",
		start: partial.start,
		end: partial.start + 30 * 60_000,
		allDay: false,
		location: null,
		notes: null,
		url: null,
		status: "confirmed",
		selfStatus: "accepted",
		organizerIsSelf: false,
		attendeeCount: 3,
		joinUrl: null,
		joinProvider: null,
	};
	return { ...base, ...partial, key: occurrenceKey(partial.id, partial.start) };
}

export function settings(overrides: Omit<Partial<Settings>, "filters"> & { filters?: Partial<Settings["filters"]> } = {}): Settings {
	const merged = structuredClone(DEFAULT_SETTINGS) as Settings;
	const { filters, ...rest } = overrides;
	Object.assign(merged, rest);
	if (filters) Object.assign(merged.filters, filters);
	return normalizeSettings(merged);
}
