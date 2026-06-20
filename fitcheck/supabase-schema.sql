-- FitCheck — Supabase schema
-- Run this in the Supabase SQL editor for your project.

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  phone text not null,
  email text not null,
  preferred_date date,
  notes text,
  service text not null,        -- wardrobe | event | shopping | overhaul
  price_quote text,
  status text default 'pending' -- pending | confirmed | completed | cancelled
);

-- Row Level Security: lock the table down. Writes happen only through
-- the Netlify function using the service role key, which bypasses RLS.
alter table bookings enable row level security;

-- No public policies are created — this table is intentionally
-- inaccessible from the browser/anon key. Only the service role
-- (used server-side in book-session.js) can read or write.

-- Optional: index for sorting the admin view by most recent
create index if not exists bookings_created_at_idx on bookings (created_at desc);
