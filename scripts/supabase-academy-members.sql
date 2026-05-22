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
drop policy if exists "academy_members_teacher_select" on public.academy_members;
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

-- 선생님: 같은 학원 소속 멤버 조회 (RLS 재귀 없음)
create policy "academy_members_teacher_select"
  on public.academy_members
  for select
  to authenticated
  using (
    public.auth_jwt_role() = 'teacher'
    and academy_id = any (public.auth_teacher_academy_scope_ids())
  );

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

-- 선생님/학생: 본인 row academy_id 를 invited_by(학원장 uid) 로 보정
create or replace function public.repair_my_academy_member_scope()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id text;
  fixed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select nullif(trim(invited_by), '')
  into owner_id
  from public.academy_members
  where user_id = auth.uid()::text
  limit 1;

  if owner_id is null then
    return jsonb_build_object('ok', true, 'fixed', false, 'reason', 'no_invited_by');
  end if;

  update public.academy_members
  set academy_id = owner_id
  where user_id = auth.uid()::text
    and academy_id is distinct from owner_id;

  fixed := found;

  return jsonb_build_object(
    'ok', true,
    'fixed', fixed,
    'academyId', owner_id,
    'invitedBy', owner_id
  );
end;
$$;

revoke all on function public.repair_my_academy_member_scope() from public;
grant execute on function public.repair_my_academy_member_scope() to authenticated;

comment on function public.repair_my_academy_member_scope() is
  '선생님/학생: 본인 academy_members.academy_id 를 invited_by(학원장 auth uid) 로 맞춤';

notify pgrst, 'reload schema';
