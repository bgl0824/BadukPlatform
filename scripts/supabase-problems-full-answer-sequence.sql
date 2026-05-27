-- =============================================================================
-- AI 응수형 정답 전체 수순 (흑·백 교대, 정답 루트 백 = 제작자 입력 / KataGo는 오답만)
-- =============================================================================

alter table public.problems
  add column if not exists full_answer_sequence jsonb;

comment on column public.problems.full_answer_sequence is
  'AI 응수형 정답 루트 전체: [{ "color": "black"|"white", "move": "C11" }, ...]. 3수=3착, 5수=5착';

-- 예: 3수 축 문제
-- update public.problems set
--   problem_mode = 'ai_response',
--   answer_move_count = 3,
--   full_answer_sequence = '[
--     {"color":"black","move":"C11"},
--     {"color":"white","move":"D11"},
--     {"color":"black","move":"E10"}
--   ]'::jsonb
-- where id = 'YOUR_PROBLEM_ID';

notify pgrst, 'reload schema';
