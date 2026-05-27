-- =============================================================================
-- AI 응수형 문제풀이 (흑만 학생, 백은 KataGo)
-- 선행: problems 테이블, (선택) supabase-problems-problem-mode.sql
-- =============================================================================

alter table public.problems
  add column if not exists answer_move_count integer;

alter table public.problems
  add column if not exists black_answer_sequence jsonb;

comment on column public.problems.problem_mode is
  'normal | ai_response | ai_response_test(스팟 UX 프로토타입)';

comment on column public.problems.answer_move_count is
  '총 수순 길이: 1, 3, 5, 7 (홀수). 흑·백·흑…';

comment on column public.problems.black_answer_sequence is
  '학생 흑 정답 (하위호환). 신규는 full_answer_sequence 권장';

comment on column public.problems.full_answer_sequence is
  '정답 루트 전체 수순 흑·백. 정답 시 백 자동착수, 오답 시만 KataGo';

-- 예: 축 테스트 3수 문제 (ID를 실제 값으로 교체)
-- update public.problems
-- set
--   problem_mode = 'ai_response',
--   answer_move_count = 3,
--   black_answer_sequence = '["D4", "F4"]'::jsonb,
--   correct_move = '{"x":3,"y":3}'::jsonb
-- where id in ('YOUR_AXIS_TEST_ID_1', 'YOUR_AXIS_TEST_ID_2');

notify pgrst, 'reload schema';
