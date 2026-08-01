# Show Bible Version — Plan (short)

**Goal:** Show the Bible translation next to the verse reference, e.g. `John 3:16 (KJV)`.

**What changes:**
- Store the version in `LyricsStore` (new `bibleVersion` field, auto-cleared when a song loads).
- When a verse is selected, save its version (`KJV`, `WEB`, ...).
- Both the **stage** and **regular** displays render `reference (version)`.
- A small pure helper `formatBibleReference` is unit-tested.

**Phases:** store → wire-up → helper+tests → render in both outputs → verify.
