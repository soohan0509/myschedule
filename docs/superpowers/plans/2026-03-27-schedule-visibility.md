# Schedule Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 일정은 생성자만, 그룹 일정은 생성자+수락 멤버만 볼 수 있도록 Supabase RLS 정책을 재적용한다.

**Architecture:** Supabase RLS 정책만 수정. 프론트엔드 코드 변경 없음. 기존 `001_init.sql`에 정책이 작성되어 있으나 DB에 적용되지 않아, 새 마이그레이션 파일로 drop 후 재생성한다.

**Tech Stack:** Supabase (PostgreSQL RLS), SQL

---

### Task 1: 마이그레이션 파일 생성

**Files:**
- Create: `supabase/migrations/006_fix_visibility.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/006_fix_visibility.sql` 파일을 아래 내용으로 생성한다.

```sql
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
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/006_fix_visibility.sql
git commit -m "feat: 일정 가시성 제어 RLS 정책 재적용"
```

---

### Task 2: Supabase에 마이그레이션 적용

**Files:**
- 없음 (Supabase 대시보드에서 직접 실행)

- [ ] **Step 1: Supabase 대시보드에서 SQL 실행**

1. Supabase 프로젝트 대시보드 접속
2. 좌측 메뉴 → **SQL Editor** 클릭
3. `supabase/migrations/006_fix_visibility.sql` 파일의 전체 내용을 붙여넣기
4. **Run** 버튼 클릭
5. 성공 메시지 확인

- [ ] **Step 2: 정책 적용 확인**

Supabase 대시보드에서:
1. 좌측 메뉴 → **Authentication** → **Policies**
2. `schedules` 테이블 확인
3. 다음 3개 정책이 존재하는지 확인:
   - `schedules_select`
   - `schedules_update`
   - `schedules_delete`

- [ ] **Step 3: 동작 테스트**

웹사이트에서 직접 확인:
1. A 계정으로 로그인 → 개인 일정 추가
2. B 계정으로 로그인 → A가 추가한 개인 일정이 **보이지 않아야 함**
3. A 계정으로 로그인 → 그룹 일정 추가 (B 초대)
4. B 계정 로그인 → 알림에서 **수락 전에는 보이지 않아야 함**
5. B 계정에서 수락 → 이후 그룹 일정이 **보여야 함**
