-- =============================================================================
-- HOTFIX: academy_members_teacher_select RLS infinite recursion → 500
--
-- 원인: 정책 안에서 academy_members 를 다시 SELECT (EXISTS subquery) 하면
--       같은 테이블 RLS 가 재귀 호출되어 PostgREST 500 발생.
--       (Postgres: "infinite recursion detected in policy for relation academy_members")
--
-- 조치: SECURITY DEFINER 함수로 선생님 scope id 를 한 번만 읽고,
--       정책은 academy_id = ANY(scope_ids) 로 단순 비교.
--
-- Supabase SQL Editor에서 이 파일 전체 실행 후, 선생님 계정 재로그인.
-- =============================================================================

drop policy if exists "academy_members_teacher_select" on public.academy_members;

drop function if exists public.auth_teacher_academy_scope_ids();

create or replace function public.auth_teacher_academy_scope_ids()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array(
      select distinct scope_id
      from (
        select nullif(trim(m.invited_by), '') as scope_id
        from public.academy_members m
        where m.user_id = auth.uid()::text
          and m.role = 'teacher'
        union all
        select nullif(trim(m.academy_id), '') as scope_id
        from public.academy_members m
        where m.user_id = auth.uid()::text
          and m.role = 'teacher'
      ) scopes
      where scope_id is not null
    ),
    '{}'::text[]
  );
$$;

revoke all on function public.auth_teacher_academy_scope_ids() from public;
grant execute on function public.auth_teacher_academy_scope_ids() to authenticated;

comment on function public.auth_teacher_academy_scope_ids() is
  '선생님 JWT 기준 학원 scope id 목록 (invited_by 우선 + academy_id, RLS 재귀 없음)';

create policy "academy_members_teacher_select"
  on public.academy_members
  for select
  to authenticated
  using (
    public.auth_jwt_role() = 'teacher'
    and academy_id = any (public.auth_teacher_academy_scope_ids())
  );

comment on policy "academy_members_teacher_select" on public.academy_members is
  '선생님: auth_teacher_academy_scope_ids() 와 같은 academy_id 멤버 조회 (RLS 재귀 없음)';

notify pgrst, 'reload schema';
