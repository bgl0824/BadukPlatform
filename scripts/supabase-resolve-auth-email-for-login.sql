-- =============================================================================
-- 로그인: 아이디 → auth.users.email 조회 (레거시 계정 브릿지)
-- - 신규 가입은 모두 user_*@baduk.app (초대/일반 동일)
-- - 예전 invite_*@invite.baduk.app 계정 로그인 호환용
-- - 클라이언트: supabase.rpc('resolve_auth_email_for_login', { check_username })
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

begin;

drop function if exists public.resolve_auth_email_for_login(text);

create or replace function public.resolve_auth_email_for_login(check_username text)
returns text
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  normalized_username text;
  resolved_email text;
begin
  normalized_username := lower(trim(coalesce(check_username, '')));

  if normalized_username = '' then
    return null;
  end if;

  select lower(trim(users.email))
  into resolved_email
  from auth.users as users
  where lower(trim(coalesce(users.raw_user_meta_data ->> 'username', ''))) = normalized_username
  order by users.created_at desc
  limit 1;

  return resolved_email;
end;
$$;

comment on function public.resolve_auth_email_for_login(text) is
  '로그인용: user_metadata.username 에 매칭되는 auth.users.email 반환';

revoke all on function public.resolve_auth_email_for_login(text) from public;
grant execute on function public.resolve_auth_email_for_login(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
