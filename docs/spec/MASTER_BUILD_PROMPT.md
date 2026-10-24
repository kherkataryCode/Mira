# FRIDAY — MASTER BUILD PROMPT
## Personal AI Assistant for Web + iOS, secure by design, responsive in every orientation

You are acting as a principal product engineer, senior full-stack architect, iOS engineer, product designer, DevSecOps engineer, QA lead, and technical writer. Build **Friday**, a polished personal AI assistant that helps one person plan, learn, stay informed, and follow through. Do not merely produce a landing page, mock UI, or architecture essay: deliver a runnable, tested repository with working core features, documented limitations, and a Render Blueprint.

## 0. Required deliverables

Create a complete GitHub-ready repository with:
- Working web app and iOS app project (not just screenshots).
- Backend API, database schema/migrations, background worker/scheduler, and AI provider gateway.
- `render.yaml` Blueprint at the repository root that matches the actual repository paths and commands.
- Dockerfiles where needed, `.env.example` files, lockfiles, health checks, and production build scripts.
- `README.md` with copy/paste local setup, GitHub upload, Render deployment, environment variables, database setup/migrations, APNs setup, AI provider setup, troubleshooting, and rollback instructions.
- `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE` placeholder clearly marked for owner choice, `CHANGELOG.md`, architecture diagram, threat model, API docs, and backup/restore guide.
- Automated tests, GitHub Actions CI, dependency/security checks, seed/demo data, and a demo mode that does not require paid AI keys.
- Responsive UI design reference image for desktop web, mobile web, iPhone portrait, and iPhone landscape. Include the supplied concept image in `design/` and create implementation screenshots if browser/device automation is available.
- A concise acceptance checklist mapping every requirement below to implementation and tests.

**Honesty rule:** never claim the app is production-ready, secure, deployed, or tested unless evidence supports it. Mark external credentials/integrations requiring user setup. Do not fabricate deployment URLs or API keys. If a feature cannot be completed, document why, the exact remaining steps, and a safe working fallback.

## 1. Product vision

Friday is a friendly, capable, calm personal assistant—not a generic chatbot and not just a todo list. It should feel proactive without being intrusive. Its core promise: **Plan. Learn. Stay informed. Be productive.**

Primary areas:
1. Home / Daily Brief
2. Chat + voice
3. Tasks and projects
4. Reminders and calendar-like agenda
5. Bite-sized learning
6. Personalized news
7. Notes and personal knowledge
8. Settings, privacy, integrations, and system health

Use a warm, natural conversational style, concise by default, with user-controlled verbosity. Never pretend to have completed an action that failed. Confirm consequential actions and communicate uncertainty.

## 2. Visual design — follow the reference's design language, not its exact assets

Reference inspiration: https://dribbble.com/shots/27708813-Online-Courses-Mobile-App

**Treat this reference as the primary visual direction and override generic dashboard styling.** The reference describes an editorial, curated-course archive: bold course-poster compositions, oversized typography, abstract geometric artwork, magazine-like layouts, curated discovery cards, clear categories, and an expressive learning flow. Adapt those design principles to Friday without copying the creator's exact screen, assets, or branding.

Brand: **Friday**. Visual direction:
- Use a sophisticated editorial palette inspired by the reference: near-black `#060505`, warm cream/sand `#DECDB6` and `#D4BC9E`, muted greens `#4F7755` and `#7E886E`, warm taupe `#BBAF9D`, charcoal `#444335`, and restrained vermilion `#D63229` for important accents. Create accessible design tokens and check contrast.
- Keep the app dark-first with near-black surfaces and warm cream text, while using cream/sand panels and poster-like artwork as deliberate accents. Avoid the previous blue/purple gradient-heavy generic AI dashboard look.
- Use oversized editorial headings, confident serif display typography paired with a clean sans-serif UI font, asymmetrical but orderly composition, abstract geometric shapes, strong visual rhythm, spacious margins, and polished cards.
- Learning content should feel like a curated creative magazine: bold featured lesson/course cards, category chips, clear reading time/level, “continue learning,” and saved lessons. Reuse the same visual language for daily briefs, news, and assistant suggestions.
- Keep task and reminder lists calm, scannable, compact, and practical; editorial styling must not reduce usability.
- Chat should be a first-class destination, not a small dashboard widget: full conversation view, readable message bubbles, clear streaming/thinking state, text composer, attachment/voice controls where supported, and an obvious microphone/voice mode. Use a warm accent for the main action and show clear listening/recording state.
- Use a consistent icon library and design tokens; no emoji as a substitute for all UI icons. Avoid excessive glassmorphism, generic neon gradients, clutter, tiny text, gratuitous animation, and fake metrics.
- Do not copy proprietary artwork. Create original abstract shapes or use licensed/open assets with attribution where required.

