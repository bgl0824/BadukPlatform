-- 문제 급수/단수 (학습 흐름 display_order 와 별도)
-- Supabase SQL Editor에서 실행하세요.

alter table public.problems
  add column if not exists grade_level text;

comment on column public.problems.grade_level is
  '급수/단수 코드 (예: 30k, 1k, 1d). null = 미지정. display_order 와 독립.';

create index if not exists problems_level_group_category_grade_level_idx
  on public.problems (level_group, category, grade_level);

-- -----------------------------------------------------------------------------
-- 급수 일괄 배정 RPC (RLS UPDATE 가 0건일 때 클라이언트 폴백)
-- -----------------------------------------------------------------------------

create or replace function public.bulk_set_problems_grade_levels(
  problem_ids text[],
  new_grade_level text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_grade text;
  affected integer;
begin
  if not public.auth_can_manage_problems() then
    raise exception 'not authorized to update problems';
  end if;

  if problem_ids is null or cardinality(problem_ids) = 0 then
    return 0;
  end if;

  normalized_grade := nullif(lower(trim(coalesce(new_grade_level, ''))), '');
  if normalized_grade in ('unassigned', 'null') then
    normalized_grade := null;
  end if;

  update public.problems
  set grade_level = normalized_grade
  where id = any (problem_ids);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.bulk_set_problems_grade_levels(text[], text) from public;
grant execute on function public.bulk_set_problems_grade_levels(text[], text) to authenticated;
