import { Electroview } from "electrobun/view";
import type { SettingsRPCSchema, SettingsSnapshot } from "../../shared/settings-rpc";

let snap: SettingsSnapshot | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const rpc = Electroview.defineRPC<SettingsRPCSchema>({
	maxRequestTime: 10_000,
	handlers: {
		requests: {},
		messages: {
			snapshot: (s) => {
				snap = s;
				render();
			},
		},
	},
});
new Electroview({ rpc });

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

function toast(msg: string) {
	const t = $("toast");
	t.textContent = msg;
	t.hidden = false;
	setTimeout(() => (t.hidden = true), 1500);
}

// ---------- tabs ----------
for (const b of Array.from($("tabs").querySelectorAll("button"))) {
	b.addEventListener("click", () => showTab(b.dataset["tab"]!));
}
function showTab(name: string) {
	for (const b of Array.from($("tabs").querySelectorAll("button"))) b.classList.toggle("active", b.dataset["tab"] === name);
	for (const p of Array.from(document.querySelectorAll<HTMLElement>(".panel"))) p.classList.toggle("active", p.dataset["panel"] === name);
}

// ---------- render ----------
function render() {
	if (!snap) return;
	const s = snap.settings;
	const auth = $("auth-status");
	auth.textContent =
		snap.authStatus === "fullAccess" ? "Access granted" : snap.authStatus === "notDetermined" ? "Not requested yet" : `Access ${snap.authStatus}`;
	auth.className = `pill ${snap.authStatus === "fullAccess" ? "ok" : snap.authStatus === "notDetermined" ? "" : "bad"}`;
	$("grant").textContent = snap.authStatus === "notDetermined" ? "Grant access" : snap.authStatus === "fullAccess" ? "Re-check" : "Open System Settings";

	const cals = $("calendars");
	cals.textContent = "";
	if (snap.calendars.length === 0) cals.append(el("div", "hint", "No calendars available."));
	for (const c of snap.calendars) {
		const item = el("label", "item");
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = s.calendars.enabled[c.id] ?? s.calendars.defaultEnabled;
		cb.addEventListener("change", () => update((x) => (x.calendars.enabled[c.id] = cb.checked)));
		const sw = el("span", "swatch");
		sw.style.background = c.colorHex ?? "#888";
		const text = el("span", "grow", c.title);
		const sub = el("span", "sub", c.sourceTitle ?? "");
		item.append(cb, sw, text, sub);
		cals.append(item);
	}

	input("leadMinutes").value = String(s.leadMinutes);
	input("alertAtStart").checked = s.alertAtStart;
	input("dismissWhenEventEnds").checked = s.dismissWhenEventEnds;
	input("snoozePresets").value = s.snoozePresets.join(", ");

	input("f-skipAllDay").checked = s.filters.skipAllDay;
	input("f-skipDeclined").checked = s.filters.skipDeclined;
	input("f-skipTentative").checked = s.filters.skipTentative;
	input("f-skipCanceled").checked = s.filters.skipCanceled;
	input("f-requireAttendees").checked = s.filters.requireAttendees;
	input("f-requireJoinLink").checked = s.filters.requireJoinLink;
	input("f-excludeKeywords").value = s.filters.excludeKeywords.join(", ");
	input("f-includeKeywords").value = s.filters.includeKeywords.join(", ");

	input("s-enabled").checked = s.sound.enabled;
	const sel = $<HTMLSelectElement>("s-path");
	sel.textContent = "";
	const opts = [...snap.sounds];
	if (!opts.some((o) => o.path === s.sound.path)) opts.unshift({ name: s.sound.path.split("/").pop() ?? "Custom", path: s.sound.path });
	for (const o of opts) {
		const opt = document.createElement("option");
		opt.value = o.path;
		opt.textContent = o.name;
		sel.append(opt);
	}
	sel.value = s.sound.path;
	input("s-volume").value = String(s.sound.volume);

	input("k-showNext").value = s.shortcuts.showNext;
	input("k-togglePause").value = s.shortcuts.togglePause;

	$("version").textContent = snap.version;

	const up = $("upcoming");
	up.textContent = "";
	if (snap.upcoming.length === 0) up.append(el("div", "hint", "No upcoming events."));
	for (const ev of snap.upcoming) {
		const ov = s.overrides[ev.id];
		const item = el("div", "item");
		if (snap.focusEventId === ev.id) item.classList.add("focus");
		const when = new Date(ev.start).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
		item.append(el("span", "grow", `${when}  ${ev.title}`));
		const lead = document.createElement("input");
		lead.type = "number";
		lead.className = "num";
		lead.min = "0";
		lead.placeholder = String(s.leadMinutes);
		lead.value = ov?.leadMinutes !== undefined ? String(ov.leadMinutes) : "";
		lead.title = "Lead minutes for this event";
		lead.addEventListener("change", () => {
			const v = lead.value.trim() === "" ? null : Number(lead.value);
			void rpc.request.setOverride({ eventId: ev.id, leadMinutes: v, title: ev.title }).then(apply);
		});
		const ex = document.createElement("input");
		ex.type = "checkbox";
		ex.checked = ov?.exclude ?? false;
		ex.title = "Exclude this event";
		ex.addEventListener("change", () => void rpc.request.setOverride({ eventId: ev.id, exclude: ex.checked, title: ev.title }).then(apply));
		const exl = el("label", "sub", "");
		exl.append(ex, " exclude");
		item.append(el("span", "sub", "lead"), lead, exl);
		up.append(item);
	}

	const ovs = $("overrides");
	ovs.textContent = "";
	const entries = Object.entries(s.overrides);
	if (entries.length === 0) ovs.append(el("div", "hint", "No overrides."));
	for (const [id, ov] of entries) {
		const item = el("div", "item");
		const desc = [ov.exclude ? "excluded" : null, ov.leadMinutes !== undefined ? `lead ${ov.leadMinutes}m` : null].filter(Boolean).join(", ");
		item.append(el("span", "grow", ov.title ?? id), el("span", "sub", desc));
		const rm = el("button", "btn danger", "Remove") as HTMLButtonElement;
		rm.addEventListener("click", () => void rpc.request.removeOverride({ eventId: id }).then(apply));
		item.append(rm);
		ovs.append(item);
	}

	if (snap.focusEventId) {
		showTab("events");
		document.querySelector(".item.focus")?.scrollIntoView({ block: "center" });
	}
}

