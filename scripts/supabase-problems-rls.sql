-- =============================================================================
-- public.problems RLS
-- - SELECT: 누구나 (anon + authenticated)
-- - INSERT / UPDATE / DELETE: admin, academy_owner, teacher 만
-- - role: Supabase Auth JWT → user_metadata.role (또는 userType 별칭)
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) JWT role 헬퍼 (auth.jwt() 기반)
-- -----------------------------------------------------------------------------

create or replace function public.normalize_auth_role(role text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(role, '')))
    when 'academy' then 'academy_owner'
    when 'individual' then 'student'
    when 'user' then 'student'
    else lower(trim(coalesce(role, '')))
  end;
$$;

comment on function public.normalize_auth_role(text) is
  '앱 permission-service.js 와 동일한 role 별칭 정규화';

create or replace function public.auth_jwt_role()
returns text
language sql
stable
as $$
  select public.normalize_auth_role(
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'userType',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )
  );
$$;

comment on function public.auth_jwt_role() is
  '현재 요청 JWT의 정규화된 role (미로그인 시 빈 문자열)';

create or replace function public.auth_can_manage_problems()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and public.auth_jwt_role() in ('admin', 'academy_owner', 'teacher');
$$;

comment on function public.auth_can_manage_problems() is
  '문제 CRUD 권한: 로그인 + admin/academy_owner/teacher';

revoke all on function public.normalize_auth_role(text) from public;
revoke all on function public.auth_jwt_role() from public;
revoke all on function public.auth_can_manage_problems() from public;

grant execute on function public.normalize_auth_role(text) to anon, authenticated;
grant execute on function public.auth_jwt_role() to anon, authenticated;
grant execute on function public.auth_can_manage_problems() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) RLS 활성화
-- -----------------------------------------------------------------------------

alter table public.problems enable row level security;

-- -----------------------------------------------------------------------------
-- 3) 기존 public(anon) 쓰기 정책 제거
-- -----------------------------------------------------------------------------

drop policy if exists "Allow public read problems" on public.problems;
drop policy if exists "Allow public insert problems" on public.problems;
drop policy if exists "Allow public update problems" on public.problems;
drop policy if exists "Allow public delete problems" on public.problems;

-- 이전에 다른 이름으로 만든 정책이 있을 수 있음
drop policy if exists "problems_select_all" on public.problems;
drop policy if exists "problems_insert_by_managers" on public.problems;
drop policy if exists "problems_update_by_managers" on public.problems;
drop policy if exists "problems_delete_by_managers" on public.problems;

-- -----------------------------------------------------------------------------
-- 4) 최종 RLS 정책
-- -----------------------------------------------------------------------------

-- 읽기: 비로그인(anon) + 로그인 사용자 모두 허용
create policy "problems_select_all"
on public.problems
for select
to public
using (true);

-- 쓰기: 로그인 + 권한 role 만
create policy "problems_insert_by_managers"
on public.problems
for insert
to authenticated
with check (public.auth_can_manage_problems());

create policy "problems_update_by_managers"
on public.problems
for update
to authenticated
using (public.auth_can_manage_problems())
with check (public.auth_can_manage_problems());

create policy "problems_delete_by_managers"
on public.problems
for delete
to authenticated
using (public.auth_can_manage_problems());

-- -----------------------------------------------------------------------------
-- 5) (선택) delete_problem RPC — RLS 우회 방지, 동일 role 검사
--     클라이언트는 .from('problems').delete() 를 우선 사용합니다.
-- -----------------------------------------------------------------------------

create or replace function public.delete_problem(problem_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if not public.auth_can_manage_problems() then
    raise exception 'not authorized to delete problems';
  end if;

  delete from public.problems
  where id = problem_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.delete_problem(text) from public;
grant execute on function public.delete_problem(text) to authenticated;

-- anon 에게는 RPC 삭제 권한을 부여하지 않습니다.

-- -----------------------------------------------------------------------------
-- 확인용 (실행 후 Policy / 함수 목록 점검)
-- -----------------------------------------------------------------------------
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'problems';
