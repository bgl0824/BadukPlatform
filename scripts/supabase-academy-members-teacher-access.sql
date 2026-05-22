-- =============================================================================
-- 선생님 academy_members 조회·scope 복구 패치
-- (기존 supabase-academy-members.sql 적용 후 이 파일을 SQL Editor에서 실행)
-- =============================================================================

drop policy if exists "academy_members_teacher_select" on public.academy_members;

drop function if exists public.auth_teacher_academy_scope_ids();

-- RLS 재귀 방지: 정책 내부에서 academy_members 를 다시 SELECT 하지 않음
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
  '선생님 JWT 기준 학원 scope id 목록 (invited_by + academy_id, RLS 재귀 없음)';

create policy "academy_members_teacher_select"
  on public.academy_members
  for select
  to authenticated
  using (
    public.auth_jwt_role() = 'teacher'
    and academy_id = any (public.auth_teacher_academy_scope_ids())
  );

comment on policy "academy_members_teacher_select" on public.academy_members is
  '선생님: auth_teacher_academy_scope_ids() 와 같은 academy_id 멤버 조회';

-- 본인 row academy_id 가 잘못 저장된 경우 invited_by(학원장 uid) 로 보정
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
