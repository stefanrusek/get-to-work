// Decides whether an occurrence should ever produce an alert. Pure.
import type { EventOccurrence } from "../calendar/types";
import type { Settings } from "./settings";

export type FilterReason =
	| "ok"
	| "calendar-disabled"
	| "all-day"
	| "declined"
	| "tentative"
	| "canceled"
	| "no-attendees"
	| "no-join-link"
	| "excluded-keyword"
	| "missing-include-keyword"
	| "excluded-override";

export function calendarEnabled(settings: Settings, calendarId: string): boolean {
	return settings.calendars.enabled[calendarId] ?? settings.calendars.defaultEnabled;
}

function hasKeyword(text: string, keywords: string[]): boolean {
	const t = text.toLowerCase();
	return keywords.some((k) => k.trim().length > 0 && t.includes(k.trim().toLowerCase()));
}

export function filterReason(ev: EventOccurrence, settings: Settings): FilterReason {
	const f = settings.filters;
	if (settings.overrides[ev.id]?.exclude) return "excluded-override";
	if (!calendarEnabled(settings, ev.calendarId)) return "calendar-disabled";
	if (f.skipAllDay && ev.allDay) return "all-day";
	if (f.skipCanceled && ev.status === "canceled") return "canceled";
	if (f.skipDeclined && ev.selfStatus === "declined") return "declined";
	if (f.skipTentative && (ev.selfStatus === "tentative" || ev.status === "tentative")) return "tentative";
	if (f.requireAttendees && ev.attendeeCount < 1) return "no-attendees";
	if (f.requireJoinLink && !ev.joinUrl) return "no-join-link";
	const haystack = `${ev.title}\n${ev.location ?? ""}\n${ev.notes ?? ""}`;
	if (f.excludeKeywords.length > 0 && hasKeyword(haystack, f.excludeKeywords)) return "excluded-keyword";
	if (f.includeKeywords.length > 0 && !hasKeyword(haystack, f.includeKeywords)) return "missing-include-keyword";
	return "ok";
}

export function isAlertable(ev: EventOccurrence, settings: Settings): boolean {
	return filterReason(ev, settings) === "ok";
}
