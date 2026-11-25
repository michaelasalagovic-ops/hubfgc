create or replace function fcg_private.task_assignee_emails()
returns table(user_id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select member.user_id, u.email::text
  from fcg_private.task_assignees() member
  join auth.users u on u.id = member.user_id
  where (select public.fcg_can_write())
    and exists (
      select from auth.users caller
      where caller.id = (select auth.uid())
        and lower(caller.email) = lower((select auth.jwt())->>'email')
        and caller.email_confirmed_at is not null
    )
  order by lower(u.email)
$$;
