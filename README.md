# Training Log

A coach-and-athlete workout app in the spirit of TeamBuildr and Bridge, built to run for free.
Coaches build programs out of reusable blocks and assign them; athletes log on their phones,
even with no signal. Tonnage, plyometric contacts and weekly volume are calculated automatically.

It's a plain web app (HTML, CSS and JavaScript, no build step) that athletes install to their
home screen. Data lives on the device in demo mode, or syncs through a free Supabase project.

## What's in phase 1

**Athletes**
- Today screen with a week strip; tap ✓ to log a set as prescribed, or edit reps and weight
- "Last time" numbers on every exercise, notes on any exercise and on the session
- Swap an exercise for a coach-approved alternative, or switch to any other day of the program
- Add sets or extra exercises, session RPE and minutes, automatic new estimated maxes
- My week: tonnage, plyo contacts (with high-intensity contacts on their own line), reps,
  session load, sprint meters, sets by movement, planned vs done, 7-day vs 4-week load trend
- Works offline after the first visit

**Coaches**
- Team board: sessions done vs planned, tonnage, contacts, load and latest athlete note per athlete
- Block builder: weeks, deload week, days, sets/reps, % of max (optionally keyed off another lift),
  fixed weight or RPE, per-week progression (+% / +weight / +reps), supersets, coaching notes,
  copy day, copy block, and live planned contacts and sets per day and week
- Quick add: type `Back squat 4x5 @80% +2.5%/wk` or `Box jump 3x5`, one per line
- Assign a block to athletes or a whole group with a start date and training weekdays
- Exercise library (50 starters) with movement type, plyo contacts per rep and intensity tier,
  sprint meters, demo video link, and swap options
- Athlete page with maxes, programs, recent sessions, notes and swaps

## Try it on your computer

```
cd workout-tracker
python3 -m http.server 8080
```

Open http://localhost:8080 and pick the coach or one of the demo athletes.

Run the tests for the training math with `node --test`.

## Put it online for athletes (free)

1. **Database.** In Supabase, open SQL Editor → New query, paste all of
   [`supabase/schema.sql`](supabase/schema.sql), and press Run.
2. **Sign-in codes.** In Supabase, Authentication → Emails → "Magic Link" template: add
   `{{ .Token }}` to the email body so people get a 6-digit code (codes work better than links
   inside a home-screen app).
3. **Keys.** Copy the Project URL and anon public key from Project Settings → API into
   [`js/config.js`](js/config.js).
4. **Hosting.** In Cloudflare Pages (or Vercel or Netlify), connect this GitHub repo. No build
   command, output directory `/`. Every push to `main` redeploys.
5. **Add the site URL** under Supabase Authentication → URL Configuration.

The coach signs in, creates a team and gets a 6-letter team code. Athletes open the link,
sign in with their email, enter the code, and tap Share → Add to Home Screen.

## How it's put together

| File | What it does |
| --- | --- |
| `js/calc.js` | All the training math (prescriptions, progressions, tonnage, contacts, zones, scheduling, quick-entry parser) |
| `js/store.js` | Local data store (works offline), demo data |
| `js/sync.js` | Optional Supabase sign-in and sync |
| `js/athlete.js`, `js/coach.js` | The screens |
| `js/seed.js` | Starter exercise library and demo program |
| `supabase/schema.sql` | Tables and the security rules (coaches edit their team; athletes write only their own logs) |
| `sw.js` | Offline caching. Bump `VERSION` when app files change. |

## Notes on the numbers

- **Tonnage** = reps × weight for exercises marked "uses a weight".
- **Plyo contacts** = reps × contacts per rep. Tiers 5–6 (depth jumps, shock) are also counted as high-intensity contacts.
- **Session load** = session RPE × minutes (arbitrary units).
- **Load trend** compares the last 7 days with the 4-week weekly average. Above about 1.5 is a big jump worth a conversation; it is not an injury predictor.