function el(tag: string, cls: string, text?: string): HTMLElement {
	const e = document.createElement(tag);
	e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

function apply(next: SettingsSnapshot) {
	snap = next;
	render();
}

function update(mutate: (s: SettingsSnapshot["settings"]) => void) {
	if (!snap) return;
	mutate(snap.settings);
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		if (!snap) return;
		void rpc.request.saveSettings({ settings: snap.settings }).then((n) => {
			snap = n;
			toast("Saved");
		});
	}, 250);
}

function list(v: string): string[] {
	return v
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
}
function nums(v: string): number[] {
	return list(v)
		.map(Number)
		.filter((n) => Number.isFinite(n) && n > 0);
}

// ---------- bindings ----------
input("leadMinutes").addEventListener("change", () => update((s) => (s.leadMinutes = Math.max(0, Number(input("leadMinutes").value) || 0))));
input("alertAtStart").addEventListener("change", () => update((s) => (s.alertAtStart = input("alertAtStart").checked)));
input("dismissWhenEventEnds").addEventListener("change", () => update((s) => (s.dismissWhenEventEnds = input("dismissWhenEventEnds").checked)));
input("snoozePresets").addEventListener("change", () => update((s) => (s.snoozePresets = nums(input("snoozePresets").value))));
for (const k of ["skipAllDay", "skipDeclined", "skipTentative", "skipCanceled", "requireAttendees", "requireJoinLink"] as const) {
	input(`f-${k}`).addEventListener("change", () => update((s) => (s.filters[k] = input(`f-${k}`).checked)));
}
input("f-excludeKeywords").addEventListener("change", () => update((s) => (s.filters.excludeKeywords = list(input("f-excludeKeywords").value))));
input("f-includeKeywords").addEventListener("change", () => update((s) => (s.filters.includeKeywords = list(input("f-includeKeywords").value))));
input("s-enabled").addEventListener("change", () => update((s) => (s.sound.enabled = input("s-enabled").checked)));
$<HTMLSelectElement>("s-path").addEventListener("change", () => update((s) => (s.sound.path = $<HTMLSelectElement>("s-path").value)));
input("s-volume").addEventListener("change", () => update((s) => (s.sound.volume = Number(input("s-volume").value))));
$("s-preview").addEventListener("click", () => {
	if (snap) void rpc.request.previewSound({ path: $<HTMLSelectElement>("s-path").value, volume: Number(input("s-volume").value) });
});
$("s-pick").addEventListener("click", () => {
	void rpc.request.pickSoundFile({}).then((p) => {
		if (p) update((s) => (s.sound.path = p));
	});
});
input("k-showNext").addEventListener("change", () => update((s) => (s.shortcuts.showNext = input("k-showNext").value.trim())));
input("k-togglePause").addEventListener("change", () => update((s) => (s.shortcuts.togglePause = input("k-togglePause").value.trim())));
$("grant").addEventListener("click", () => {
	void rpc.request.requestAccess({}).then(() => setTimeout(() => void rpc.request.getSnapshot({}).then(apply), 1500));
});
$("testAlert").addEventListener("click", () => void rpc.request.testAlert({}));

void rpc.request.getSnapshot({}).then(apply);
setInterval(() => {
	if (snap && snap.authStatus !== "fullAccess") void rpc.request.getSnapshot({}).then(apply);
}, 3000);
