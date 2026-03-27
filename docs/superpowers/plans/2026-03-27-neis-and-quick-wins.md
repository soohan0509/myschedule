# NEIS API 연동 + Phase 1 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NEIS Open API를 통해 학사일정을 캘린더에 자동 표시하고 급식 정보를 시간표에서 확인할 수 있게 하며, UX/보안/접근성 Quick Win 개선을 모두 적용한다.

**Architecture:** Vercel 서버리스 함수(`api/neis.js`)가 NEIS API를 프록시하여 API 키를 숨기고 캐싱한다. 학사일정은 캘린더 dot으로 표시되고, 급식은 timetable.js의 식사 행에 인라인 버튼으로 추가된다.

**Tech Stack:** Vanilla JS (ES Modules), Supabase, Vercel Serverless (CommonJS), NEIS Open API, CSS custom properties

---

## 파일 변경 목록

| 파일 | 작업 | 설명 |
|------|------|------|
| `api/neis.js` | 신규 | NEIS API 프록시 (학사일정 + 급식, 인메모리 캐시) |
| `timetable.js` | 수정 | renderTimetable에 onMealClick 콜백 + 식사 버튼 추가 |
| `calendar.js` | 수정 | NEIS 학사일정, 급식 모달, 오늘 버튼, 토스트, XSS fix, 에러 핸들링, 비밀번호 정책, aria |
| `calendar.html` | 수정 | 오늘 버튼 HTML, 토스트 컨테이너, 급식 모달 |
| `style.css` | 수정 | 토스트, 스켈레톤, 모달 애니메이션, 급식 버튼, 빈 상태, 비밀번호 강도계 |

---

## Task 1: NEIS 학교 코드 조회 (Setup)

**Files:**
- 없음 (조회만)

- [ ] **Step 1: SD_SCHUL_CODE 조회**

터미널에서 실행:
```bash
curl "https://open.neis.go.kr/hub/schoolInfo?KEY=e5db69bb76264e79862b0527cfdd2db8&Type=json&ATPT_OFCDC_SC_CODE=J10&SCHUL_NM=%EA%B2%BD%EA%B8%B0%EB%B6%81%EA%B3%BC%ED%95%99%EA%B3%A0" | python3 -m json.tool | grep -E "SD_SCHUL_CODE|SCHUL_NM"
```

기대 출력 (예시):
```
"SD_SCHUL_CODE": "7531044",
"SCHUL_NM": "경기북과학고등학교",
```

- [ ] **Step 2: 코드 기록**

출력에서 `SD_SCHUL_CODE` 값을 메모한다. 이후 Task 2에서 `SCHOOL_CODE` 상수에 사용.

---

## Task 2: api/neis.js 작성

**Files:**
- Create: `api/neis.js`

- [ ] **Step 1: `api/neis.js` 생성**

Task 1에서 확인한 `SD_SCHUL_CODE`를 `SCHOOL_CODE`에 넣어 작성:

