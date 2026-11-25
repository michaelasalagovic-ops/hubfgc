create function fcg_private.task_assignees()
returns table(user_id uuid, display_name text, has_display_name boolean)
language sql stable security definer set search_path = ''
as $$
  select u.id,
    coalesce(n.display_name, 'Člen týmu · ' || left(u.id::text, 8)),
    n.display_name is not null
  from auth.users u
  cross join lateral (
    select nullif(left(btrim(u.raw_user_meta_data->>'fcg_display_name'), 60), '') as display_name
  ) n
  where (select auth.uid()) is not null
    and (select public.fcg_can_read())
    and u.email_confirmed_at is not null
    and (
      exists (select from public.fcg_members m where m.email = lower(u.email))
      or exists (select from public.fcg_admins a where a.email = lower(u.email))
    )
  order by 2, 1
$$;

create function public.fcg_task_assignees()
returns table(user_id uuid, display_name text, has_display_name boolean)
language sql stable set search_path = ''
as $$ select * from fcg_private.task_assignees() $$;

revoke all on function fcg_private.task_assignees(), public.fcg_task_assignees() from public, anon;
grant execute on function fcg_private.task_assignees(), public.fcg_task_assignees() to authenticated;
