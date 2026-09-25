-- Language rule templates. One row per named policy a writer keeps, owned by
-- that writer rather than by a project, so a rule set written once can be
-- loaded into any of their documents.
create table if not exists public.language_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A writer keeps one template per name: saving over a name replaces it
  -- rather than leaving two of them to choose between.
  unique (user_id, name)
);

alter table public.language_templates enable row level security;

drop policy if exists "Users can view their own templates" on public.language_templates;
create policy "Users can view their own templates"
  on public.language_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own templates" on public.language_templates;
create policy "Users can create their own templates"
  on public.language_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own templates" on public.language_templates;
create policy "Users can update their own templates"
  on public.language_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own templates" on public.language_templates;
create policy "Users can delete their own templates"
  on public.language_templates for delete
  using (auth.uid() = user_id);
