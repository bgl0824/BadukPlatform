-- =============================================================================
-- public.student_progress
-- - 학생 문제별 학습 진도 (기기 간 동기화)
-- - 학생: 본인 행 SELECT / INSERT / UPDATE
-- - 학원장·선생님·관리자: 소속 학생 진도 SELECT
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- (auth_jwt_role, auth_teacher_academy_scope_ids 는 academy_members 스크립트 선행)
-- =============================================================================

create table if not exists public.student_progress (
  id text primary key,
  user_id text not null,
  academy_id text,
  problem_id text not null,
  problem_title text not null default '',
  category text not null default '',
  status text not null default 'IN_PROGRESS',
  solved boolean not null default false,
  wrong_count integer not null default 0,
  wrong_moves jsonb not null default '[]'::jsonb,
  solved_at timestamptz,
  attempts jsonb not null default '[]'::jsonb,
  review_resolved boolean not null default false,
  review_completed_at timestamptz,
  review_archived boolean not null default false,
  review_archived_at timestamptz,
  review_deleted boolean not null default false,
  review_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, problem_id)
);

create index if not exists student_progress_user_id_idx
  on public.student_progress (user_id);

create index if not exists student_progress_academy_id_idx
  on public.student_progress (academy_id);

comment on table public.student_progress is
  '학생 문제별 학습 진도 (앱 BADUK_STUDENT_PROGRESS 와 동기화)';

alter table public.student_progress enable row level security;

drop policy if exists "student_progress_self_select" on public.student_progress;
drop policy if exists "student_progress_self_insert" on public.student_progress;
drop policy if exists "student_progress_self_update" on public.student_progress;
drop policy if exists "student_progress_staff_select" on public.student_progress;
drop policy if exists "student_progress_admin_all" on public.student_progress;

-- 학생: 본인 진도 조회
create policy "student_progress_self_select"
  on public.student_progress
  for select
  to authenticated
  using (user_id = auth.uid()::text);

-- 학생: 본인 진도 생성
create policy "student_progress_self_insert"
  on public.student_progress
  for insert
  to authenticated
  with check (user_id = auth.uid()::text);

-- 학생: 본인 진도 수정
create policy "student_progress_self_update"
  on public.student_progress
  for update
  to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- 학원장·선생님·관리자: 소속 학생 진도 조회
create policy "student_progress_staff_select"
  on public.student_progress
  for select
  to authenticated
  using (
    public.auth_jwt_role() = 'admin'
    or (
      public.auth_jwt_role() = 'academy_owner'
      and academy_id = auth.uid()::text
    )
    or (
      public.auth_jwt_role() = 'teacher'
      and exists (
        select 1
        from public.academy_members m
        where m.user_id = student_progress.user_id
          and m.academy_id = any (public.auth_teacher_academy_scope_ids())
      )
    )
  );

-- 관리자: 전체 CRUD
create policy "student_progress_admin_all"
  on public.student_progress
  for all
  to authenticated
  using (public.auth_jwt_role() = 'admin')
  with check (public.auth_jwt_role() = 'admin');

notify pgrst, 'reload schema';
