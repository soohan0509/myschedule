-- 일과 (특정 날짜에 표시되는 개인 일과)
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  start_time text not null,
  end_time text not null,
  specific_dates date[] not null default '{}',
  created_at timestamptz default now()
);

-- 일과 예외 (이 날만 삭제)
create table if not exists routine_exceptions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid references routines(id) on delete cascade,
  exception_date date not null
);
