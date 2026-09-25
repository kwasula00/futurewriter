-- Every project is one work of a given type, and its outline lives beside the
-- draft so the skeleton can be navigated and rebuilt without touching the text.
alter table public.projects
  add column if not exists work_type text not null default 'novel',
  add column if not exists structure jsonb not null default '{"version":1,"nodes":[]}'::jsonb;
