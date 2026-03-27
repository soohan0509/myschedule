# 일정 가시성 제어 설계

**날짜:** 2026-03-27
**상태:** 승인됨

## 배경

현재 개인 일정(`personal`)과 그룹 일정(`group`)을 추가해도 같은 반 다른 사람들에게 모두 보이는 문제가 있다. `001_init.sql`에 RLS 정책이 올바르게 작성되어 있으나 실제 Supabase DB에 적용되지 않아 발생하는 문제다.

## 요구사항

| 일정 타입 | 조회 가능 대상 |
|----------|--------------|
| `class`  | 누구나 (반 필터는 프론트엔드에서 처리) |
| `personal` | 생성자 본인만 |
| `group` | 생성자 또는 `status = 'accepted'` 멤버만 |

- 그룹 초대 거절 시 해당 일정 전체 삭제 (기존 동작 유지)

## 아키텍처

**DB 수준 보안 (RLS)** 만으로 처리. 프론트엔드 코드 변경 없음.

## 구현 계획

### 1. 새 마이그레이션 파일 생성

`supabase/migrations/006_fix_visibility.sql`

- `schedules` 테이블의 기존 select/update/delete 정책을 drop 후 재생성
- `IF EXISTS`로 안전하게 처리

### 2. Supabase 적용 방법

Supabase 대시보드 → SQL Editor에서 실행.

## RLS 정책 상세

```sql
-- 기존 정책 제거
drop policy if exists "class_select" on schedules;
drop policy if exists "schedules_update" on schedules;
drop policy if exists "schedules_delete" on schedules;

-- 조회: 타입별 가시성 제어
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

-- 수정: 생성자 또는 관련 멤버만
create policy "schedules_update" on schedules for update
  using (
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    ))
  );

-- 삭제: 생성자 또는 관련 멤버만
create policy "schedules_delete" on schedules for delete
  using (
    (type = 'class' and class_num = (select class_num from profiles where id = auth.uid())) or
    (type = 'personal' and created_by = auth.uid()) or
    (type = 'group' and (
      created_by = auth.uid() or
      exists (select 1 from group_members where schedule_id = schedules.id and user_id = auth.uid() and status = 'accepted')
    ))
  );
```

## 변경 범위

- **추가**: `supabase/migrations/006_fix_visibility.sql`
- **변경 없음**: 프론트엔드 코드 (`calendar.js`, `app.js` 등)
