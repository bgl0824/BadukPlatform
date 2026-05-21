-- =============================================================================
-- public.curriculum_categories
-- - 카테고리 순서/이름/삭제 상태 (localStorage 단독 저장 대신 Supabase 동기화)
--
-- Supabase SQL Editor에서 이 파일 전체를 실행하세요.
-- =============================================================================

create table if not exists public.curriculum_categories (
  id text primary key,
  name text not null,
  level_group text not null default '입문',
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, level_group)
);

create index if not exists curriculum_categories_level_group_sort_idx
  on public.curriculum_categories (level_group, sort_order);

comment on table public.curriculum_categories is
  '학습 커리큘럼 카테고리 (순서·삭제 상태)';

alter table public.curriculum_categories enable row level security;

drop policy if exists "curriculum_categories_public_read" on public.curriculum_categories;
drop policy if exists "curriculum_categories_admin_write" on public.curriculum_categories;

create policy "curriculum_categories_public_read"
  on public.curriculum_categories
  for select
  to anon, authenticated
  using (status = 'active');

create policy "curriculum_categories_admin_write"
  on public.curriculum_categories
  for all
  to authenticated
  using (public.auth_can_manage_problems())
  with check (public.auth_can_manage_problems());

notify pgrst, 'reload schema';
