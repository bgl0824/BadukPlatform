-- =============================================================================
-- public.academy_members
-- - 초대 가입 학생/선생님 ↔ 학원 연결 (localStorage 대신 Supabase)
-- - INSERT: 가입 직후 본인(user_id = auth.uid())
-- - SELECT: 학원장(academy_id = auth.uid()), admin 전체
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

create table if not exists public.academy_members (
  id text primary key,
  academy_id text not null,
  academy_name text not null default '',
  user_id text not null,
  username text not null default '',
  name text not null default '',
  role text not null check (role in ('student', 'teacher')),
  assigned_teacher_id text,
  invite_code text,
  invited_by text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_at timestamptz not null default now(),
  unique (academy_id, user_id)
);

create index if not exists academy_members_academy_id_idx
  on public.academy_members (academy_id);

create index if not exists academy_members_user_id_idx
  on public.academy_members (user_id);

comment on table public.academy_members is
  '학원 소속 멤버 (초대 가입 시 insert)';

alter table public.academy_members enable row level security;

drop policy if exists "academy_members_self_select" on public.academy_members;
drop policy if exists "academy_members_self_insert" on public.academy_members;
drop policy if exists "academy_members_owner_select" on public.academy_members;
drop policy if exists "academy_members_admin_select" on public.academy_members;
drop policy if exists "academy_members_owner_update" on public.academy_members;
drop policy if exists "academy_members_admin_all" on public.academy_members;

-- 본인 소속 조회 (학생/선생님 metadata 보강)
create policy "academy_members_self_select"
  on public.academy_members
  for select
  to authenticated
  using (user_id = auth.uid()::text);

-- 가입 직후 본인 멤버 행 생성
create policy "academy_members_self_insert"
  on public.academy_members
  for insert
  to authenticated
  with check (user_id = auth.uid()::text);

-- 학원장: 본인 학원 멤버 조회
create policy "academy_members_owner_select"
  on public.academy_members
  for select
  to authenticated
  using (
    public.auth_jwt_role() = 'academy_owner'
    and academy_id = auth.uid()::text
  );

-- 관리자: 전체 조회
create policy "academy_members_admin_select"
  on public.academy_members
  for select
  to authenticated
  using (public.auth_jwt_role() = 'admin');

-- 학원장: 본인 학원 멤버 수정(비활성 등)
create policy "academy_members_owner_update"
  on public.academy_members
  for update
  to authenticated
  using (
    public.auth_jwt_role() = 'academy_owner'
    and academy_id = auth.uid()::text
  )
  with check (
    public.auth_jwt_role() = 'academy_owner'
    and academy_id = auth.uid()::text
  );

-- 관리자: 전체 CRUD
create policy "academy_members_admin_all"
  on public.academy_members
  for all
  to authenticated
  using (public.auth_jwt_role() = 'admin')
  with check (public.auth_jwt_role() = 'admin');

notify pgrst, 'reload schema';
