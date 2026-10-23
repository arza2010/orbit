-- ORBIT: the whole database setup in one file.
-- Paste this entire file into Supabase -> SQL Editor -> New query, then press Run. Do it once, on a new project.
-- (It is every file in supabase/migrations, joined in order. If you update Orbit later, run only the newer files.)


-- ======================================================================
-- 20261021000000_init.sql
-- ======================================================================
-- Orbit: personal data. Every table is private to its owner via row-level security.
-- Run once in the Supabase SQL editor (or `supabase db push`).

-- ---------- Tasks ----------
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 500),
  notes       text,
  due_at      timestamptz,
  course      text,
  priority    smallint not null default 0 check (priority between 0 and 3),
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index tasks_user_open_idx on public.tasks (user_id, done_at, due_at);

-- ---------- Habits ----------
create table public.habits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  target_per_week smallint not null default 7 check (target_per_week between 1 and 7),
  hue            smallint not null default 258 check (hue between 0 and 360),
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id) where archived_at is null;

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id   uuid not null references public.habits (id) on delete cascade,
  logged_on  date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, logged_on)
);
create index habit_logs_user_day_idx on public.habit_logs (user_id, logged_on desc);

-- ---------- Goals ----------
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 300),
  area          text,
  unit          text,
  target_value  numeric,
  current_value numeric not null default 0,
  due_on        date,
  status        text not null default 'active' check (status in ('active', 'done', 'dropped')),
  created_at    timestamptz not null default now()
);
create index goals_user_status_idx on public.goals (user_id, status);

-- ---------- Money (amounts in paise; negative = income) ----------
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount_paise  bigint not null,
  category      text not null check (char_length(category) between 1 and 60),
  note          text,
  spent_on      date not null default current_date,
  created_at    timestamptz not null default now()
);
create index expenses_user_day_idx on public.expenses (user_id, spent_on desc);

-- ---------- Office-hours / 1:1 log ----------
create table public.one_on_ones (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  with_name        text not null check (char_length(with_name) between 1 and 120),
  with_role        text,
  held_at          timestamptz not null,
  nexus_event_id   text,
  notes            text,
  follow_ups       jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index one_on_ones_user_idx on public.one_on_ones (user_id, held_at desc);

-- ---------- Class notes (from Wispr Flow transcripts) ----------
create table public.class_notes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course           text not null,
  session_start    timestamptz,
  session_end      timestamptz,
  wispr_meeting_id text,
  transcript       text,
  notes_md         text,
  status           text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  created_at       timestamptz not null default now(),
  unique (user_id, wispr_meeting_id)
);
create index class_notes_user_course_idx on public.class_notes (user_id, course, session_start desc);

-- ---------- Row-level security: each row belongs to exactly one user ----------
do $$
declare t text;
begin
  foreach t in array array['tasks','habits','habit_logs','goals','expenses','one_on_ones','class_notes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;


-- ======================================================================
-- 20261022000000_class_notes_v2.sql
-- ======================================================================
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


-- ======================================================================
-- 20261023000000_wispr_sync.sql
-- ======================================================================
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


-- ======================================================================
-- 20261024000000_notifications.sql
-- ======================================================================
-- Notifications: task times and reminders, push subscriptions, per-user settings, and the inbox.
-- Run in the Supabase SQL editor after 20261023000000_wispr_sync.sql.

-- Tasks can carry a time and a reminder ("pay the bill, 5 pm, remind me an hour before").
alter table public.tasks
  add column if not exists due_has_time boolean not null default false,
  add column if not exists remind_at    timestamptz,
  add column if not exists reminded_at  timestamptz;

create index if not exists tasks_remind_idx on public.tasks (remind_at)
  where reminded_at is null and done_at is null and remind_at is not null;

-- One row per browser or phone that agreed to receive pushes.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- What to notify about, and when to stay quiet. announcements_cursor remembers the newest Nexus
-- announcement already handled, so only genuinely new ones are pushed.
create table if not exists public.notification_settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled             jsonb not null default '{"assignment": true, "task": true, "announcement": true, "digest": true}'::jsonb,
  quiet_start         smallint not null default 23 check (quiet_start between 0 and 23),
  quiet_end           smallint not null default 7  check (quiet_end between 0 and 23),
  announcements_cursor timestamptz,
  updated_at          timestamptz not null default now()
);

