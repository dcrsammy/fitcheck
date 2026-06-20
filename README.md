# FitCheck

Styling website for Olawale — upload-and-style AI tool + in-person booking.

## What's built

- `index.html` — landing page
- `style.html` — upload a photo, get instant AI styling feedback
- `book.html` — service picker + booking request form
- `css/main.css` — full design system (dark, flyer/zine-inspired, Polaroid motif)
- `js/main.js` — upload handling, AI call, booking form submit
- `netlify/functions/style-analysis.js` — calls Claude (Anthropic API) to read the outfit photo
- `netlify/functions/book-session.js` — writes booking requests to Supabase
- `supabase-schema.sql` — run this in Supabase SQL editor to create the `bookings` table

## To deploy (same stack as your other sites)

1. **Push to GitHub** — create a repo (e.g. `dcrsammy/fitcheck`), push this folder.
2. **Connect to Netlify** — new site from Git, point at the repo. Build settings are already in `netlify.toml` (no build step needed, it's static).
3. **Supabase**
   - Create a new Supabase project (or reuse one).
   - Run `supabase-schema.sql` in the SQL editor to create the `bookings` table.
   - Grab your Project URL and the **service_role** key (Settings > API).
4. **Environment variables** — in Netlify (Site settings > Environment variables), add:
   - `ANTHROPIC_API_KEY` — your Claude API key from console.anthropic.com
   - `SUPABASE_URL` — your Supabase project URL
   - `SUPABASE_SERVICE_KEY` — the **service_role** key (not the anon key — this is what lets the function write past RLS)
5. **Redeploy** after adding env vars so the functions pick them up.

## Where to check bookings

For now, view new bookings directly in the Supabase Table Editor (`bookings` table).
Once volume picks up, worth adding an email/WhatsApp notification on each new
booking (Resend works fine for this, same as your other sites — there's a
commented spot for it in `book-session.js`), or a small password-gated
admin page like the ones on your other projects.

## Next steps / ideas not yet built

- Save/share past "fit checks" (would need user accounts — Supabase Auth)
- Premium tier: unlimited uploads, saved lookbooks (Paystack, same as your other sites)
- Calendar view for booking instead of a plain date field, once volume justifies it
- Gallery page of real styled looks for social proof / SEO
