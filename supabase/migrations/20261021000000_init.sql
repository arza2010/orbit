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
