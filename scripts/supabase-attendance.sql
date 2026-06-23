-- 출결관리 1차 스키마 (추후 Supabase 연동용)
-- 이번 단계 UI는 localStorage(BADUK_ATTENDANCE)를 사용합니다.

create table if not exists public.academy_class_periods (
  id uuid primary key default gen_random_uuid(),
  academy_id text not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academy_class_periods_academy_id_idx
  on public.academy_class_periods (academy_id, sort_order);

create table if not exists public.academy_attendance_marks (
  id uuid primary key default gen_random_uuid(),
  academy_id text not null,
  student_user_id text not null,
  attendance_date date not null,
  period_id uuid not null references public.academy_class_periods(id) on delete cascade,
  marked_at timestamptz not null default now(),
  unique (academy_id, student_user_id, attendance_date, period_id)
);

create index if not exists academy_attendance_marks_month_idx
  on public.academy_attendance_marks (academy_id, attendance_date, student_user_id);

create table if not exists public.academy_student_attendance_meta (
  academy_id text not null,
  student_user_id text not null,
  monthly_frequency integer,
  attendance_days text,
  payment_status text,
  updated_at timestamptz not null default now(),
  primary key (academy_id, student_user_id)
);

-- RLS 예시 (학원장 전용)
-- alter table public.academy_class_periods enable row level security;
-- create policy academy_class_periods_owner on public.academy_class_periods
--   for all using (academy_id = auth.uid()::text);
