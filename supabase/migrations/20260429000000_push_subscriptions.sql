-- Web Push subscriptions for the mobile shell at /mobile.
-- The push-subscribe Edge Function stores rows here; push-unsubscribe deletes
-- them. RLS scopes every operation to the authenticated user, so a JWT for
-- user A can never read/write/delete user B's subscription.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subscriptions_user_id
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "Users can read own push_subscriptions"
  on push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own push_subscriptions"
  on push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own push_subscriptions"
  on push_subscriptions for delete
  using (auth.uid() = user_id);
