import { GlobalShortcut } from "electrobun/main";

export interface ShortcutBindings {
	showNext: string;
	togglePause: string;
}

const registered = new Set<string>();

export function applyShortcuts(bindings: ShortcutBindings, handlers: { showNext(): void; togglePause(): void }): void {
	for (const acc of registered) GlobalShortcut.unregister(acc);
	registered.clear();
	const pairs: Array<[string, () => void]> = [
		[bindings.showNext, handlers.showNext],
		[bindings.togglePause, handlers.togglePause],
	];
	for (const [acc, fn] of pairs) {
		if (!acc) continue;
		const ok = GlobalShortcut.register(acc, () => {
			try {
				fn();
			} catch (err) {
				console.error("[shortcuts] handler failed", err);
			}
		});
		if (ok) registered.add(acc);
		else console.warn("[shortcuts] could not register", acc);
	}
}

export function releaseShortcuts(): void {
	for (const acc of registered) GlobalShortcut.unregister(acc);
	registered.clear();
}
