# Product Vision & Change Specification — implementation status

Status of each section of *Mira — Product Vision & Change Specification* against this repository.
✅ done · 🟡 partly done · ⏳ not started

| § | Item | Status | Notes |
|---|---|---|---|
| 3.1 | Briefing as boxed sections (To-dos, Reminders, News, Concept) in a grid | ✅ | “Brief me” renders collapsible cards; layout is markdown underneath |
| 3.1 | “3 things worth knowing today”, Why it matters, source, time, Read more | ✅ | Deterministic, no AI call |
| 3.1 | Per-story Ask Mira / Share | ✅ | Save/dismiss stay on the News page |
| 3.1 | Group duplicate stories | 🟡 | Feed dedupe by URL and title; no clustering of related stories |
| 3.2 | Dated briefing snapshots | ✅ | `briefings.snapshot` (stories, tasks, reminders, events, concept, word) |
| 3.2 | Chat understands “the briefing”, “that story”, “yesterday’s briefing” | ✅ | Retrieved server-side from snapshots; “From today’s briefing” chip |
| 3.3 | Newspaper uses full width; collapsible, persistent sidebar | ✅ | Sidebar preference: pinned / hidden |
| 4.1 | Calendar: day / week / month / agenda; create, edit, delete | ✅ | Location/link, notes, attendees, repeats |
| 4.1 | Natural-language events with confirmation | ✅ | Chat and quick add (“Meeting with Raj tomorrow 3pm for 30 min”) |
| 4.1 | Recurring events, event reminder, conflict warnings | ✅ | One linked reminder per event; overlaps reported, not blocked |
| 4.1 | Drag-and-drop rescheduling | ✅ | Week and month views, desktop; one-off events and tasks |
| 4.1 | Buffer time between events | ⏳ | |
| 4.1 | Tasks and reminders on the calendar without duplicates; complete / postpone | ✅ | |
| 4.2 | Cross-feature consistency | ✅ | Covered by `apps/api/src/test/workspace.test.ts` |
| 5.1 | Word of the day: pronunciation, definition, examples, collocations, usage, quiz | ✅ | Curated list of 30, no AI |
| 5.1 | Save / known, spaced review, streaks | ✅ | Learn page review cards; learning-day streak |
| 5.2 | Learning tracks, depth levels, flashcards, weekly summaries | 🟡 | Existing lessons, quizzes and reviews; no depth switch or weekly summary yet |
| 6 | Eight layouts with Auto / Shuffle / Manual, persisted | ✅ | Classic, Newspaper, Magazine, Timeline, Bento, Focus, Command Center, Knowledge Map |
| 6.1 | Density preference | ✅ | Comfortable / compact |
| 6.1 | Saved presets, widget reordering | ⏳ | |
| 7 | Chat search (titles + messages), pin, rename, archive, multi-select, export | ✅ | |
| 7 | Save responses as notes; context indicator | ✅ | |
| 7 | Folders / collections | 🟡 | API supports a `folder` field; no UI yet |
| 7 | Searchable knowledge library | 🟡 | Knowledge Map layout shows topics, saved words and notes |
| 8 | Scope policy enforced on the backend | ✅ | Out-of-scope → redirect with no AI call; mixed → supported part answered |
| 9 | Morning briefing / evening recap | ✅ | Existing scheduled briefings |
| 9 | “What changed?”, weekly insights, smart follow-through | ⏳ | |
| 11 | SaaS readiness (onboarding, plans, integrations) | ⏳ | Later phase per the spec |
| — | iPhone app parity for calendar, layouts and words | ⏳ | iOS shows event proposals as “confirm on web” |
