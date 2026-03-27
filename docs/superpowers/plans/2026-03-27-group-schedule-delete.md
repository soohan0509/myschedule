# Group Schedule Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 일정 삭제 시 "모두에게서 삭제" / "나에게서만 삭제" 옵션을 제공하고, 모든 accepted 멤버가 삭제 버튼을 볼 수 있게 한다.

**Architecture:** DB에 `'left'` 상태 추가 + RLS 수정(migration), 프론트엔드에서 그룹 삭제 메뉴 UI 추가. `schedules_delete` RLS는 이미 accepted 멤버에게 삭제 권한을 허용하므로 별도 수정 불필요.

**Tech Stack:** Supabase (PostgreSQL RLS), Vanilla JS

---

### Task 1: DB 마이그레이션 파일 생성

**Files:**
- Create: `supabase/migrations/007_group_delete.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/007_group_delete.sql`을 아래 내용으로 생성한다.

```sql
-- group_members status에 'left' 추가
ALTER TABLE group_members DROP CONSTRAINT group_members_status_check;
ALTER TABLE group_members ADD CONSTRAINT group_members_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'left'));

-- schedules_select RLS 수정: 생성자도 'left' 상태면 안 보이도록
DROP POLICY IF EXISTS "schedules_select" ON schedules;
CREATE POLICY "schedules_select" ON schedules FOR SELECT
  USING (
    type = 'class' OR
    (type = 'personal' AND created_by = auth.uid()) OR
    (type = 'group' AND (
      (created_by = auth.uid() AND NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE schedule_id = schedules.id
          AND user_id = auth.uid()
          AND status = 'left'
      )) OR
      EXISTS (
        SELECT 1 FROM group_members
        WHERE schedule_id = schedules.id
          AND user_id = auth.uid()
          AND status = 'accepted'
      )
    ))
  );
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/007_group_delete.sql
git commit -m "feat: 그룹 일정 삭제 옵션 DB 마이그레이션 추가"
```

---

### Task 2: 프론트엔드 — 그룹 삭제 메뉴 함수 추가

**Files:**
- Modify: `calendar.js` — `showRoutineDeleteMenu` 함수 아래에 `showGroupDeleteMenu` 함수 추가

- [ ] **Step 1: `showGroupDeleteMenu` 함수 추가**

`calendar.js`에서 `showRoutineDeleteMenu` 함수(421번 줄 끝) 바로 다음에 아래 함수를 삽입한다.

```javascript
function showGroupDeleteMenu(btn, scheduleId, isCreator, date) {
  document.querySelectorAll('.routine-delete-menu').forEach(el => el.remove());

  const menu = document.createElement('div');
  menu.className = 'routine-delete-menu';
  menu.innerHTML = `
    <button class="rdm-btn rdm-danger" id="gdm-all">모두에게서 삭제</button>
    <button class="rdm-btn" id="gdm-me">나에게서만 삭제</button>
  `;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(menu);

  menu.querySelector('#gdm-all').addEventListener('click', async () => {
    if (!confirm('그룹 일정을 모두에게서 삭제할까요?')) return;
    await supabase.from('schedules').delete().eq('id', scheduleId);
    menu.remove();
    await renderCalendar();
    await showDateDetail(date);
  });

  menu.querySelector('#gdm-me').addEventListener('click', async () => {
    if (isCreator) {
      await supabase.from('group_members').insert({
        schedule_id: scheduleId,
        user_id: profile.id,
        status: 'left'
      });
    } else {
      await supabase.from('group_members')
        .update({ status: 'left' })
        .eq('schedule_id', scheduleId)
        .eq('user_id', profile.id);
    }
    menu.remove();
    await renderCalendar();
    await showDateDetail(date);
  });

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); }
    });
  }, 0);
}
```

- [ ] **Step 2: 커밋**

```bash
git add calendar.js
git commit -m "feat: 그룹 일정 삭제 메뉴 함수 추가"
```

---

### Task 3: 프론트엔드 — 삭제 버튼 조건 및 동작 변경

**Files:**
- Modify: `calendar.js` — `showDateDetail` 함수 내 삭제 버튼 로직 (약 334번 줄)

- [ ] **Step 1: 삭제 버튼 조건 및 클릭 이벤트 수정**

`showDateDetail` 함수 내 아래 코드를 찾아서:

```javascript
      const canDelete = s.type === 'class'
        ? currentClass === profile.class_num
        : s.created_by === profile.id;

      if (canDelete) {
        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = '삭제';
        del.addEventListener('click', async () => {
          if (!confirm(`"${s.title}" 일정을 삭제할까요?`)) return;
          await supabase.from('schedules').delete().eq('id', s.id);
          await renderCalendar();
          await showDateDetail(date);
        });
        card.appendChild(del);
      }
```

아래로 교체한다:

```javascript
      const isGroupMember = acceptedIds.includes(s.id);
      const canDelete = s.type === 'class'
        ? currentClass === profile.class_num
        : s.type === 'personal'
          ? s.created_by === profile.id
          : s.created_by === profile.id || isGroupMember;

      if (canDelete) {
        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = '삭제';
        if (s.type === 'group') {
          del.addEventListener('click', () =>
            showGroupDeleteMenu(del, s.id, s.created_by === profile.id, date)
          );
        } else {
          del.addEventListener('click', async () => {
            if (!confirm(`"${s.title}" 일정을 삭제할까요?`)) return;
            await supabase.from('schedules').delete().eq('id', s.id);
            await renderCalendar();
            await showDateDetail(date);
          });
        }
        card.appendChild(del);
      }
```

- [ ] **Step 2: 커밋**

```bash
git add calendar.js
git commit -m "feat: 그룹 일정 삭제 버튼 모든 멤버에게 표시 및 옵션 메뉴 연결"
```

---

### Task 4: Supabase에 마이그레이션 적용

**Files:**
- 없음 (Supabase 대시보드에서 직접 실행)

- [ ] **Step 1: SQL Editor에서 실행**

Supabase 대시보드 → SQL Editor에 `supabase/migrations/007_group_delete.sql` 전체 내용 붙여넣기 후 Run.

- [ ] **Step 2: 동작 테스트**

1. A 계정으로 그룹 일정 생성 (B 초대)
2. B 계정에서 수락
3. B 계정에서 삭제 버튼 클릭 → "모두에게서 삭제" / "나에게서만 삭제" 메뉴 표시 확인
4. "나에게서만 삭제" 선택 → B에게만 안 보이고 A에게는 여전히 보이는지 확인
5. "모두에게서 삭제" 선택 → A, B 모두에게 안 보이는지 확인
