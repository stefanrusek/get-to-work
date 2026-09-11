// Detects video-conference join links in event fields. Pure; no I/O.

export interface JoinLink {
	url: string;
	provider: string;
	/** false when we only found a generic https link. */
	confident: boolean;
}

interface Provider {
	name: string;
	/** Tested against the full URL (case-insensitive). */
	pattern: RegExp;
}

// Order matters: first match wins. Patterns match a host (and optional path prefix).
const PROVIDERS: Provider[] = [
	{ name: "Zoom", pattern: /^(zoommtg:|https?:\/\/([\w-]+\.)?(zoom\.us|zoom\.com|zoomgov\.com)\/(j|my|s|w|wc|meeting)\/)/i },
	{ name: "Zoom", pattern: /^https?:\/\/([\w-]+\.)?zoom\.(us|com)\//i },
	{ name: "Google Meet", pattern: /^https?:\/\/meet\.google\.com\//i },
	{ name: "Microsoft Teams", pattern: /^(msteams:|https?:\/\/(teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft)\/)/i },
	{ name: "Webex", pattern: /^https?:\/\/([\w-]+\.)?webex\.com\//i },
	{ name: "GoToMeeting", pattern: /^https?:\/\/([\w-]+\.)?(gotomeeting\.com|gotomeet\.me|goto\.com)\//i },
	{ name: "GoToWebinar", pattern: /^https?:\/\/([\w-]+\.)?gotowebinar\.com\//i },
	{ name: "Whereby", pattern: /^https?:\/\/([\w-]+\.)?whereby\.com\//i },
	{ name: "Around", pattern: /^https?:\/\/([\w-]+\.)?around\.co\//i },
	{ name: "Jitsi", pattern: /^https?:\/\/(meet\.jit\.si|([\w-]+\.)?jitsi\.[a-z]+)\//i },
	{ name: "BlueJeans", pattern: /^https?:\/\/([\w-]+\.)?bluejeans\.com\//i },
	{ name: "Slack Huddle", pattern: /^https?:\/\/([\w-]+\.)?slack\.com\/huddle\//i },
	{ name: "Slack", pattern: /^https?:\/\/app\.slack\.com\/(huddle|call)\//i },
	{ name: "Discord", pattern: /^https?:\/\/(discord\.gg|([\w-]+\.)?discord\.com\/(channels|invite))\//i },
	{ name: "FaceTime", pattern: /^(facetime:|https?:\/\/facetime\.apple\.com\/)/i },
	{ name: "Skype", pattern: /^https?:\/\/(join\.skype\.com|meet\.lync\.com|([\w-]+\.)?skype\.com\/)/i },
	{ name: "RingCentral", pattern: /^https?:\/\/([\w-]+\.)?(ringcentral\.com|rnk\.ms)\//i },
	{ name: "Dialpad", pattern: /^https?:\/\/([\w-]+\.)?(dialpad\.com|meetings\.dialpad\.com|uberconference\.com)\//i },
	{ name: "Chime", pattern: /^https?:\/\/([\w-]+\.)?chime\.aws\//i },
	{ name: "Lifesize", pattern: /^https?:\/\/([\w-]+\.)?lifesize\.com\//i },
	{ name: "Zoho Meeting", pattern: /^https?:\/\/([\w-]+\.)?zoho\.com\/meeting/i },
	{ name: "Pexip", pattern: /^https?:\/\/([\w-]+\.)?pexip\.(com|me)\//i },
	{ name: "Vonage", pattern: /^https?:\/\/([\w-]+\.)?vonage\.com\//i },
	{ name: "8x8", pattern: /^https?:\/\/([\w-]+\.)?8x8\.(com|vc)\//i },
	{ name: "Daily", pattern: /^https?:\/\/([\w-]+\.)?daily\.co\//i },
	{ name: "Livestorm", pattern: /^https?:\/\/([\w-]+\.)?livestorm\.co\//i },
	{ name: "Demio", pattern: /^https?:\/\/([\w-]+\.)?(demio\.com|my\.demio\.com)\//i },
	{ name: "Riverside", pattern: /^https?:\/\/([\w-]+\.)?riverside\.fm\//i },
	{ name: "StreamYard", pattern: /^https?:\/\/([\w-]+\.)?streamyard\.com\//i },
	{ name: "Loom", pattern: /^https?:\/\/([\w-]+\.)?loom\.com\//i },
	{ name: "Gather", pattern: /^https?:\/\/([\w-]+\.)?gather\.town\//i },
	{ name: "Butter", pattern: /^https?:\/\/([\w-]+\.)?butter\.us\//i },
	{ name: "Tuple", pattern: /^https?:\/\/([\w-]+\.)?tuple\.app\//i },
	{ name: "Pop", pattern: /^https?:\/\/([\w-]+\.)?pop\.com\//i },
	{ name: "Calendly", pattern: /^https?:\/\/([\w-]+\.)?calendly\.com\//i },
	{ name: "Cal.com", pattern: /^https?:\/\/([\w-]+\.)?cal\.com\//i },
	{ name: "Vimeo", pattern: /^https?:\/\/([\w-]+\.)?vimeo\.com\/(event|live)/i },
	{ name: "YouTube Live", pattern: /^https?:\/\/([\w-]+\.)?youtube\.com\/(live|watch)/i },
	{ name: "Twitch", pattern: /^https?:\/\/([\w-]+\.)?twitch\.tv\//i },
	{ name: "Hopin", pattern: /^https?:\/\/([\w-]+\.)?hopin\.(com|to)\//i },
	{ name: "Airmeet", pattern: /^https?:\/\/([\w-]+\.)?airmeet\.com\//i },
	{ name: "Bevy", pattern: /^https?:\/\/([\w-]+\.)?bevy\.com\//i },
	{ name: "Crowdcast", pattern: /^https?:\/\/([\w-]+\.)?crowdcast\.io\//i },
	{ name: "Whimsical", pattern: /^https?:\/\/([\w-]+\.)?whimsical\.com\//i },
	{ name: "Miro", pattern: /^https?:\/\/([\w-]+\.)?miro\.com\//i },
	{ name: "Figma", pattern: /^https?:\/\/([\w-]+\.)?figma\.com\//i },
	{ name: "Notion", pattern: /^https?:\/\/([\w-]+\.)?notion\.(so|site)\//i },
	{ name: "Luma", pattern: /^https?:\/\/([\w-]+\.)?lu\.ma\//i },
	{ name: "Meetup", pattern: /^https?:\/\/([\w-]+\.)?meetup\.com\//i },
	{ name: "Eventbrite", pattern: /^https?:\/\/([\w-]+\.)?eventbrite\.[a-z.]+\//i },
	{ name: "Sessions", pattern: /^https?:\/\/([\w-]+\.)?sessions\.us\//i },
	{ name: "Vowel", pattern: /^https?:\/\/([\w-]+\.)?vowel\.com\//i },
	{ name: "Mmhmm", pattern: /^https?:\/\/([\w-]+\.)?mmhmm\.app\//i },
	{ name: "Huddle01", pattern: /^https?:\/\/([\w-]+\.)?huddle01\.(com|app)\//i },
	{ name: "Element", pattern: /^https?:\/\/([\w-]+\.)?(element\.io|matrix\.to)\//i },
	{ name: "Telegram", pattern: /^https?:\/\/t\.me\//i },
	{ name: "WhatsApp", pattern: /^https?:\/\/(call\.whatsapp\.com|chat\.whatsapp\.com)\//i },
	{ name: "Signal", pattern: /^https?:\/\/signal\.(group|link)\//i },
	{ name: "Amazon Chime", pattern: /^https?:\/\/app\.chime\.aws\//i },
	{ name: "Google Hangouts", pattern: /^https?:\/\/hangouts\.google\.com\//i },
	{ name: "Zoom", pattern: /^https?:\/\/([\w-]+\.)?zoom\.us$/i },
];

// Very permissive URL finder: schemes we care about plus http(s).
const URL_RE = /\b(?:https?:\/\/[^\s<>"'`)\]}]+|zoommtg:\/\/[^\s<>"'`)\]}]+|msteams:[^\s<>"'`)\]}]+|facetime:[^\s<>"'`)\]}]+)/gi;

// Links people paste without a scheme (Google writes "meet.google.com/abc-defg-hij" in plain-text invites).
const BARE_RE = /(?<![\w/.])((?:[\w-]+\.)?(?:meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|zoom\.us\/(?:j|my|s|w|wc)\/[^\s<>"'`)\]}]+|teams\.microsoft\.com\/l\/[^\s<>"'`)\]}]+))/gi;

function cleanUrl(raw: string): string {
	// Strip trailing punctuation that commonly follows URLs in prose.
	return raw.replace(/[.,;:!?)]+$/, "");
}

export function extractUrls(text: string | null | undefined): string[] {
	if (!text) return [];
	const out: string[] = [];
	for (const m of text.matchAll(URL_RE)) out.push(cleanUrl(m[0]));
	// Scheme-less links, skipping any span already covered by a full URL.
	const stripped = text.replace(URL_RE, " ");
	for (const m of stripped.matchAll(BARE_RE)) out.push(`https://${cleanUrl(m[1] ?? m[0])}`);
	return out;
}

export function classifyUrl(url: string): { provider: string; confident: boolean } | null {
	for (const p of PROVIDERS) {
		if (p.pattern.test(url)) return { provider: p.name, confident: true };
	}
	if (/^https?:\/\//i.test(url)) return { provider: "Link", confident: false };
	return null;
}

/**
 * Find the best join link across url/location/notes. A recognised provider anywhere beats a generic link;
 * within the same confidence tier, earlier fields win.
 */
export function findJoinLink(fields: { url?: string | null; location?: string | null; notes?: string | null }): JoinLink | null {
	const candidates: JoinLink[] = [];
	for (const text of [fields.url, fields.location, fields.notes]) {
		for (const url of extractUrls(text)) {
			const c = classifyUrl(url);
			if (c) candidates.push({ url, provider: c.provider, confident: c.confident });
		}
	}
	return candidates.find((c) => c.confident) ?? candidates[0] ?? null;
}

export const KNOWN_PROVIDER_COUNT = new Set(PROVIDERS.map((p) => p.name)).size;
