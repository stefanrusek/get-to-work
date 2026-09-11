import { describe, expect, test } from "bun:test";
import { EMPTY_STATE } from "../src/bun/core/settings";
import { actions, nextAlert, planAlerts, tick } from "../src/bun/core/scheduler";
import { ev, settings, T0 } from "./helpers";

const MIN = 60_000;

describe("scheduler", () => {
	test("lead alert fires at start - lead, not before", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings({ leadMinutes: 1 });
		expect(tick(events, s, EMPTY_STATE, T0).show).toBeNull();
		const r = tick(events, s, EMPTY_STATE, T0 + 9 * MIN);
		expect(r.show?.kind).toBe("lead");
		expect(r.show?.occurrence.id).toBe("a");
	});

	test("fired alerts do not repeat; ended events drop out", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings();
		let state = EMPTY_STATE;
		const r1 = tick(events, s, state, T0 + 9 * MIN);
		state = actions.markFired(state, r1.consumed, T0 + 9 * MIN);
		expect(tick(events, s, state, T0 + 9 * MIN + 1000).show).toBeNull();
		expect(planAlerts(events, s, EMPTY_STATE, T0 + 41 * MIN)).toEqual([]);
	});

	test("per-event lead override", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings({ overrides: { a: { leadMinutes: 5 } } });
		expect(tick(events, s, EMPTY_STATE, T0 + 5 * MIN).show?.kind).toBe("lead");
	});

	test("alertAtStart adds a second alert", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings({ leadMinutes: 2, alertAtStart: true });
		const planned = planAlerts(events, s, EMPTY_STATE, T0);
		expect(planned.map((p) => p.kind)).toEqual(["lead", "start"]);
		expect(planned[1]?.alertAt).toBe(T0 + 10 * MIN);
	});

	test("snooze re-alerts later and supersedes dismissal", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings();
		let state = EMPTY_STATE;
		const now = T0 + 9 * MIN;
		state = actions.markFired(state, tick(events, s, state, now).consumed, now);
		state = actions.snooze(state, events[0]!.key, 5, now);
		expect(tick(events, s, state, now + 4 * MIN).show).toBeNull();
		const r = tick(events, s, state, now + 5 * MIN);
		expect(r.show?.kind).toBe("snooze");
		state = actions.markFired(state, r.consumed, now + 5 * MIN);
		expect(state.snoozed[events[0]!.key]).toBeUndefined();
		expect(tick(events, s, state, now + 6 * MIN).show).toBeNull();
	});

	test("snooze past event end is dropped", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings();
		let state = actions.snooze(EMPTY_STATE, events[0]!.key, 60, T0 + 9 * MIN);
		expect(tick(events, s, state, T0 + 70 * MIN).show).toBeNull();
	});

	test("dismiss suppresses lead and start alerts", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings({ leadMinutes: 2, alertAtStart: true });
		let state = EMPTY_STATE;
		state = actions.markFired(state, tick(events, s, state, T0 + 8 * MIN).consumed, T0 + 8 * MIN);
		state = actions.dismiss(state, events[0]!.key, T0 + 8 * MIN);
		expect(tick(events, s, state, T0 + 10 * MIN).show).toBeNull();
	});

	test("paused consumes due alerts without showing", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings({ pausedUntil: -1 });
		const r = tick(events, s, EMPTY_STATE, T0 + 9 * MIN);
		expect(r.paused).toBe(true);
		expect(r.show).toBeNull();
		expect(r.consumed).toHaveLength(1);
		const s2 = settings({ pausedUntil: T0 + 5 * MIN });
		expect(tick(events, s2, EMPTY_STATE, T0 + 9 * MIN).paused).toBe(false);
	});

	test("multiple due alerts: soonest-starting event wins, others consumed", () => {
		const events = [ev({ id: "b", start: T0 + 12 * MIN }), ev({ id: "a", start: T0 + 10 * MIN })];
		const s = settings({ leadMinutes: 5 });
		const r = tick(events, s, EMPTY_STATE, T0 + 8 * MIN);
		expect(r.show?.occurrence.id).toBe("a");
		expect(r.consumed).toHaveLength(2);
	});

	test("filtered events never alert; nextAlert for countdown", () => {
		const events = [ev({ id: "a", start: T0 + 10 * MIN, allDay: true }), ev({ id: "b", start: T0 + 20 * MIN })];
		const planned = planAlerts(events, settings(), EMPTY_STATE, T0);
		expect(planned).toHaveLength(1);
		expect(nextAlert(planned, T0)?.occurrence.id).toBe("b");
		expect(nextAlert(planned, T0 + 30 * MIN)).toBeNull();
	});

	test("reset forgets an occurrence", () => {
		const key = "a@1";
		let state = actions.snooze(EMPTY_STATE, key, 5, T0);
		state = actions.dismiss(state, key, T0);
		state = { ...state, fired: { [`${key}#lead`]: T0, "other#lead": T0 } };
		state = actions.reset(state, key);
		expect(state).toEqual({ fired: { "other#lead": T0 }, snoozed: {}, dismissed: {} });
	});
});