### Responsive and orientation requirements — mandatory
The UI must fit the viewport in **portrait and landscape**, across small iPhones, larger phones, tablets, laptops, and desktop monitors:
- No horizontal page overflow at any supported width.
- Respect iOS safe-area insets (`env(safe-area-inset-*)`) and notches/home indicators.
- Use dynamic viewport units (`dvh` where appropriate), flexible grid/flex layouts, fluid typography, and content-aware breakpoints.
- In landscape on short screens, compact headers/cards, reduce vertical padding, allow intentional panel scrolling, and keep key actions reachable.
- Do not lock orientation unless a specific screen truly requires it.
- Avoid fixed pixel heights for main content; account for browser chrome and virtual keyboard.
- Chat input remains visible above the keyboard; scroll conversation to the newest message safely.
- Touch targets should generally be at least 44×44 CSS px; provide keyboard access and visible focus.
- Test at minimum 320×568, 390×844, 844×390, 768×1024, 1280×800, and 1920×1080, plus one Android-sized viewport.
- Provide a responsive screenshot matrix and note any unavailable real-device tests.

### Main screens
**Home dashboard**
- Greeting and concise daily overview.
- Today's tasks, next reminders, one learning card, top relevant news, daily brief, and quick actions.
- Do not fabricate metrics or display empty decorative charts.
- Let users reorder/hide dashboard widgets if practical.

**Chat**
- Text input, voice capture, conversation history, streaming responses if reliable, cancel generation, retry, copy, and clear error states.
- A visible indicator for the selected AI provider/model where useful.
- The assistant can propose task/reminder/news actions but must show a clear confirmation step for consequential actions.
- Use accessible loading states and never silently drop a message.

**Tasks**
- Create/edit/complete/reopen/delete, due dates, priorities, tags, project, filters, search, recurring tasks, and task history where appropriate.
- Natural-language entry such as “Remind me to call the dentist tomorrow at 5 PM” must be parsed into a preview; user confirms ambiguous dates/times.
- Task state is persisted in the database, not only client memory.

**Reminders**
- One-time and recurring reminders, timezone-aware scheduling, snooze/dismiss/complete, configurable advance notification, and visible delivery status.
- Use Asia/Kolkata as the initial default timezone but let the user change it.
- Reliable reminder delivery must not depend on an LLM being awake. The backend scheduler/worker is authoritative; local notifications can be scheduled on iOS when permissions are granted, with server push for server-generated events.
- Explain iOS notification permissions and limits. Never promise delivery if APNs, device permissions, network, or hosting availability is not configured.

**Daily brief**
- Summarize actual upcoming tasks/reminders, selected news, and learning progress. Do not invent personal events.
- Configurable schedule and sections; allow regenerate-on-demand with cost limits.
- Sensible suggested defaults (all editable): morning brief 8:00, news scan 8:00 and 17:00, microlearning 12:30, afternoon check-in 13:00, evening review 21:00, timezone Asia/Kolkata. Do not force these schedules on the user.

**Microlearning**
- Short lessons with a plain-language explanation, practical example, key takeaway, optional short quiz, saved progress, and spaced-repetition review.
- Personalize topics (e.g. technology, cybersecurity, finance, communication) through settings.
- Do not claim mastery from a single quiz.

