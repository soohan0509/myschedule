# Phase 2: D-Day + 중복경고 + Undo + 다크모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** D-Day 카운트다운 배너, 일정 저장 시 중복 경고, 삭제 실행 취소(Undo), 다크 모드를 구현한다.

**Architecture:** 모두 기존 Vanilla JS + Supabase 스택에서 동작. D-Day는 `schedules.is_dday` 필드 추가(마이그레이션)로 구현하고, Undo는 삭제 직후 JS 메모리에 보관 후 5초 내 복원. 다크 모드는 CSS `[data-theme="dark"]` 셀렉터와 `localStorage`로 구현.

**Tech Stack:** Vanilla JS, Supabase PostgreSQL, CSS custom properties, localStorage

---

## 파일 변경 목록

| 파일 | 작업 | 설명 |
|------|------|------|
| `supabase/migrations/010_dday.sql` | 신규 | schedules 테이블에 is_dday 컬럼 추가 |
| `calendar.js` | 수정 | D-Day 배너, 중복경고, Undo, 다크모드 토글 |
| `calendar.html` | 수정 | D-Day 체크박스(모달), D-Day 배너 div, 다크모드 버튼 |
| `style.css` | 수정 | D-Day 스타일, 다크 모드 변수 |

---

## Task 1: D-Day DB 마이그레이션

**Files:**
- Create: `supabase/migrations/010_dday.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- supabase/migrations/010_dday.sql
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_dday BOOLEAN DEFAULT FALSE;
```

- [ ] **Step 2: Supabase에 마이그레이션 적용**

Supabase 대시보드 → SQL Editor에서 실행:
```sql
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_dday BOOLEAN DEFAULT FALSE;
```

또는 CLI 사용 가능한 경우:
```bash
npx supabase db push
```

- [ ] **Step 3: 컬럼 추가 확인**

Supabase 대시보드 → Table Editor → schedules 테이블에서 `is_dday` 컬럼(boolean, default false)이 추가됐는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/010_dday.sql
git commit -m "feat: schedules 테이블에 is_dday 컬럼 추가"
```

---

## Task 2: D-Day — 일정 추가 모달에 체크박스

**Files:**
- Modify: `calendar.html` (일정 추가 모달)

- [ ] **Step 1: 모달에 D-Day 체크박스 추가**

`calendar.html`의 일정 추가 모달에서 `<div class="file-input-area"...` 바로 위에 추가:

```html
<div class="form-group" style="display:flex;align-items:center;gap:10px">
  <input type="checkbox" id="modal-dday" style="width:auto;margin:0">
  <label for="modal-dday" style="margin:0;font-size:0.9rem;cursor:pointer">📌 D-Day로 등록 (캘린더 상단에 카운트다운 표시)</label>
</div>
```

- [ ] **Step 2: 확인**

"+ 일정 추가" 클릭 → 모달에 D-Day 체크박스가 보이는지 확인.

---

## Task 3: D-Day — submitSchedule에 is_dday 반영

**Files:**
- Modify: `calendar.js:778-830` (submitSchedule 함수)

- [ ] **Step 1: submitSchedule에서 is_dday 값 읽기 및 저장**

`submitSchedule` 함수에서 `const title = ...` 줄 아래에 추가:
```javascript
const isDday = document.getElementById('modal-dday')?.checked || false;
```

supabase insert 객체에 `is_dday: isDday` 추가:
```javascript
// 기존:
const { data: schedule, error } = await supabase.from('schedules').insert({
  class_num: profile.class_num,
  date: selectedDate,
  time_slot: selectedSlot || 'all-day',
  title,
  detail,
  type: selectedType,
  created_by: profile.id
}).select().single();

