export interface CalendarInfo {
	id: string;
	title: string;
	colorHex: string | null;
	sourceTitle: string | null;
	isSubscribed: boolean;
}

export type EventStatus = "none" | "confirmed" | "tentative" | "canceled";
export type SelfStatus = "none" | "unknown" | "pending" | "accepted" | "declined" | "tentative";

export interface EventOccurrence {
	/** Stable key for one occurrence: `${id}@${start}`. */
	key: string;
	id: string;
	calendarId: string;
	title: string;
	start: number; // epoch ms
	end: number; // epoch ms
	allDay: boolean;
	location: string | null;
	notes: string | null;
	url: string | null;
	status: EventStatus;
	selfStatus: SelfStatus;
	organizerIsSelf: boolean;
	attendeeCount: number;
	joinUrl: string | null;
	joinProvider: string | null;
}

export function occurrenceKey(id: string, start: number): string {
	return `${id}@${start}`;
}
