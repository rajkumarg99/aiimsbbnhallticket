# AIIMS Bibinagar — Hall Ticket Registration System

This app now uses **Supabase** (a free, hosted database) so that every
student's device and the administrator's device see the same data. Follow
the steps below in order — none of them require writing any code.

## What you need

- A computer with internet access.
- [Node.js](https://nodejs.org) installed (version 18 or later) — this is
  the only "technical" tool needed, and it's a simple installer like any
  other program.
- 15–20 minutes.

---

## Step 1 — Create your free Supabase project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign up (you can use a Google account or email).
3. Click **New project**.
4. Give it a name (e.g. "aiims-hallticket"), set a database password (save
   it somewhere safe — you likely won't need it again), and pick a region
   close to India (e.g. Singapore).
5. Click **Create new project** and wait about a minute while it sets up.

## Step 2 — Set up the database (one paste-and-click)

1. In your new project, click **SQL Editor** in the left-hand menu.
2. Click **New query**.
3. Open the file `supabase-setup.sql` (included in this folder) in any text
   editor, copy everything in it, and paste it into the SQL editor.
4. Click **Run**. You should see a success message.

This creates proper, separate tables — courses, subjects, applications, and
so on — matching the Database Schema document, rather than one big blob of
data. That's what makes it possible for your IT team to later query,
report on, or lock down this data properly.

That's it — the database is ready. You only do this once.

## Step 3 — Copy your project's connection details

1. Still in Supabase, click the **gear icon** (Project Settings) in the left
   menu, then click **API**.
2. You'll see two things you need:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon public** key — a long string of letters and numbers
     (there's also a "service_role" key on that page — never use that one
     here, it's much more powerful and must stay private)
3. Open the file `src/supabaseClient.js` in this project folder using any
   text editor (Notepad, TextEdit, VS Code, etc.).
4. Replace the two placeholder values with the ones you copied, and save.

## Step 4 — Run it and check it works

1. Unzip this project if you haven't already, and open a terminal/command
   prompt inside the folder.
2. Run:
   ```
   npm install
   npm run dev
   ```
3. Open the link it prints (usually `http://localhost:5173`).
4. Try submitting a test application, then open the *same link in a
   different browser or on your phone* — switch to the Admin tab and
   confirm you can see that application. If you can, the shared database is
   working correctly.

## Step 5 — Publish it so others can reach it

Right now it only runs on your computer. To make it reachable by anyone:

1. Run:
   ```
   npm run build
   ```
   This creates a `dist` folder containing the finished website (plain
   HTML/CSS/JS files — no server software needed).
2. Upload the *contents* of `dist` to a web host. The easiest free option
   for a first pilot:
   - Go to [app.netlify.com/drop](https://app.netlify.com/drop)
   - Drag the `dist` folder onto the page
   - Netlify gives you a live web address immediately
3. Alternatively, hand the `dist` folder to your IT team to upload to the
   AIIMS web server the same way they publish any other static webpage.

Whichever address you end up with is what you share with students (in the
fee notification, etc.) and what you use yourself for the admin console.

---

## Before you open this to real students — please read

This setup gets you running quickly, but it currently has **no real access
control**: anyone who has your site's address could, with a bit of browser
know-how, read or modify *any* student's data — not just their own. That's
an acceptable trade-off for a small pilot with people you trust (colleagues,
a handful of volunteer students), but it is **not** appropriate for a real
examination cycle with the general student body.

Before that point, this needs proper per-role security rules added (students
can only see their own application; only signed-in administrators can see
everyone's) — this is exactly what the "Database Schema, API Design &
Security Requirements" document already lays out, and your IT/NIC team can
implement it directly on top of what's here; nothing about the app itself
needs to be rebuilt.

Also change the admin password (currently `admin123`, set in the app for
demo purposes) to something private before sharing the link with anyone.

## What's inside

- `src/App.jsx` — the entire application.
- `src/supabaseClient.js` — where your Supabase credentials go (Step 3).
- `supabase-setup.sql` — the one-time database setup script (Step 2).
