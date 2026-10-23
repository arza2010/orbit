# Start here: get your own Orbit (no coding, no commands)

Everything below is clicking and copy-pasting in your web browser. Allow **30 to 45 minutes** the first time. It is free.

**The idea:** Orbit isn't a website you sign up to. You make your *own private copy*, on your own accounts, with your own Nexus token. Nobody else can see it, including the person who shared it with you.

> Unofficial. Not made by or affiliated with Mesa. Your Nexus token can read your grades and attendance, so treat it like a password: never post it in a chat or screenshot, and never put someone else's token into your copy.

Open a blank note (Notes app, Google Doc, anything). You'll collect five things in it as you go:

| # | What | You'll get it in |
|---|---|---|
| 1 | Nexus token | Part 1 |
| 2 | Supabase project URL | Part 2 |
| 3 | Supabase publishable key | Part 2 |
| 4 | Your Google email (the one you'll sign in with) | you already have it |
| 5 | Your Vercel address | Part 4 |

Screens change over time, so a button may be worded a little differently. The idea of each step stays the same.

---

## Part 1: Make your Nexus token (3 minutes)

1. Open **Nexus** and go to **Nexus MCP**.
2. Create a **new token**.
3. Tick only these: your **profile, schedule, courses, assignments, announcements, attendance**. Tick **grades** too only if you want your marks shown. Leave anything that says delete or edit unticked.
4. Copy the token (it starts with `mesa_pat_`) into your note as **#1**.

## Part 2: Create your private database on Supabase (10 minutes)

Supabase is where your tasks, notes and settings live. It's free.

1. Go to **supabase.com** and sign up (the "Continue with GitHub" or Google button is easiest).
2. Click **New project**. Give it any name, make up a database password (save it in your note, you won't need it again), and pick a **region close to you** (for India: Mumbai). Click create and wait about two minutes.
3. In the left menu open **Project Settings → API** (or "API Keys"). Copy two things into your note:
   - **Project URL** → **#2**
   - The **publishable** key (starts with `sb_publishable_`) → **#3**. Do **not** use the "secret" or "service_role" key.
4. In the left menu open **SQL Editor → New query**.
5. On this project's GitHub page, open the file **`supabase/setup-all.sql`**, click the copy button, and paste everything into the query box. Press **Run**. It should say success.

## Part 3: Set up Google sign-in (10 minutes)

This lets you log in to your own Orbit with Google. Only the email you choose will be allowed in.

1. In Supabase, open **Authentication → Providers → Google** and switch it on. **Leave this tab open**: it shows a **Callback URL** you need in a moment. Copy it.
2. In a new tab, go to **console.cloud.google.com** and sign in with Google. Click the project picker at the top → **New project** → name it "Orbit" → create it.
3. Open the menu → **APIs & Services → OAuth consent screen** (or "Google Auth platform"). Choose **External**, name the app "Orbit", use your email for the support and contact emails, and save. If it asks for **Test users**, add your own Google email.
4. Open **Credentials → Create credentials → OAuth client ID**. Application type: **Web application**. Under **Authorized redirect URIs** click add and paste the **Callback URL** from step 1. Create it.
5. Google shows a **Client ID** and a **Client secret**. Go back to the Supabase Google tab, paste both in, and **Save**.

## Part 4: Put it online with one click (5 minutes)

1. Sign up at **vercel.com** with GitHub.
2. Click this button: **[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Farza2010%2Forbit&env=MESA_MCP_URL,MESA_PAT,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,ALLOWED_EMAIL&envDescription=Five%20values%20from%20START-HERE.md&envLink=https%3A%2F%2Fgithub.com%2Farza2010%2Forbit%2Fblob%2Fmain%2FSTART-HERE.md&project-name=orbit&repository-name=orbit)**
3. Vercel asks to copy the project into your GitHub. Accept and give it any name.
4. It asks you to fill in five boxes. Paste in your values:
   - `MESA_MCP_URL`: paste `https://students.mesaschool.co.in/mcp`
   - `MESA_PAT`: your Nexus token (#1)
   - `NEXT_PUBLIC_SUPABASE_URL`: your Project URL (#2)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: your publishable key (#3)
   - `ALLOWED_EMAIL`: your Google email (#4). Only this account can log in.
5. Press **Deploy** and wait about a minute. Vercel then shows your site's address, like `https://orbit-yourname.vercel.app`. Copy it into your note as **#5**.

## Part 5: Link the two together (2 minutes)

1. Back in Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to your address (#5).
3. Under **Redirect URLs** add your address followed by `/**`, for example `https://orbit-yourname.vercel.app/**`. Save.

## Part 6: Open it

Go to your address (#5) and sign in with Google. You should land on **Today**, filled with your own classes.

**On your phone:** open the address in Safari, tap **Share → Add to Home Screen**, and always open Orbit from that icon. (iPhone only allows notifications this way.) On Android, tap **Install**.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| "That Google account isn't allowed in" | The email you signed in with isn't the one in `ALLOWED_EMAIL`. In Vercel → Settings → Environment Variables, fix it, then redeploy. |
| Login goes round in circles or errors | Re-check Part 5: the Site URL and Redirect URL must be your exact address. |
| "Can't reach Nexus" | The token is wrong or expired. Make a new one (Part 1), update `MESA_PAT` in Vercel, and redeploy. |
| The Life tab says "One more step" | The database setup didn't run. Redo Part 2, step 5. |
| Anything else | Copy the error into an AI assistant (Claude, ChatGPT) together with this guide and ask it to walk you through. |

## Extras, whenever you like

Phone notifications, two-way Google Calendar sync and class notes from transcripts need a few more steps. They're in **[SETUP.md](SETUP.md)**. That file is more technical, so the easiest route is to give it to an AI assistant and say "walk me through this one step at a time".

## Updating later

Your copy doesn't update by itself. If the original project gets improvements, the easiest way is to give your AI assistant the new files and ask it to merge them into your copy, then paste any new database file into Supabase's SQL Editor. Skipping updates is fine: your copy keeps working as it is.
