-- Schema scaffolding for the Luiza content-automation template feature
-- (PRD #344, slice #346). Adds optional columns to task_templates, creates
-- the new template_references child table, and provisions the two private
-- Storage buckets that subsequent slices upload to and read from via signed
-- URLs minted by supabase/functions/_shared/signedUrls.ts.
--
-- This migration is purely additive: every change is gated by IF NOT EXISTS
-- (or ON CONFLICT for storage.buckets) so re-running it on an existing DB is
-- a no-op.

-- ── task_templates additive columns ────────────────────────────────────────
-- brand_context: free-form Markdown describing the template's brand voice
-- params_schema: JSON Schema describing the params an instantiation accepts
-- title_template / description_template: Mustache templates rendered at
-- instantiation time using the params + brand_context.

alter table task_templates
  add column if not exists brand_context text;

alter table task_templates
  add column if not exists params_schema jsonb;

alter table task_templates
  add column if not exists title_template text;

alter table task_templates
  add column if not exists description_template text;

-- ── template_references child table ────────────────────────────────────────
-- One row per attached reference (text snippet, image, or audio sample) used
-- to ground the template's prompt. Bucket-backed assets store their object
-- key in storage_path; pure-text references store the literal payload in
-- content_text.

create table if not exists template_references (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates (id) on delete cascade,
  key text not null,
  kind text not null check (kind in ('text', 'image', 'audio')),
  storage_path text,
  mime_type text,
  content_text text,
  original_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_template_references_template_id
  on template_references (template_id);

alter table template_references enable row level security;

-- Single-user-friendly policy: the app is allowlist-gated (see CLAUDE.md ›
-- "Authentication & Authorization"), so any signed-in user can manage
-- references. Mirrors the public policy used by task_templates today.
-- Tighten to per-owner once task_templates grows owner_user_id.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'template_references'
       and policyname = 'Public read access for template_references'
  ) then
    create policy "Public read access for template_references"
      on template_references for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'template_references'
       and policyname = 'Public insert access for template_references'
  ) then
    create policy "Public insert access for template_references"
      on template_references for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'template_references'
       and policyname = 'Public update access for template_references'
  ) then
    create policy "Public update access for template_references"
      on template_references for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'template_references'
       and policyname = 'Public delete access for template_references'
  ) then
    create policy "Public delete access for template_references"
      on template_references for delete using (true);
  end if;
end
$$;

-- ── Private Storage buckets ────────────────────────────────────────────────
-- Both buckets are private. Browser callers read objects via signed URLs
-- minted by supabase/functions/_shared/signedUrls.ts; writes go through
-- authenticated Supabase clients (gated by Storage RLS below).

insert into storage.buckets (id, name, public)
values ('template-references', 'template-references', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('task-outputs', 'task-outputs', false)
on conflict (id) do nothing;

-- Storage RLS for both buckets: authenticated users can read/write any
-- object in either bucket; anonymous clients receive 401/403. The allowlist
-- gate already restricts who can ever sign in, so per-folder ownership is
-- not yet enforced here — revisit when the app grows multi-tenant.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated read template-references'
  ) then
    create policy "Authenticated read template-references"
      on storage.objects for select to authenticated
      using (bucket_id = 'template-references');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated write template-references'
  ) then
    create policy "Authenticated write template-references"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'template-references');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated update template-references'
  ) then
    create policy "Authenticated update template-references"
      on storage.objects for update to authenticated
      using (bucket_id = 'template-references')
      with check (bucket_id = 'template-references');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated delete template-references'
  ) then
    create policy "Authenticated delete template-references"
      on storage.objects for delete to authenticated
      using (bucket_id = 'template-references');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated read task-outputs'
  ) then
    create policy "Authenticated read task-outputs"
      on storage.objects for select to authenticated
      using (bucket_id = 'task-outputs');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated write task-outputs'
  ) then
    create policy "Authenticated write task-outputs"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'task-outputs');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated update task-outputs'
  ) then
    create policy "Authenticated update task-outputs"
      on storage.objects for update to authenticated
      using (bucket_id = 'task-outputs')
      with check (bucket_id = 'task-outputs');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname = 'Authenticated delete task-outputs'
  ) then
    create policy "Authenticated delete task-outputs"
      on storage.objects for delete to authenticated
      using (bucket_id = 'task-outputs');
  end if;
end
$$;
