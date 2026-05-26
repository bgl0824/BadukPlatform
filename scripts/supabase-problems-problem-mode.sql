-- =============================================================================
-- AI 응수 UX 실험용 problem_mode (선택)
-- Supabase SQL Editor에서 실행. problems 테이블이 있어야 합니다.
-- =============================================================================

alter table public.problems
  add column if not exists problem_mode text;

alter table public.problems
  add column if not exists ai_response_candidates jsonb;

comment on column public.problems.problem_mode is
  'ai_response_test: 오답 후 mock AI 응수 스팟 UX (일반 문제와 분리)';

comment on column public.problems.ai_response_candidates is
  '응수 후보 (KataGo 연동 전 수동 입력) [{ "move": "D4", "color": "blue" }, ...]. 없으면 스팟 미표시';

-- KataGo 연동 시 동일 형식을 candidateResponses 로 주입 가능 (앱 resolveCandidateResponses 참고).

-- 축 테스트 문제 2개: 아래 ID를 실제 problem.id 로 바꾼 뒤 실행하세요.
-- update public.problems
-- set
--   problem_mode = 'ai_response_test',
--   ai_response_candidates = '[
--     {"move": "D4", "color": "blue"},
--     {"move": "E5", "color": "green"}
--   ]'::jsonb
-- where id in ('YOUR_PROBLEM_ID_1', 'YOUR_PROBLEM_ID_2');

notify pgrst, 'reload schema';
