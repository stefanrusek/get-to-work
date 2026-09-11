import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, isPaused, normalizeSettings, pruneState, SettingsStore } from "../src/bun/core/settings";

describe("settings", () => {
	test("normalize fills defaults and drops junk", () => {
		const s = normalizeSettings({ leadMinutes: "x", filters: { skipAllDay: false, bogus: 1 }, overrides: { a: { leadMinutes: 3, junk: true } } });
		expect(s.leadMinutes).toBe(DEFAULT_SETTINGS.leadMinutes);
		expect(s.filters.skipAllDay).toBe(false);
		expect(s.filters.skipDeclined).toBe(true);
		expect(s.overrides).toEqual({ a: { leadMinutes: 3 } });
		expect((s.filters as any).bogus).toBeUndefined();
	});

	test("normalize clamps and validates lists", () => {
		const s = normalizeSettings({ sound: { volume: 7 }, snoozePresets: [0, -2, 3, 10, 15, 30, 60], pausedUntil: "no" });
		expect(s.sound.volume).toBe(1);
		expect(s.snoozePresets).toEqual([3, 10, 15, 30]);
		expect(s.pausedUntil).toBeNull();
		expect(normalizeSettings({ pausedUntil: -1 }).pausedUntil).toBe(-1);
	});

	test("isPaused", () => {
		expect(isPaused(normalizeSettings({}), 100)).toBe(false);
		expect(isPaused(normalizeSettings({ pausedUntil: -1 }), 100)).toBe(true);
		expect(isPaused(normalizeSettings({ pausedUntil: 200 }), 100)).toBe(true);
		expect(isPaused(normalizeSettings({ pausedUntil: 50 }), 100)).toBe(false);
	});

	test("pruneState keeps recent past entries and future snoozes", () => {
		const day = 24 * 60 * 60 * 1000;
		const now = 10 * day;
		const st = pruneState(
			{ dismissed: { old: now - 2 * day, recent: now - 1000 }, snoozed: { future: now + 1000, stale: now - 2 * day }, fired: { x: now } },
			now,
		);
		expect(st).toEqual({ dismissed: { recent: now - 1000 }, snoozed: { future: now + 1000 }, fired: { x: now } });
	});

	test("store round-trips through disk", () => {
		const dir = mkdtempSync(join(tmpdir(), "gtw-"));
		const store = new SettingsStore(dir);
		store.update((s) => {
			s.leadMinutes = 7;
			s.calendars.enabled["c1"] = false;
		});
		const again = new SettingsStore(dir);
		expect(again.settings.leadMinutes).toBe(7);
		expect(again.settings.calendars.enabled["c1"]).toBe(false);
		expect(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).leadMinutes).toBe(7);
		again.updateState((st) => {
			st.dismissed["k"] = Date.now();
		});
		expect(new SettingsStore(dir).state.dismissed["k"]).toBeDefined();
	});
});
