import { Electroview } from "electrobun/view";
import type { AlertPayload, AlertRPCSchema } from "../../shared/alert-rpc";

let current: AlertPayload | null = null;
let clockOffset = 0; // main-process now minus local now, keeps countdown honest across displays

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const rpc = Electroview.defineRPC<AlertRPCSchema>({
	maxRequestTime: 5000,
	handlers: {
		requests: {},
		messages: {
			setAlert: (payload) => {
				current = payload;
				render();
			},
			tick: ({ now }) => {
				clockOffset = now - Date.now();
				renderCountdown();
			},
			pressKey: ({ key }) => {
				handleKey(key, () => {});
			},
		},
	},
});

new Electroview({ rpc });

function fmtTime(ms: number): string {
	return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function render() {
	if (!current) return;
	document.documentElement.style.setProperty("--calendar", current.calendarColor ?? "#3b82f6");
	$("title").textContent = current.title || "(untitled)";
	$("when").textContent = `${fmtTime(current.start)} – ${fmtTime(current.end)}`;
	$("location").textContent = current.location ?? "";
	const join = $<HTMLButtonElement>("join");
	join.hidden = !current.joinUrl;
	if (current.joinUrl) join.textContent = "";
	if (current.joinUrl) {
		join.append(`Join ${current.joinProvider ?? "call"}`);
		const k = document.createElement("kbd");
		k.textContent = "J";
		join.append(k);
	}
	const [s1, s5] = current.snoozePresets.length >= 2 ? current.snoozePresets : [1, 5];
	$("snooze1").textContent = "";
	$("snooze1").append(`Snooze ${s1}m`, kbd(String(s1 === 1 ? "1" : s1)));
	$("snooze5").textContent = "";
	$("snooze5").append(`Snooze ${s5}m`, kbd(String(s5)));
	renderCountdown();
}

function kbd(t: string) {
	const k = document.createElement("kbd");
	k.textContent = t;
	return k;
}

function renderCountdown() {
	if (!current) return;
	const now = Date.now() + clockOffset;
	const diff = current.start - now;
	const el = $("countdown");
	if (diff <= 0) {
		const late = Math.floor(-diff / 60000);
		el.textContent = late < 1 ? "Now" : `${late}m ago`;
		el.classList.add("now");
		$("eyebrow").textContent = late < 1 ? "Starting now" : "Already started";
	} else {
		const m = Math.floor(diff / 60000);
		const s = Math.floor((diff % 60000) / 1000);
		el.textContent = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
		el.classList.remove("now");
		$("eyebrow").textContent = "Upcoming meeting";
	}
}

function act(action: "dismiss" | "join" | "customize") {
	void rpc.request[action]({});
}
function snooze(index: number) {
	const minutes = current?.snoozePresets[index] ?? (index === 0 ? 1 : 5);
	void rpc.request.snooze({ minutes });
}

$("dismiss").addEventListener("click", () => act("dismiss"));
$("join").addEventListener("click", () => act("join"));
$("customize").addEventListener("click", () => act("customize"));
$("snooze1").addEventListener("click", () => snooze(0));
$("snooze5").addEventListener("click", () => snooze(1));

function handleKey(key: string, preventDefault: () => void) {
	switch (key) {
		case "Escape":
		case "Enter":
			preventDefault();
			act("dismiss");
			break;
		case "j":
		case "J":
			if (current?.joinUrl) {
				preventDefault();
				act("join");
			}
			break;
		case "1":
			preventDefault();
			snooze(0);
			break;
		case "5":
			preventDefault();
			snooze(1);
			break;
	}
}

window.addEventListener("keydown", (e) => {
	if (e.metaKey || e.ctrlKey || e.altKey) return;
	handleKey(e.key, () => e.preventDefault());
});

setInterval(renderCountdown, 1000);
