-- 문제 공용 표시 순서 (카테고리·단계별 display_order)
-- Supabase SQL Editor에서 실행하세요.

alter table public.problems
  add column if not exists display_order integer not null default 0;

create index if not exists problems_level_group_category_display_order_idx
  on public.problems (level_group, category, display_order);

-- 기존 데이터: created_at/id 순으로 카테고리·단계별 1..N 부여
with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(nullif(trim(level_group), ''), '입문'), category
      order by created_at asc, id asc
    ) as rn
  from public.problems
)
update public.problems p
set display_order = r.rn
from ranked r
where p.id = r.id
  and (p.display_order is null or p.display_order = 0);
