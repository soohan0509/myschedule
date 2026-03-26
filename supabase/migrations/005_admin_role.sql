-- 어드민 컬럼 추가
alter table profiles add column if not exists is_admin boolean not null default false;

-- 김수한 (4반 5번) 어드민 설정
update profiles set is_admin = true
where id = '7b9b790f-9cf6-400b-a162-d6e63aa273e4';

-- profiles: 어드민은 모든 프로필 수정 가능
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update
  using (id = auth.uid() or (select is_admin from profiles where id = auth.uid()));

-- schedules: 어드민은 전체 열람/수정/삭제 가능
drop policy if exists "class_select" on schedules;
create policy "class_select" on schedules for select
  using (
    (select is_admin from profiles where id = auth.uid()) or
    type = 'class' or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    ))
  );

drop policy if exists "schedules_update" on schedules;
create policy "schedules_update" on schedules for update
  using (
    (select is_admin from profiles where id = auth.uid()) or
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (created_by = auth.uid() or exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')))
  );

drop policy if exists "schedules_delete" on schedules;
create policy "schedules_delete" on schedules for delete
  using (
    (select is_admin from profiles where id = auth.uid()) or
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (created_by = auth.uid() or exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')))
  );

-- group_members: 어드민은 전체 열람 가능
drop policy if exists "gm_select" on group_members;
create policy "gm_select" on group_members for select
  using (
    (select is_admin from profiles where id = auth.uid()) or
    user_id = auth.uid() or
    exists (select 1 from schedules where id = group_members.schedule_id and created_by = auth.uid())
  );

-- notifications: 어드민은 전체 열람 가능
drop policy if exists "notif_select" on notifications;
create policy "notif_select" on notifications for select
  using (
    (select is_admin from profiles where id = auth.uid()) or
    user_id = auth.uid()
  );
