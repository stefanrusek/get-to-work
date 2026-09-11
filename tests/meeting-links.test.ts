import { describe, expect, test } from "bun:test";
import { classifyUrl, extractUrls, findJoinLink, KNOWN_PROVIDER_COUNT } from "../src/bun/core/meeting-links";

describe("meeting-links", () => {
	test("recognises a broad set of providers", () => {
		expect(KNOWN_PROVIDER_COUNT).toBeGreaterThanOrEqual(50);
		const cases: Array<[string, string]> = [
			["https://zoom.us/j/123456789?pwd=abc", "Zoom"],
			["https://acme.zoom.us/j/123", "Zoom"],
			["zoommtg://zoom.us/join?confno=123", "Zoom"],
			["https://meet.google.com/abc-defg-hij", "Google Meet"],
			["https://teams.microsoft.com/l/meetup-join/19%3ameeting", "Microsoft Teams"],
			["https://acme.webex.com/acme/j.php?MTID=m1", "Webex"],
			["https://global.gotomeeting.com/join/123", "GoToMeeting"],
			["https://whereby.com/room", "Whereby"],
			["https://meet.jit.si/Room", "Jitsi"],
			["https://app.slack.com/huddle/T1/C1", "Slack Huddle"],
			["https://discord.gg/abc", "Discord"],
			["https://facetime.apple.com/join#v=1", "FaceTime"],
			["https://app.chime.aws/meetings/123", "Chime"],
		];
		for (const [url, provider] of cases) {
			expect(classifyUrl(url)?.provider, url).toBe(provider);
			expect(classifyUrl(url)?.confident, url).toBe(true);
		}
	});

	test("generic https links are low-confidence, non-links are null", () => {
		expect(classifyUrl("https://example.com/agenda")).toEqual({ provider: "Link", confident: false });
		expect(classifyUrl("Conference Room B")).toBeNull();
	});

	test("extracts urls from prose and strips trailing punctuation", () => {
		expect(extractUrls("Join here: https://meet.google.com/abc-defg-hij. Thanks!")).toEqual([
			"https://meet.google.com/abc-defg-hij",
		]);
		expect(extractUrls("Dial-in (https://zoom.us/j/1)")).toEqual(["https://zoom.us/j/1"]);
		expect(extractUrls(null)).toEqual([]);
	});

	test("Google Calendar invitation text (Meet link in notes, description noise)", () => {
		const notes = `Weekly sync

Join with Google Meet: https://meet.google.com/abc-defg-hij
Or dial: (US) +1 555-555-0100 PIN: 123 456#
More phone numbers: https://tel.meet/abc-defg-hij?pin=1234
Agenda: https://docs.google.com/document/d/1`;
		const r = findJoinLink({ url: null, location: null, notes });
		expect(r).toEqual({ url: "https://meet.google.com/abc-defg-hij", provider: "Google Meet", confident: true });
	});

	test("Zoom invitation text (link in location and in notes with passcode)", () => {
		const notes = `Stefan is inviting you to a scheduled Zoom meeting.

Join Zoom Meeting
https://us02web.zoom.us/j/81234567890?pwd=abcDEF123

Meeting ID: 812 3456 7890
Passcode: 123456`;
		expect(findJoinLink({ location: "https://us02web.zoom.us/j/81234567890?pwd=abcDEF123", notes })?.provider).toBe("Zoom");
		expect(findJoinLink({ location: "Room 12", notes })).toEqual({
			url: "https://us02web.zoom.us/j/81234567890?pwd=abcDEF123",
			provider: "Zoom",
			confident: true,
		});
	});

	test("scheme-less Meet and Zoom links are detected", () => {
		expect(findJoinLink({ location: "meet.google.com/abc-defg-hij" })).toEqual({
			url: "https://meet.google.com/abc-defg-hij",
			provider: "Google Meet",
			confident: true,
		});
		expect(findJoinLink({ notes: "join at acme.zoom.us/j/123456789 (passcode 1)" })?.url).toBe("https://acme.zoom.us/j/123456789");
		// a full URL is not duplicated as a bare match
		expect(extractUrls("https://meet.google.com/abc-defg-hij")).toEqual(["https://meet.google.com/abc-defg-hij"]);
	});

	test("prefers confident provider over earlier generic link", () => {
		const r = findJoinLink({
			url: "https://example.com/doc",
			location: "Room 4",
			notes: "Backup: https://zoom.us/j/999",
		});
		expect(r).toEqual({ url: "https://zoom.us/j/999", provider: "Zoom", confident: true });
	});

	test("falls back to generic link, then null", () => {
		expect(findJoinLink({ notes: "see https://example.com/x" })?.confident).toBe(false);
		expect(findJoinLink({ location: "Kitchen" })).toBeNull();
	});
});
