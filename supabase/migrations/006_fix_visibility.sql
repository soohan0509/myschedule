-- 기존 schedules RLS 정책 제거
drop policy if exists "class_select" on schedules;
drop policy if exists "schedules_update" on schedules;
drop policy if exists "schedules_delete" on schedules;
drop policy if exists "schedules_select" on schedules;

-- 조회: 타입별 가시성 제어
-- class: 누구나 조회 가능 (반 필터는 프론트엔드에서 처리)
-- personal: 생성자 본인만
-- group: 생성자 또는 status='accepted' 멤버만
create policy "schedules_select" on schedules for select
  using (
    type = 'class' or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (
        select 1 from group_members
        where schedule_id = schedules.id
          and user_id = auth.uid()
          and status = 'accepted'
      )
    ))
  );

-- 수정
create policy "schedules_update" on schedules for update
  using (
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    ))
  );

-- 삭제
create policy "schedules_delete" on schedules for delete
  using (
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    ))
  );
