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
