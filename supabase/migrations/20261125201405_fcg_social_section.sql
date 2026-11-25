alter table public.fcg_members
  drop constraint fcg_members_sections_check,
  add constraint fcg_members_sections_check check (
    sections <@ array['roadmapa','meetingy','dokumenty','web','strategie','some']::text[]
    and array_position(sections,null) is null
  );

create or replace function public.fcg_my_sections()
returns text[] language sql stable set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then array[]::text[]
    when (select public.fcg_is_admin()) then array['roadmapa','meetingy','dokumenty','web','strategie','some']::text[]
    else coalesce(
      (select m.sections from public.fcg_members m where m.email=lower((select auth.jwt())->>'email')),
      array[]::text[]
    )
  end
$$;

create or replace function public.fcg_record_section(payload jsonb)
returns text language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(payload) is distinct from 'object' then null
    when payload->>'kind' = 'document' then 'dokumenty'
    when payload->>'kind' = 'meeting' then 'meetingy'
    when payload->>'kind' = 'note' then 'strategie'
    when payload->>'kind' = 'social' then
      case when payload->>'channel' in ('instagram','linkedin','podklady') then 'some' end
    when payload->>'kind' = 'task' then case
      when nullif(payload->>'meetingId','') is not null then 'meetingy'
      when payload->>'category' in ('Migrace','Obsah','Lokální SEO','Měření','AEO / GEO') then 'web'
      else 'roadmapa'
    end
    when coalesce(payload->>'kind','') in ('','page') then 'web'
  end
$$;
