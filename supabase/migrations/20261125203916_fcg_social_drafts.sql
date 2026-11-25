alter policy read_hub_files on storage.objects using (
  bucket_id='fcg-files'
  and case split_part(name,'/',1) when 'documents' then 'dokumenty' when 'images' then 'web' when 'social' then 'some' end
    = any (array(select unnest(public.fcg_my_sections())))
);
alter policy add_hub_files on storage.objects with check (
  bucket_id='fcg-files' and (select public.fcg_can_write())
  and case split_part(name,'/',1) when 'documents' then 'dokumenty' when 'images' then 'web' when 'social' then 'some' end
    = any (array(select unnest(public.fcg_my_sections())))
  and (split_part(name,'/',1)<>'social' or name ~ '^social/[a-f0-9-]{36}[.](jpg|png|webp|mp4)$')
);

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
      when nullif(payload->>'socialId','') is not null then 'some'
      when nullif(payload->>'meetingId','') is not null then 'meetingy'
      when payload->>'category' in ('Migrace','Obsah','Lokální SEO','Měření','AEO / GEO') then 'web'
      else 'roadmapa'
    end
    when coalesce(payload->>'kind','') in ('','page') then 'web'
  end
$$;

create table fcg_private.social_settings (
  singleton boolean primary key default true check (singleton),
  publisher_id uuid references auth.users(id) on delete set null
);
alter table fcg_private.social_settings enable row level security;
revoke all on fcg_private.social_settings from public, anon, authenticated;