**Personalized news**
- User-selected categories, sources, keywords, importance, deduplication, summaries, publication timestamps, and source links/citations.
- Distinguish breaking, important, relevant, and background news.
- Respect source/API terms, rate limits, robots/access restrictions, and copyright. Summarize rather than republish articles.
- If sources are unavailable, show a clear stale-data/error state; do not fabricate news.
- Scheduled jobs fetch only at configured intervals; do not poll continuously or call an LLM for every item.

**Notes / personal knowledge**
- Save/search/edit/delete user notes. Add tags and link notes to tasks/lessons when useful.
- Memory is user-controlled: show what is saved, allow edit/export/delete, and do not infer sensitive traits unnecessarily.
- Provide data export and account deletion flow.

**Settings**
- Profile, timezone, briefing schedule, notification preferences, AI provider order/budgets, news preferences, learning topics, privacy/data export, theme, connected integrations, sessions, and security.

**System Health (owner-only)**
- Read-only status for API, database, worker/scheduler, last successful job, provider failures, queue depth, and AI spend where available.
- Never expose secrets, raw prompts containing private data, internal stack traces, or another user's information.
- Make it clear this is a health snapshot, not a guarantee.

## 3. Technology stack — use this unless a documented constraint justifies a change

Prefer a TypeScript monorepo:
- **Web:** Next.js (App Router) + TypeScript + React.
- **UI/styling:** Tailwind CSS + accessible component primitives (e.g. shadcn/ui or Radix); design tokens and responsive layouts.
- **iOS:** Expo + React Native + TypeScript, with native capabilities through Expo modules; use Expo Notifications and SecureStore where appropriate. If a true native-only capability cannot be supported in Expo Go, document the development-build step.
- **API:** Node.js LTS + TypeScript + Fastify (or Next.js API routes only if a separate API/worker architecture remains clear; prefer Fastify for the standalone backend).
- **Database:** PostgreSQL; migrations with a maintained tool (e.g. Prisma or Drizzle). Use connection pooling suitable for Render.
- **Background jobs:** a separate worker process with a PostgreSQL-backed job queue/scheduler (e.g. pg-boss or equivalent), durable retries, idempotency, and bounded concurrency. Do not rely on in-process `setInterval` as the production scheduler.
- **AI gateway:** provider adapters for Kimi/Moonshot, OpenAI, and Anthropic, with server-only credentials, normalized request/response contracts, bounded timeouts/retries, budgets, and provider fallback.
- **OpenClaw:** optional orchestration integration behind a strict adapter/API boundary. Do not assume it is installed, available, or safe by default. The app must still work without OpenClaw.
- **Authentication:** use a maintained auth library/provider with secure defaults. Prefer passkeys/OAuth where practical; if local passwords are supported, hash with Argon2id. Do not invent cryptography.
- **Validation:** Zod or equivalent for all untrusted inputs.
- **Testing:** Vitest/Jest for unit/integration, Playwright for web E2E, and Expo/iOS checks where feasible.
- **CI/security:** GitHub Actions, ESLint, TypeScript checks, dependency audit, secret scanning, static analysis, and test/build gates.
- **Hosting:** Render Blueprint for API, worker, web (or separate frontend host only if justified), and managed PostgreSQL. Keep web/API/worker commands and health checks consistent with actual files.
- **Observability:** structured logs with redaction, request IDs, health/readiness endpoints, job outcomes, provider latency/errors, and budget metrics.

Pin supported runtime versions, commit lockfiles, and verify the chosen packages and commands actually exist at implementation time. Do not invent package names or use unmaintained packages without explaining why.

## 4. Architecture and separation of responsibilities

Build clear modules:
- `apps/web`
- `apps/mobile`
- `apps/api`
- `apps/worker`
- `packages/shared` (schemas/types)
- `packages/ui` only if it genuinely reduces duplication
- `infra/` for deployment and operational docs
- `docs/` for architecture, threat model, API, and setup
- root package/workspace config and CI

The backend is the authority for user data, permissions, scheduling, and consequential actions. The model is not the database, clock, scheduler, or permission system.

