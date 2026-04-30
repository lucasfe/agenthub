-- Agents table
-- NOTE: When modifying this schema, also apply changes to the live Supabase DB
-- via SQL Editor. This file is the source of truth for the expected schema.
create table if not exists agents (
  id text primary key,
  name text not null,
  category text not null,
  description text not null,
  tags text[] not null default '{}',
  icon text not null default 'Bot',
  color text not null default 'blue',
  featured boolean not null default false,
  popularity integer not null default 50,
  content text,
  tools text[] not null default '{}',
  model text not null default 'claude-sonnet-4-6',
  capabilities text[] not null default '{}',
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Backfill for existing deployments where the column did not exist yet.
alter table agents add column if not exists usage_count integer not null default 0;

-- Atomic increment for agent usage. SECURITY DEFINER lets unauthenticated
-- clients bump the counter without granting blanket write access on the row,
-- which keeps RLS in place for everything else (name, content, etc.).
create or replace function increment_agent_usage(p_agent_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update agents
     set usage_count = usage_count + 1
   where id = p_agent_id
   returning usage_count into new_count;
  return new_count;
end;
$$;

revoke all on function increment_agent_usage(text) from public;
grant execute on function increment_agent_usage(text) to anon, authenticated;

-- Teams table
create table if not exists teams (
  id text primary key,
  name text not null,
  description text not null,
  color text not null default 'blue',
  agents text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Tools catalog (sub-agent tools available during orchestration runs)
create table if not exists tools (
  id text primary key,
  name text not null,
  description text not null,
  icon text,
  category text,
  input_schema jsonb not null,
  requires_approval boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Runs log (one row per orchestration run, inserted when the run ends)
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  task text not null,
  mode text not null,
  status text not null,
  plan jsonb,
  steps jsonb,
  total_tokens_in integer not null default 0,
  total_tokens_out integer not null default 0,
  total_cost_cents integer not null default 0,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_runs_status on runs(status);
create index if not exists idx_runs_created_at on runs(created_at desc);

-- Web Push subscriptions for the mobile shell at /mobile. Owned by the
-- push-subscribe / push-unsubscribe Edge Functions. RLS scopes every
-- operation to the row's owner.
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

-- Enable Row Level Security (for future auth)
alter table agents enable row level security;
alter table teams enable row level security;
alter table tools enable row level security;
alter table runs enable row level security;
alter table push_subscriptions enable row level security;

-- For now, allow public read access (no auth yet)
create policy "Public read access for agents" on agents
  for select using (true);

create policy "Public insert access for agents" on agents
  for insert with check (true);

create policy "Public delete access for agents" on agents
  for delete using (true);

create policy "Public read access for teams" on teams
  for select using (true);

create policy "Public insert access for teams" on teams
  for insert with check (true);

create policy "Public update access for teams" on teams
  for update using (true) with check (true);

create policy "Public delete access for teams" on teams
  for delete using (true);

create policy "Public read access for tools" on tools
  for select using (true);

create policy "Public read access for runs" on runs
  for select using (true);

create policy "Public insert access for runs" on runs
  for insert with check (true);
