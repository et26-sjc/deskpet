# Selected-self upright invariant

This maintenance contract prevents the explicitly selected self from appearing as a crawling desktop pet.

## Public behavior

- Applies whenever `selection.userCharacterId` is non-null.
- Applies to every supported one-to-eight-person project and every possible self position.
- Normal mode may move the selected self, but it renders `idle_left` or `idle_right` and remains upright.
- Normal-mode dragging uses `drag`; drag release returns to an upright idle action. During self-poop, dragging self keeps `poop_left/right`, translates the complete queue and current dropping, and release leaves the formation fixed.
- Dad and grandpa shout keep the selected self upright as the recipient.
- Self-poop keeps the selected self in the poop role throughout formation, active chase, and drag-based whole-formation repositioning. Ordinary cursor movement never moves self in this branch.
- The selected self never renders `crawl_*` or `centipede_*`.

## Required implementation points

Keep the invariant active in all of these paths:

1. Pet initialization and respawn.
2. Free-roam movement and work-area recovery.
3. Group-shout gathering and recipient holding.
4. Self-poop formation transitions and relay updates.
5. Normal drag release and self-poop whole-formation drag/release.
6. Controlled runtime-evidence staging.
7. Final state sanitization as a fail-safe.

Use one shared action selector for ordinary movement. Do not duplicate a raw `crawl_left` / `crawl_right` choice in new selected-self-capable paths.

## Regression coverage

The template behavior-engine suite must:

- iterate people counts 1 through 8;
- iterate every valid selected-self position for each count;
- check initialization, free roam, forced state repair, drag release, and respawn;
- check group-shout and self-poop transitions, fixed behavior under ordinary cursor movement, and whole-formation movement only while dragging self;
- fail if the selected self renders either a `crawl_*` or `centipede_*` action.

Any runtime-code change invalidates old screenshots, runtime review fingerprints, packaged performance reports, and packaged binaries. Refresh and revalidate all release evidence before delivery.