Suggested flow:
1. User speaks/types in web or iOS app.
2. Client sends authenticated request to API over HTTPS.
3. API validates schema, authenticates/authorizes, applies rate/budget limits, and persists user-approved changes.
4. AI gateway selects a provider/model for language tasks only; tool requests are validated against allowlisted schemas and user permissions.
5. Tasks/reminders/news preferences are saved to PostgreSQL.
6. Worker runs due jobs, scheduled news collection, brief generation, notification dispatch, cleanup, and retries.
7. iOS local notifications are used only when scheduled on-device and permitted; server push uses APNs with explicit credential setup.
8. UI shows state from persisted records and delivery/job status.

## 5. AI provider gateway and cost controls

Support Kimi/Moonshot, OpenAI, and Anthropic through separate adapters. User can set primary and fallback order and per-provider/model budgets.
- Keep keys server-side only; never send provider keys to web/iOS.
- Classify failures: invalid key/permission (do not loop retries), quota/billing, rate limit (honor Retry-After), transient outage/timeouts, invalid request, and model unavailable.
- Use bounded exponential backoff with jitter, maximum attempts, request timeout, and circuit breaker if justified.
- Do not blindly replay tool calls or side effects after a timeout. Use idempotency keys and reconcile persisted state.
- Fallback only for appropriate failures; never hide auth/quota errors behind infinite retries.
- Use deterministic code for reminders, CRUD, calculations, sorting, deduplication, and simple summaries whenever possible.
- Limit context, message history, output tokens, and tool rounds. Cache safe reusable results with TTL. Avoid sending sensitive records unless needed.
- Log token/cost estimates without logging full private prompts by default. Enforce per-user and global budgets and provide a graceful “AI temporarily unavailable” fallback.
- Demo mode must work without any AI key and must visibly identify demo responses.

## 6. OpenClaw / agent tool safety

OpenClaw is optional, never a security boundary by itself.
- Treat webpages, email/news, documents, and retrieved text as untrusted data that may contain prompt injection.
- Never allow retrieved instructions to override system policy or user authorization.
- Use allowlisted, narrowly scoped tools with schema validation, timeouts, output size limits, audit trails, and per-tool permissions.
- Separate read-only tools from write tools. Require explicit user confirmation for deleting data, sending external messages, changing account/security settings, or other consequential actions.
- Do not expose shell, filesystem, arbitrary browser, or unrestricted network tools to a model by default.
- Restrict outbound network access where practical; block metadata/private network SSRF targets and validate destinations.
- Require user-configured OpenClaw endpoint/credentials; fail closed if configured insecurely. Keep OpenClaw disabled by default until configured and tested.

## 7. Mandatory security requirements

Threat-model the system and implement defence in depth:
- Authentication and per-resource authorization on every protected endpoint; prevent IDOR and cross-user data access.
- Secure, HttpOnly, SameSite cookies for web sessions; Secure in production; CSRF protections where applicable. Mobile tokens stored using platform-secure storage; rotate/revoke refresh tokens and sessions.
- Argon2id for any locally stored password hashes; never store plaintext passwords or secrets.
- Rate limiting for login, password reset, chat/AI, and mutation endpoints; generic auth errors; lockout/throttling that avoids easy denial of service.
- Validate all inputs and environment variables at startup. Use parameterized queries/ORM, safe output encoding, CSP, strict CORS allowlist, payload limits, timeouts, and safe error responses.
- Prevent XSS, CSRF, SSRF, SQL injection, path traversal, open redirects, unsafe deserialization, and mass assignment.
- Secrets only in environment/secret manager; `.env` ignored by Git; provide `.env.example` with placeholders only. Never expose secrets in frontend bundles, logs, source maps, error responses, or screenshots.
- HTTPS/TLS in deployment; least-privilege database role; encrypt sensitive fields where justified; redact logs; document data retention, export, deletion, and backup restore.
- Do not collect sensitive data unless required. No third-party analytics by default.
- Separate dev/test/prod; non-root containers where applicable; expose only required ports; private DB access; dependency updates; health checks.
- Add tests for authorization boundaries, session expiry/revocation, rate limits, job idempotency, retries, and secret redaction.
- Include a practical threat model with assets, trust boundaries, abuse cases, mitigations, and residual risks. Never promise perfect security.