// 변경 후:
const { data: schedule, error } = await supabase.from('schedules').insert({
  class_num: profile.class_num,
  date: selectedDate,
  time_slot: selectedSlot || 'all-day',
  title,
  detail,
  type: selectedType,
  created_by: profile.id,
  is_dday: isDday
}).select().single();
```

- [ ] **Step 2: 모달 열릴 때 체크박스 초기화**

`openModal` 함수(`calendar.js:728`) 내부에서 체크박스 초기화 추가. 기존 초기화 코드(`document.querySelectorAll('.type-btn')...`) 다음에:
```javascript
const ddayCb = document.getElementById('modal-dday');
if (ddayCb) ddayCb.checked = false;
```

---

## Task 4: D-Day — 배너 렌더링

**Files:**
- Modify: `calendar.html`
- Modify: `calendar.js`
- Modify: `style.css`

- [ ] **Step 1: calendar.html에 D-Day 배너 div 추가**

`<div class="calendar-section">` 바로 아래, `<div class="calendar-nav">` 위에 추가:

```html
<div id="dday-banner" class="dday-banner" style="display:none"></div>
```

- [ ] **Step 2: style.css에 D-Day 배너 스타일 추가**

`style.css` 끝에 추가:

```css
/* D-Day 배너 */
.dday-banner {
  background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
  border: 1px solid #93C5FD;
  border-radius: 10px;
  padding: 10px 16px;
  margin-bottom: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.dday-item {
  background: white;
  border: 1px solid #BFDBFE;
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #1D4ED8;
  white-space: nowrap;
}
.dday-item.today  { background: #3B82F6; color: white; border-color: #3B82F6; }
.dday-item.past   { background: #F1F5F9; color: #94A3B8; border-color: #E2E8F0; }
.day-dot.dday     { background: #3B82F6; border: 2px solid #1D4ED8; width: 8px; height: 8px; }
```

- [ ] **Step 3: calendar.js에 D-Day 계산 헬퍼 추가**

`escapeHtml` 함수 아래에 추가:

```javascript
// ─── D-Day ───────────────────────────────────────
function calcDDay(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

async function renderDDayBanner() {
  const banner = document.getElementById('dday-banner');
  if (!banner) return;

  const pad = n => String(n).padStart(2, '0');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  // 오늘 이후 90일치 D-Day 조회
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 90);
  const futureStr = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;

  const { data } = await supabase
    .from('schedules')
    .select('title, date, is_dday')
    .eq('is_dday', true)
    .gte('date', todayStr)
    .lte('date', futureStr)
    .order('date', { ascending: true })
    .limit(5);

  const items = data || [];
  if (items.length === 0) { banner.style.display = 'none'; return; }

  banner.style.display = 'flex';
  banner.innerHTML = '<span style="font-size:0.78rem;font-weight:600;color:#3B82F6;white-space:nowrap;">📌 D-Day</span>';
  items.forEach(s => {
    const dday = calcDDay(s.date);
    const span = document.createElement('span');
    span.className = 'dday-item' + (dday === 'D-Day' ? ' today' : '');
    span.textContent = `${escapeHtml(s.title)} ${dday}`;
    banner.appendChild(span);
  });
}
```

- [ ] **Step 4: renderCalendar 함수에서 D-Day 배너 갱신 호출**

`renderCalendar` 함수 맨 끝, `document.getElementById('prev-month').onclick = ...` 블록 바로 위에 추가:

```javascript
await renderDDayBanner();
```

- [ ] **Step 5: renderCalendar의 dotMap에 dday dot 추가**

`renderCalendar`에서 schedules를 가져오는 쿼리를 `is_dday`도 포함하도록 수정:

```javascript
// 기존:
supabase.from('schedules').select('date, type').eq('class_num', currentClass)...

// 변경 후:
supabase.from('schedules').select('date, type, is_dday').eq('class_num', currentClass)...
```

그리고 dotMap 채우는 부분 수정:

```javascript
// 기존:
[...(schedules || []), ...acceptedDots].forEach(s => {
  if (!dotMap[s.date]) dotMap[s.date] = [];
  dotMap[s.date].push(s.type);
});

// 변경 후:
[...(schedules || []), ...acceptedDots].forEach(s => {
  if (!dotMap[s.date]) dotMap[s.date] = [];
  dotMap[s.date].push(s.is_dday ? 'dday' : s.type);
});
```

- [ ] **Step 6: 확인**

D-Day 일정을 하나 추가 (is_dday 체크) → 캘린더 상단에 "수학시험 D-X" 배너가 표시되는지 확인.
해당 날짜에 파란 테두리 dot이 표시되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add calendar.js calendar.html style.css
git commit -m "feat: D-Day 카운트다운 배너 및 캘린더 dot 추가"
```

---

## Task 5: 일정 중복 충돌 경고

**Files:**
- Modify: `calendar.js:778` (submitSchedule 함수)

일정 저장 전, 동일 날짜+시간대에 이미 일정이 있으면 경고를 보여준다.

- [ ] **Step 1: submitSchedule에 중복 체크 로직 추가**

`submitSchedule` 함수에서 `submitBtn.disabled = true` 줄 **바로 앞**에 삽입:

```javascript
// 중복 일정 체크 (같은 날짜 + 같은 time_slot, class 일정)
if (selectedSlot && selectedSlot !== 'all-day' && selectedSlot !== 'submission') {
  const { data: existing } = await supabase
    .from('schedules')
    .select('id, title')
    .eq('class_num', profile.class_num)
    .eq('date', selectedDate)
    .eq('time_slot', selectedSlot)
    .limit(1);

  if (existing && existing.length > 0) {
    const proceed = confirm(
      `"${existing[0].title}" 일정이 이미 이 시간에 있습니다.\n그래도 추가하시겠습니까?`
    );
    if (!proceed) return;
  }
}
```

- [ ] **Step 2: 확인**

같은 날짜의 같은 교시에 두 번째 일정을 추가 시도 → "이미 일정이 있습니다. 그래도 추가하시겠습니까?" 확인 다이얼로그가 표시되는지 확인.
"취소" 클릭 시 저장 안 됨, "확인" 클릭 시 저장됨 확인.

- [ ] **Step 3: 커밋**

```bash
git add calendar.js
git commit -m "feat: 일정 중복 충돌 경고 추가"
```

---

## Task 6: 실행 취소 (Undo)

**Files:**
- Modify: `calendar.js`
- Modify: `style.css`

일정 삭제 직후 5초간 "실행 취소" 버튼이 있는 토스트를 보여주고, 클릭 시 복원한다.

- [ ] **Step 1: style.css에 undo toast 버튼 스타일 추가**

기존 `.toast` 스타일 아래에 추가:

```css
.toast-undo-btn {
  background: none;
  border: 1px solid rgba(255,255,255,0.4);
  color: white;
  border-radius: 5px;
  padding: 2px 8px;
  font-size: 0.8rem;
  cursor: pointer;
  margin-left: auto;
  white-space: nowrap;
  flex-shrink: 0;
}
.toast-undo-btn:hover { background: rgba(255,255,255,0.15); }
```

- [ ] **Step 2: calendar.js에 showUndoToast 함수 추가**

`showToast` 함수 바로 아래에 추가:

```javascript
function showUndoToast(message, onUndo, duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast success';
  toast.style.cssText += ';justify-content:space-between;';
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  const undoBtn = document.createElement('button');
  undoBtn.className = 'toast-undo-btn';
  undoBtn.textContent = '실행 취소';
  toast.appendChild(undoBtn);
  container.appendChild(toast);

  let cancelled = false;
  const timer = setTimeout(() => {
    if (!cancelled) {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }
  }, duration);

  undoBtn.addEventListener('click', () => {
    cancelled = true;
    clearTimeout(timer);
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
    onUndo();
  });
}
```

- [ ] **Step 3: 단순 일정 삭제에 Undo 적용**

`showDateDetail` 함수에서 일반 일정(class/personal) 삭제 핸들러를 찾아 수정:

```javascript
// 기존:
del.addEventListener('click', async () => {
  if (!confirm(`"${s.title}" 일정을 삭제할까요?`)) return;
  const { error } = await supabase.from('schedules').delete().eq('id', s.id);
  if (error) { showToast('삭제 실패: ' + error.message, 'error'); return; }
  showToast('일정이 삭제됐습니다.', 'success');
  await renderCalendar();
  await showDateDetail(date);
});

// 변경 후:
del.addEventListener('click', async () => {
  if (!confirm(`"${s.title}" 일정을 삭제할까요?`)) return;
  const { error } = await supabase.from('schedules').delete().eq('id', s.id);
  if (error) { showToast('삭제 실패: ' + error.message, 'error'); return; }

  // 복원용 데이터 저장 (attachments 제외)
  const deleted = {
    class_num: s.class_num,
    date: s.date,
    time_slot: s.time_slot,
    title: s.title,
    detail: s.detail,
    type: s.type,
    created_by: s.created_by,
    is_dday: s.is_dday || false,
  };

  await renderCalendar();
  await showDateDetail(date);

  showUndoToast(`"${s.title}" 삭제됨`, async () => {
    const { error: restoreErr } = await supabase.from('schedules').insert(deleted);
    if (restoreErr) { showToast('복원 실패: ' + restoreErr.message, 'error'); return; }
    showToast('일정이 복원됐습니다.', 'success');
    await renderCalendar();
    if (selectedDate) await showDateDetail(selectedDate);
  });
});
```

- [ ] **Step 4: 확인**

일정 삭제 → 5초간 "삭제됨 — 실행 취소" 토스트 표시 확인.
"실행 취소" 클릭 → 일정이 다시 나타나는지 확인.
5초 경과 → 토스트 사라지고 복원 안 되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add calendar.js style.css
git commit -m "feat: 일정 삭제 실행 취소 (5초 Undo) 추가"
```

---

## Task 7: 다크 모드

**Files:**
- Modify: `style.css`
- Modify: `calendar.html`
- Modify: `calendar.js`

- [ ] **Step 1: style.css에 다크 모드 CSS 변수 추가**

`:root` 블록 바로 아래에 추가:

```css
[data-theme="dark"] {
  --primary: #60A5FA;
  --primary-dark: #3B82F6;
  --bg: #0F172A;
  --card: #1E293B;
  --border: #334155;
  --text: #F1F5F9;
  --text-muted: #94A3B8;
  --danger: #F87171;
  --success: #4ADE80;
  --shadow: 0 1px 3px rgba(0,0,0,0.4);
}
[data-theme="dark"] .calendar-day:hover { background: #1E3A5F; }
[data-theme="dark"] .calendar-day.selected { background: #1E3A5F; }
[data-theme="dark"] .calendar-day.today .day-num { background: var(--primary); }
[data-theme="dark"] .modal-overlay { background: rgba(0,0,0,0.65); }
[data-theme="dark"] .tab.active { background: var(--bg); }
[data-theme="dark"] .notif-dropdown { background: var(--card); border-color: var(--border); }
[data-theme="dark"] .routine-delete-menu { background: var(--card); border-color: var(--border); }
[data-theme="dark"] .dday-banner { background: linear-gradient(135deg, #1E293B 0%, #1E3A5F 100%); border-color: #334155; }
[data-theme="dark"] .dday-item { background: #0F172A; border-color: #334155; color: #60A5FA; }
[data-theme="dark"] .skeleton {
  background: linear-gradient(90deg, #1E293B 25%, #334155 50%, #1E293B 75%);
  background-size: 800px 100%;
}
```

- [ ] **Step 2: calendar.html 헤더에 다크 모드 토글 버튼 추가**

설정 버튼 (`settings-btn`) 바로 앞에 추가:

```html
<button class="notification-btn" id="darkmode-btn" title="다크 모드 전환">
  <svg id="darkmode-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
</button>
```

- [ ] **Step 3: calendar.js에 다크 모드 토글 함수 추가**

`setupTodayBtn` 함수 아래에 추가:

```javascript
// ─── 다크 모드 ────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const icon = document.getElementById('darkmode-icon');
  if (!icon) return;
  // 라이트: 달 아이콘, 다크: 해 아이콘
  icon.innerHTML = dark
    ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
    : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
}

function setupDarkMode() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  applyTheme(isDark);

  document.getElementById('darkmode-btn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = !current;
    applyTheme(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  });
}
```

- [ ] **Step 4: init()에 setupDarkMode() 호출 추가**

`setupTodayBtn()` 바로 아래에:

```javascript
setupDarkMode();
```

- [ ] **Step 5: 확인**

헤더의 달 모양 버튼 클릭 → 전체 UI가 다크 테마로 전환되는지 확인.
새로고침 후 다크 모드가 유지되는지 확인 (localStorage 저장 확인).
다시 클릭 → 라이트 모드로 복귀 확인.

- [ ] **Step 6: 커밋**

```bash
git add calendar.js calendar.html style.css
git commit -m "feat: 다크 모드 토글 추가 (CSS 변수 + localStorage 저장)"
```

---

## 최종 확인

- [ ] **전체 체크리스트**
  - [ ] D-Day 일정 저장 시 is_dday 체크박스 동작
  - [ ] D-Day 배너에 "제목 D-N" 표시
  - [ ] D-Day 날짜 셀에 파란 테두리 dot
  - [ ] 같은 시간대 일정 추가 시 충돌 경고 confirm 표시
  - [ ] 일정 삭제 → 5초 Undo 토스트 → 실행 취소 클릭 시 복원
  - [ ] 다크 모드 토글 동작 + 새로고침 후 유지

- [ ] **최종 커밋 & 배포**

```bash
git push origin master
npx vercel --prod
```
