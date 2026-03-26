import { NEIS_API_KEY, NEIS_ATPT_CODE, NEIS_SCHOOL_CODE } from './app.js';

const ALL_SLOTS = [
  { key: '아침식사',  label: '아침 식사',  time: '07:50~08:40', fixed: true  },
  { key: '1교시',    label: '1교시',      time: '09:10~10:00', fixed: false },
  { key: '2교시',    label: '2교시',      time: '10:10~11:00', fixed: false },
  { key: '3교시',    label: '3교시',      time: '11:10~12:00', fixed: false },
  { key: '4교시',    label: '4교시',      time: '12:10~13:00', fixed: false },
  { key: '점심식사',  label: '점심 식사',  time: '13:00~14:00', fixed: true  },
  { key: '5교시',    label: '5교시',      time: '14:00~14:50', fixed: false },
  { key: '6교시',    label: '6교시',      time: '15:00~15:50', fixed: false },
  { key: '7교시',    label: '7교시',      time: '16:00~16:50', fixed: false },
  { key: '저녁식사',  label: '저녁 식사',  time: '17:40~18:50', fixed: true  },
  { key: '자습1교시', label: '자습 1교시', time: '18:50~19:40', fixed: true  },
  { key: '자습2교시', label: '자습 2교시', time: '19:50~20:40', fixed: true  },
  { key: '자습3교시', label: '자습 3교시', time: '20:50~21:40', fixed: true  },
  { key: '자습4교시', label: '자습 4교시', time: '22:10~24:00', fixed: true  },
  { key: '개별자습',  label: '개별 자습',  time: '00:00~',      fixed: true  },
];

// 금요일 이후 제거 슬롯
const FRIDAY_REMOVE = new Set(['저녁식사','자습1교시','자습2교시','자습3교시','자습4교시','개별자습']);

export function getSlotsForDate(date) {
  const day = new Date(date + 'T00:00:00').getDay(); // 0=일, 5=금, 6=토
  if (day === 0 || day === 6) {
    // 주말: 전부 제거
    return [];
  } else if (day === 5) {
    // 금요일: 저녁식사 이후 제거
    return ALL_SLOTS.filter(s => !FRIDAY_REMOVE.has(s.key));
  }
  return ALL_SLOTS;
}

export async function fetchTimetable(classNum, date) {
  const dateStr = date.replace(/-/g, '');
  const year = date.slice(0, 4);
  const url = `https://open.neis.go.kr/hub/hisTimetable?KEY=${NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${NEIS_ATPT_CODE}&SD_SCHUL_CODE=${NEIS_SCHOOL_CODE}&AY=${year}&SEM=1&ALL_TI_YMD=${dateStr}&GRADE=1&CLASS_NM=${classNum}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const rows = json?.hisTimetable?.[1]?.row;
    if (!rows) return {};
    const map = {};
    rows.forEach(r => { map[r.PERIO + '교시'] = r.ITRT_CNTNT; });
    return map;
  } catch {
    return {};
  }
}

export function isRoutineActive(r, date) {
  const type = r.repeat_type || 'specific';
  if (type === 'specific') return (r.specific_dates || []).includes(date);
  const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
  const dow = DAY_KEYS[new Date(date + 'T00:00:00').getDay()];
  if (type === 'daily') return true;
  if (type === 'weekly') return (r.repeat_days || []).includes(dow);
  if (type === 'monthly') return r.repeat_start_date && date.slice(8) === r.repeat_start_date.slice(8);
  if (type === 'yearly') return r.repeat_start_date && date.slice(5) === r.repeat_start_date.slice(5);
  return false;
}

function timeToMinutes(t) {
  if (!t) return 9999;
  const [h, m] = t.split(':').map(Number);
  // 00:xx는 자정(다음날)이므로 1440+분으로 처리
  return (h === 0 ? 1440 : h * 60) + (m || 0);
}

function getSlotStatus(startStr, endStr, isToday, isPast) {
  if (isPast) return 'past';
  if (!isToday || !startStr) return 'future';
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(startStr);
  const endMin = endStr ? timeToMinutes(endStr) : 9999;
  if (nowMin >= startMin && nowMin < endMin) return 'current';
  if (nowMin >= endMin) return 'past';
  return 'future';
}

export function renderTimetable(subjectMap, schedules, routines, date, classNum, myClassNum, onSlotClick) {
  const container = document.createDocumentFragment();
  const isMyClass = classNum === myClassNum;
  const slots = getSlotsForDate(date);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = date === todayStr;
  const isPast = date < todayStr;

  const ul = document.createElement('ul');
  ul.className = 'timetable-list';

  // ── 슬롯 + 일과 합산 후 시간순 정렬 ──────────────
  const todayRoutines = (routines || []).filter(r => isRoutineActive(r, date));

  const slotItems = slots.map(s => ({
    kind: 'slot',
    sortMin: timeToMinutes(s.time.split('~')[0]),
    data: s
  }));
  const routineItems = todayRoutines.map(r => ({
    kind: 'routine',
    sortMin: timeToMinutes(r.start_time),
    data: r
  }));

  const combined = [...slotItems, ...routineItems].sort((a, b) => a.sortMin - b.sortMin);

  combined.forEach(item => {
    const li = document.createElement('li');

    if (item.kind === 'slot') {
      const { key, label, time, fixed } = item.data;
      const subject = fixed ? '' : (subjectMap[key] || '-');
      const slotSchedules = schedules.filter(s => s.time_slot === key);
      const badges = slotSchedules.map(s =>
        `<span class="slot-badge badge-${s.type}">${s.title}</span>`
      ).join('');
      const [startStr, endStr] = time.split('~');
      const status = getSlotStatus(startStr, endStr, isToday, isPast);
      li.className = 'timetable-slot' + (isMyClass ? ' clickable' : '') + (status === 'past' ? ' slot-past' : status === 'current' ? ' slot-current' : '');
      li.innerHTML = `
        <div class="slot-label">${label}<span style="color:var(--text-muted);font-size:0.72rem;margin-left:6px">${time}</span></div>
        <div class="slot-subject">${subject}${badges}</div>
      `;
      if (isMyClass) li.addEventListener('click', () => onSlotClick(key, label, time));
    } else {
      const r = item.data;
      const status = getSlotStatus(r.start_time, r.end_time, isToday, isPast);
      li.className = 'timetable-slot routine-slot' + (status === 'past' ? ' slot-past' : status === 'current' ? ' slot-current' : '');
      li.innerHTML = `
        <div class="slot-label" style="color:#7C3AED">📋 내 일과<span style="color:var(--text-muted);font-size:0.72rem;margin-left:6px">${r.start_time}~${r.end_time}</span></div>
        <div class="slot-subject" style="display:flex;justify-content:space-between;align-items:center">
          <span>${r.title}</span>
          <button class="btn-delete" style="margin:0" data-rid="${r.id}">삭제</button>
        </div>
      `;
    }
    ul.appendChild(li);
  });

  container.appendChild(ul);

  // ── 당일까지 제출 ─────────────────────────────────
  const subSched = schedules.filter(s => s.time_slot === 'submission');
  const subBadges = subSched.map(s =>
    `<span class="slot-badge badge-${s.type}">${s.title}</span>`
  ).join('');
  const subSection = document.createElement('div');
  subSection.className = 'submission-section';
  subSection.innerHTML = `<h4>📌 당일까지 제출 ${subBadges}</h4>`;
  if (isMyClass) subSection.addEventListener('click', () => onSlotClick('submission', '당일까지 제출', ''));
  container.appendChild(subSection);

  return container;
}
