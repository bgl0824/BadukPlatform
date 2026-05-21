-- =============================================================================
-- 기본 관리자(admin) 계정 — 안내용 SQL
--
-- Supabase Auth 비밀번호는 SQL만으로 안전하게 넣기 어렵습니다.
-- 권장: Node 스크립트 (Service Role Key 사용)
--
--   set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
--   node scripts/create-admin-user.mjs
--
-- 가상 이메일 확인만:
--   node scripts/create-admin-user.mjs --dry-run
-- =============================================================================

-- 아래 이메일은 --dry-run 출력값과 동일해야 합니다.
-- admin 아이디 고정 시 해시는 항상 같습니다 (앱 usernameToAuthEmail 규칙).

-- admin 아이디 고정 시 내부 email (앱과 동일 해시):
-- user_aa73da63e26b@baduk.app
-- (다시 확인: node scripts/create-admin-user.mjs --dry-run)

-- 이미 Dashboard / 스크립트로 계정을 만든 뒤 metadata만 맞추려면:
-- (이메일을 --dry-run 결과로 바꾸세요)

/*
update auth.users
set
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'admin',
    'userType', 'admin',
    'username', 'admin'
  ),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmed_at = coalesce(confirmed_at, now())
where lower(email) = lower('user_aa73da63e26b@baduk.app');
*/

-- 생성 여부 확인:
-- select id, email, raw_user_meta_data->>'username' as username, raw_user_meta_data->>'role' as role
-- from auth.users
-- where raw_user_meta_data->>'username' = 'admin';
