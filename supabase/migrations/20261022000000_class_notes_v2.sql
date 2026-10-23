-- Class notes v2: richer note rows, plus one consolidated digest per course.
-- Run in the Supabase SQL editor after 20261021000000_init.sql.

alter table public.class_notes
  add column if not exists title          text,
  add column if not exists nexus_event_id text,
  add column if not exists source         text not null default 'paste' check (source in ('paste', 'upload', 'wispr')),
  add column if not exists summary        text,
  add column if not exists action_items   jsonb not null default '[]'::jsonb,
  add column if not exists exam_hints     jsonb not null default '[]'::jsonb,
  add column if not exists unsure_terms   jsonb not null default '[]'::jsonb,
  add column if not exists model          text,
  add column if not exists error          text,
  add column if not exists processed_at   timestamptz,
  add column if not exists updated_at     timestamptz not null default now();

create table if not exists public.course_digests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course       text not null,
  content_md   text not null,
  note_count   integer not null default 0,
  model        text,
  updated_at   timestamptz not null default now(),
  unique (user_id, course)
);

alter table public.course_digests enable row level security;
create policy "owner full access" on public.course_digests for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
