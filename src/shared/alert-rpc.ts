import type { RPCSchema } from "electrobun/main";

export interface AlertPayload {
	occurrenceKey: string;
	title: string;
	start: number; // epoch ms
	end: number; // epoch ms
	location: string | null;
	joinUrl: string | null;
	joinProvider: string | null;
	calendarColor: string | null;
	snoozePresets: number[]; // minutes
}

export type AlertRPCSchema = {
	bun: RPCSchema<{
		requests: {
			dismiss: { params: {}; response: void };
			join: { params: {}; response: void };
			customize: { params: {}; response: void };
			snooze: { params: { minutes: number }; response: void };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			setAlert: AlertPayload;
			tick: { now: number };
			/** Dev/automation: behave as if the user pressed this key. */
			pressKey: { key: string };
		};
	}>;
};
