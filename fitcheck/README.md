# FitCheck

Styling website — single fit-check tool, full wardrobe/closet builder with
outfit combos and day-of-week planning, in-person booking, and a paid
subscription tier (Paystack).

## Pages

- `index.html` — landing
- `style.html` — upload a photo, get instant AI styling feedback (free, capped)
- `wardrobe.html` — "My Closet": build a wardrobe, combine items into outfits,
  assign fits to days of the week (paywalled features for free users)
- `pricing.html` — subscription checkout (₦2,000/mo or ₦18,000/yr)
- `book.html` — in-person booking with Olawale

## Functions (`netlify/functions/`)

- `style-analysis.js` — single fit-check (Claude vision)
- `tag-item.js` — tags one wardrobe item (category, color, tags, description)
- `combo-verdict.js` — judges a combination of already-tagged items
- `book-session.js` — writes bookings to Supabase
- `verify-payment.js` — verifies a Paystack transaction, activates subscription

## One-time setup

### 1. Supabase

1. Create a project at supabase.com (or reuse an existing one).
2. Run `supabase-schema.sql` in the SQL editor (bookings table).
3. Run `supabase-schema-v2.sql` (profiles, wardrobe_items, outfits — wardrobe feature).
4. In Supabase Auth settings, make sure **Email OTP / magic link** is enabled
   (it's on by default).
5. Grab: Project URL, anon public key (Settings > API), and the
   **service_role** key (also Settings > API — keep this one secret).

### 2. Cloudinary

1. In your Cloudinary dashboard, go to Settings > Upload.
2. Create an **unsigned upload preset** (needed so the browser can upload
   wardrobe photos directly without a server round-trip). Name it anything,
   e.g. `fitcheck_wardrobe`.

### 3. Paystack

Grab your **public key** (`pk_live_...` or `pk_test_...` to start) and
**secret key** (`sk_live_...` / `sk_test_...`) from the Paystack dashboard.

### 4. Fill in `js/config.js`

Open `js/config.js` and replace the placeholder values with your real
Supabase URL, Supabase anon key, Paystack public key, and Cloudinary
cloud name + upload preset. This file is safe to be public — it only
contains keys meant to be exposed client-side.

### 5. Netlify environment variables

Site settings > Environment variables, add:

- `ANTHROPIC_API_KEY` — from console.anthropic.com (needs a small credit balance)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` — the **service_role** key (not anon — this is
  what lets functions write past Row Level Security)
- `PAYSTACK_SECRET_KEY`

Redeploy after adding these so the functions pick them up.

## Pricing (locked in)

| Tier | Price | Includes |
|---|---|---|
| Free | ₦0 | 5 fit-checks/month, browse-only closet (10 items) |
| Style Pro | ₦10,000/mo · ₦96,000/yr | Unlimited fit-checks, closet still capped at 10 items |
| Closet | ₦50,000/mo · ₦480,000/yr | Unlimited fit-checks + unlimited wardrobe + AI combos + day planning + priority booking |

Edit amounts in `js/config.js` under `PRICING` (values are in kobo) if these
ever need to change — `pricing.html`/`pricing.js` read from there directly.

## How the paywall works

- `profiles.plan` ('free' | 'pro' | 'closet') + `profiles.plan_expires_at` in
  Supabase control access — set by `verify-payment.js` after a successful
  Paystack transaction.
- Free **and** Pro: capped at 10 wardrobe items, no combo builder, no day
  assignment — only the **Closet** plan unlocks those.
- The 5-fit-checks-per-month free limit is defined in `config.js`
  (`FREE_FIT_CHECKS_PER_MONTH`) but **not yet enforced** in `style.html` —
  that page is currently open/anonymous (no login). Enforcing the free cap
  there would require adding the same Supabase auth used on `wardrobe.html`
  to `style.html` too, and counting checks against
  `profiles.free_checks_used_this_month`. Worth doing once you're ready —
  flag it and it can be built next.
- Subscriptions are **not auto-renewing** — Paystack inline checkout here is
  a one-time charge per period. For real recurring billing, upgrade to
  Paystack Subscriptions/Plans later.


## Where to check bookings / subscribers

For now, view directly in Supabase Table Editor (`bookings`, `profiles`,
`wardrobe_items`, `outfits` tables). Worth adding an admin page once
volume picks up.

## Ideas not yet built

- Recurring billing (Paystack Plans) instead of one-time charges
- Email/WhatsApp notification when a booking comes in
- Weekly view of assigned outfits (calendar-style, currently just tags
  per outfit)
- Edit/delete wardrobe items
- Gallery of styled looks for social proof / SEO
