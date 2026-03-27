# 주간/일간 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캘린더에 月/週/日 뷰 토글을 추가하여 월간 그리드, 주간 7컬럼 카드, 일간 전체화면 세 가지 뷰를 제공한다.

**Architecture:** `currentView` 변수('month'|'week'|'day')로 뷰 상태를 관리하고, `renderView()`가 상태에 따라 `renderCalendar()` / `renderWeekView()` / `renderDayView()` 중 하나를 호출한다. 주간 뷰는 기존 calendar-grid 영역을 7컬럼 카드로 교체하고, 일간 뷰는 캘린더 섹션을 숨기고 상세 패널을 전체 너비로 확장한다.

**Tech Stack:** Vanilla JS (ES Modules), Supabase, CSS Grid/Flexbox

---

## 파일 변경 목록

| 파일 | 작업 | 설명 |
|------|------|------|
| `calendar.html` | 수정 | 月/週/日 토글 버튼 추가 |
| `calendar.js` | 수정 | currentView, renderView, renderWeekView, renderDayView, setupViewToggle 추가 |
| `style.css` | 수정 | 주간/일간 뷰 레이아웃 스타일 |

---

## Task 1: 뷰 토글 버튼 HTML + CSS

**Files:**
- Modify: `calendar.html`
- Modify: `style.css`

- [ ] **Step 1: calendar.html의 캘린더 nav에 뷰 토글 추가**

`<div class="calendar-nav">` 전체를 아래로 교체:

```html
<div class="calendar-nav">
  <button class="nav-btn" id="prev-month" aria-label="이전">◀</button>
  <div style="display:flex;align-items:center;gap:10px">
    <h2 id="month-title"></h2>
    <button class="nav-btn today-btn" id="today-btn">오늘</button>
  </div>
  <div style="display:flex;align-items:center;gap:6px">
    <div class="view-toggle">
      <button class="view-btn active" data-view="month">月</button>
      <button class="view-btn" data-view="week">週</button>
      <button class="view-btn" data-view="day">日</button>
    </div>
    <button class="nav-btn" id="next-month" aria-label="다음">▶</button>
  </div>
</div>
```

- [ ] **Step 2: style.css에 view-toggle 스타일 추가**

파일 끝에 추가:

```css
/* 뷰 토글 */
.view-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.view-btn {
  padding: 5px 12px;
  border: none;
  background: var(--card);
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border-right: 1px solid var(--border);
}
.view-btn:last-child { border-right: none; }
.view-btn.active { background: var(--primary); color: white; }
.view-btn:hover:not(.active) { background: var(--bg); color: var(--text); }
[data-theme="dark"] .view-btn { background: #1A1A1A; color: #909090; border-color: #2A2A2A; }
[data-theme="dark"] .view-btn.active { background: #2563EB; color: white; }
[data-theme="dark"] .view-btn:hover:not(.active) { background: #222222; color: #F0F0F0; }
```

- [ ] **Step 3: 확인**

브라우저에서 캘린더 상단에 月/週/日 버튼 그룹이 표시되는지 확인. (클릭은 아직 동작 안 함)

- [ ] **Step 4: 커밋**

```bash
git add calendar.html style.css
git commit -m "feat: 月/週/日 뷰 토글 버튼 추가"
```

---

## Task 2: calendar.js에 뷰 상태 변수 + renderView 디스패처

**Files:**
- Modify: `calendar.js`

- [ ] **Step 1: 상단 변수 블록에 뷰 관련 변수 추가**

`let currentYear, currentMonth;` 줄 다음에 추가:

```javascript
let currentView = 'month'; // 'month' | 'week' | 'day'
let currentWeekStart = null; // 주간 뷰: 해당 주 월요일 Date 객체
```

- [ ] **Step 2: renderView 디스패처 추가**

`// ─── 캘린더 렌더링 ───` 섹션 바로 위에 추가:

```javascript
// ─── 뷰 렌더링 디스패처 ────────────────────────────
async function renderView() {
  if (currentView === 'month') await renderCalendar();
  else if (currentView === 'week') await renderWeekView();
  else if (currentView === 'day') await renderDayView();
}
```

