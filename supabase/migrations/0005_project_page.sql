-- The page a project is set on: the trim size of the book and the margins the
-- text is laid out with, so the draft is shown at the size it will be printed at.
alter table public.projects
  add column if not exists page jsonb not null default '{"format":"a5","margins":{"top":20,"right":18,"bottom":20,"left":18}}'::jsonb;