create function fcg_private.social_people()
returns table(user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u
  where u.email_confirmed_at is not null
    and (select auth.uid()) is not null and 'some'=any(public.fcg_my_sections())
    and (exists(select from public.fcg_admins a where a.email=lower(u.email))
      or exists(select from public.fcg_members m where m.email=lower(u.email) and m.role='editor' and 'some'=any(m.sections)))
$$;
create function public.fcg_social_reviewers()
returns table(user_id uuid)
language sql stable set search_path = ''
as $$ select * from fcg_private.social_people() $$;
revoke all on function fcg_private.social_people(), public.fcg_social_reviewers() from public, anon;
grant execute on function fcg_private.social_people(), public.fcg_social_reviewers() to authenticated;

create function fcg_private.check_social_review()
returns trigger language plpgsql set search_path = ''
as $$
declare
  before_review jsonb;
  next_review jsonb := new.record->'review';
  actor text := auth.uid()::text;
  state text := next_review->>'state';
  draft_changed boolean := false;
  content_keys text[] := array['review','status'];
begin
  if (new.id like 'publish-%' or new.record->>'publicationTask'='true') and pg_trigger_depth()=1 and current_user='authenticated' then
    raise exception 'Publication tasks follow the post workflow' using errcode='42501';
  end if;
  if tg_op='UPDATE' and old.record->>'kind'='social' then
    if not new.deleted and (new.record->>'kind' is distinct from 'social'
      or (old.record->>'channel'='podklady') is distinct from (new.record->>'channel'='podklady')) then
      raise exception 'A post must stay in its record type' using errcode='23514';
    end if;
    before_review := old.record->'review';
    draft_changed := (old.record-content_keys) is distinct from (new.record-content_keys);
  end if;
  if new.deleted or new.record->>'kind' is distinct from 'social' or new.record->>'channel'='podklady' then return new; end if;

  if next_review is not distinct from before_review then
    if draft_changed and state in ('pending','approved','published') then
      raise exception 'Changes require a new review' using errcode='23514';
    end if;
  elsif state='pending' then
    if (next_review->>'reviewerId') is null or coalesce(new.record->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (new.record->>'date')::date is null then
      raise exception 'Provide a publication date and a reviewer' using errcode='23514';
    end if;
    if before_review->>'state' in ('approved','published') then
      raise exception 'Save a new draft before requesting review again' using errcode='23514';
    end if;
    if not exists(select 1 from fcg_private.social_people() p where p.user_id::text=next_review->>'reviewerId') then
      raise exception 'Choose an eligible SoMe reviewer' using errcode='23514';
    end if;
    next_review := jsonb_build_object('state',state,'reviewerId',next_review->>'reviewerId','requestedBy',actor);
  elsif state in ('approved','returned') then
    if before_review->>'state' is distinct from 'pending' or before_review->>'reviewerId' is distinct from actor or draft_changed then
      raise exception 'Only the assigned reviewer can decide on the saved draft' using errcode='42501';
    end if;
    if state='returned' and coalesce(btrim(next_review->>'note'),'')='' then
      raise exception 'Add a note before returning the draft' using errcode='23514';
    end if;
    next_review := before_review || jsonb_build_object('state',state,'note',left(btrim(coalesce(next_review->>'note','')),2000));
  elsif state='published' then
    if before_review->>'state' is distinct from 'approved' or draft_changed or not exists(
      select 1 from public.fcg_records where id='publish-'||new.id and not deleted and record->>'ownerId'=actor
    ) then
      raise exception 'Only an approved draft can be marked as published' using errcode='23514';
    end if;
    next_review := before_review || jsonb_build_object('state',state);
  elsif next_review is not null or not draft_changed or coalesce(before_review->>'state','') not in ('pending','approved') then
    raise exception 'Invalid review transition' using errcode='23514';
  end if;

  if next_review is not null then
    new.record := new.record || jsonb_build_object('review',next_review,'status',case state
      when 'pending' then 'K revizi' when 'approved' then 'Připraveno'
      when 'returned' then 'Rozpracováno' when 'published' then 'Publikováno' end);
  elsif before_review is not null then
    new.record := new.record || '{"status":"Návrh"}'::jsonb;
  elsif tg_op='INSERT' then
    new.record := new.record || '{"status":"Návrh"}'::jsonb;
  else
    new.record := new.record || jsonb_build_object('status',coalesce(old.record->>'status','Návrh'));
  end if;
  return new;
end;
$$;

create function fcg_private.sync_social_publication()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  state text := new.record#>>'{review,state}';
  previous_state text;
  task_id text := 'publish-'||new.id;
  publisher uuid;
  task jsonb;
begin
  if tg_op='UPDATE' then previous_state := old.record#>>'{review,state}'; end if;
  if (not new.deleted and new.record->>'kind' is distinct from 'social')
    or (state is not distinct from previous_state and not new.deleted) then return new; end if;
  if state='approved' and not new.deleted then
    select publisher_id into publisher from fcg_private.social_settings where singleton;
    if publisher is null then raise exception 'SoMe publisher is not configured' using errcode='23514'; end if;
    task := jsonb_build_object('id',task_id,'kind','task','category','SoMe','socialId',new.id,
      'publicationTask',true,'ownerId',publisher,'title','Publikovat · '||(new.record->>'title'),
      'priority','Střední','status','Rozpracováno','date',coalesce(new.record->>'date',''),
      'description','Po ručním zveřejnění označte příspěvek v SoMe jako publikovaný.');
    insert into public.fcg_records as existing (id,version,record,deleted) values(task_id,1,task,false)
      on conflict(id) do update set record=excluded.record, version=existing.version+1, deleted=false;
  elsif previous_state in ('approved','published') then
    update public.fcg_records set version=version+1, record=record||jsonb_build_object(
      'status',case when state='published' or new.deleted then 'Hotovo' else 'Čeká na podklady' end)
    where id=task_id and record->>'publicationTask'='true' and not deleted;
  end if;
  return new;
end;
$$;

revoke all on function fcg_private.check_social_review(), fcg_private.sync_social_publication() from public, anon, authenticated;

create trigger check_social_review before insert or update on public.fcg_records
for each row execute function fcg_private.check_social_review();
create trigger sync_social_publication after insert or update on public.fcg_records
for each row when (new.record->>'kind'='social') execute function fcg_private.sync_social_publication();
