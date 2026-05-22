-- =============================================================================
-- 학원장/관리자 → 멤버 비밀번호 초기화 (Supabase Auth)
-- - GoTrue auth.users.encrypted_password 갱신 (기본값 000000 과 동일 정책)
-- - 클라이언트: supabase.rpc('reset_auth_user_password', { target_user_id, new_password })
--
-- 선행: scripts/supabase-problems-rls.sql 또는 supabase-academy-invite-codes.sql
--       (auth_jwt_role 함수)
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.auth_can_reset_member_password()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and public.auth_jwt_role() in ('admin', 'academy_owner');
$$;

comment on function public.auth_can_reset_member_password() is
  '비밀번호 초기화: admin 또는 academy_owner';

revoke all on function public.auth_can_reset_member_password() from public;
grant execute on function public.auth_can_reset_member_password() to authenticated;

create or replace function public.reset_auth_user_password(
  target_user_id uuid,
  new_password text
)
returns json
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  updated_count integer;
begin
  if not public.auth_can_reset_member_password() then
    raise exception 'permission denied';
  end if;

  if char_length(coalesce(new_password, '')) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;

  update auth.users
  set
    encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
    updated_at = now()
  where id = target_user_id;

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'user not found';
  end if;

  return json_build_object('ok', true, 'user_id', target_user_id);
end;
$$;

revoke all on function public.reset_auth_user_password(uuid, text) from public;
grant execute on function public.reset_auth_user_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';
