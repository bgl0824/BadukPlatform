-- 문제별 바둑판 크기 (9줄 / 13줄). 기존 행은 기본 13줄.
alter table public.problems
  add column if not exists board_size smallint not null default 13;

alter table public.problems
  drop constraint if exists problems_board_size_check;

alter table public.problems
  add constraint problems_board_size_check
  check (board_size in (9, 13));
