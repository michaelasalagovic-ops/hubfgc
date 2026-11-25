create schema if not exists fcg_private;
revoke all on schema fcg_private from public;
grant usage on schema fcg_private to authenticated;

alter table public.fcg_members
  add column role text not null default 'editor' check (role in ('editor', 'reader'));

create or replace function public.fcg_can_write()
returns boolean language sql stable set search_path = ''
as $$
  select public.fcg_is_admin() or exists (
    select from public.fcg_members
    where email = lower((select auth.jwt())->>'email') and role = 'editor'
  )
$$;

create function public.fcg_can_read()
returns boolean language sql stable set search_path = ''
as $$
  select public.fcg_is_admin() or exists (
    select from public.fcg_members where email = lower((select auth.jwt())->>'email')
  )
$$;

revoke all on function public.fcg_can_read() from public, anon;
grant execute on function public.fcg_can_read() to authenticated, service_role;

alter policy read_records on public.fcg_records using ((select public.fcg_can_read()));
alter policy read_original_files on public.fcg_original_files using ((select public.fcg_can_read()));
alter policy read_hub_files on storage.objects using (bucket_id = 'fcg-files' and (select public.fcg_can_read()));

create function fcg_private.list_members()
returns table(email text, role text, has_account boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.fcg_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return query
    select e.email,
           case when a.email is not null then 'admin'::text else m.role end,
           exists (select from auth.users u where lower(u.email) = e.email)
    from (select x.email from public.fcg_members x union select x.email from public.fcg_admins x) e
    left join public.fcg_admins a on a.email = e.email
    left join public.fcg_members m on m.email = e.email
    order by e.email;
end
$$;

create function fcg_private.set_member_role(target_email text, new_role text, expected_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  existing_role text;
begin
  perform pg_catalog.pg_advisory_xact_lock(197486912, 1);
  if not public.fcg_is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_email = lower((select auth.jwt())->>'email') then
    raise exception 'Cannot change own role' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('admin', 'editor', 'reader') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select m.role into existing_role from public.fcg_members m
  where m.email = target_email for update;
  if exists (select from public.fcg_admins a where a.email = target_email) then
    existing_role := 'admin';
  end if;
  if existing_role is null or existing_role is distinct from expected_role then
    raise sqlstate 'PT409' using message = 'Membership changed';
  end if;

  if new_role = 'admin' then
    if not exists (select from auth.users u where lower(u.email) = target_email) then
      raise sqlstate 'PT409' using message = 'Account required for administrator role';
    end if;
    insert into public.fcg_admins(email) values (target_email) on conflict (email) do nothing;
  elsif existing_role = 'admin' then
    insert into public.fcg_members(email, role) values (target_email, new_role)
    on conflict (email) do update set role = excluded.role;
    delete from public.fcg_admins where email = target_email;
  else
    update public.fcg_members set role = new_role where email = target_email;
  end if;
end
$$;

create function public.fcg_list_members()
returns table(email text, role text, has_account boolean)
language sql stable set search_path = ''
as $$ select * from fcg_private.list_members() $$;

create function public.fcg_set_member_role(target_email text, new_role text, expected_role text)
returns void language sql set search_path = ''
as $$ select fcg_private.set_member_role(target_email, new_role, expected_role) $$;

revoke all on function fcg_private.list_members(), fcg_private.set_member_role(text,text,text),
  public.fcg_list_members(), public.fcg_set_member_role(text,text,text) from public, anon;
grant execute on function fcg_private.list_members(), fcg_private.set_member_role(text,text,text),
  public.fcg_list_members(), public.fcg_set_member_role(text,text,text) to authenticated;