```javascript
// api/neis.js
const https = require('https');

const API_KEY = process.env.NEIS_API_KEY;
const ATPT_CODE = 'J10';
const SCHOOL_CODE = 'REPLACE_WITH_SD_SCHUL_CODE'; // Task 1에서 확인한 값으로 교체

const scheduleCache = new Map(); // key: 'YYYYMM'
const mealCache = new Map();     // key: 'YYYYMMDD_N'
const SCHEDULE_TTL = 24 * 60 * 60 * 1000; // 24h
const MEAL_TTL = 60 * 60 * 1000;           // 1h

function neisGet(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://open.neis.go.kr/hub/${path}`, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, month, date, mealCode } = req.query;

  try {
    if (type === 'schedule') {
      if (!month || !/^\d{6}$/.test(month)) return res.status(400).json({ error: 'invalid month' });
      const cached = scheduleCache.get(month);
      if (cached && Date.now() - cached.ts < SCHEDULE_TTL) return res.json(cached.data);

      const from = month + '01';
      const to = month + '31';
      const data = await neisGet(
        `SchoolSchedule?KEY=${API_KEY}&Type=json&pIndex=1&pSize=100` +
        `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHOOL_CODE}` +
        `&AA_FROM_YMD=${from}&AA_TO_YMD=${to}`
      );
      const rows = data?.SchoolSchedule?.[1]?.row || [];
      const result = rows.map(r => ({ date: r.AA_YMD, name: r.EVENT_NM }));
      scheduleCache.set(month, { data: result, ts: Date.now() });
      res.setHeader('Cache-Control', 's-maxage=86400');
      return res.json(result);
    }

    if (type === 'meal') {
      if (!date || !mealCode) return res.status(400).json({ error: 'invalid params' });
      const key = `${date}_${mealCode}`;
      const cached = mealCache.get(key);
      if (cached && Date.now() - cached.ts < MEAL_TTL) return res.json(cached.data);

      const data = await neisGet(
        `mealServiceDietInfo?KEY=${API_KEY}&Type=json&pIndex=1&pSize=5` +
        `&ATPT_OFCDC_SC_CODE=${ATPT_CODE}&SD_SCHUL_CODE=${SCHOOL_CODE}` +
        `&MLSV_YMD=${date}&MMEAL_SC_CODE=${mealCode}`
      );
      const rows = data?.mealServiceDietInfo?.[1]?.row || [];
      const result = rows[0]
        ? {
            menu: (rows[0].DDISH_NM || '').replace(/<br\/>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean),
            cal: rows[0].CAL_INFO || '',
          }
        : null;
      mealCache.set(key, { data: result, ts: Date.now() });
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.json(result);
    }

    return res.status(400).json({ error: 'unknown type' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
```

- [ ] **Step 2: Vercel 환경변수 설정 확인**

`vercel.json`이 있는지 확인:
```bash
cat vercel.json
```

vercel.json에 env 항목이 없다면 — Vercel 대시보드에서 수동으로 `NEIS_API_KEY=e5db69bb76264e79862b0527cfdd2db8` 환경변수를 추가한다. 또는 로컬 테스트를 위해 `.env` 파일에 추가:
```
NEIS_API_KEY=e5db69bb76264e79862b0527cfdd2db8
```

- [ ] **Step 3: 로컬에서 API 동작 확인**

```bash
npx vercel dev
```

별도 터미널에서:
```bash
# 이번 달 학사일정 조회
curl "http://localhost:3000/api/neis?type=schedule&month=$(date +%Y%m)"
# 기대: JSON 배열 [{date: "20260301", name: "..."}, ...]

# 오늘 급식 조회 (점심)
curl "http://localhost:3000/api/neis?type=meal&date=$(date +%Y%m%d)&mealCode=2"
# 기대: {menu: [...], cal: "...kcal"} 또는 null (방학/주말)
```

- [ ] **Step 4: 커밋**

```bash
git add api/neis.js
git commit -m "feat: NEIS API 프록시 서버리스 함수 추가 (학사일정 + 급식)"
```

---

## Task 3: 학사일정 — calendar.js에 fetchNeisSchedule 추가

**Files:**
- Modify: `calendar.js`

학사일정을 월별로 가져오는 함수와 캐시를 추가한다.

- [ ] **Step 1: calendar.js 상단 변수 선언 부분(5번째 줄 근처)에 추가**

`let routines = [];` 바로 아래에 추가:

```javascript
let neisScheduleCache = {}; // 'YYYYMM' → [{date, name}]
```

- [ ] **Step 2: fetchNeisSchedule 함수를 calendar.js 끝(init 함수 위)에 추가**

```javascript
// ─── NEIS 학사일정 ─────────────────────────────────
async function fetchNeisSchedule(year, month) {
  const key = `${year}${String(month + 1).padStart(2, '0')}`;
  if (neisScheduleCache[key]) return neisScheduleCache[key];
  try {
    const res = await fetch(`/api/neis?type=schedule&month=${key}`);
    if (!res.ok) return [];
    const data = await res.json();
    neisScheduleCache[key] = data || [];
    return neisScheduleCache[key];
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: 커밋은 Task 4와 함께 한다**

---

## Task 4: 학사일정 — renderCalendar()에 학사 dot 표시

**Files:**
- Modify: `calendar.js:144-248` (renderCalendar 함수)

- [ ] **Step 1: renderCalendar 함수 내부 수정**

`renderCalendar` 함수에서 `const [{ data: schedules }, ...] = await Promise.all([...]` 부분을 찾아, NEIS 조회를 병렬로 추가한다:

```javascript
// 기존:
const [{ data: schedules }, { data: memberRows }] = await Promise.all([
  supabase.from('schedules').select('date, type').eq('class_num', currentClass).gte('date', startDate).lte('date', endDate),
  supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted')
]);

// 변경 후:
const [{ data: schedules }, { data: memberRows }, neisSchedules] = await Promise.all([
  supabase.from('schedules').select('date, type').eq('class_num', currentClass).gte('date', startDate).lte('date', endDate),
  supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted'),
  fetchNeisSchedule(currentYear, currentMonth)
]);
```

- [ ] **Step 2: dotMap에 학사 dot 추가**

`dotMap`을 채우는 부분 (`[...(schedules || []), ...acceptedDots].forEach(...)`) 바로 다음에 추가:

```javascript
// 학사일정 dot 추가
(neisSchedules || []).forEach(s => {
  // s.date는 'YYYYMMDD' 형식 → 'YYYY-MM-DD'로 변환
  const dateStr = `${s.date.slice(0,4)}-${s.date.slice(4,6)}-${s.date.slice(6,8)}`;
  if (dateStr >= startDate && dateStr <= endDate) {
    if (!dotMap[dateStr]) dotMap[dateStr] = [];
    dotMap[dateStr].push('neis');
  }
});
```

- [ ] **Step 3: style.css에 neis dot 색상 추가**

`style.css`의 `.day-dot.routine` 라인 바로 아래에 추가:

```css
.day-dot.neis { background: #F59E0B; }
```

- [ ] **Step 4: 캘린더에서 dot 렌더링 확인**

브라우저에서 캘린더를 열고, 이번 달에 학사일정(개학, 시험 등)이 있는 날짜에 노란색 점이 표시되는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add calendar.js style.css
git commit -m "feat: NEIS 학사일정 캘린더 dot 표시"
```

---

## Task 5: 학사일정 — showDateDetail()에 학사 내용 표시

**Files:**
- Modify: `calendar.js:252-363` (showDateDetail 함수)

- [ ] **Step 1: showDateDetail에서 NEIS 데이터 조회 추가**

`showDateDetail` 함수 상단의 `const [subjectMap, ...]` Promise.all에 NEIS 조회 추가:

```javascript
// 기존:
const [subjectMap, { data: classSchedules }, { data: memberRows }] = await Promise.all([
  fetchTimetable(currentClass, date),
  supabase.from('schedules').select('*, attachments(*)').eq('class_num', currentClass).eq('date', date),
  supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted')
]);

// 변경 후:
const [subjectMap, { data: classSchedules }, { data: memberRows }, neisForMonth] = await Promise.all([
  fetchTimetable(currentClass, date),
  supabase.from('schedules').select('*, attachments(*)').eq('class_num', currentClass).eq('date', date),
  supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted'),
  fetchNeisSchedule(parseInt(date.slice(0,4)), parseInt(date.slice(5,7)) - 1)
]);
const neisDateStr = date.replace(/-/g, ''); // 'YYYYMMDD'
const neisDayEvents = (neisForMonth || []).filter(s => s.date === neisDateStr);
```

- [ ] **Step 2: 사이드패널 학사일정 섹션 삽입**

`panel.innerHTML = \`<h3>...</h3>\`` 직후, `btnRow` 생성 전에 추가:

```javascript
if (neisDayEvents.length > 0) {
  const neisSection = document.createElement('div');
  neisSection.style.cssText = 'background:#FFFBEB;border:1px solid #F59E0B;border-radius:8px;padding:10px 12px;margin-bottom:12px;';
  neisSection.innerHTML = `
    <div style="font-size:0.75rem;font-weight:600;color:#D97706;margin-bottom:4px;">📅 학사일정</div>
    ${neisDayEvents.map(e => `<div style="font-size:0.88rem;color:#92400E;">${escapeHtml(e.name)}</div>`).join('')}
  `;
  panel.appendChild(neisSection);
}
```

> `escapeHtml`은 Task 13에서 추가한다. 지금은 `e.name`을 그대로 써도 되지만, Task 13 완료 후 꼭 교체한다.

- [ ] **Step 3: 브라우저에서 확인**

학사일정이 있는 날짜를 클릭하면 사이드패널 상단에 노란 배경의 학사일정 섹션이 표시되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add calendar.js
git commit -m "feat: 날짜 상세 패널에 학사일정 표시"
```

---

## Task 6: 급식 — timetable.js에 식사 버튼 추가

**Files:**
- Modify: `timetable.js:77-155` (renderTimetable 함수)

- [ ] **Step 1: renderTimetable 함수 시그니처에 onMealClick 추가**

```javascript
// 기존:
export function renderTimetable(subjectMap, schedules, routines, date, classNum, myClassNum, onSlotClick) {

// 변경 후:
export function renderTimetable(subjectMap, schedules, routines, date, classNum, myClassNum, onSlotClick, onMealClick) {
```

- [ ] **Step 2: 식사 slot 렌더링 부분 수정**

`combined.forEach(item => {` 블록 내부, `if (item.kind === 'slot')` 분기 안에서 `fixed: true`인 식사 슬롯에 버튼을 추가한다.

현재 코드에서 `li.innerHTML = \`...\`` 설정 직후(`if (isMyClass) li.addEventListener(...)` 줄 바로 앞) 에 아래 코드를 삽입:

```javascript
// 식사 슬롯이면 급식 버튼 추가
const MEAL_CODE = { '아침식사': 1, '점심식사': 2, '저녁식사': 3 };
if (fixed && MEAL_CODE[key] && onMealClick) {
  const mealBtn = document.createElement('button');
  mealBtn.className = 'btn-meal';
  mealBtn.textContent = '🍚 급식';
  mealBtn.setAttribute('aria-label', `${label} 급식 보기`);
  mealBtn.addEventListener('click', e => {
    e.stopPropagation();
    onMealClick(date, MEAL_CODE[key]);
  });
  // slot-subject div에 버튼 추가
  const subjectDiv = li.querySelector('.slot-subject');
  if (subjectDiv) subjectDiv.appendChild(mealBtn);
}
```

- [ ] **Step 3: style.css에 btn-meal 스타일 추가**

`.btn-delete` 스타일 근처에 추가:

```css
.btn-meal {
  background: #FEF3C7;
  color: #D97706;
  border: 1px solid #FCD34D;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  margin-left: 8px;
  font-weight: 600;
  transition: background 0.15s;
}
.btn-meal:hover { background: #FDE68A; }
```

- [ ] **Step 4: 커밋은 Task 7과 함께**

---

## Task 7: 급식 — calendar.js에 showMealModal 추가

**Files:**
- Modify: `calendar.js`
- Modify: `calendar.html`
- Modify: `style.css`

- [ ] **Step 1: calendar.html에 급식 모달 HTML 추가**

`</body>` 태그 바로 위에 추가:

```html
<!-- 급식 모달 -->
<div class="modal-overlay" id="meal-modal">
  <div class="modal" style="max-width:340px">
    <h3 id="meal-modal-title">급식 정보</h3>
    <div id="meal-modal-body" style="min-height:80px"></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="meal-modal-close">닫기</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: calendar.js에 showMealModal 함수 추가**

`// ─── NEIS 학사일정 ───` 섹션 아래에 추가:

```javascript
// ─── 급식 모달 ─────────────────────────────────────
const MEAL_LABEL = { 1: '🌅 아침 급식', 2: '☀️ 점심 급식', 3: '🌙 저녁 급식' };

async function showMealModal(date, mealCode) {
  const modal = document.getElementById('meal-modal');
  const titleEl = document.getElementById('meal-modal-title');
  const bodyEl = document.getElementById('meal-modal-body');

  titleEl.textContent = `${MEAL_LABEL[mealCode]} (${date.slice(5,7)}월 ${date.slice(8,10)}일)`;
  bodyEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">불러오는 중...</p>';
  modal.classList.add('open');

  try {
    const dateCompact = date.replace(/-/g, ''); // YYYYMMDD
    const res = await fetch(`/api/neis?type=meal&date=${dateCompact}&mealCode=${mealCode}`);
    const data = await res.json();

    if (!data || !data.menu || data.menu.length === 0) {
      bodyEl.innerHTML = '<p style="color:var(--text-muted)">급식 정보가 없습니다.</p>';
      return;
    }

    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;padding:0;';
    data.menu.forEach(item => {
      const li = document.createElement('li');
      li.style.cssText = 'padding:4px 0;border-bottom:1px solid var(--border);font-size:0.9rem;';
      li.textContent = item;
      ul.appendChild(li);
    });

    bodyEl.innerHTML = '';
    bodyEl.appendChild(ul);

    if (data.cal) {
      const calEl = document.createElement('p');
      calEl.style.cssText = 'color:var(--text-muted);font-size:0.8rem;margin-top:10px;';
      calEl.textContent = `칼로리: ${data.cal}`;
      bodyEl.appendChild(calEl);
    }
  } catch {
    bodyEl.innerHTML = '<p style="color:var(--danger)">급식 정보를 불러올 수 없습니다.</p>';
  }
}
```

- [ ] **Step 3: calendar.js init 함수에 meal modal 닫기 이벤트 추가**

`setupModal()` 호출 라인 아래에:

```javascript
document.getElementById('meal-modal-close').addEventListener('click', () =>
  document.getElementById('meal-modal').classList.remove('open')
);
document.getElementById('meal-modal').addEventListener('click', e => {
  if (e.target.id === 'meal-modal') document.getElementById('meal-modal').classList.remove('open');
});
```

- [ ] **Step 4: showDateDetail의 renderTimetable 호출에 onMealClick 콜백 추가**

`calendar.js:301-305`에서 renderTimetable 호출 부분:

```javascript
// 기존:
const ttFrag = renderTimetable(
  subjectMap, schedules || [], visibleRoutines, date, currentClass, profile.class_num,
  (slot, label, time) => openModal(date, slot, label)
);

// 변경 후:
const ttFrag = renderTimetable(
  subjectMap, schedules || [], visibleRoutines, date, currentClass, profile.class_num,
  (slot, label, time) => openModal(date, slot, label),
  (mealDate, mealCode) => showMealModal(mealDate, mealCode)
);
```

- [ ] **Step 5: 브라우저에서 확인**

평일 날짜 클릭 → 시간표에서 "아침 식사", "점심 식사", "저녁 식사" 행에 "🍚 급식" 버튼 확인.
버튼 클릭 → 급식 모달이 열리고 메뉴가 표시되는지 확인. 방학/주말은 "급식 정보가 없습니다" 표시.

- [ ] **Step 6: 커밋**

```bash
git add api/neis.js timetable.js calendar.js calendar.html style.css
git commit -m "feat: NEIS 급식 정보 시간표 인라인 버튼 + 모달 추가"
```

---

## Task 8: "오늘" 버튼

**Files:**
- Modify: `calendar.html:48-53` (캘린더 nav)
- Modify: `calendar.js`
- Modify: `style.css`

- [ ] **Step 1: calendar.html의 캘린더 nav에 "오늘" 버튼 추가**

현재:
```html
<div class="calendar-nav">
  <button class="nav-btn" id="prev-month">◀</button>
  <h2 id="month-title"></h2>
  <button class="nav-btn" id="next-month">▶</button>
</div>
```

변경 후:
```html
<div class="calendar-nav">
  <button class="nav-btn" id="prev-month">◀</button>
  <div style="display:flex;align-items:center;gap:10px">
    <h2 id="month-title"></h2>
    <button class="nav-btn today-btn" id="today-btn">오늘</button>
  </div>
  <button class="nav-btn" id="next-month">▶</button>
</div>
```

- [ ] **Step 2: style.css에 today-btn 스타일 추가**

`.nav-btn` 스타일 아래에:

```css
.today-btn {
  font-size: 0.78rem;
  padding: 4px 10px;
  color: var(--primary);
  border-color: var(--primary);
  font-weight: 600;
}
.today-btn:hover { background: #EFF6FF; }
```

- [ ] **Step 3: calendar.js에 오늘 버튼 이벤트 추가**

`setupTabs` 함수 아래에 새 함수 추가:

```javascript
// ─── 오늘 버튼 ────────────────────────────────────
function setupTodayBtn() {
  document.getElementById('today-btn').addEventListener('click', async () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    await renderCalendar();
    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    selectedDate = todayStr;
    document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.calendar-day.today`)?.classList.add('selected');
    await showDateDetail(todayStr);
  });
}
```

- [ ] **Step 4: init() 함수에서 setupTodayBtn() 호출 추가**

`setupTabs()` 호출 바로 아래에:

```javascript
setupTodayBtn();
```

- [ ] **Step 5: 확인**

◀ 버튼을 3번 클릭해서 3개월 전으로 이동 → "오늘" 버튼 클릭 → 현재 월로 즉시 복귀하고 오늘 날짜가 선택되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add calendar.html calendar.js style.css
git commit -m "feat: 캘린더 오늘 버튼 추가"
```

---

## Task 9: 토스트 알림 시스템

**Files:**
- Modify: `calendar.html`
- Modify: `calendar.js`
- Modify: `style.css`

- [ ] **Step 1: calendar.html에 toast 컨테이너 추가**

`</body>` 바로 위에:

```html
<!-- 토스트 -->
<div id="toast-container"></div>
```

- [ ] **Step 2: style.css에 토스트 스타일 추가**

파일 끝에 추가:

```css
/* 토스트 알림 */
#toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toast {
  background: #1E293B;
  color: white;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  max-width: 340px;
  animation: toastIn 0.25s ease-out;
}
.toast.success { border-left: 4px solid var(--success); }
.toast.error { border-left: 4px solid var(--danger); }
.toast.info { border-left: 4px solid var(--primary); }
.toast.toast-out { animation: toastOut 0.2s ease-in forwards; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes toastOut {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(24px); }
}
```

- [ ] **Step 3: calendar.js에 showToast 함수 추가**

`// ─── 오늘 버튼 ───` 섹션 위에 추가:

```javascript
// ─── 토스트 ───────────────────────────────────────
function showToast(message, type = 'info', duration = 2500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}
```

- [ ] **Step 4: 기존 일정 저장/삭제에 토스트 적용**

`submitSchedule` 함수에서 성공 시 `closeModal()` 호출 다음에 추가:
```javascript
showToast('일정이 저장됐습니다.', 'success');
```

`submitSchedule` 함수에서 에러 시 기존 errEl 처리 유지, 추가로:
```javascript
showToast('저장 실패: ' + error.message, 'error');
```

일정 삭제 성공 후 (`await supabase.from('schedules').delete()...` 다음)에:
```javascript
showToast('일정이 삭제됐습니다.', 'success');
```

루틴 저장 성공 후 (`document.getElementById('routine-modal').classList.remove('open')` 다음)에:
```javascript
showToast('일과가 저장됐습니다.', 'success');
```

이름 변경 성공 후:
```javascript
showToast('이름이 변경됐습니다.', 'success');
```

비밀번호 변경 성공 후:
```javascript
showToast('비밀번호가 변경됐습니다.', 'success');
```

- [ ] **Step 5: 확인**

일정 추가 → 저장 → 우하단에 초록색 "일정이 저장됐습니다." 토스트가 2.5초 후 사라지는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add calendar.html calendar.js style.css
git commit -m "feat: 토스트 알림 시스템 추가"
```

---

## Task 10: 모달 애니메이션 + 외부 클릭 닫기

**Files:**
- Modify: `style.css`

- [ ] **Step 1: style.css에서 modal-overlay와 .modal에 애니메이션 추가**

기존 `.modal-overlay` 스타일을 찾아 수정:

현재 코드 (grep으로 확인):
```bash
grep -n "modal-overlay\|\.modal " style.css
```

`.modal-overlay` 스타일에 transition 추가, `.modal`에 animation 추가:

```css
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  /* 추가: */
  animation: overlayIn 0.2s ease-out;
}
.modal-overlay.open { display: flex; }
.modal {
  background: var(--card);
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0,0,0,0.18);
  /* 추가: */
  animation: modalIn 0.2s ease-out;
}
@keyframes overlayIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

> 외부 클릭으로 닫기는 calendar.js에 이미 구현되어 있음 (`modal.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); })`). 추가 작업 불필요.

- [ ] **Step 2: 확인**

일정 추가 버튼 클릭 → 모달이 아래서 위로 부드럽게 나타나는지 확인.
모달 바깥 영역 클릭 → 닫히는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add style.css
git commit -m "feat: 모달 fade-in/slide-up 애니메이션 추가"
```

---

## Task 11: 로딩 스켈레톤

**Files:**
- Modify: `style.css`
- Modify: `calendar.js`

- [ ] **Step 1: style.css에 스켈레톤 스타일 추가**

파일 끝에 추가:

```css
/* 로딩 스켈레톤 */
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 6px;
}
.skeleton-line { height: 14px; margin-bottom: 8px; }
.skeleton-line.short { width: 60%; }
.skeleton-line.medium { width: 80%; }
.skeleton-line.full { width: 100%; }
```

- [ ] **Step 2: showDateDetail 함수 초기 로딩 상태 개선**

`showDateDetail` 함수 상단에서 `panel.innerHTML = ...` 부분을 찾아 교체:

```javascript
// 기존:
panel.innerHTML = `<h3>${parseInt(m)}월 ${parseInt(d)}일</h3><p style="color:var(--text-muted);font-size:0.83rem">불러오는 중...</p>`;

// 변경 후:
panel.innerHTML = `
  <h3>${parseInt(m)}월 ${parseInt(d)}일</h3>
  <div class="skeleton skeleton-line medium"></div>
  <div class="skeleton skeleton-line full"></div>
  <div class="skeleton skeleton-line short"></div>
`;
```

- [ ] **Step 3: 확인**

느린 네트워크(DevTools → Network → Slow 3G)에서 날짜 클릭 시 반짝이는 스켈레톤이 보이다가 데이터 로드 후 시간표로 교체되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add calendar.js style.css
git commit -m "feat: 날짜 상세 패널 로딩 스켈레톤 추가"
```

---

## Task 12: 빈 상태 디자인

**Files:**
- Modify: `calendar.html:56-58`
- Modify: `style.css`

- [ ] **Step 1: calendar.html의 초기 빈 상태 개선**

현재:
```html
<div class="detail-card" id="detail-card">
  <p style="color:var(--text-muted);font-size:0.9rem">날짜를 클릭하면<br>시간표와 일정이 표시됩니다.</p>
</div>
```

변경 후:
```html
<div class="detail-card" id="detail-card">
  <div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <p>날짜를 클릭하면<br>시간표와 일정이 표시됩니다.</p>
  </div>
</div>
```

- [ ] **Step 2: style.css에 empty-state 스타일 추가**

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  gap: 14px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.7;
}
```

- [ ] **Step 3: 확인**

페이지 새로고침 → 사이드패널에 캘린더 아이콘과 안내 문구가 예쁘게 표시되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add calendar.html style.css
git commit -m "design: 빈 상태 디자인 개선 (캘린더 아이콘 + 안내 문구)"
```

---

## Task 13: XSS 방지 — escapeHtml + innerHTML 수정

**Files:**
- Modify: `calendar.js`

- [ ] **Step 1: escapeHtml 헬퍼 함수 추가**

`calendar.js` 파일 상단(import 구문 바로 아래)에 추가:

```javascript
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: showDateDetail의 schedule card innerHTML 수정**

`calendar.js`의 `allSchedules.forEach(s => {` 블록에서 `card.innerHTML = \`...\`` 부분을 찾아 수정:

```javascript
// 기존 (XSS 취약):
card.innerHTML = `
  <div class="schedule-card-header">
    <span class="schedule-card-title">${s.title}</span>
    <span class="slot-badge badge-${s.type}">${typeLabel}</span>
  </div>
  ${s.detail ? `<div class="schedule-card-detail">${s.detail}</div>` : ''}
  ${(s.attachments || []).map(a =>
    `<a class="schedule-card-file" href="${a.file_url}" target="_blank">📎 ${a.file_name}</a>`
  ).join('')}
`;

// 변경 후 (XSS 안전):
card.innerHTML = `
  <div class="schedule-card-header">
    <span class="schedule-card-title">${escapeHtml(s.title)}</span>
    <span class="slot-badge badge-${escapeHtml(s.type)}">${escapeHtml(typeLabel)}</span>
  </div>
  ${s.detail ? `<div class="schedule-card-detail">${escapeHtml(s.detail)}</div>` : ''}
  ${(s.attachments || []).map(a =>
    `<a class="schedule-card-file" href="${escapeHtml(a.file_url)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(a.file_name)}</a>`
  ).join('')}
`;
```

- [ ] **Step 3: Task 5의 neisDayEvents 렌더링에 escapeHtml 적용**

Task 5에서 `e.name`을 쓴 곳을 `escapeHtml(e.name)`으로 교체 (이미 Task 5 주석에 명시됨).

- [ ] **Step 4: 커밋**

```bash
git add calendar.js
git commit -m "security: XSS 방지 - escapeHtml 적용 및 innerHTML 이스케이프"
```

---

## Task 14: API 에러 핸들링

**Files:**
- Modify: `calendar.js`
- Modify: `timetable.js`

- [ ] **Step 1: submitSchedule의 Supabase 에러 핸들링 개선**

`calendar.js`에서 `submitSchedule` 함수를 찾아 에러 시 토스트 추가. 현재 `if (error) { errEl.textContent = ...; return; }` 패턴에 toast 추가:

```javascript
// 파일 저장 에러 (submitSchedule 내 파일 업로드 에러 시)
if (uploadError) {
  showToast('파일 업로드 실패: ' + uploadError.message, 'error');
  return;
}

// 일정 저장 에러 (supabase insert 에러 시)
if (error) {
  showToast('저장 실패. 다시 시도해주세요.', 'error');
  errEl.textContent = error.message;
  errEl.classList.add('show');
  return;
}
```

- [ ] **Step 2: timetable.js의 fetchTimetable 에러 개선**

현재 catch에서 빈 객체를 반환하는데, 호출부인 calendar.js의 showDateDetail에서 subjectMap이 비어있어도 시간표가 정상 렌더링되므로 이미 처리됨. 다만 에러 시 사용자에게 알림이 없으므로:

`calendar.js`의 `showDateDetail` 함수에서 `fetchTimetable` 결과가 에러일 경우 처리 추가:

```javascript
// showDateDetail에서 Promise.all 다음에 추가:
// subjectMap이 비어있고 평일이면 시간표 로드 실패 알림
const jsDay = new Date(date + 'T00:00:00').getDay();
if (Object.keys(subjectMap).length === 0 && jsDay !== 0 && jsDay !== 6) {
  showToast('시간표를 불러오지 못했습니다.', 'info');
}
```

- [ ] **Step 3: renderCalendar의 Supabase 에러 처리**

`renderCalendar`의 Promise.all을 try-catch로 감싼다:

```javascript
let schedules, memberRows, neisSchedules;
try {
  const results = await Promise.all([
    supabase.from('schedules').select('date, type').eq('class_num', currentClass).gte('date', startDate).lte('date', endDate),
    supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted'),
    fetchNeisSchedule(currentYear, currentMonth)
  ]);
  schedules = results[0].data;
  memberRows = results[1].data;
  neisSchedules = results[2];
} catch {
  showToast('일정을 불러오지 못했습니다. 네트워크를 확인해주세요.', 'error');
  schedules = [];
  memberRows = [];
  neisSchedules = [];
}
```

- [ ] **Step 4: 커밋**

```bash
git add calendar.js timetable.js
git commit -m "feat: API 에러 핸들링 및 토스트 알림 연동"
```

---

## Task 15: 비밀번호 정책 강화

**Files:**
- Modify: `calendar.js:93-115` (setupSettings 비밀번호 변경)
- Modify: `calendar.html:187-193` (설정 모달 비밀번호 폼)
- Modify: `style.css`

- [ ] **Step 1: style.css에 비밀번호 강도계 스타일 추가**

```css
/* 비밀번호 강도계 */
.pw-strength-bar {
  height: 4px;
  border-radius: 2px;
  margin-top: 6px;
  transition: width 0.3s, background 0.3s;
  width: 0%;
}
.pw-strength-label {
  font-size: 0.75rem;
  margin-top: 4px;
  font-weight: 600;
}
.strength-weak   { background: var(--danger); }
.strength-medium { background: #F59E0B; }
.strength-strong { background: var(--success); }
```

- [ ] **Step 2: calendar.html의 "새 비밀번호" 입력 필드 아래에 강도계 추가**

"새 비밀번호" form-group 바로 다음에 삽입:

```html
<div style="margin-top:-8px;margin-bottom:12px">
  <div class="pw-strength-bar" id="pw-strength-bar"></div>
  <div class="pw-strength-label" id="pw-strength-label"></div>
</div>
```

- [ ] **Step 3: calendar.js의 setupSettings에 강도 체크 이벤트 추가**

`document.getElementById('settings-pw-btn').addEventListener(...)` 줄 위에 추가:

```javascript
document.getElementById('settings-pw-new').addEventListener('input', function() {
  const pw = this.value;
  const bar = document.getElementById('pw-strength-bar');
  const label = document.getElementById('pw-strength-label');
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (!pw) { bar.style.width = '0%'; label.textContent = ''; return; }
  if (score <= 1) {
    bar.style.width = '33%'; bar.className = 'pw-strength-bar strength-weak';
    label.style.color = 'var(--danger)'; label.textContent = '취약';
  } else if (score <= 3) {
    bar.style.width = '66%'; bar.className = 'pw-strength-bar strength-medium';
    label.style.color = '#D97706'; label.textContent = '보통';
  } else {
    bar.style.width = '100%'; bar.className = 'pw-strength-bar strength-strong';
    label.style.color = 'var(--success)'; label.textContent = '강함';
  }
});
```

- [ ] **Step 4: 비밀번호 최소 길이를 6→8자로 강화**

`calendar.js:100`에서:

```javascript
// 기존:
if (newPw.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다.'; ... }

// 변경 후:
if (newPw.length < 8) { errEl.textContent = '비밀번호는 8자 이상이어야 합니다.'; ... }
```

- [ ] **Step 5: 확인**

설정 모달 열기 → 새 비밀번호 입력 시 강도계 바가 빨강→주황→초록으로 변하는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add calendar.js calendar.html style.css
git commit -m "feat: 비밀번호 강도계 및 최소 8자 정책 추가"
```

---

## Task 16: 접근성 — aria-label 추가

**Files:**
- Modify: `calendar.js:211-238` (renderCalendar 날짜 셀)

- [ ] **Step 1: 날짜 셀에 aria-label 추가**

`renderCalendar` 함수의 날짜 셀 생성 부분에서 `d.className = 'calendar-day'` 바로 다음에 추가:

```javascript
// aria-label: "N월 N일, 일정 N개" 형식
const eventCount = (dotMap[dateStr] || []).length;
const dayOfWeek = ['일','월','화','수','목','금','토'][new Date(dateStr + 'T00:00:00').getDay()];
d.setAttribute('aria-label', `${currentMonth + 1}월 ${day}일 ${dayOfWeek}요일${eventCount > 0 ? `, 일정 ${eventCount}개` : ''}`);
d.setAttribute('role', 'button');
d.setAttribute('tabindex', '0');
d.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.click(); }
});
```

> ⚠️ `dotMap` 계산 이후에 이 코드가 위치해야 `eventCount`가 정확하다. 날짜 셀 생성 루프(`for (let day = 1; ...)`)는 dotMap 계산 뒤에 있으므로 문제없음.

- [ ] **Step 2: 모달에 aria 속성 추가**

`calendar.html`의 `#modal`, `#routine-modal`, `#settings-modal`, `#meal-modal`에 속성 추가:

