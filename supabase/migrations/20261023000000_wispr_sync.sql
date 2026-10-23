-- Wispr Flow sync: stored connection, plus rows for recordings that need a class assigned.
-- Run in the Supabase SQL editor after 20261022000000_class_notes_v2.sql.

-- Recordings that could not be matched to a Nexus class are kept (without a transcript) so you can
-- assign or dismiss them. 'ignored' remembers a dismissal so a later sync doesn't bring it back.
alter table public.class_notes drop constraint if exists class_notes_status_check;
alter table public.class_notes
  add constraint class_notes_status_check
  check (status in ('pending', 'processing', 'done', 'failed', 'unmatched', 'ignored'));

alter table public.class_notes
  add column if not exists wispr_title text,
  add column if not exists wispr_start timestamptz,
  add column if not exists wispr_end   timestamptz;

-- One connection per provider per user. Tokens are encrypted by the app before they reach here.
create table if not exists public.integration_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider          text not null check (provider in ('wispr')),
  client_id         text not null,
  access_token_enc  text not null,
  refresh_token_enc text,
  expires_at        timestamptz,
  scope             text,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.integration_tokens enable row level security;
create policy "owner full access" on public.integration_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