## 8. Code quality and performance rules

For every module/function/dependency, ask:
- Is it necessary and used? Is it duplicated? Is there a simpler built-in or already-installed alternative?
- Does it allocate large objects, make unnecessary network/DB calls, or repeat work?
- Are errors, timeouts, cancellation, race conditions, and cleanup handled?
- Is the function testable and appropriately small? Are types and names clear?
- Is there evidence for optimization? Avoid premature complexity.

Required practices:
- Enable TypeScript strict mode and linting; avoid `any` unless justified and contained.
- Avoid duplicated business logic between web, mobile, API, and worker; share validated schemas/types.
- Avoid N+1 queries; use appropriate indexes, pagination, transactions, connection pooling, and query plans for slow queries.
- Use Sets/Maps where they clearly improve repeated lookups/deduplication; bounded queues and concurrency; TTL caches only for safe non-authoritative data.
- PostgreSQL remains the source of truth. Cache is disposable and must not own tasks/reminders.
- Bound chat history, request body size, logs, job retries, concurrency, and AI tool rounds.
- Avoid constant polling. Prefer push, explicit refresh, and modest backoff.
- Keep bundles lean; lazy-load large screens; optimize images; avoid layout shifts.
- Use database migrations safely and never delete migrations/data scripts simply because static search looks unused.
- Detect dead code with static analysis and repository-wide reference checks. Check dynamic imports, route registration, framework conventions, CLI use, config references, migrations, and deployment scripts before removing anything.
- Every code change must include relevant tests and update docs when behavior/configuration changes.

## 9. Scheduling, notifications, and reliability

- Persist jobs or derive due work from persisted records; do not rely on a single web process staying alive.
- Make scheduled jobs idempotent; use leases/locking or queue semantics to prevent duplicate execution across worker restarts/scaling.
- Store timestamps in UTC and keep the user's IANA timezone separately; handle daylight-saving transitions.
- Define retries, dead-letter/manual recovery strategy, missed-run policy, and cleanup/retention.
- Track last success, next run, failure reason safe for display, and delivery state.
- Use APNs credentials only as server secrets. Document Apple Developer membership/signing/provisioning requirements and what can/cannot be tested without a physical iPhone.
- Render Free instances may sleep, have limited resources, and may not provide reliable always-on background execution. Do not promise production-grade scheduling on a sleeping/free worker. Explain paid always-on worker/appropriate hosting for reliable schedules. Never use an in-process timer as the only production scheduler.

## 10. Database and core entities

Design normalized schemas and migrations for at least:
- users, sessions/refresh tokens, user preferences
- tasks, projects, task tags
- reminders and recurrence/timezone metadata
- notification deliveries and device registrations
- conversations and messages with bounded retention
- learning topics, lessons, quiz attempts, progress/review schedule
- news preferences, sources, items, user saves/feedback
- notes and tags
- provider configuration (secret values must not be stored as plain text in ordinary rows), usage/budget events
- scheduled jobs/job outcomes and audit events

Every user-owned record must have an owner relationship and authorization tests. Add indexes based on actual query patterns. Include migration and seed data. Use fake demo data only in demo mode.

## 11. Testing and definition of done

Before calling a feature done:
- Typecheck, lint, unit tests, integration tests, production build, and security checks pass.
- Test auth/authorization and data isolation for two different users.
- Test invalid inputs, timeouts, provider outage/quota/rate limit, retries, duplicate job execution, and notification permission denial.
- Verify all pages and forms work; no dead buttons, fake success messages, or placeholder links disguised as real functionality.
- Test responsive layouts at the viewport sizes listed above in portrait and landscape; no clipped controls or horizontal overflow.
- Verify the Render Blueprint is syntactically valid and its service names, env vars, health checks, build/start commands, Docker contexts, and database references match the repo.
- Add a CI workflow that runs on pull requests and pushes.
- Review git diff for accidental secrets, generated files, debug logs, and unrelated changes.
- Document checks actually run and checks that could not be run.

## 12. Render deployment requirements

