# Get To Work

Unmissable full-screen meeting alerts for macOS, on every display. A feature clone of
[In Your Face](https://inyourface.app/) built with [Bun](https://bun.sh) and
[Electrobun](https://electrobun.dev), shipped as a single self-installing binary.

- Reads Apple Calendar via EventKit (iCloud, Google, Exchange… whatever is configured in macOS).
- Shows a screen-covering alert on **every monitor** shortly before each meeting, above full-screen apps and the menu bar.
- Join the call with one click (60+ conferencing providers detected), snooze, or dismiss. Keyboard: `J` join, `1`/`5` snooze, `Esc` dismiss.
- Menu bar countdown to the next meeting, upcoming events, pause alerts, sync now.
- Filters (calendars, all-day, declined, tentative, keywords, attendees, join-link only), per-event overrides, custom sounds, global shortcuts.

## Install

Download the latest `get-to-work` binary from GitHub Releases, then:

```sh
chmod +x get-to-work
./get-to-work            # installs ~/Applications/Get To Work.app, registers it at login, starts it
```

If you downloaded it with a browser (not `curl`/`gh`), macOS quarantines the file; clear that first:

```sh
xattr -d com.apple.quarantine ./get-to-work
```

On first launch macOS asks for **Calendar access** – click *Allow*. Look for `GTW` in the menu bar.

Other commands: `get-to-work status | start | stop | restart | logs | uninstall [--purge] | --version`.

Requires macOS 14+ on Apple silicon.

## Develop

Prerequisites: Xcode Command Line Tools, [hutch](https://framework.blackboard.sh/electrobun/guides/hutch/)
(`curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh`), Bun ≥ 1.4.2 for the installer build.

```sh
hutch install
hutch run dev            # dev build (no calendar permission strings – use `bun run release` to test EventKit)
bun test                 # unit tests for scheduler, filters, meeting links, settings, installer
bun run release          # hutch build → patch Info.plist → ad-hoc sign → tar → bun --compile → dist/get-to-work
```

CI: `.github/workflows/build.yml` runs typecheck, tests, and the full release pipeline on every push to `main`,
uploading `get-to-work` as a workflow artifact; pushing a `v*` tag publishes it as a GitHub Release.

Layout: `src/bun` main process (Bun), `src/views` alert + settings UIs, `native/macos/gtw.mm` EventKit + window-level bridge
loaded via `bun:ffi`, `installer/` the self-installing CLI, `scripts/` build glue.

Automation hook: while the app runs, append JSON lines to
`~/Library/Application Support/ai.sugarmaple.get-to-work/<channel>/commands.jsonl`; results land in `commands.out.jsonl`.
Actions: `status`, `events`, `sync`, `grant-access`, `test-alert`, `close-alert`, `alert-key` (`{"key":"Escape"}`),
`show-next`, `pause` (`{"minutes":30}`), `resume`, `settings`, `set` (`{"settings":{…}}`), `state`, `reset-state`,
`open-settings`, `create-test-event` (`{"inMinutes":2}`), `delete-event` (`{"id":…}`), `quit`.
