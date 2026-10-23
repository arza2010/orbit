-- Google Calendar sync: allow a second connection type and keep its settings next to the tokens.
-- Run in the Supabase SQL editor after 20261024000000_notifications.sql.

alter table public.integration_tokens drop constraint if exists integration_tokens_provider_check;
alter table public.integration_tokens
  add constraint integration_tokens_provider_check check (provider in ('wispr', 'google'));

-- Calendar id, connected account, what to sync, last result. No secrets: tokens stay in the *_enc columns.
alter table public.integration_tokens add column if not exists meta jsonb not null default '{}'::jsonb;
