import type { RPCSchema } from "electrobun/main";
import type { CalendarInfo } from "../bun/calendar/types";
import type { Settings } from "../bun/core/settings";

export interface SettingsSnapshot {
	settings: Settings;
	calendars: CalendarInfo[];
	authStatus: string;
	sounds: Array<{ name: string; path: string }>;
	version: string;
	upcoming: Array<{ key: string; id: string; title: string; start: number; end: number; joinUrl: string | null }>;
	focusEventId: string | null;
}

export type SettingsRPCSchema = {
	bun: RPCSchema<{
		requests: {
			getSnapshot: { params: {}; response: SettingsSnapshot };
			saveSettings: { params: { settings: Settings }; response: SettingsSnapshot };
			setOverride: { params: { eventId: string; leadMinutes?: number | null; exclude?: boolean; title?: string }; response: SettingsSnapshot };
			removeOverride: { params: { eventId: string }; response: SettingsSnapshot };
			requestAccess: { params: {}; response: string };
			previewSound: { params: { path: string; volume: number }; response: void };
			testAlert: { params: {}; response: void };
			pickSoundFile: { params: {}; response: string | null };
			close: { params: {}; response: void };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			snapshot: SettingsSnapshot;
		};
	}>;
};
