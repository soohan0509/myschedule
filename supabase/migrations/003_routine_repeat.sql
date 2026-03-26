alter table routines add column if not exists repeat_type text not null default 'specific';
alter table routines add column if not exists repeat_days text[] not null default '{}';
alter table routines add column if not exists repeat_start_date date;
