-- =============================================================================
-- problems: 최선정답(best_moves) / 허용정답(alternative_moves)
-- - correct_move 는 하위호환용 (best_moves[0] 과 동기화)
-- - 기존 행은 correct_move → best_moves 백필
-- Supabase SQL Editor에서 실행하세요.
-- =============================================================================

alter table public.problems
  add column if not exists best_moves jsonb;

alter table public.problems
  add column if not exists alternative_moves jsonb;

comment on column public.problems.best_moves is
  '최선정답 좌표 배열 [{ "x": 3, "y": 9 }] 또는 GTP 문자열. correct_move 와 동기화';

comment on column public.problems.alternative_moves is
  '허용정답(차선) 좌표 배열. 학생에게 좋은 수로 인정, 통계용 answerQuality=alternative';

-- 기존 correct_move → best_moves (1개)
update public.problems
set best_moves = jsonb_build_array(correct_move)
where best_moves is null
  and correct_move is not null;

update public.problems
set alternative_moves = '[]'::jsonb
where alternative_moves is null;
