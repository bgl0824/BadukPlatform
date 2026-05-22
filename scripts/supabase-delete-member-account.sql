-- =============================================================================
-- 멤버 계정 완전 삭제 (auth.users + academy_members)
-- - 학원장: 본인 학원 · 비활성(inactive) 멤버만
-- - 관리자: 전체 학원 · 활성/비활성 모두
-- - 클라이언트: supabase.rpc('delete_member_account', { target_user_id, target_academy_id })
--
-- 선행: auth_jwt_role (supabase-problems-rls.sql 등)
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

create or replace function public.auth_can_delete_member_account()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and public.auth_jwt_role() in ('admin', 'academy_owner');
$$;

comment on function public.auth_can_delete_member_account() is
  '멤버 계정 삭제: admin 또는 academy_owner';

revoke all on function public.auth_can_delete_member_account() from public;
grant execute on function public.auth_can_delete_member_account() to authenticated;

create or replace function public.delete_member_account(
  target_user_id uuid,
  target_academy_id text
)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  member_status text;
  member_role text;
  deleted_members integer;
  deleted_users integer;
  caller_role text;
begin
  if not public.auth_can_delete_member_account() then
    raise exception 'permission denied';
  end if;

  if target_user_id is null or coalesce(trim(target_academy_id), '') = '' then
    raise exception 'target_user_id and target_academy_id are required';
  end if;

  caller_role := public.auth_jwt_role();

  select status, role
  into member_status, member_role
  from public.academy_members
  where user_id = target_user_id::text
    and academy_id = target_academy_id
  limit 1;

  if member_status is null then
    raise exception 'academy member not found';
  end if;

  if caller_role = 'academy_owner' then
    if auth.uid()::text <> target_academy_id then
      raise exception 'permission denied for academy';
    end if;

    if member_status = 'active' then
      raise exception 'active members must be deactivated before delete';
    end if;
  elsif caller_role <> 'admin' then
    raise exception 'permission denied';
  end if;

  delete from public.academy_members
  where user_id = target_user_id::text
    and academy_id = target_academy_id;

  get diagnostics deleted_members = row_count;

  delete from auth.users
  where id = target_user_id;

  get diagnostics deleted_users = row_count;

  if deleted_users = 0 then
    raise exception 'auth user not found';
  end if;

  return json_build_object(
    'ok', true,
    'user_id', target_user_id,
    'academy_id', target_academy_id,
    'member_role', member_role,
    'deleted_members', deleted_members,
    'deleted_users', deleted_users
  );
end;
$$;

revoke all on function public.delete_member_account(uuid, text) from public;
grant execute on function public.delete_member_account(uuid, text) to authenticated;

notify pgrst, 'reload schema';
