-- exam_sets type/set_role 정합성 보정
-- 정책:
-- - past_exam, mock_test => question_bank
-- - promotion_test       => promotion_paper

update public.exam_sets
set set_role = 'question_bank',
    updated_at = now()
where type in ('past_exam', 'mock_test')
  and set_role <> 'question_bank';

update public.exam_sets
set set_role = 'promotion_paper',
    updated_at = now()
where type = 'promotion_test'
  and set_role <> 'promotion_paper';

-- 선택: 현재 상태 확인
-- select type, set_role, count(*) from public.exam_sets group by type, set_role order by type, set_role;
