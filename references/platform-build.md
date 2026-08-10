# Platform build and acceptance

## Tiered performance gates

- User delivery: run packaged smoke and `run_performance_audit.mjs --quick` only on the final actual-count package. Measure every main phase for five seconds, then use `validate_performance_report.mjs` to bind the report to the current project, complete portable directory, and EXE SHA-256. This smoke does not replace the Skill release soak.
- Skill release: run complete real 5-window and 8-window packaged audits only when the shared `candidateFingerprint`, Electron, platform/architecture, performance contract, or fictional fixture changes. Cache the result under `$CODEX_HOME/cache/love-roommate/performance-v1/` for at most 30 days.
- A cache hit must still run `validate_performance_release.mjs` against both fictional projects, reports, portable apps, and the current candidate. Corruption, failure, expiry, photos, names, or absolute paths invalidate it.
- Direct `build_project.mjs` calls default to `--performance-profile full`; only the unified `delivery` profile selects `quick`. Calling `release_check.mjs` without arguments always means the complete test suite.

## Windows

- Supported target: Windows 10/11 x64.
- Use the pinned Electron runtime downloaded automatically by the Skill and package it without an installer or system-wide tools.
- Deliver a named portable app folder under `release/windows/` containing the matching `.exe` and Electron runtime files. The user launches that `.exe` directly; no installation or administrator access is required.
- Materialize the staged package with the guarded release-transfer helper: use an atomic directory rename on the same volume, fall back to recursive copy only for `EXDEV`, and remove a partial destination when fallback copying fails. Do not copy a staged Windows app directly into `release/windows/` with an unguarded recursive copy.
- Verify transparent-window rendering, tray menu, drag, right-click hit testing, global shortcuts, and normal clicks through transparent pixels.
- Do not require installation or administrator access.

## macOS

- Supported target: macOS 13+ on Apple silicon.
- Use the pinned Electron runtime downloaded automatically by the Skill and package it directly on an Apple-silicon Mac.
- After installing app resources and updating `Info.plist`, ad-hoc sign the complete `.app` and require `codesign --verify --deep --strict` to pass before reporting packaging success.
- Deliver the locally ad-hoc-signed `.app` under `release/macos/`.
- Use the same guarded release-transfer helper and preserve relative symlinks when a cross-volume copy fallback is required.
- Do not claim Developer ID signing, notarization, DMG, Intel support, App Store readiness, or general Gatekeeper acceptance.
- Locally built apps normally avoid download quarantine. If a copied app is blocked, tell the user to use Finder's **Open** command or the Privacy & Security panel; do not disable Gatekeeper globally.

## Cross-platform rule

Never treat a Windows-produced macOS directory as a verified `.app`. Preserve the editable project so the same source can be built again on the target operating system.

## Runtime acceptance

- Keep every character inside the nearest display work area and away from the taskbar or Dock.
- For self-present poop chase, choose the display containing self, make one gradual safe placement inside that work area, then ignore ordinary cursor motion. Only dragging self may translate the complete row and current dropping; release fixes the formation again. For no-self cursor-centipede, follow the click-through cursor poop with bounded speed, acceleration, and dead-zone smoothing while keeping the connected row inside the active work area; never teleport.
- Keep the decorative poop cursor, dropped poop, and stink effects permanently click-through.
- Right-click the visible character to open recovery controls; clicks outside opaque pixels must reach the underlying app.
- Verify group shout and poop chase are mutually exclusive, Pause freezes both people and the current poop effect, and leaving a prank hides its effect windows.
- With self present, verify ordinary mouse movement changes no character position after the one-time placement; self remains visibly in front as the only poop source, exactly one dropping is readable, every other character chases and eats in repeating photo-number order, and eaters never become poop sources. Drag self and verify every person plus the dropping moves by the same bounded offset, self keeps the poop pose, and release fixes the row. With no self selected, verify the click-through cursor poop follows the real pointer with smoothing, never jumps, and every human-centipede mouth touches the previous rear while the full connected chain chases it.
- Capture each poop effect over a controlled surface containing both light and dark regions. Freeze the composition, capture the visible poop, then hide only the poop effect and capture the matching `effect-underlay.png`. Verify transparent interior pixels, the outer edge band, and all four corners restore the underlay; reject neutral white/gray compositor artifacts even when the effect PNG's alpha looks clean. Also verify the effect window/page uses true transparency, the capture contains a substantial transparent-pixel region, and desktop foreground coverage matches a compact brown silhouette rather than an opaque white/gray rectangle. White-only screenshots are not valid edge evidence.
- Verify dad and grandpa reports distinguish `recipientId`, `participantIds`, `excludedIds`, and `skippedReason`. When self is present, that recipient moves at the configured speed to the formation center axis, stands in front without overlap, remains idle, and shows no prank bubble while every other character kneels and shouts. When self is absent, `recipientId` is null and every photographed character kneels and shouts; do not create spectators or extra exclusions.
- Use tray Pause and Quit as recovery controls.
- On centipede exit, show only the configured grandpa phrase when `exitShout` is enabled.
