alter table public.fcg_members
  add column sections text[] not null default array['roadmapa','meetingy','dokumenty','web','strategie']::text[]
  check (sections <@ array['roadmapa','meetingy','dokumenty','web','strategie']::text[]
    and array_position(sections,null) is null);

create function public.fcg_my_sections()
returns text[] language sql stable set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then array[]::text[]
    when (select public.fcg_is_admin()) then array['roadmapa','meetingy','dokumenty','web','strategie']::text[]
    else coalesce(
      (select m.sections from public.fcg_members m where m.email=lower((select auth.jwt())->>'email')),
      array[]::text[]
    )
  end
$$;

create function public.fcg_record_section(payload jsonb)
returns text language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(payload) is distinct from 'object' then null
    when payload->>'kind' = 'document' then 'dokumenty'
    when payload->>'kind' = 'meeting' then 'meetingy'
    when payload->>'kind' = 'note' then 'strategie'
    when payload->>'kind' = 'task' then case
      when nullif(payload->>'meetingId','') is not null then 'meetingy'
      when payload->>'category' in ('Migrace','Obsah','Lokální SEO','Měření','AEO / GEO') then 'web'
      else 'roadmapa'
    end
    when coalesce(payload->>'kind','') in ('','page') then 'web'
  end
$$;

alter table public.fcg_records
  add column hub_section text generated always as (public.fcg_record_section(record)) stored;

revoke all on function public.fcg_my_sections(), public.fcg_record_section(jsonb) from public, anon;
grant execute on function public.fcg_my_sections(), public.fcg_record_section(jsonb) to authenticated, service_role;

grant update (sections) on public.fcg_members to authenticated;
create policy update_member_sections on public.fcg_members for update to authenticated
  using ((select public.fcg_is_admin())) with check ((select public.fcg_is_admin()));

alter policy read_records on public.fcg_records using (
  hub_section = any (array(select unnest(public.fcg_my_sections())))
  or (deleted and hub_section is null and (select public.fcg_is_admin()))
);
alter policy insert_records on public.fcg_records with check (
  (select public.fcg_can_write()) and version=1 and not deleted
  and public.fcg_record_section(record) = any (array(select unnest(public.fcg_my_sections())))
);
alter policy update_records on public.fcg_records using (
  (select public.fcg_can_write()) and not deleted
  and hub_section = any (array(select unnest(public.fcg_my_sections())))
) with check (
  (not deleted and (select public.fcg_can_write())
    and public.fcg_record_section(record) = any (array(select unnest(public.fcg_my_sections()))))
  or (deleted and (select public.fcg_is_admin()))
);

alter policy read_original_files on public.fcg_original_files
  using ('dokumenty' = any (array(select unnest(public.fcg_my_sections()))));
alter policy read_hub_files on storage.objects using (
  bucket_id='fcg-files'
  and case split_part(name,'/',1) when 'documents' then 'dokumenty' when 'images' then 'web' end
    = any (array(select unnest(public.fcg_my_sections())))
);
alter policy add_hub_files on storage.objects with check (
  bucket_id='fcg-files' and (select public.fcg_can_write())
  and case split_part(name,'/',1) when 'documents' then 'dokumenty' when 'images' then 'web' end
    = any (array(select unnest(public.fcg_my_sections())))
);
