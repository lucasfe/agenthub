-- Agents table
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

-- Enable Row Level Security (for future auth)
alter table agents enable row level security;
alter table teams enable row level security;

-- For now, allow public read access (no auth yet)
create policy "Public read access for agents" on agents
  for select using (true);

create policy "Public insert access for agents" on agents
  for insert with check (true);

create policy "Public read access for teams" on teams
  for select using (true);

create policy "Public insert access for teams" on teams
  for insert with check (true);

create policy "Public update access for teams" on teams
  for update using (true) with check (true);
