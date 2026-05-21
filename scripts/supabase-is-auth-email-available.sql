-- =============================================================================
-- Supabase Auth: 아이디/이메일 중복확인 RPC (회원가입·로그인용)
--
-- ✅ SQL Editor에서 이 파일 전체만 한 번 실행하세요.
-- ✅ create or replace + drop if exists — 여러 번 실행해도 안전합니다.
-- ✅ 생성 대상:
--    - public.is_auth_username_available(check_username text)
--    - public.is_auth_email_available(check_email text)
--
-- 실행 후: Table Editor가 아니라 Database → Functions 에서 두 함수가 보이는지 확인하세요.
-- 404가 계속이면 Settings → API → "Reload schema" 또는 1~2분 후 재시도하세요.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) 이전에 다른 시그니처로 만든 동명 함수가 있으면 제거 (충돌 방지)
-- ---------------------------------------------------------------------------
drop function if exists public.is_auth_username_available(text);
drop function if exists public.is_auth_email_available(text);

-- ---------------------------------------------------------------------------
-- 1) 화면 아이디(user_metadata.username) 중복 확인 — 주요 기준
-- ---------------------------------------------------------------------------
create or replace function public.is_auth_username_available(check_username text)
returns boolean
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  normalized_username text;
begin
  normalized_username := lower(trim(coalesce(check_username, '')));

  if normalized_username = '' then
    return false;
  end if;

  return not exists (
    select 1
    from auth.users as users
    where lower(trim(coalesce(users.raw_user_meta_data ->> 'username', ''))) = normalized_username
  );
end;
$$;

comment on function public.is_auth_username_available(text) is
  '회원가입 아이디 중복확인: auth.users.raw_user_meta_data.username 기준';

-- ---------------------------------------------------------------------------
-- 2) auth.users.email 슬롯 중복 확인 (해시 기반 user_xxx@baduk.app 등)
-- ---------------------------------------------------------------------------
create or replace function public.is_auth_email_available(check_email text)
returns boolean
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  normalized_email text;
begin
  normalized_email := lower(trim(coalesce(check_email, '')));

  if normalized_email = '' or position('@' in normalized_email) = 0 then
    return false;
  end if;

  return not exists (
    select 1
    from auth.users as users
    where lower(trim(users.email)) = normalized_email
  );
end;
$$;

comment on function public.is_auth_email_available(text) is
  '회원가입 auth email 슬롯 중복확인: auth.users.email 기준';

-- ---------------------------------------------------------------------------
-- 3) 권한 (anon / authenticated — 비로그인 중복확인 포함)
-- ---------------------------------------------------------------------------
revoke all on function public.is_auth_username_available(text) from public;
revoke all on function public.is_auth_email_available(text) from public;

grant execute on function public.is_auth_username_available(text) to anon, authenticated, service_role;
grant execute on function public.is_auth_email_available(text) to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) PostgREST(API) 스키마 캐시 갱신 — 404 방지
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- 5) 설치 확인 (선택: 실행 후 Results 탭에서 true/false 확인)
-- ---------------------------------------------------------------------------
-- select public.is_auth_username_available('test_username_not_exists');
-- select public.is_auth_email_available('user_test@baduk.app');
