-- =============================================================================
-- 기출/시험 세트 (문제 묶음 — problems 와 분리)
-- - exam_sets: 배포 단위 (제목, 급수, 유형, 공개범위, 상태)
-- - exam_set_questions: 세트 ↔ problem_id (order_index)
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- (auth_jwt_role / auth_can_manage_problems 는 supabase-problems-rls.sql 선행)
-- =============================================================================

create table if not exists public.exam_sets (
  id text primary key,
  title text not null,
  description text not null default '',
  grade_level text,
  type text not null default 'past_exam'
    check (type in ('past_exam', 'promotion_test', 'mock_test')),
  visibility text not null default 'private'
    check (visibility in ('public', 'academy', 'private')),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  level_group text,
  academy_id text,
  set_role text not null default 'question_bank'
    check (set_role in ('question_bank', 'promotion_paper')),
  source_exam_set_id text references public.exam_sets(id) on delete set null,
  available_from timestamptz,
  available_until timestamptz,
  exam_date date,
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exam_sets_available_window_check'
  ) then
    alter table public.exam_sets
      add constraint exam_sets_available_window_check
      check (
        available_from is null
        or available_until is null
        or available_from <= available_until
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'exam_sets_type_role_check'
  ) then
    alter table public.exam_sets
      add constraint exam_sets_type_role_check
      check (
        (type = 'promotion_test' and set_role = 'promotion_paper')
        or (type in ('past_exam', 'mock_test') and set_role = 'question_bank')
      );
  end if;
end
$$;

create index if not exists exam_sets_status_visibility_idx
  on public.exam_sets (status, visibility, grade_level);

create index if not exists exam_sets_role_status_idx
  on public.exam_sets (set_role, status);

create index if not exists exam_sets_available_window_idx
  on public.exam_sets (available_from, available_until);

create index if not exists exam_sets_source_idx
  on public.exam_sets (source_exam_set_id);

create index if not exists exam_sets_level_group_sort_idx
  on public.exam_sets (level_group, sort_order);

comment on table public.exam_sets is
  '기출/승급/모의 시험 세트 — problem 과 별도 배포 단위';

comment on column public.exam_sets.grade_level is
  '대표 급수 코드 (30k, 1d 등). 세트 라벨·필터용';

create table if not exists public.exam_set_questions (
  exam_set_id text not null references public.exam_sets (id) on delete cascade,
  problem_id text not null,
  order_index integer not null default 1,
  primary key (exam_set_id, problem_id)
);

create index if not exists exam_set_questions_set_order_idx
  on public.exam_set_questions (exam_set_id, order_index);

comment on table public.exam_set_questions is
  '세트에 포함된 problem.id 목록 (order_index = 세트 내부 순서)';

-- -----------------------------------------------------------------------------
-- 플랫폼 admin (JWT role = admin) — 초안·비공개 세트 포함 전체 조회
-- -----------------------------------------------------------------------------

create or replace function public.auth_is_platform_admin()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and public.auth_jwt_role() = 'admin';
$$;

revoke all on function public.auth_is_platform_admin() from public;
grant execute on function public.auth_is_platform_admin() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.exam_sets enable row level security;
alter table public.exam_set_questions enable row level security;

drop policy if exists "exam_sets_select" on public.exam_sets;
drop policy if exists "exam_sets_select_platform_admin" on public.exam_sets;
drop policy if exists "exam_sets_write_managers" on public.exam_sets;
drop policy if exists "exam_set_questions_select" on public.exam_set_questions;
drop policy if exists "exam_set_questions_write_managers" on public.exam_set_questions;

create policy "exam_sets_select_platform_admin"
on public.exam_sets
for select
to authenticated
using (public.auth_is_platform_admin());

create policy "exam_sets_select"
on public.exam_sets
for select
to public
using (
  public.auth_can_manage_problems()
  or (
    status = 'published'
    and (
      (
        set_role = 'question_bank'
        and (
          visibility = 'public'
          or (
            visibility = 'academy'
            and coalesce(academy_id, '') <> ''
            and (
              academy_id = coalesce(auth.jwt() -> 'user_metadata' ->> 'academyId', '')
              or exists (
                select 1
                from public.academy_members am
                where am.user_id = auth.uid()::text
                  and am.role = public.auth_jwt_role()
                  and am.status = 'active'
                  and am.academy_id = academy_id
              )
            )
          )
        )
      )
      or (
        set_role = 'promotion_paper'
        and public.auth_jwt_role() in ('academy_owner', 'teacher')
        and now() >= coalesce(available_from, now() + interval '100 years')
        and now() <= coalesce(available_until, now() - interval '100 years')
        and (
          visibility = 'public'
          or (
            visibility = 'academy'
            and coalesce(academy_id, '') <> ''
            and academy_id = coalesce(
              auth.jwt() -> 'user_metadata' ->> 'academyId',
              ''
            )
          )
        )
      )
    )
  )
);

create policy "exam_sets_write_managers"
on public.exam_sets
for all
to authenticated
using (public.auth_can_manage_problems())
with check (public.auth_can_manage_problems());

create policy "exam_set_questions_select"
on public.exam_set_questions
for select
to public
using (
  exists (
    select 1
    from public.exam_sets es
    where es.id = exam_set_id
      and (
        public.auth_can_manage_problems()
        or (
          es.status = 'published'
          and (
            (
              es.set_role = 'question_bank'
              and (
                es.visibility = 'public'
                or (
                  es.visibility = 'academy'
                  and coalesce(es.academy_id, '') <> ''
                  and (
                    es.academy_id = coalesce(auth.jwt() -> 'user_metadata' ->> 'academyId', '')
                    or exists (
                      select 1
                      from public.academy_members am
                      where am.user_id = auth.uid()::text
                        and am.role = public.auth_jwt_role()
                        and am.status = 'active'
                        and am.academy_id = es.academy_id
                    )
                  )
                )
              )
            )
            or (
              es.set_role = 'promotion_paper'
              and public.auth_jwt_role() in ('academy_owner', 'teacher')
              and now() >= coalesce(es.available_from, now() + interval '100 years')
              and now() <= coalesce(es.available_until, now() - interval '100 years')
              and (
                es.visibility = 'public'
                or (
                  es.visibility = 'academy'
                  and coalesce(es.academy_id, '') <> ''
                  and es.academy_id = coalesce(
                    auth.jwt() -> 'user_metadata' ->> 'academyId',
                    ''
                  )
                )
              )
            )
          )
        )
      )
  )
);

create policy "exam_set_questions_write_managers"
on public.exam_set_questions
for all
to authenticated
using (public.auth_can_manage_problems())
with check (public.auth_can_manage_problems());

notify pgrst, 'reload schema';
