-- =============================================================================
-- AI 응수형: 오답 백 응수 타깃 그룹 (교육용 전술 선택)
-- 선행: problems 테이블
-- =============================================================================

alter table public.problems
  add column if not exists target_white_group jsonb;

alter table public.problems
  add column if not exists target_white_mark text;

comment on column public.problems.target_white_group is
  '오답 시 백이 살려야 할 타깃 좌표 [{x,y},...]. 미지정 시 stones의 target_white_mark(기본 triangle) 표시 백돌 사용';

comment on column public.problems.target_white_mark is
  'stones.mark와 매칭해 타깃 시드 추출 (기본 triangle)';

notify pgrst, 'reload schema';
