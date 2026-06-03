-- 모의시험 결과 저장 (V1)
create table if not exists public.mock_test_attempts (
  id bigint generated always as identity primary key,
  exam_set_id text not null references public.exam_sets(id) on delete cascade,
  student_user_id uuid not null,
  student_name text not null default '',
  academy_id text,
  attempted_at timestamptz not null default now(),
  total_question_count integer not null default 0 check (total_question_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  accuracy_rate integer not null default 0 check (accuracy_rate >= 0 and accuracy_rate <= 100),
  wrong_problem_numbers integer[] not null default '{}',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  overtime_seconds integer not null default 0 check (overtime_seconds >= 0),
  time_limit_seconds integer not null default 1200 check (time_limit_seconds > 0),
  created_at timestamptz not null default now()
);

alter table public.mock_test_attempts
  add column if not exists duration_seconds integer not null default 0;

alter table public.mock_test_attempts
  add column if not exists overtime_seconds integer not null default 0;

alter table public.mock_test_attempts
  add column if not exists time_limit_seconds integer not null default 1200;

create index if not exists mock_test_attempts_exam_set_idx
  on public.mock_test_attempts (exam_set_id, attempted_at desc);

create index if not exists mock_test_attempts_student_idx
  on public.mock_test_attempts (student_user_id, attempted_at desc);

alter table public.mock_test_attempts enable row level security;

drop policy if exists "mock_test_attempts_student_insert" on public.mock_test_attempts;
drop policy if exists "mock_test_attempts_student_select_self" on public.mock_test_attempts;
drop policy if exists "mock_test_attempts_academy_viewers_select" on public.mock_test_attempts;
drop policy if exists "mock_test_attempts_admin_all" on public.mock_test_attempts;

create policy "mock_test_attempts_student_insert"
on public.mock_test_attempts
for insert
to authenticated
with check (
  auth.uid() = student_user_id
  and public.auth_jwt_role() = 'student'
);

create policy "mock_test_attempts_student_select_self"
on public.mock_test_attempts
for select
to authenticated
using (auth.uid() = student_user_id);

-- 학원장: auth.uid() = academy_id (원장 계정 id). academy_members에 원장 행이 없어도 조회 가능.
-- 선생님: JWT academyId 일치 또는 같은 학원 소속 학생 응시.
create policy "mock_test_attempts_academy_viewers_select"
on public.mock_test_attempts
for select
to authenticated
using (
  (
    public.auth_jwt_role() = 'academy_owner'
    and (
      mock_test_attempts.academy_id = auth.uid()::text
      or mock_test_attempts.academy_id = coalesce(auth.jwt() -> 'user_metadata' ->> 'academyId', '')
      or exists (
        select 1
        from public.academy_members student
        where student.user_id = mock_test_attempts.student_user_id::text
          and student.academy_id = auth.uid()::text
          and student.status = 'active'
      )
    )
  )
  or (
    public.auth_jwt_role() = 'teacher'
    and (
      (
        coalesce(mock_test_attempts.academy_id, '') <> ''
        and mock_test_attempts.academy_id = coalesce(auth.jwt() -> 'user_metadata' ->> 'academyId', '')
      )
      or exists (
        select 1
        from public.academy_members teacher
        join public.academy_members student
          on student.academy_id = teacher.academy_id
        where teacher.user_id = auth.uid()::text
          and teacher.role = 'teacher'
          and teacher.status = 'active'
          and student.user_id = mock_test_attempts.student_user_id::text
          and student.status = 'active'
      )
    )
  )
);

create policy "mock_test_attempts_admin_all"
on public.mock_test_attempts
for all
to authenticated
using (public.auth_jwt_role() = 'admin')
with check (public.auth_jwt_role() = 'admin');

notify pgrst, 'reload schema';
