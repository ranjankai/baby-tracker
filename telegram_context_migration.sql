-- telegram_context: stores per-chat conversation history for the Telegram AI chatbox
-- Context window: min last 20 messages, max all messages from today (IST)

CREATE TABLE IF NOT EXISTS public.telegram_context (
  id         BIGSERIAL PRIMARY KEY,
  chat_id    BIGINT      NOT NULL,
  role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups by chat and time
CREATE INDEX IF NOT EXISTS idx_telegram_context_chat_time
  ON public.telegram_context (chat_id, created_at DESC);

-- Optional: auto-prune rows older than 30 days to keep the table lean
-- (Supabase pg_cron or a manual periodic DELETE can handle this)
-- DELETE FROM public.telegram_context WHERE created_at < NOW() - INTERVAL '30 days';