```html
<!-- 기존: -->
<div class="modal-overlay" id="modal">
  <div class="modal">

<!-- 변경 후: -->
<div class="modal-overlay" id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-heading">
  <div class="modal">
```

나머지 모달들도 동일하게:
- `#routine-modal`: `aria-labelledby="routine-modal-heading"` → 모달 h3에 `id="routine-modal-heading"` 추가
- `#settings-modal`: `aria-labelledby="settings-modal-heading"` → 모달 h3에 `id="settings-modal-heading"` 추가
- `#meal-modal`: `aria-labelledby="meal-modal-title"` (이미 id 있음)

- [ ] **Step 3: style.css에서 focus-visible 스타일 추가**

```css
/* 키보드 포커스 표시 (접근성) */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.calendar-day:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  border-radius: 4px;
}
```

- [ ] **Step 4: 확인**

Tab 키로 캘린더 날짜 이동 시 파란 outline이 표시되는지 확인.
Enter 키로 날짜 선택이 되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add calendar.js calendar.html style.css
git commit -m "feat: 접근성 개선 - aria-label, role, focus-visible 추가"
```

---

## Task 17: 어드민 링크 보안 — 비관리자 완전 숨김

**Files:**
- Modify: `calendar.html`
- Modify: `calendar.js:24`

현재 `admin-btn`은 이미 `style="display:none"`으로 시작하고 JS에서 `is_admin`일 때만 보여주고 있다. 하지만 HTML 소스를 보면 `href="admin.html"`이 노출된다. 이를 동적으로 생성하도록 변경한다.

- [ ] **Step 1: calendar.html에서 admin-btn 링크를 빈 span으로 교체**

```html
<!-- 기존: -->
<a href="admin.html" class="btn btn-secondary btn-sm" id="admin-btn" style="display:none">어드민</a>

