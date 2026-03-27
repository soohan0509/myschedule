# 그룹 일정 삭제 옵션 설계

**날짜:** 2026-03-27
**상태:** 승인됨

## 배경

현재 그룹 일정은 생성자만 삭제할 수 있고, 삭제 시 무조건 전체 삭제된다. 그룹 멤버(수락한 사람)는 삭제 버튼 자체가 없다.

## 요구사항

- 그룹 일정의 생성자 및 accepted 멤버 모두 삭제 버튼 표시
- 삭제 클릭 시 두 가지 옵션 제공:
  - **모두에게서 삭제**: 일정 전체 삭제 (`schedules` 행 삭제)
  - **나에게서만 삭제**: 본인만 더 이상 안 보이게 처리

## 아키텍처

### DB 변경

`group_members.status`에 `'left'` 값 추가. 생성자가 "나에게서만 삭제"를 선택하면 `group_members`에 `left` 행을 삽입하고, RLS에서 이를 감지해 생성자에게도 안 보이도록 처리.

### RLS 변경

`schedules_select` 정책 수정:
- 기존: 생성자는 무조건 group 일정 조회 가능
- 변경: 생성자도 자신의 `group_members` status가 `'left'`이면 조회 불가

```sql
-- status 제약 변경
ALTER TABLE group_members DROP CONSTRAINT group_members_status_check;
ALTER TABLE group_members ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'left'));

-- schedules_select RLS 수정
DROP POLICY IF EXISTS "schedules_select" ON schedules;
CREATE POLICY "schedules_select" ON schedules FOR SELECT
  USING (
    type = 'class' OR
    (type = 'personal' AND created_by = auth.uid()) OR
    (type = 'group' AND (
      (created_by = auth.uid() AND NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE schedule_id = schedules.id AND user_id = auth.uid() AND status = 'left'
      )) OR
      EXISTS (
        SELECT 1 FROM group_members
        WHERE schedule_id = schedules.id AND user_id = auth.uid() AND status = 'accepted'
      )
    ))
  );
```

### 프론트엔드 변경 (`calendar.js`)

**삭제 버튼 표시 조건 변경:**

```javascript
// 기존
const canDelete = s.type === 'class'
  ? currentClass === profile.class_num
  : s.created_by === profile.id;

// 변경
const isGroupMember = (s.acceptedIds || []).includes(profile.id);
const canDelete = s.type === 'class'
  ? currentClass === profile.class_num
  : s.type === 'personal'
    ? s.created_by === profile.id
    : s.created_by === profile.id || isGroupMember;
```

**그룹 삭제 메뉴 표시:**
삭제 버튼 클릭 시 두 옵션 메뉴 표시 (루틴 삭제 메뉴와 동일한 UI 패턴).

| 옵션 | 동작 |
|------|------|
| 모두에게서 삭제 | `schedules` 삭제 |
| 나에게서만 삭제 | 멤버: `group_members` status → `'left'` / 생성자: `group_members`에 `left` 행 삽입 |

## 변경 파일

- **추가**: `supabase/migrations/007_group_delete.sql`
- **수정**: `calendar.js` — `showDateDetail` 함수의 삭제 버튼 로직
