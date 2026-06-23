-- 문제 후보 표시(A/B/C/D) — 입문 선택형 문제 제작용
-- 실행: Supabase SQL Editor

alter table public.problems
  add column if not exists candidate_labels jsonb;

comment on column public.problems.candidate_labels is
  '바둑판 후보 표시 [{x,y,label}] — A/B/C/D 등 선택지 위치';