<!-- 변경 후: -->
<span id="admin-btn-placeholder"></span>
```

- [ ] **Step 2: calendar.js:24의 admin-btn 로직 수정**

```javascript
// 기존:
if (profile.is_admin) document.getElementById('admin-btn').style.display = '';

// 변경 후:
if (profile.is_admin) {
  const adminLink = document.createElement('a');
  adminLink.href = 'admin.html';
  adminLink.className = 'btn btn-secondary btn-sm';
  adminLink.textContent = '어드민';
  document.getElementById('admin-btn-placeholder').replaceWith(adminLink);
}
```

- [ ] **Step 3: 확인**

일반 계정으로 로그인 → 페이지 소스 보기 → `admin.html` 문자열이 보이지 않는지 확인.
어드민 계정으로 로그인 → 어드민 버튼이 보이는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add calendar.html calendar.js
git commit -m "security: 어드민 링크를 비관리자에게 완전히 숨김"
```

---

## 최종 확인

- [ ] **전체 기능 체크리스트**

  - [ ] 이번 달 학사일정이 있는 날짜에 노란 점 표시
  - [ ] 날짜 클릭 시 학사일정 노란 섹션 표시
  - [ ] 평일 시간표에 아침/점심/저녁 행에 "🍚 급식" 버튼 표시
  - [ ] 급식 버튼 클릭 시 모달로 메뉴 표시 (방학/주말은 "정보 없음")
  - [ ] "오늘" 버튼으로 현재 월로 즉시 복귀
  - [ ] 일정 저장/삭제 시 토스트 알림
  - [ ] 모달 열릴 때 slide-up 애니메이션
  - [ ] 날짜 선택 전 empty state에 캘린더 아이콘 + 안내
  - [ ] 로딩 중 스켈레톤 animation (느린 네트워크 테스트)
  - [ ] 비밀번호 변경 시 강도계 표시
  - [ ] 일반 사용자에게 어드민 링크 비표시
  - [ ] Tab 키로 날짜 포커스 이동 + Enter로 선택

- [ ] **최종 커밋**

```bash
git add -A
git status
# 변경 파일 확인 후
git commit -m "feat: NEIS API 연동 + Phase 1 UX/보안/접근성 개선 완료"
```

---

## 다음 단계: Plan 2

이 플랜 완료 후 다음 기능을 별도 플랜으로 구현한다:
- D-Day 카운트다운 (일정 타입 추가 + 배너)
- 일정 중복 충돌 경고
- 실행 취소 (Undo 5초 보관함)
- 주간/일간 뷰 토글
- 다크 모드 (CSS 변수 + 토글)
