-- Task templates (reusable Kanban-board ticket blueprints). See PRD #246
-- and issue #247. Mirrors the convention used by `agents`, `teams`,
-- `tools`, `runs`, `tasks`: public RLS policies, no per-row ownership.

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  task_title text not null,
  task_description text,
  plan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_templates_created_at
  on task_templates (created_at desc);

alter table task_templates enable row level security;

create policy "Public read access for task_templates" on task_templates
  for select using (true);

create policy "Public insert access for task_templates" on task_templates
  for insert with check (true);

create policy "Public update access for task_templates" on task_templates
  for update using (true) with check (true);

create policy "Public delete access for task_templates" on task_templates
  for delete using (true);
