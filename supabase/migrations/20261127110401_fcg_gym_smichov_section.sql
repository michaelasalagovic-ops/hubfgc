alter table public.fcg_members
  drop constraint fcg_members_sections_check,
  add constraint fcg_members_sections_check check (
    sections <@ array['roadmapa','meetingy','dokumenty','web','strategie','some','gym-smichov']::text[]
    and array_position(sections,null) is null
  ),
  alter column sections set default array['roadmapa','meetingy','dokumenty','web','strategie','gym-smichov']::text[];

update public.fcg_members
set sections = array_append(sections, 'gym-smichov')
where not ('gym-smichov' = any(sections));

create or replace function public.fcg_my_sections()
returns text[] language sql stable set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then array[]::text[]
    when (select public.fcg_is_admin()) then array['roadmapa','meetingy','dokumenty','web','strategie','some','gym-smichov']::text[]
    else coalesce(
      (select m.sections from public.fcg_members m where m.email=lower((select auth.jwt())->>'email')),
      array[]::text[]
    )
  end
$$;
