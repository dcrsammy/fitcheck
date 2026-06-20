-- FitCheck v2 — wardrobe + subscriptions
-- Run AFTER supabase-schema.sql (bookings table).
-- Uses Supabase Auth (built-in `auth.users`) for login.

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now(),
  plan text default 'free',              -- 'free' | 'pro' | 'closet'
  plan_expires_at timestamptz,
  free_checks_used_this_month int default 0,
  free_checks_reset_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- wardrobe items ----------
create table if not exists wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  image_url text not null,          -- Cloudinary URL
  category text,                    -- top | bottom | shoes | outerwear | accessory
  color text,
  tags text[],                      -- e.g. {"oversized","denim","casual"}
  ai_description text
);

alter table wardrobe_items enable row level security;

create policy "Users manage own wardrobe items"
  on wardrobe_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- outfits ----------
create table if not exists outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  item_ids uuid[] not null,         -- references wardrobe_items.id
  assigned_day text,                -- "monday" | "tuesday" | ... | null
  ai_verdict text,
  name text                         -- optional, e.g. "Owambe fit"
);

alter table outfits enable row level security;

create policy "Users manage own outfits"
  on outfits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists wardrobe_items_user_idx on wardrobe_items (user_id);
create index if not exists outfits_user_idx on outfits (user_id);
