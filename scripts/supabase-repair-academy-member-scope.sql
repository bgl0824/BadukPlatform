-- =============================================================================
-- academy_members.academy_id 를 학원장 auth.users.id 와 맞추는 복구
--
-- 배경: 패치 이전 초대 가입 시 academy_id 가 metadata 값 등으로 저장된 경우,
--       학원장 RLS(academy_id = auth.uid()) 조회·dropdown 에 선생님이 안 보임.
--
-- 1) 아래 진단 쿼리로 불일치 확인 (학원장 UUID 로 치환)
-- 2) repair_academy_member_scope() RPC 실행 (학원장 로그인 세션)
-- 3) 필요 시 수동 UPDATE 블록 사용
--
-- Supabase SQL Editor에서 실행하세요.
-- =============================================================================

-- --- 진단: 학원장 auth id 와 teacher row academy_id 비교 ---
-- select
--   m.user_id,
--   m.academy_id,
--   m.role,
--   m.status,
--   m.invited_by,
--   m.invite_code
-- from public.academy_members m
-- where m.role = 'teacher'
-- order by m.joined_at desc;

-- select auth.uid()::text as owner_auth_id;

create or replace function public.repair_academy_member_scope()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id text := auth.uid()::text;
  role_name text := public.auth_jwt_role();
  fixed_members int := 0;
  fixed_invites int := 0;
begin
  if owner_id is null then
    raise exception 'not authenticated';
  end if;

  if role_name not in ('academy_owner', 'admin') then
    raise exception 'forbidden: academy_owner or admin only';
  end if;

  -- 초대한 멤버: invited_by = 학원장 id 인데 academy_id 가 다른 경우
  update public.academy_members
  set academy_id = owner_id
  where academy_id is distinct from owner_id
    and (
      invited_by = owner_id
      or invite_code in (
        select code
        from public.academy_invite_codes
        where created_by = owner_id
      )
    );

  get diagnostics fixed_members = row_count;

  -- 학원장이 만든 초대코드의 academy_id 도 auth uid 로 통일
  update public.academy_invite_codes
  set academy_id = owner_id
  where created_by = owner_id
    and academy_id is distinct from owner_id;

  get diagnostics fixed_invites = row_count;

  return jsonb_build_object(
    'ok', true,
    'ownerId', owner_id,
    'fixedMembers', fixed_members,
    'fixedInviteCodes', fixed_invites
  );
end;
$$;

revoke all on function public.repair_academy_member_scope() from public;
grant execute on function public.repair_academy_member_scope() to authenticated;

comment on function public.repair_academy_member_scope() is
  '학원장: invited_by/초대코드 기준으로 academy_members·invite academy_id 를 auth.uid() 로 정렬';

-- --- 수동 일괄 수정 (RPC 전에 SQL Editor에서만 사용) ---
-- update public.academy_members
-- set academy_id = '<OWNER_AUTH_USERS_ID>'
-- where academy_id = '<OLD_ACADEMY_ID>'
--   and role in ('teacher', 'student');

notify pgrst, 'reload schema';
