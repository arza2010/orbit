# Set up your own Orbit

About 45 minutes the first time. You will end up with your own private copy running on your own accounts. Nothing here is shared with anyone, including the person who sent you this.

Do the steps in order. Steps 1 to 5 get you a working app on your laptop. Step 6 puts it on the internet. Steps 7 to 10 are optional extras.

## 0. What you need

- Node.js 20 or newer, and git.
- A Google account (this is the only account that will be allowed in).
- Accounts on [Supabase](https://supabase.com), [Vercel](https://vercel.com) and [Google Cloud](https://console.cloud.google.com), all free.
- Your Nexus login.

## 1. Get the code

```bash
git clone <this repo> orbit
cd orbit
npm install
cp .env.example .env.local
```

You will fill in `.env.local` as you go. It is private to your machine and is never committed.

## 2. Make your Nexus token

Orbit reads your classes and deadlines through Nexus's MCP endpoint, using a token only you hold.

1. Open Nexus, then **Nexus MCP**, and create a **new token**.
2. Tick only what Orbit uses: your profile, schedule, courses, assignments, announcements and attendance. Tick grades only if you want marks shown. Leave anything that can delete or change things unticked.
3. Copy the token (it starts with `mesa_pat_`) and the MCP address into `.env.local`:
   ```
   MESA_MCP_URL=https://students.mesaschool.co.in/mcp
   MESA_PAT=mesa_pat_...
   ```

Treat this token like a password. It can read your grades. Never paste it into a chat, a screenshot or a public repo.

## 3. Create your database (Supabase)

1. supabase.com → **New project**. Pick a region close to you (Mumbai `ap-south-1` for India).
2. **Project Settings → API.** Copy the **Project URL** and the **publishable** key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Never use or paste the `service_role` key anywhere except where step 8 says.
3. **SQL Editor → New query.** Easiest: paste all of `supabase/setup-all.sql` and run it once. Or run each file in `supabase/migrations` **in this order**:
   1. `20261021000000_init.sql`
   2. `20261022000000_class_notes_v2.sql`
   3. `20261023000000_wispr_sync.sql`
   4. `20261024000000_notifications.sql`
   5. `20261025000000_google_calendar.sql`
   6. `20261026000000_life_spaces.sql`

Every table is private to its owner (row-level security), so even a leaked publishable key exposes nothing.

## 4. Google sign-in

1. Google Cloud Console → **APIs & Services → OAuth consent screen**. User type **External**. Add your own email as a **test user**.
2. **Credentials → Create credentials → OAuth client ID → Web application.** Under *Authorized redirect URIs* add:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Copy the client ID and secret. In Supabase: **Authentication → Providers → Google** → enable → paste both → Save.
4. Supabase → **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` for now (your Vercel address later)
   - Redirect URLs: add `http://localhost:3000/**`
5. Tell Orbit whose account may sign in:
   ```
   ALLOWED_EMAIL=you@example.com
   ```
   Use the exact Google address you will sign in with. Anyone else is signed straight back out.

## 5. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. It sends you to **/login**; sign in with your allowed account and you land on **Today**. Run `npm run preflight -- --quick` any time to check your setup.

## 6. Put it on the internet (Vercel)

1. Push your copy to your own GitHub repo, then Vercel → **Add New → Project** → import it.
2. Vercel → **Settings → Environment Variables.** Add every variable from your `.env.local`.
3. Deploy. Copy the production address.
4. Back in Supabase **URL Configuration**: set the Site URL to your production address and add `https://<your-address>/**` to Redirect URLs.
5. In Google Cloud, if you later add Google Calendar (step 9), add your production address to its redirect list too.

`vercel.json` pins functions to Mumbai (`bom1`). Change it if your Supabase project is elsewhere.

## 7. Install it on your phone

- **iPhone:** Safari → Share → **Add to Home Screen**, then always open it from there. (Notifications on iPhone only work this way.)
- **Android / desktop Chrome:** use **Install**.

## 8. Notifications (optional)

Deadlines 1 day, 3 hours and 1 hour before; your own task reminders; new Nexus announcements; and an 8 am digest. Nothing is sent in your quiet hours (default 11 pm to 7 am).

1. Generate the keys and put them in `.env.local` (and later in Vercel):
   ```bash
   npx web-push generate-vapid-keys      # NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
   openssl rand -base64 32               # CRON_SECRET
   ```
   ```
   VAPID_SUBJECT=mailto:you@example.com
   ```
2. Supabase → **Project Settings → API** → copy the **secret** (service_role) key into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. Server only: never prefix it with `NEXT_PUBLIC_`. It is used by one route (`/api/cron/notify`) that runs with nobody signed in.
3. After you deploy, open `supabase/cron/notify.sql`, replace the two placeholders (your address and your `CRON_SECRET`), and run it once in the SQL editor. That schedules the check every 5 minutes, free, from inside Supabase.
4. On your phone open **Inbox** and press **Turn on notifications**.

## 9. Google Calendar two-way sync (optional)

Once connected (Calendar page → Connect):

- **Orbit → Google.** Classes, assignment deadlines and dated tasks go into a calendar called **Orbit** in your Google account, with reminders. It refreshes about every 12 minutes, whenever you change a task, and on **Sync now**. Orbit only ever edits events it created itself.
- **Google → Orbit.** Your other Google calendars appear in Orbit's Calendar. Move a task's event in Google and the task's due time follows.

One-time setup, in the same Google Cloud project as step 4:

1. **APIs & Services → Library → Google Calendar API → Enable.**
2. **Credentials →** your Web client → *Authorized redirect URIs*: add `https://<your-address>/api/google/callback` and `http://localhost:3000/api/google/callback`.
3. **Data Access → Add or remove scopes →** add `https://www.googleapis.com/auth/calendar`.
4. **Audience.** In *Testing* mode Google expires your sign-in after **7 days**, so Orbit asks you to reconnect weekly. Click **Publish app** to stop that. For a tool only you use, Google shows an "unverified app" screen once: click *Advanced → Continue*.
5. Put the client ID and secret in `.env.local` and Vercel, and redeploy:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

Disconnecting removes the stored tokens and tells Google to forget the grant. The **Orbit** calendar stays in Google until you delete it there.

## 10. Class notes (optional)

Notes turn a class transcript into clean study notes, filed under the right course. You need an AI key and a way to get transcripts in.

1. **AI key.** Either a free Gemini key from Google AI Studio, or an OpenRouter key:
   ```
   GEMINI_API_KEY=...
   # or
   OPENROUTER_API_KEY=sk-or-v1-...
   ```
2. **Encryption key** for anything Orbit stores about your connections:
   ```bash
   openssl rand -base64 32               # TOKEN_ENCRYPTION_KEY
   ```
   Keep a copy somewhere safe. Without it, stored connections can't be read.
3. **Transcripts.** Either **Notes → New** and paste any transcript (Wispr Flow, Granola, a Zoom export, anything), or connect **Wispr Flow** from the Notes page to pull transcripts automatically.

## Updating

```bash
git pull
npm install
```

Run any new SQL files from `supabase/migrations` in the Supabase SQL editor, then redeploy.

## How access is enforced

1. `proxy.ts` blocks every route except `/login` and `/auth/*` for anyone not signed in as the allowed email (API routes get a 401).
2. `requireUser()` re-checks inside every data loader, next to the data.
3. `/auth/callback` signs out any Google account that is not `ALLOWED_EMAIL`.
4. Row-level security means database rows only ever belong to the signed-in user.

## Attendance

**Courses → Attendance** reads your attendance from Nexus and applies Mesa's rule of **at least 75% in every class**, judged class by class. For each class it shows where you stand, how many of the remaining classes you can still miss (counted from the real schedule), and what skipping or attending the next one does to your percentage.

## When something goes wrong

Run `npm run preflight`. It checks your environment, each live service and your database tables, and tells you which one is broken without printing any secret.