- [ ] **Step 3: setupViewToggle 함수 추가**

`setupTodayBtn` 함수 바로 아래에 추가:

```javascript
// ─── 뷰 토글 ──────────────────────────────────────
function setupViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;
      if (view === currentView) return;

      currentView = view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 주간 뷰 진입 시 현재 선택 날짜 또는 오늘 기준 주 설정
      if (view === 'week') {
        const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
        currentWeekStart = getWeekStart(base);
      }
      // 일간 뷰 진입 시 선택 날짜 없으면 오늘로 설정
      if (view === 'day' && !selectedDate) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        selectedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      }

      await renderView();
    });
  });
}
```

- [ ] **Step 4: getWeekStart 헬퍼 추가**

`calcDDay` 함수 바로 위에 추가:

```javascript
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 월요일 기준
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

- [ ] **Step 5: init()에 setupViewToggle() 호출 추가**

`setupTodayBtn();` 줄 바로 다음에:

```javascript
setupViewToggle();
```

- [ ] **Step 6: renderCalendar의 prev/next onclick을 renderView로 교체**

`renderCalendar` 함수 끝의 nav 이벤트 등록 부분:

```javascript
// 기존:
document.getElementById('prev-month').onclick = async () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await renderCalendar();
};
document.getElementById('next-month').onclick = async () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await renderCalendar();
};

// 변경 후:
document.getElementById('prev-month').onclick = async () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await renderView();
};
document.getElementById('next-month').onclick = async () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await renderView();
};
```

- [ ] **Step 7: setupTodayBtn도 renderView 사용으로 수정**

`setupTodayBtn` 함수에서:
```javascript
// 기존:
await renderCalendar();