Provide a root-level `render.yaml` Blueprint that deploys the actual repository. Choose a coherent topology and document any paid services:
- Web frontend service.
- API service if separate.
- Always-on background worker for reliable schedules.
- Managed PostgreSQL database.
- Correct health checks, runtime/build/start commands, and environment-variable references.
- `sync: false` for user-provided secrets; do not include actual values.
- Database migrations must run safely as a release/pre-deploy step where supported, not on every web request.
- No secrets in repo. Do not assume persistent disk exists on free instances. Do not use SQLite as production source of truth.
- If Render Blueprint limitations require manual dashboard steps, list exact steps and mark them clearly.
- Include expected costs/plan caveats without inventing current prices; link to official Render docs.
- Provide a local Docker Compose or equivalent development setup if practical.

## 13. GitHub upload and setup guide

Write exact instructions for:
1. Prerequisites and versions.
2. Clone/download, install dependencies, configure `.env`, run database, apply migrations, seed demo data, start all services locally.
3. Test demo mode without paid keys.
4. Add API keys securely and test each provider.
5. Configure optional OpenClaw.
6. Create GitHub repository and upload using Git or web UI, including `.gitignore` and secret checks.
7. Connect repository to Render and deploy the Blueprint.
8. Create/set database and run migrations safely.
9. Configure custom domain/HTTPS if desired.
10. Configure APNs and iOS push; describe Apple Developer and signing requirements, Expo development builds/TestFlight as applicable.
11. Run smoke tests, inspect logs, test worker and reminders, test rollback and restore.
12. Troubleshoot common errors: missing env vars, database URL/SSL, migrations, CORS, callback URLs, provider quota, Render sleeping, APNs setup, and iOS notification permissions.

## 14. Execution protocol

Do not stop after generating a plan. Work in phases:
A. Inspect environment and choose compatible dependency versions.
B. Produce architecture, threat model, and data model.
C. Build one end-to-end vertical slice: authentication → create task → persist → show on dashboard.
D. Add reminders + worker/idempotency.
E. Add provider gateway and demo mode.
F. Add news and microlearning.
G. Add iOS app and notification flows.
H. Complete UI polish/responsive orientations.
I. Add tests, CI, security scans, docs, Render Blueprint.
J. Run all available checks, fix failures, review diffs, and produce final handoff.

At each phase, implement and test instead of leaving TODO-only stubs. If scope is too large for one pass, prioritize a secure working vertical slice and label incomplete features honestly. Do not replace real functionality with a fake demo unless it is explicitly isolated as demo mode.

## 15. Final response from the coding agent

At the end, report:
- What is implemented and what remains.
- Exact repository tree.
- Commands run and pass/fail results.
- Local URLs and setup steps (only if actually verified).
- Render Blueprint service list and required environment variables.
- iOS build/signing/push steps and remaining manual requirements.
- Security/performance findings and residual risks.
- Known limitations and next recommended steps.
- Link/path to the completed source archive if the environment supports file creation.

**Now build Friday as a complete, coherent, testable repository. Prioritize correctness, security, responsiveness, low operating cost, and maintainability over unnecessary features or abstraction.**


## 16. Explicit chat and voice acceptance criteria
Chat and voice are core product requirements and must be implemented, not merely shown in mockups:
- Include a dedicated Chat screen/page accessible from primary navigation on both web and iOS.
- Text chat must persist conversation history per user and support send, loading/streaming, cancel, retry, copy, and recoverable errors.
- Voice input must request microphone permission when needed, visibly show listening/recording state, support stop/cancel, and provide an editable transcription preview before sending when the platform supports it.
- Support spoken responses only if a suitable text-to-speech implementation is configured; expose a mute/voice preference and handle unavailable speech services gracefully.
- Do not claim continuous background listening or wake-word support unless explicitly implemented with the required native permissions and platform constraints.
- The composer must remain usable in portrait and landscape, including when the mobile keyboard is open.
- Add automated tests for chat persistence, authorization, failed provider calls, cancellation, and voice permission-denied states where testable.
- If a provider does not support audio natively, use a documented speech-to-text adapter or clearly label voice input as unavailable until configured; never display a fake microphone success state.
