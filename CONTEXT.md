# Baby Tracker Context (RK-Protocol)

## 🎯 Project Vision
An AI-native, mobile-first baby tracker that transitions from a simple logger to a proactive pediatric assistant.

## 🏗️ Architecture
- **Backend**: Supabase (PostgreSQL + Edge Functions).
- **Frontend**: React (Vite-based) with a **"Dumb Frontend"** principle.
- **AI Core (Two-Phase Scout & Expert)**: 
  - **Phase 1 (Scout)**: Resilient waterfall (`gemini-3.1-flash-lite` -> `gemini-2.5-flash-lite`) with Google Search fetches live environmental/weather context for Gurgaon.
  - **Phase 2 (Expert)**: The standard Gemini waterfall (3.5 Flash -> 3.1 Lite -> 3.0 -> 2.5 -> 2.5 Lite) performs analysis using the Scout's context as plain text (no tools attached to conserve quota).
- **Component Safety**: All high-complexity components (e.g. `MedBox`, `WeightBox`) must implement a silent-fail render guard (`try...catch` returning `null`) to ensure core app (Activity History) stability.
- **Weight Tracking**: SVG sparklines map X-coordinates to raw timestamps to prevent rendering errors. 0.01kg precision enforced.
- **Medicine Expiration**: AI-driven duration parsing sets `expires_at` column; dashboard auto-filters expired records.

## 🔑 API Key
- **Active Key**: Managed via `.env.local` and Vercel/Supabase environment variables (Rotation: 03-05-2026).
- **Key Scope**: Verified live on `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemma-4-26b-a4b-it`. Note: `gemini-3.1-flash-lite` (503) and `gemma-4-31b-it` (500) are intermittently unavailable — waterfall handles gracefully.
- **Key Location**: Frontend: hardcoded in `src/utils/ai.js`. Edge functions: single source of truth at `supabase/functions/_shared/config.ts` (imported by both functions at deploy time).

## 🛠️ Infrastructure & Toolchain (Verified 03-05-2026)
- **Node**: `/Users/rkant/.nvm/versions/node/v20.20.2/bin/node`
- **NPM**: `/Users/rkant/.nvm/versions/node/v20.20.2/bin/npm`
- **NPX**: `/Users/rkant/.nvm/versions/node/v20.20.2/bin/npx`
- **Supabase CLI**: `/Users/rkant/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/bin/supabase`
  - *Deployment Mandate*: Always use `--no-verify-jwt` for Edge Functions to support internal `pg_cron` triggers.
- **Python**: `/usr/bin/python3`

## 🎛️ External Dashboard Configs (Manual)
- **Cron Jobs**: A **20-minute Cron Job** is configured in the Supabase UI to invoke both Edge Functions.
- **Environment Variables**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are managed in the Supabase Dashboard.
- **DB Schema Note**: The `baby_events` table includes a manually added `intensity` text column for spit-up tracking.
- **DB Constraint (Manual)**: A partial unique index `only_one_active_feed` must be applied via Supabase SQL Editor to prevent duplicate active feeds:
  ```sql
  CREATE UNIQUE INDEX only_one_active_feed
  ON public.baby_events ((1))
  WHERE end_time IS NULL AND type IN ('mom_l', 'mom_r', 'top');
  ```

## 🧠 AI Brains (The "Heavylifters")
1. **`nudge-monitor` (Alerts)**: 
   - Fires Telegram notifications via `sendTelegram`.
   - Checks rule-based intervals (Feed/Pee/Poop).
   - Counts feeding intervals from **start_time**.
2. **`generate-strip-insights` (Dashboard)**: 
   - Updates the `ai_insights` table for the main UI card.
   - **Gatekeeper Logic**: Skips execution if `< 1 Hour` has passed since the last update OR if `no new events` have been logged.

## 🎨 Premium Visual Identity
- **Design Mandates**: Strictly follows the rules established in **`GEMINI.md`** (Big Targets, Visual Weight, Semantic Color Sync).
- **Custom Icons**: Migrated from generic Lucide icons to a custom, hand-drawn SVG library (`src/components/Icons.jsx`).
  - **Breastfeed**: Mirrored mother-baby silhouette for Left/Right sides.
  - **TopFeed**: Spoon/Bowl/Baby profile for supplemental feeding.
  - **Diaper/TummyTime**: Soft, weighted silhouettes for changes and free-time.
  - **QuickLog**: Clipboard+Plus identifier for the main action card.
- **Header UX**: Removed "Quick Log" text in favor of a prominent icon-only anchor. Stretched active controls (Stop/Pause) to `flex: 1` with `48px` touch targets for better ergonomics during feeding.

## 🛡️ Immutable Rules
1. **Cooldown**: Dashboard AI update cooldown is **1 HOUR**.
2. **Feeding Logic**: All "ago" calculations and nudge intervals use **`start_time`** (reverted from end_time).
3. **Frontend Cache**: The Chatbox Scout (weather search) is cached per browser session to prevent redundant API calls.
4. **Local Day Boundaries**: All date filters and "Today" counters MUST use local browser day boundaries (`new Date(y, m, d)`) converted to ISO strings, not raw UTC strings, to prevent regional time zone leaks.
5. **Midnight Reset**: The universal daily reset for all app logic (feeds, diapers, medicines) is exactly **00:00 local time**.
6. **Edge Function Security**: All Edge Functions MUST be deployed with the `--no-verify-jwt` flag. They are internal-only tools triggered by database crons that do not support auth headers.