-- The inbox. `ref` identifies the thing a notification is about (assignment + lead, task, ...), and
-- the unique constraint is what stops the same alert ever being sent twice.
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('assignment', 'task', 'announcement', 'digest', 'test')),
  ref         text not null,
  title       text not null,
  body        text,
  url         text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  read_at     timestamptz,
  unique (user_id, ref)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'notification_settings', 'notifications']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;


-- ======================================================================
-- 20261025000000_google_calendar.sql
-- ======================================================================
-- Google Calendar sync: allow a second connection type and keep its settings next to the tokens.
-- Run in the Supabase SQL editor after 20261024000000_notifications.sql.

alter table public.integration_tokens drop constraint if exists integration_tokens_provider_check;
alter table public.integration_tokens
  add constraint integration_tokens_provider_check check (provider in ('wispr', 'google'));

-- Calendar id, connected account, what to sync, last result. No secrets: tokens stay in the *_enc columns.
alter table public.integration_tokens add column if not exists meta jsonb not null default '{}'::jsonb;


-- ======================================================================
-- 20261026000000_life_spaces.sql
-- ======================================================================
-- Life tab v2: spaces (areas of life), projects inside them, a kanban stage and a "why" on tasks,
-- plus the subjective layer: daily check-ins, area ratings and weekly reviews.
-- Safe to run more than once.

create table if not exists public.life_spaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  emoji       text not null default '✨' check (char_length(emoji) between 1 and 8),
  hue         smallint not null default 258 check (hue between 0 and 360),
  intention   text check (intention is null or char_length(intention) <= 200),
  position    integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists life_spaces_user_idx on public.life_spaces (user_id, position) where archived_at is null;

create table if not exists public.life_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  space_id    uuid not null references public.life_spaces (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  status      text not null default 'active' check (status in ('active', 'paused', 'done')),
  due_on      date,
  created_at  timestamptz not null default now()
);
create index if not exists life_projects_space_idx on public.life_projects (space_id, status);

alter table public.tasks
  add column if not exists space_id   uuid references public.life_spaces (id) on delete set null,
  add column if not exists project_id uuid references public.life_projects (id) on delete set null,
  add column if not exists stage      text not null default 'todo' check (stage in ('todo', 'doing')),
  add column if not exists why        text check (why is null or char_length(why) <= 500);
create index if not exists tasks_space_idx on public.tasks (space_id) where done_at is null;
create index if not exists tasks_project_idx on public.tasks (project_id) where done_at is null;

-- How a life area feels right now, 1 (struggling) to 5 (thriving). One rating per area per day.
create table if not exists public.space_ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  space_id   uuid not null references public.life_spaces (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  note       text check (note is null or char_length(note) <= 300),
  rated_on   date not null,
  created_at timestamptz not null default now(),
  unique (space_id, rated_on)
);
create index if not exists space_ratings_user_idx on public.space_ratings (user_id, rated_on desc);

-- One check-in per day: mood, energy and a line about it.
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  mood       smallint check (mood between 1 and 5),
  energy     smallint check (energy between 1 and 5),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- One review per week (week_start is the Monday).
create table if not exists public.weekly_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  wins       text check (wins is null or char_length(wins) <= 2000),
  change     text check (change is null or char_length(change) <= 2000),
  focus      text check (focus is null or char_length(focus) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

do $$
declare t text;
begin
  foreach t in array array['life_spaces','life_projects','space_ratings','checkins','weekly_reviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'owner full access') then
      execute format(
        'create policy "owner full access" on public.%I for all to authenticated
           using (user_id = (select auth.uid()))
           with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;

