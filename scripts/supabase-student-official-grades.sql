-- =============================================================================
-- public.student_official_grades
-- - 학생 공식(실제) 급수 — 학원×학생당 1건 (V1: 이력·사유·비고 없음)
-- - 학원장·선생님: 등록/수정 (UPSERT)
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- (auth_jwt_role, auth_teacher_academy_scope_ids 는 academy_members 스크립트 선행)
-- =============================================================================

create table if not exists public.student_official_grades (
  academy_id text not null,
  student_user_id text not null,
  grade_code text not null,
  acquired_at date not null,
  grade_source text not null,
  primary key (academy_id, student_user_id),
  constraint student_official_grades_grade_source_check
    check (grade_source in ('kba', 'kgf', 'platform'))
);

create index if not exists student_official_grades_academy_idx
  on public.student_official_grades (academy_id);

create index if not exists student_official_grades_student_idx
  on public.student_official_grades (student_user_id);

comment on table public.student_official_grades is
  '학생 공식(실제) 급수 — V1: grade_code, acquired_at, grade_source 만 저장';

comment on column public.student_official_grades.grade_code is
  '앱 grade-level-service 코드 (30k~1k, 1d~5d)';

comment on column public.student_official_grades.grade_source is
  'kba=대한바둑협회, kgf=한국기원, platform=플랫폼 자체급수';

alter table public.student_official_grades enable row level security;

drop policy if exists "student_official_grades_owner_all" on public.student_official_grades;
drop policy if exists "student_official_grades_teacher_all" on public.student_official_grades;
drop policy if exists "student_official_grades_admin_all" on public.student_official_grades;

create policy "student_official_grades_owner_all"
  on public.student_official_grades
  for all
  to authenticated
  using (
    public.auth_jwt_role() = 'academy_owner'
    and academy_id = auth.uid()::text
  )
  with check (
    public.auth_jwt_role() = 'academy_owner'
    and academy_id = auth.uid()::text
  );

create policy "student_official_grades_teacher_all"
  on public.student_official_grades
  for all
  to authenticated
  using (
    public.auth_jwt_role() = 'teacher'
    and academy_id = any (public.auth_teacher_academy_scope_ids())
  )
  with check (
    public.auth_jwt_role() = 'teacher'
    and academy_id = any (public.auth_teacher_academy_scope_ids())
  );

create policy "student_official_grades_admin_all"
  on public.student_official_grades
  for all
  to authenticated
  using (public.auth_jwt_role() = 'admin')
  with check (public.auth_jwt_role() = 'admin');

notify pgrst, 'reload schema';
