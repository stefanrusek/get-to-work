// EventKit-backed calendar source. Wraps the native bridge and normalizes events for the scheduler.
import { native, type CalendarAuthStatus, type NativeEvent } from "../native";
import { findJoinLink } from "../core/meeting-links";
import { occurrenceKey, type CalendarInfo, type EventOccurrence, type EventStatus, type SelfStatus } from "./types";

const STATUS: Record<number, EventStatus> = { 0: "none", 1: "confirmed", 2: "tentative", 3: "canceled" };
const SELF: Record<number, SelfStatus> = { [-1]: "none", 0: "unknown", 1: "pending", 2: "accepted", 3: "declined", 4: "tentative" };

export const SYNC_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;
export const SYNC_WINDOW_AFTER_MS = 48 * 60 * 60 * 1000;
export const RESYNC_INTERVAL_MS = 5 * 60 * 1000;

export function normalizeEvent(e: NativeEvent): EventOccurrence {
	const join = findJoinLink({ url: e.url, location: e.location, notes: e.notes });
	return {
		key: occurrenceKey(e.id, e.start),
		id: e.id,
		calendarId: e.calendarId,
		title: (e.title ?? "").trim() || "(No title)",
		start: e.start,
		end: e.end,
		allDay: e.allDay,
		location: e.location?.trim() || null,
		notes: e.notes ?? null,
		url: e.url ?? null,
		status: STATUS[e.status] ?? "none",
		selfStatus: SELF[e.selfStatus] ?? "unknown",
		organizerIsSelf: e.organizerIsSelf,
		attendeeCount: e.attendeeCount,
		joinUrl: join?.url ?? null,
		joinProvider: join?.provider ?? null,
	};
}

export class CalendarService {
	events: EventOccurrence[] = [];
	calendars: CalendarInfo[] = [];
	lastSync = 0;
	lastError: string | null = null;
	private listeners = new Set<() => void>();

	onChange(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	authStatus(): CalendarAuthStatus {
		return native.calendarAuthStatus();
	}

	hasAccess(): boolean {
		return this.authStatus() === "fullAccess";
	}

	requestAccess(): void {
		const status = this.authStatus();
		if (status === "notDetermined") {
			native.requestCalendarAccess();
		} else if (status === "denied" || status === "restricted" || status === "writeOnly") {
			native.openCalendarPrivacySettings();
		}
	}

	/** True when the store reported changes or the periodic interval elapsed. */
	needsSync(now: number): boolean {
		if (native.storeChanged()) return true;
		return now - this.lastSync > RESYNC_INTERVAL_MS;
	}

	/** Fetch calendars + events. Returns true if the event list changed. */
	sync(now = Date.now()): boolean {
		this.lastSync = now;
		if (!this.hasAccess()) {
			const changed = this.events.length > 0 || this.calendars.length > 0;
			this.events = [];
			this.calendars = [];
			if (changed) this.emit();
			return changed;
		}
		try {
			const cals = native.calendars();
			this.calendars = cals.map((c) => ({
				id: c.id,
				title: c.title,
				colorHex: c.colorHex,
				sourceTitle: c.sourceTitle,
				isSubscribed: c.isSubscribed,
			}));
			const raw = native.events(now - SYNC_WINDOW_BEFORE_MS, now + SYNC_WINDOW_AFTER_MS);
			const seen = new Set<string>();
			const next: EventOccurrence[] = [];
			for (const e of raw) {
				const n = normalizeEvent(e);
				if (seen.has(n.key)) continue;
				seen.add(n.key);
				next.push(n);
			}
			next.sort((a, b) => a.start - b.start || a.end - b.end || a.title.localeCompare(b.title));
			const changed = JSON.stringify(next) !== JSON.stringify(this.events);
			this.events = next;
			this.lastError = null;
			if (changed) this.emit();
			return changed;
		} catch (err) {
			this.lastError = err instanceof Error ? err.message : String(err);
			console.error("[calendar] sync failed:", this.lastError);
			return false;
		}
	}

	calendarColor(calendarId: string): string | null {
		return this.calendars.find((c) => c.id === calendarId)?.colorHex ?? null;
	}

	private emit() {
		for (const l of this.listeners) {
			try {
				l();
			} catch (err) {
				console.error("[calendar] listener failed", err);
			}
		}
	}
}
