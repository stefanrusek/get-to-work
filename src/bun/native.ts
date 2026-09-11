// bun:ffi bindings to build/native/libgtw.dylib (copied into the bundle as Resources/app/native/libgtw.dylib).
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const symbols = {
	gtw_calendar_auth_status: { args: [], returns: FFIType.i32 },
	gtw_calendar_request_access: { args: [], returns: FFIType.void },
	gtw_store_changed: { args: [], returns: FFIType.i32 },
	gtw_calendars_json: { args: [], returns: FFIType.cstring },
	gtw_events_json: { args: [FFIType.f64, FFIType.f64], returns: FFIType.cstring },
	gtw_free: { args: [FFIType.ptr], returns: FFIType.void },
	gtw_create_event_json: {
		args: [FFIType.cstring, FFIType.f64, FFIType.f64, FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.cstring],
		returns: FFIType.cstring,
	},
	gtw_delete_event_json: { args: [FFIType.cstring], returns: FFIType.cstring },
	gtw_screens_json: { args: [], returns: FFIType.cstring },
	gtw_window_make_alert: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.void },
	gtw_window_make_normal: { args: [FFIType.ptr], returns: FFIType.void },
	gtw_window_focus: { args: [FFIType.ptr], returns: FFIType.void },
	gtw_window_debug_json: { args: [FFIType.ptr], returns: FFIType.cstring },
	gtw_app_activate: { args: [], returns: FFIType.void },
	gtw_open_calendar_privacy_settings: { args: [], returns: FFIType.void },
} as const;

export type CalendarAuthStatus = "notDetermined" | "restricted" | "denied" | "fullAccess" | "writeOnly";

export interface NativeCalendar {
	id: string;
	title: string;
	colorHex: string | null;
	sourceTitle: string | null;
	sourceType: number;
	type: number;
	allowsModifications: boolean;
	isSubscribed: boolean;
}

export interface NativeEvent {
	id: string;
	calendarId: string;
	title: string | null;
	start: number; // epoch ms
	end: number; // epoch ms
	allDay: boolean;
	location: string | null;
	notes: string | null;
	url: string | null;
	status: number; // EKEventStatus: 0 none, 1 confirmed, 2 tentative, 3 canceled
	selfStatus: number; // EKParticipantStatus: -1 unknown/no attendees, 0 unknown, 1 pending, 2 accepted, 3 declined, 4 tentative
	organizerName: string | null;
	organizerIsSelf: boolean;
	attendeeCount: number;
	hasRecurrence: boolean;
	isDetached: boolean;
	availability: number;
}

export interface NativeScreen {
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	scale: number;
	name: string | null;
}

export interface WindowDebug {
	level: number;
	x: number;
	y: number;
	width: number;
	height: number;
	visible: boolean;
	key: boolean;
	screen: string | null;
	collectionBehavior: number;
	styleMask: number;
	firstResponder: string | null;
}

function candidatePaths(): string[] {
	const env = process.env["GTW_NATIVE_LIB"];
	const out: string[] = [];
	if (env) out.push(env);
	// Packaged: <App>.app/Contents/MacOS is cwd; copy targets land under Resources/app/.
	out.push(resolve(process.cwd(), "../Resources/app/native/libgtw.dylib"));
	out.push(resolve(process.cwd(), "../Resources/native/libgtw.dylib"));
	// Dev fallbacks relative to the source tree.
	out.push(resolve(import.meta.dir, "../../build/native/libgtw.dylib"));
	out.push(resolve(process.cwd(), "build/native/libgtw.dylib"));
	return out;
}

function load() {
	const tried: string[] = [];
	for (const p of candidatePaths()) {
		tried.push(p);
		if (!existsSync(p)) continue;
		return { lib: dlopen(p, symbols), path: p };
	}
	throw new Error(`libgtw.dylib not found. Tried:\n${tried.join("\n")}`);
}

const loaded = load();
const lib = loaded.lib;
export const nativeLibraryPath = loaded.path;

function takeJson<T>(cstr: unknown): T {
	// FFIType.cstring returns a CString; its toString copies the bytes. We leak the strdup'd buffer
	// only if ptr is unavailable, which never happens with bun:ffi CString.
	const s = cstr as { toString(): string; ptr: Pointer | number };
	const text = s.toString();
	if (s.ptr) lib.symbols.gtw_free(s.ptr as Pointer);
	return JSON.parse(text) as T;
}

const STATUS: Record<number, CalendarAuthStatus> = {
	0: "notDetermined",
	1: "restricted",
	2: "denied",
	3: "fullAccess",
	4: "writeOnly",
};

export const native = {
	calendarAuthStatus(): CalendarAuthStatus {
		return STATUS[lib.symbols.gtw_calendar_auth_status()] ?? "notDetermined";
	},
	requestCalendarAccess(): void {
		lib.symbols.gtw_calendar_request_access();
	},
	storeChanged(): boolean {
		return lib.symbols.gtw_store_changed() !== 0;
	},
	calendars(): NativeCalendar[] {
		return takeJson<NativeCalendar[]>(lib.symbols.gtw_calendars_json());
	},
	events(startMs: number, endMs: number): NativeEvent[] {
		return takeJson<NativeEvent[]>(lib.symbols.gtw_events_json(startMs, endMs));
	},
	/** Dev helper: create a calendar event (requires full access). */
	createEvent(o: {
		title: string;
		start: number;
		end: number;
		location?: string;
		calendarId?: string;
		notes?: string;
		url?: string;
	}): { id?: string; calendar?: string; error?: string } {
		const c = (v: string) => ptr(Buffer.from(`${v}\0`, "utf8"));
		return takeJson(
			lib.symbols.gtw_create_event_json(c(o.title), o.start, o.end, c(o.location ?? ""), c(o.calendarId ?? ""), c(o.notes ?? ""), c(o.url ?? "")),
		);
	},
	deleteEvent(id: string): { ok?: boolean; error?: string } {
		return takeJson(lib.symbols.gtw_delete_event_json(ptr(Buffer.from(`${id}\0`, "utf8"))));
	},
	screens(): NativeScreen[] {
		return takeJson<NativeScreen[]>(lib.symbols.gtw_screens_json());
	},
	windowMakeAlert(win: Pointer, screenIndex: number): void {
		lib.symbols.gtw_window_make_alert(win, screenIndex);
	},
	windowMakeNormal(win: Pointer): void {
		lib.symbols.gtw_window_make_normal(win);
	},
	windowFocus(win: Pointer): void {
		lib.symbols.gtw_window_focus(win);
	},
	windowDebug(win: Pointer): WindowDebug {
		return takeJson<WindowDebug>(lib.symbols.gtw_window_debug_json(win));
	},
	appActivate(): void {
		lib.symbols.gtw_app_activate();
	},
	openCalendarPrivacySettings(): void {
		lib.symbols.gtw_open_calendar_privacy_settings();
	},
};
