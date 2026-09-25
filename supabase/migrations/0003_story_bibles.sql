-- Story bible per project. Rules, characters, relationships, narrative,
-- scenes and the continuity log live here as one JSONB document.
create table if not exists public.story_bibles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  bible jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.story_bibles enable row level security;

drop policy if exists "owner can read" on public.story_bibles;
drop policy if exists "owner can write" on public.story_bibles;

create policy "owner can read"
  on public.story_bibles for select
  using (exists (
    select 1 from public.projects p
    where p.id = story_bibles.project_id
      and p.user_id = auth.uid()
  ));

create policy "owner can write"
  on public.story_bibles for all
  using (exists (
    select 1 from public.projects p
    where p.id = story_bibles.project_id
      and p.user_id = auth.uid()
  ));