## 🚧 Active Work / State
- [DONE] Custom premium icon library and header UX overhaul implemented.
- [DONE] Two-Phase "Scout & Expert" AI optimization implemented across all systems.
- [DONE] Added Spit-up tracking (Minor/Major) and grid-3 layout overhaul.
- [DONE] Reverted feeding timers to `start_time` across frontend and backend.
- [DONE] **29-04-2026**: API key rotated across all sources and edge functions. Redeployed to Vercel and Supabase.
- [DONE] **29-04-2026**: Fixed chatbox triage prompt — event types corrected to match DB schema (`mom_l`, `mom_r`, `top`, `diaper`, `spit_up`). Previously used generic types (`feed`, `sleep`, etc.) causing blank logs to be sent to the Expert AI.
- [DONE] **29-04-2026**: Injected current date (IST, `en-IN` format) into Scout prompt across all three AI surfaces (chatbox, insight strip, nudge monitor) to prevent stale/seasonal climate advice.
- [DONE] **03-05-2026**: Global API key rotated across all source files, edge functions, and protocol documentation.
- [DONE] **03-05-2026**: Centralized edge function Gemini key to `supabase/functions/_shared/config.ts` and migrated frontend to use `import.meta.env.VITE_GEMINI_API_KEY`. Key rotation is now a single-point update for edge functions and an env-var update for the frontend.
- [DONE] **20-05-2026**: Prepend `gemini-3.5-flash` to the Insight waterfall sequence across frontend (`src/utils/ai.js`) and both edge functions (`generate-strip-insights` and `nudge-monitor`), and successfully rebuilt the React production bundle. Verified and logged all absolute CLI paths in the environment.
- [DONE] **20-05-2026**: Upgraded the Scout model to the stable `gemini-3.1-flash-lite` across the frontend (`src/utils/ai.js`) and both edge functions (`generate-strip-insights` and `nudge-monitor`). Also updated `gemini-3.1-flash-lite-preview` to stable `gemini-3.1-flash-lite` in the Insight tier waterfalls. Rebuilt the React production bundle.
- [DONE] **20-05-2026**: Implemented resilient multi-model Scout waterfall fallbacks (`gemini-3.1-flash-lite` -> `gemini-2.5-flash-lite`) for Phase 1 weather searches in frontend (`src/utils/ai.js`) and both edge functions (`generate-strip-insights` and `nudge-monitor`). Rebuilt the React production bundle successfully.


- [DONE] **01-05-2026**: Redesigned header — removed welcome subtitle, replaced logout text with icon-only, added user-initials avatar bubble (RK/RS).
- [DONE] **01-05-2026**: Implemented optimistic UI lock (`isSubmitting`) on feed buttons with "Starting..." state to prevent double-tap race conditions.
- [DONE] **01-05-2026**: Added 5-second safety hatch `setTimeout` to auto-unlock UI if network hangs permanently.
- [DONE] **01-05-2026**: Added `BabyContext.addEvent` to throw on Supabase error. QuickLog catches `error.code === '23505'` (Postgres unique violation) and triggers `window.location.reload()` to self-heal out-of-sync state.
- [DONE] **01-05-2026**: Renamed "# Stats" dashboard card to "# Diapers".
- [DONE] **02-05-2026**: Added `visibilitychange` listeners to both `useEffect` data fetchers in `BabyContext.jsx`. App now silently re-fetches all data the moment Safari/Chrome wakes from background, eliminating stale 1000+ minute timers.

- [DONE] **08-05-2026**: Implemented gesture-driven UI with `SwipeableRow`.
  - Left Swipe: Revealed Note (violet) and Edit (purple) icons from the right.
  - Right Swipe: Revealed Delete (red) icon from the left.
  - Snap-open model: Panels stay open after swipe until clicked or row is tapped.
  - Hit-test fix: Foreground renders first to prevent blocking action button clicks.
- [DONE] **08-05-2026**: Integrated Recycle Bin system.
  - Table: `deleted_baby_events` with 10-item FIFO limit (via trigger).
  - UI: Bottom-sheet modal accessible via header icon (moved next to History).
  - Logic: `move_to_trash` and `restore_from_trash` RPCs.
- [DONE] **14-05-2026**: Implemented end-to-end weight tracking with growth trends and Sparkline visualization.
- [DONE] **14-05-2026**: Implemented medicine expiration tracking with AI duration parsing and dashboard countdowns.
- [DONE] **26-05-26**: Fixed disappearing Weight card by fetching latest weight and trend from full historical database logs rather than the limited 100-event array.
- [DONE] **26-05-26**: Plumbed AI weight insights to the Weight card and updated the `generate-strip-insights` Edge Function to query `weight_kg` and output a `"weight"` insight key in its micro-insights schema.
- [DONE] **26-05-26**: Added Section IX (First Time Right - FTR Protocol) to global rules and addressed minor MECE gaps to enforce rigorous multi-layer feature audit verification.
- [DONE] **27-05-26**: Added Spit-up intensity selection to the Edit Activity modal, allowing fluid editing of minor/major spit ups.
- [DONE] **27-05-26**: Converted all discrete button grids to premium continuous segmented sliding controls (segmented toggles) with dynamic active background indicator transitions (in Edit Modal and Quick Log panels).
- [DONE] **27-05-26**: Implemented the Smart Log Exporter featuring a breakthrough dynamic sliding-window date selector (effortless single date defaulting + dynamic range window extensions), clipboard copier for Doctor/ChatGPT formats, and full clinical print-to-PDF stylesheets.
- [DONE] **27-05-26**: Upgraded the main dashboard date filter chip to support dynamic "From → To" date range filtering, opening a premium interactive bottom-sheet modal using our signature sliding-window date selector (effortless single date defaulting + dynamic range window extensions).

## 🐛 Open Bugs
- None currently known.

---
*Last Updated: 27-05-26 (Date range filters, log exporter, segmented controls)*
