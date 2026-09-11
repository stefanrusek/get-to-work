import { describe, expect, test } from "bun:test";
import { filterReason } from "../src/bun/core/filters";
import { ev, settings, T0 } from "./helpers";

describe("filters", () => {
	test("default settings accept a normal meeting", () => {
		expect(filterReason(ev({ id: "a", start: T0 }), settings())).toBe("ok");
	});

	test("disabled calendar and defaultEnabled", () => {
		const s = settings({ calendars: { enabled: { "cal-1": false }, defaultEnabled: true } });
		expect(filterReason(ev({ id: "a", start: T0 }), s)).toBe("calendar-disabled");
		const s2 = settings({ calendars: { enabled: {}, defaultEnabled: false } });
		expect(filterReason(ev({ id: "a", start: T0 }), s2)).toBe("calendar-disabled");
		const s3 = settings({ calendars: { enabled: { "cal-1": true }, defaultEnabled: false } });
		expect(filterReason(ev({ id: "a", start: T0 }), s3)).toBe("ok");
	});

	test("all-day, declined, canceled, tentative", () => {
		expect(filterReason(ev({ id: "a", start: T0, allDay: true }), settings())).toBe("all-day");
		expect(filterReason(ev({ id: "a", start: T0, selfStatus: "declined" }), settings())).toBe("declined");
		expect(filterReason(ev({ id: "a", start: T0, status: "canceled" }), settings())).toBe("canceled");
		expect(filterReason(ev({ id: "a", start: T0, selfStatus: "tentative" }), settings())).toBe("ok");
		expect(filterReason(ev({ id: "a", start: T0, selfStatus: "tentative" }), settings({ filters: { skipTentative: true } }))).toBe(
			"tentative",
		);
		expect(filterReason(ev({ id: "a", start: T0, allDay: true }), settings({ filters: { skipAllDay: false } }))).toBe("ok");
	});

	test("attendees and join link requirements", () => {
		expect(filterReason(ev({ id: "a", start: T0, attendeeCount: 0 }), settings({ filters: { requireAttendees: true } }))).toBe(
			"no-attendees",
		);
		expect(filterReason(ev({ id: "a", start: T0 }), settings({ filters: { requireJoinLink: true } }))).toBe("no-join-link");
		expect(
			filterReason(ev({ id: "a", start: T0, joinUrl: "https://zoom.us/j/1" }), settings({ filters: { requireJoinLink: true } })),
		).toBe("ok");
	});

	test("keywords are case-insensitive and search title/location/notes", () => {
		const s = settings({ filters: { excludeKeywords: ["focus"] } });
		expect(filterReason(ev({ id: "a", start: T0, title: "FOCUS time" }), s)).toBe("excluded-keyword");
		expect(filterReason(ev({ id: "a", start: T0, notes: "deep focus block" }), s)).toBe("excluded-keyword");
		const inc = settings({ filters: { includeKeywords: ["1:1"] } });
		expect(filterReason(ev({ id: "a", start: T0, title: "Weekly 1:1" }), inc)).toBe("ok");
		expect(filterReason(ev({ id: "a", start: T0, title: "Planning" }), inc)).toBe("missing-include-keyword");
	});

	test("per-event exclude override wins", () => {
		const s = settings({ overrides: { a: { exclude: true } } });
		expect(filterReason(ev({ id: "a", start: T0 }), s)).toBe("excluded-override");
	});
});
