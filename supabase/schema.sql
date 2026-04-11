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
  created_at timestamptz not null default now()
);

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

-- Enable Row Level Security (for future auth)
alter table agents enable row level security;
alter table teams enable row level security;
alter table tools enable row level security;
alter table runs enable row level security;

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
