-- Schedules the notification check to run every 5 minutes, from inside your Supabase project (free).
-- Run this ONCE in the SQL editor, after the app is deployed. Replace the two placeholders first:
--   YOUR-APP.vercel.app   your deployed address
--   YOUR_CRON_SECRET      the same value as CRON_SECRET in Vercel's environment variables

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the secret in Supabase Vault rather than pasted into the job itself.
select vault.create_secret('YOUR_CRON_SECRET', 'orbit_cron_secret');

select cron.schedule(
  'orbit-notify',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url     := 'https://YOUR-APP.vercel.app/api/cron/notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'orbit_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);

-- To stop it:        select cron.unschedule('orbit-notify');
-- To see its runs:   select * from cron.job_run_details order by start_time desc limit 10;
