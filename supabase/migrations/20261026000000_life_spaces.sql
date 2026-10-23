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
