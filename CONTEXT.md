# Baby Tracker Context (RK-Protocol)

## 🎯 Project Vision
An AI-native, mobile-first baby tracker that transitions from a simple logger to a proactive pediatric assistant.

## 🏗️ Architecture
- **Backend**: Supabase (PostgreSQL + Edge Functions).
- **Frontend**: React (Vite-based) with a **"Dumb Frontend"** principle.
- **AI Core (Two-Phase Scout & Expert)**: 
  - **Phase 1 (Scout)**: `gemini-2.5-flash-lite` with Google Search fetches live environmental/weather context for Gurgaon.
  - **Phase 2 (Expert)**: The standard Gemini waterfall (3.1 Lite -> 3.0 -> 2.5) performs analysis using the Scout's context as plain text (no tools attached to conserve quota).
- **Component Safety**: All high-complexity components (e.g. `MedBox`) must implement a silent-fail render guard (`try...catch` returning `null`) to ensure core app (Activity History) stability.

## 🔑 API Key
- **Active Key**: Managed via `.env.local` and Vercel/Supabase environment variables (Rotation: 03-05-2026).
- **Key Scope**: Verified live on `gemini-3-flash-preview`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemma-4-26b-a4b-it`. Note: `gemini-3.1-flash-lite-preview` (503) and `gemma-4-31b-it` (500) are intermittently unavailable — waterfall handles gracefully.
- **Key Location**: Frontend: hardcoded in `src/utils/ai.js`. Edge functions: single source of truth at `supabase/functions/_shared/config.ts` (imported by both functions at deploy time).

## 🛠️ Infrastructure & Toolchain (Verified 03-05-2026)
- **Node**: `/Users/rkant/.nvm/versions/node/v20.20.2/bin/node`
- **NPM**: `/Users/rkant/.nvm/versions/node/v20.20.2/bin/npm`
- **NPX**: `/Users/rkant/.nvm/versions/node/v20.20.2/bin/npx`
- **Supabase CLI**: `/Users/rkant/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/bin/supabase`
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


- [DONE] **01-05-2026**: Redesigned header — removed welcome subtitle, replaced logout text with icon-only, added user-initials avatar bubble (RK/RS).
- [DONE] **01-05-2026**: Implemented optimistic UI lock (`isSubmitting`) on feed buttons with "Starting..." state to prevent double-tap race conditions.
- [DONE] **01-05-2026**: Added 5-second safety hatch `setTimeout` to auto-unlock UI if network hangs permanently.
- [DONE] **01-05-2026**: Added `BabyContext.addEvent` to throw on Supabase error. QuickLog catches `error.code === '23505'` (Postgres unique violation) and triggers `window.location.reload()` to self-heal out-of-sync state.
- [DONE] **01-05-2026**: Renamed "# Stats" dashboard card to "# Diapers".
- [DONE] **02-05-2026**: Added `visibilitychange` listeners to both `useEffect` data fetchers in `BabyContext.jsx`. App now silently re-fetches all data the moment Safari/Chrome wakes from background, eliminating stale 1000+ minute timers.

- [DONE] **07-05-2026**: Implemented hardened Medicine Tracking System (MedBox).
  - Architecture: `med_schedules` table with `JSONB medicines` metadata.
  - NLP config via Gemma (Gemini fallback) with `extractLastJson` parser.
  - Hardened logic: Defensive null-checks on all DB data + silent-fail UI guard.
  - Unified daily reset shifted to **Midnight** across all systems.
  - Time Zone Resilience: Updated `BabyContext.jsx` to use local day boundaries for accurate history filtering in IST.

## 🐛 Open Bugs
- None currently known.

---
*Last Updated: 07-05-2026 (MedBox feature, midnight day reset)*
