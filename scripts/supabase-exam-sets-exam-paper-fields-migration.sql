-- =============================================================================
-- 시험지 출력용 필드 추가 (주최 / 주관 / 지역 / 시험형)
-- Supabase SQL Editor에서 실행하세요. 여러 번 실행해도 안전합니다.
-- =============================================================================

begin;

alter table public.exam_sets
  add column if not exists host_organization text,
  add column if not exists sponsor_organization text,
  add column if not exists region_province text,
  add column if not exists region_city text,
  add column if not exists exam_variant text;

update public.exam_sets set exam_variant = null where exam_variant = 'C';

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'exam_sets_exam_variant_check'
  ) then
    alter table public.exam_sets drop constraint exam_sets_exam_variant_check;
  end if;

  alter table public.exam_sets
    add constraint exam_sets_exam_variant_check
    check (exam_variant is null or exam_variant in ('A', 'B'));
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exam_sets_host_organization_check'
  ) then
    alter table public.exam_sets
      add constraint exam_sets_host_organization_check
      check (
        host_organization is null
        or host_organization in ('korea_baduk_foundation', 'korea_baduk_association')
      );
  end if;
end
$$;

comment on column public.exam_sets.host_organization is '주최 기관 코드 (korea_baduk_foundation, korea_baduk_association)';
comment on column public.exam_sets.sponsor_organization is '주관 기관명 (예: 화성시바둑협회)';
comment on column public.exam_sets.region_province is '시·도 (예: 경기도)';
comment on column public.exam_sets.region_city is '시·군·구 (예: 화성시)';
comment on column public.exam_sets.exam_variant is '시험형 A/B (승급심사)';

commit;

notify pgrst, 'reload schema';
