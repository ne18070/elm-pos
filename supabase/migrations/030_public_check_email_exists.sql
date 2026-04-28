-- Public helper used by the static subscribe page to reject duplicate emails.
create or replace function public.check_email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(trim(p_email))
  )
  or exists (
    select 1
    from public.users
    where lower(email) = lower(trim(p_email))
  )
  or exists (
    select 1
    from public.public_subscription_requests
    where lower(email) = lower(trim(p_email))
      and status <> 'rejected'
  );
$$;

revoke all on function public.check_email_exists(text) from public;
grant execute on function public.check_email_exists(text) to anon, authenticated;
