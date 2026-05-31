-- AI 응수형: problem_goal + target_black_group + show_target_marker
-- category(분류)와 분리된 교육 목표 필드

alter table public.problems
  add column if not exists problem_goal text;

alter table public.problems
  add column if not exists target_black_group jsonb;

alter table public.problems
  add column if not exists show_target_marker boolean default true;

comment on column public.problems.problem_goal is
  'AI 응수형 목표: capture_white_group | save_black_group | capture_black_group | save_white_group';

comment on column public.problems.target_black_group is
  'AI 응수형 타깃 흑 그룹 좌표 [{x,y},...] — △ 표시에서 연결 그룹 전체로 확장 저장';

comment on column public.problems.show_target_marker is
  '초급: true(△ 표시). 고급: false(표시 숨김, target_group DB 유지)';

-- 예시 백필 (선택):
-- update public.problems
-- set problem_goal = 'capture_white_group'
-- where problem_mode = 'ai_response'
--   and problem_goal is null
--   and target_white_group is not null
--   and jsonb_array_length(target_white_group) > 0;
