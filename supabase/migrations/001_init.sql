-- 프로필
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  class_num int not null check (class_num between 1 and 5),
  seat_num int not null,
  created_at timestamptz default now()
);

-- 일정
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  class_num int not null,
  date date not null,
  time_slot text not null,
  title text not null,
  detail text,
  type text not null check (type in ('class', 'personal', 'group')),
  created_by uuid references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

-- 첨부파일
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  file_url text not null,
  file_name text not null
);

-- 그룹 멤버
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected'))
);

-- 알림
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete cascade,
  type text not null default 'group_invite',
  is_read bool default false,
  created_at timestamptz default now()
);

-- RLS 활성화
alter table profiles enable row level security;
alter table schedules enable row level security;
alter table attachments enable row level security;
alter table group_members enable row level security;
alter table notifications enable row level security;

-- profiles RLS
create policy "profiles_select" on profiles for select
  using (true);
create policy "profiles_insert" on profiles for insert
  with check (id = auth.uid());
create policy "profiles_update" on profiles for update
  using (id = auth.uid());

-- schedules: class 타입
create policy "class_select" on schedules for select
  using (
    type = 'class' or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    ))
  );
create policy "schedules_insert" on schedules for insert
  with check (created_by = auth.uid());
create policy "schedules_update" on schedules for update
  using (
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (created_by = auth.uid() or exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')))
  );
create policy "schedules_delete" on schedules for delete
  using (
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (created_by = auth.uid() or exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')))
  );

-- attachments RLS
create policy "attachments_select" on attachments for select using (true);
create policy "attachments_insert" on attachments for insert with check (true);
create policy "attachments_delete" on attachments for delete using (true);

-- group_members RLS
create policy "gm_select" on group_members for select
  using (user_id = auth.uid() or exists (select 1 from schedules where id = group_members.schedule_id and created_by = auth.uid()));
create policy "gm_insert" on group_members for insert
  with check (exists (select 1 from schedules where id = group_members.schedule_id and created_by = auth.uid()));
create policy "gm_update" on group_members for update
  using (user_id = auth.uid());

-- notifications RLS
create policy "notif_select" on notifications for select using (user_id = auth.uid());
create policy "notif_update" on notifications for update using (user_id = auth.uid());
create policy "notif_insert" on notifications for insert with check (true);
