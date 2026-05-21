-- =============================================================================
-- public.academy_invite_codes
-- - 학원 가입 코드: 브라우저 localStorage 대신 Supabase에 저장 (도메인/기기 공유)
-- - SELECT (anon): 활성·미만료 코드만 — signup?invite= 조회
-- - INSERT/DELETE: admin, academy_owner (본인 academy_id = auth.uid())
--
-- 선행: scripts/supabase-problems-rls.sql (auth_jwt_role 등) 실행 권장.
-- 없으면 아래 헬퍼가 생성됩니다.
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

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

grant execute on function public.normalize_auth_role(text) to anon, authenticated;
grant execute on function public.auth_jwt_role() to anon, authenticated;

create table if not exists public.academy_invite_codes (
  code text primary key,
  role text not null check (role in ('student', 'teacher')),
  academy_id text not null,
  academy_name text not null default '',
  created_by text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists academy_invite_codes_academy_id_idx
  on public.academy_invite_codes (academy_id);

comment on table public.academy_invite_codes is
  '학원 초대 가입 코드 (signup invite lookup)';

-- -----------------------------------------------------------------------------
-- RLS 헬퍼 (problems RLS와 동일한 JWT role)
-- -----------------------------------------------------------------------------

create or replace function public.auth_can_manage_academy_invites()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and public.auth_jwt_role() in ('admin', 'academy_owner');
$$;

comment on function public.auth_can_manage_academy_invites() is
  '초대코드 생성/삭제: admin 또는 academy_owner';

create or replace function public.auth_invite_code_is_usable(
  invite_status text,
  invite_expires_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select coalesce(invite_status, '') = 'active'
    and (invite_expires_at is null or invite_expires_at > now());
$$;

revoke all on function public.auth_can_manage_academy_invites() from public;
revoke all on function public.auth_invite_code_is_usable(text, timestamptz) from public;

grant execute on function public.auth_can_manage_academy_invites() to anon, authenticated;
grant execute on function public.auth_invite_code_is_usable(text, timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.academy_invite_codes enable row level security;

drop policy if exists "academy_invite_codes_signup_select" on public.academy_invite_codes;
drop policy if exists "academy_invite_codes_owner_select" on public.academy_invite_codes;
drop policy if exists "academy_invite_codes_admin_select" on public.academy_invite_codes;
drop policy if exists "academy_invite_codes_insert" on public.academy_invite_codes;
drop policy if exists "academy_invite_codes_delete" on public.academy_invite_codes;

-- signup (anon): 사용 가능한 코드만 조회
create policy "academy_invite_codes_signup_select"
  on public.academy_invite_codes
  for select
  to anon, authenticated
  using (
    public.auth_invite_code_is_usable(status, expires_at)
  );

-- 학원장: 본인 학원 코드 목록 (만료/비활성 포함)
create policy "academy_invite_codes_owner_select"
  on public.academy_invite_codes
  for select
  to authenticated
  using (
    public.auth_jwt_role() = 'academy_owner'
    and academy_id = auth.uid()::text
  );

-- 관리자: 전체 목록
create policy "academy_invite_codes_admin_select"
  on public.academy_invite_codes
  for select
  to authenticated
  using (public.auth_jwt_role() = 'admin');

create policy "academy_invite_codes_insert"
  on public.academy_invite_codes
  for insert
  to authenticated
  with check (
    public.auth_can_manage_academy_invites()
    and (
      public.auth_jwt_role() = 'admin'
      or (public.auth_jwt_role() = 'academy_owner' and academy_id = auth.uid()::text)
    )
  );

create policy "academy_invite_codes_delete"
  on public.academy_invite_codes
  for delete
  to authenticated
  using (
    public.auth_can_manage_academy_invites()
    and (
      public.auth_jwt_role() = 'admin'
      or (public.auth_jwt_role() = 'academy_owner' and academy_id = auth.uid()::text)
    )
  );

notify pgrst, 'reload schema';
