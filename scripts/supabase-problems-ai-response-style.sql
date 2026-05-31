-- =============================================================================
-- AI 응수 전술 스타일 (category와 분리)
-- 값: default | escape | capture | connect | liberty_fight | sacrifice
-- =============================================================================

alter table public.problems
  add column if not exists ai_response_style text;

comment on column public.problems.ai_response_style is
  'AI 백 응수 전술: default|escape|capture|snapback|connect|liberty_fight|sacrifice. null이면 카테고리 보조 추론 (환격→snapback)';

-- 예: 사활 속 축 — category는 사활, 스타일은 escape
-- update public.problems
-- set ai_response_style = 'escape'
-- where id = 'YOUR_PROBLEM_ID';

notify pgrst, 'reload schema';
