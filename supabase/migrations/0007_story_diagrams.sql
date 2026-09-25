-- Story diagrams per project. A project can hold more than one — alternative
-- maps of the same story — so each is a named row owned through its project,
-- and a writer keeps one diagram per name rather than two of them to choose
-- between.
create table if not exists public.story_diagrams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

alter table public.story_diagrams enable row level security;

drop policy if exists "owner can read diagrams" on public.story_diagrams;
drop policy if exists "owner can write diagrams" on public.story_diagrams;

create policy "owner can read diagrams"
  on public.story_diagrams for select
  using (exists (
    select 1 from public.projects p
    where p.id = story_diagrams.project_id
      and p.user_id = auth.uid()
  ));

create policy "owner can write diagrams"
  on public.story_diagrams for all
  using (exists (
    select 1 from public.projects p
    where p.id = story_diagrams.project_id
      and p.user_id = auth.uid()
  ));