// 변경 후:
currentView = 'month';
document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'month'));
await renderView();
```

- [ ] **Step 8: 커밋 (동작 테스트 전 저장용)**

```bash
git add calendar.js
git commit -m "feat: 뷰 상태 변수 + renderView 디스패처 + setupViewToggle 추가"
```

---

## Task 3: renderWeekView 구현

**Files:**
- Modify: `calendar.js`
- Modify: `style.css`

- [ ] **Step 1: renderWeekView 함수를 renderCalendar 바로 다음에 추가**

```javascript
// ─── 주간 뷰 ──────────────────────────────────────
async function renderWeekView() {
  const pad = n => String(n).padStart(2, '0');

  // 현재 주 7일 날짜 배열 (월~일)
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  const startDate = dates[0];
  const endDate = dates[6];

  // 제목
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  document.getElementById('month-title').textContent =
    `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;

  // 데이터 로드
  const [{ data: schedules }, neisForMonth] = await Promise.all([
    supabase.from('schedules')
      .select('date, type, title, is_dday')
      .eq('class_num', currentClass)
      .gte('date', startDate)
      .lte('date', endDate),
    fetchNeisSchedule(s.getFullYear(), s.getMonth())
  ]);

  // 내비게이션
  document.getElementById('prev-month').onclick = async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    await renderWeekView();
  };
  document.getElementById('next-month').onclick = async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    await renderWeekView();
  };

  // 그리드 렌더링
  const grid = document.getElementById('calendar-grid');
  grid.className = 'week-view-grid';
  grid.innerHTML = '';

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

  dates.forEach(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    const dayName = DAY_NAMES[d.getDay()];
    const daySched = (schedules || []).filter(s => s.date === dateStr);
    const neisDateStr = dateStr.replace(/-/g, '');
    const neisSched = (neisForMonth || []).filter(s => s.date === neisDateStr);

    const col = document.createElement('div');
    col.className = 'week-day-col'
      + (dateStr === todayStr ? ' today' : '')
      + (dateStr === selectedDate ? ' selected' : '');
    col.setAttribute('role', 'button');
    col.setAttribute('tabindex', '0');

    const header = document.createElement('div');
    header.className = 'week-day-header';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'week-day-name';
    nameSpan.textContent = dayName;
    const numSpan = document.createElement('span');
    numSpan.className = 'week-day-num';
    numSpan.textContent = d.getDate();
    header.appendChild(nameSpan);
    header.appendChild(numSpan);
    col.appendChild(header);

    const body = document.createElement('div');
    body.className = 'week-day-body';

    neisSched.forEach(s => {
      const item = document.createElement('div');
      item.className = 'week-event week-event-neis';
      item.textContent = escapeHtml(s.name);
      body.appendChild(item);
    });

    daySched.forEach(s => {
      const item = document.createElement('div');
      item.className = `week-event week-event-${s.type}${s.is_dday ? ' week-event-dday' : ''}`;
      item.textContent = escapeHtml(s.title);
      body.appendChild(item);
    });

    if (daySched.length === 0 && neisSched.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'week-day-empty';
      empty.textContent = '일정 없음';
      body.appendChild(empty);
    }

    col.appendChild(body);

    const onClick = async () => {
      document.querySelectorAll('.week-day-col').forEach(el => el.classList.remove('selected'));
      col.classList.add('selected');
      selectedDate = dateStr;
      await showDateDetail(dateStr);
    };
    col.addEventListener('click', onClick);
    col.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });

    grid.appendChild(col);
  });

  await renderDDayBanner();

  // detail panel이 보이도록 복원
  document.querySelector('.detail-panel').style.display = '';
  document.querySelector('.calendar-section').style.flex = '';
}
```

- [ ] **Step 2: style.css에 주간 뷰 스타일 추가**

파일 끝에 추가:

```css
/* 주간 뷰 */
.week-view-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  background: transparent !important;
  border-radius: 0;
  overflow: visible;
}
.week-day-col {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-height: 120px;
}
.week-day-col:hover { border-color: var(--primary); box-shadow: 0 2px 8px rgba(59,130,246,0.1); }
.week-day-col.today .week-day-num { background: var(--primary); color: white; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; }
.week-day-col.selected { border-color: var(--primary); background: #EFF6FF; }
[data-theme="dark"] .week-day-col.selected { background: #0D1F3C; }
.week-day-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px 6px;
  border-bottom: 1px solid var(--border);
  gap: 2px;
}
.week-day-name { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }
.week-day-num { font-size: 0.9rem; font-weight: 700; color: var(--text); }
.week-day-body { padding: 6px 4px; display: flex; flex-direction: column; gap: 3px; }
.week-event {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.week-event-class { background: #DBEAFE; color: #1D4ED8; }
.week-event-personal { background: #F0FDF4; color: #166534; }
.week-event-group { background: #FEF3C7; color: #92400E; }
.week-event-neis { background: #FFFBEB; color: #D97706; }
.week-event-dday { background: #EFF6FF; color: #1D4ED8; border: 1px solid #93C5FD; }
[data-theme="dark"] .week-event-class { background: #0D1F3C; color: #93C5FD; }
[data-theme="dark"] .week-event-personal { background: #052E16; color: #86EFAC; }
[data-theme="dark"] .week-event-group { background: #1C1400; color: #FCD34D; }
[data-theme="dark"] .week-event-neis { background: #1C1400; color: #FCD34D; }
[data-theme="dark"] .week-event-dday { background: #0D1F3C; color: #60A5FA; }
.week-day-empty { font-size: 0.68rem; color: var(--text-muted); text-align: center; padding: 8px 0; }
```

- [ ] **Step 3: 확인**

週 버튼 클릭 → 7컬럼 카드 뷰로 전환.
◀/▶ 클릭 → 이전/다음 주로 이동.
날짜 카드 클릭 → 오른쪽 사이드 패널에 해당 날짜 상세 표시.

- [ ] **Step 4: 커밋**

```bash
git add calendar.js style.css
git commit -m "feat: 주간(週) 뷰 추가"
```

---

## Task 4: renderDayView 구현

**Files:**
- Modify: `calendar.js`
- Modify: `style.css`

- [ ] **Step 1: renderDayView 함수를 renderWeekView 다음에 추가**

```javascript
// ─── 일간 뷰 ──────────────────────────────────────
async function renderDayView() {
  const pad = n => String(n).padStart(2, '0');

  if (!selectedDate) {
    const now = new Date();
    selectedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  const d = new Date(selectedDate + 'T00:00:00');
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  document.getElementById('month-title').textContent =
    `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`;

  // 일간 뷰: 캘린더 그리드 숨기고, 상세 패널을 전체 너비로
  const grid = document.getElementById('calendar-grid');
  grid.className = 'calendar-grid'; // 원래 클래스 복원
  grid.innerHTML = '';
  grid.style.display = 'none';

  const calSection = document.querySelector('.calendar-section');
  calSection.style.display = 'none';

  const detailPanel = document.querySelector('.detail-panel');
  detailPanel.style.width = '100%';
  detailPanel.style.maxWidth = '720px';
  detailPanel.style.margin = '0 auto';

  // 내비게이션: 하루씩
  document.getElementById('prev-month').onclick = async () => {
    const prev = new Date(selectedDate + 'T00:00:00');
    prev.setDate(prev.getDate() - 1);
    selectedDate = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
    await renderDayView();
  };
  document.getElementById('next-month').onclick = async () => {
    const next = new Date(selectedDate + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    selectedDate = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
    await renderDayView();
  };

  await showDateDetail(selectedDate);
  await renderDDayBanner();
}
```

- [ ] **Step 2: 월간/주간 뷰로 돌아올 때 레이아웃 복원**

`renderCalendar` 함수 맨 앞에 (grid.innerHTML = '' 위에) 추가:

```javascript
// 일간 뷰에서 복귀 시 레이아웃 복원
document.querySelector('.calendar-section').style.display = '';
document.getElementById('calendar-grid').style.display = '';
document.querySelector('.detail-panel').style.width = '';
document.querySelector('.detail-panel').style.maxWidth = '';
document.querySelector('.detail-panel').style.margin = '';
```

`renderWeekView` 함수 맨 앞에도 동일하게 추가:

```javascript
// 일간 뷰에서 복귀 시 레이아웃 복원
document.querySelector('.calendar-section').style.display = '';
document.getElementById('calendar-grid').style.display = '';
document.querySelector('.detail-panel').style.width = '';
document.querySelector('.detail-panel').style.maxWidth = '';
document.querySelector('.detail-panel').style.margin = '';
```

- [ ] **Step 3: 확인**

日 버튼 클릭 → 캘린더 그리드가 사라지고 상세 패널이 전체 너비로 현재 날짜 표시.
◀/▶ 클릭 → 전날/다음날로 이동.
月 버튼 클릭 → 원래 월간 그리드로 복귀.

- [ ] **Step 4: 커밋**

```bash
git add calendar.js style.css
git commit -m "feat: 일간(日) 뷰 추가"
```

---

## Task 5: 주간 뷰 week-view-grid 클래스 복원 처리

**Files:**
- Modify: `calendar.js`

월간 뷰로 돌아올 때 `grid.className`이 `week-view-grid`에서 `calendar-grid`로 복원되어야 한다.

- [ ] **Step 1: renderCalendar 맨 앞에 클래스 복원 추가**

기존 `grid.innerHTML = ''` 바로 위에:

```javascript
grid.className = 'calendar-grid';
```

> 이미 Task 4 Step 2에서 layout 복원 코드를 추가했다면, 이 줄도 함께 포함되어 있어야 한다. 없다면 여기서 추가.

- [ ] **Step 2: 최종 확인 체크리스트**

  - [ ] 月 → 週 → 日 → 月 전환이 레이아웃 깨짐 없이 동작
  - [ ] 주간 뷰에서 날짜 클릭 → 사이드 패널 상세 표시
  - [ ] 일간 뷰 ◀▶ 로 날짜 이동
  - [ ] 오늘 버튼 클릭 → 월간 뷰로 복귀 + 오늘 날짜 선택
  - [ ] 다크 모드에서 주간/일간 뷰 색상 정상

- [ ] **Step 3: 커밋 + 배포**

```bash
git add calendar.js calendar.html style.css
git commit -m "feat: 주간/일간 뷰 최종 완성"
git push origin master
npx vercel --prod
```
