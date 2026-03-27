import { supabase, getProfile, requireAuth } from './app.js';
import { fetchTimetable, renderTimetable, isRoutineActive } from './timetable.js';

let routines = [];
let routineExceptions = [];
let neisScheduleCache = {}; // 'YYYYMM' → [{date, name}]

let profile = null;
let currentClass = 1;
let selectedDate = null;
let selectedSlot = null;
let selectedType = 'class';
let selectedMembers = [];
let selectedFiles = [];
let currentYear, currentMonth;
let currentView = 'month'; // 'month' | 'week' | 'day'
let currentWeekStart = null;

async function init() {
  const ok = await requireAuth();
  if (!ok) return;

  profile = await getProfile();
  if (!profile) { window.location.href = 'index.html'; return; }

  document.getElementById('user-info').textContent = `${profile.class_num}반 ${profile.seat_num}번 ${profile.name}`;
  // 어드민 링크: 관리자에게만 동적 생성 (보안)
  if (profile.is_admin) {
    const adminLink = document.createElement('a');
    adminLink.href = 'admin.html';
    adminLink.className = 'btn btn-secondary btn-sm';
    adminLink.textContent = '어드민';
    document.getElementById('admin-btn-placeholder').replaceWith(adminLink);
  }
  currentClass = profile.class_num;

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  setupTabs();
  setupTodayBtn();
  setupViewToggle();
  setupDarkMode();
  setupLogout();
  setupSettings();
  // setupWithdraw는 setupSettings 내부에서 처리
  setupWithdraw();
  setupModal();
  setupRoutineModal();
  setupNotificationBtn();
  // 급식 모달 닫기
  document.getElementById('meal-modal-close').addEventListener('click', () =>
    document.getElementById('meal-modal').classList.remove('open')
  );
  document.getElementById('meal-modal').addEventListener('click', e => {
    if (e.target.id === 'meal-modal') document.getElementById('meal-modal').classList.remove('open');
  });
  await loadRoutines();
  await renderCalendar();
  await loadNotifications();
}

// ─── 탭 ───────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    const c = parseInt(tab.dataset.class);
    if (c === profile.class_num) tab.classList.add('my-class');
    if (c === currentClass) tab.classList.add('active');
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentClass = c;
      await renderCalendar();
      if (selectedDate) await showDateDetail(selectedDate);
    });
  });
}

// ─── 설정 ─────────────────────────────────────────
function setupSettings() {
  const btn = document.getElementById('settings-btn');
  const modal = document.getElementById('settings-modal');

  btn.addEventListener('click', () => {
    document.getElementById('settings-name').value = profile.name;
    document.getElementById('settings-name-error').classList.remove('show');
    document.getElementById('settings-pw-current').value = '';
    document.getElementById('settings-pw-new').value = '';
    document.getElementById('settings-pw-confirm').value = '';
    document.getElementById('settings-pw-error').classList.remove('show');
    modal.classList.add('open');
  });
  document.getElementById('settings-cancel').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  // 이름 변경
  document.getElementById('settings-name-btn').addEventListener('click', async () => {
    const name = document.getElementById('settings-name').value.trim();
    const errEl = document.getElementById('settings-name-error');
    if (!name) { errEl.textContent = '이름을 입력해주세요.'; errEl.classList.add('show'); return; }
    const { error } = await supabase.from('profiles').update({ name }).eq('id', profile.id);
    if (error) { errEl.textContent = '변경 실패: ' + error.message; errEl.classList.add('show'); return; }
    profile.name = name;
    document.getElementById('user-info').textContent = `${profile.class_num}반 ${profile.seat_num}번 ${profile.name}`;
    showToast('이름이 변경됐습니다.', 'success');
    errEl.classList.remove('show');
  });

  // 비밀번호 변경
  // 비밀번호 강도계
  document.getElementById('settings-pw-new').addEventListener('input', function () {
    const pw = this.value;
    const bar = document.getElementById('pw-strength-bar');
    const label = document.getElementById('pw-strength-label');
    if (!pw) { bar.style.width = '0%'; label.textContent = ''; return; }
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
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

  document.getElementById('settings-pw-btn').addEventListener('click', async () => {
    const current = document.getElementById('settings-pw-current').value;
    const newPw = document.getElementById('settings-pw-new').value;
    const confirm = document.getElementById('settings-pw-confirm').value;
    const errEl = document.getElementById('settings-pw-error');
    errEl.style.color = '';
    if (!current || !newPw || !confirm) { errEl.textContent = '모든 항목을 입력해주세요.'; errEl.classList.add('show'); return; }
    if (newPw.length < 8) { errEl.textContent = '비밀번호는 8자 이상이어야 합니다.'; errEl.classList.add('show'); return; }
    if (newPw !== confirm) { errEl.textContent = '새 비밀번호가 일치하지 않습니다.'; errEl.classList.add('show'); return; }
    // 현재 비밀번호 확인
    const email = `c${profile.class_num}n${profile.seat_num}@gbs.kr`;
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authErr) { errEl.textContent = '현재 비밀번호가 올바르지 않습니다.'; errEl.classList.add('show'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { errEl.textContent = '변경 실패: ' + error.message; errEl.classList.add('show'); return; }
    showToast('비밀번호가 변경됐습니다.', 'success');
    errEl.classList.remove('show');
    document.getElementById('settings-pw-current').value = '';
    document.getElementById('settings-pw-new').value = '';
    document.getElementById('settings-pw-confirm').value = '';
    setTimeout(() => { errEl.classList.remove('show'); errEl.style.color = ''; }, 2000);
  });
}

// ─── 탈퇴 ─────────────────────────────────────────
function setupWithdraw() {
  document.getElementById('withdraw-btn').addEventListener('click', async () => {
    const password = document.getElementById('withdraw-password').value;
    const errEl = document.getElementById('withdraw-error');
    errEl.classList.remove('show');
    if (!password) { errEl.textContent = '비밀번호를 입력해주세요.'; errEl.classList.add('show'); return; }
    if (!confirm('탈퇴하면 모든 개인 일정과 일과가 삭제되며 복구할 수 없습니다. 정말 탈퇴할까요?')) return;
    const email = `c${profile.class_num}n${profile.seat_num}@gbs.kr`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = '비밀번호가 올바르지 않습니다.'; errEl.classList.add('show'); return; }
    await supabase.rpc('delete_user');
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });
}

// ─── 로그아웃 ─────────────────────────────────────
function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  });
}

// ─── 뷰 헬퍼 ─────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function renderView() {
  if (currentView === 'month') await renderCalendar();
  else if (currentView === 'week') await renderWeekView();
  else if (currentView === 'day') await renderDayView();
}

// ─── 캘린더 렌더링 ────────────────────────────────
async function renderCalendar() {
  // 레이아웃 복원
  document.querySelector('.cal-grid-area').style.display = '';
  const grid = document.getElementById('calendar-grid');
  grid.className = 'calendar-grid';
  document.querySelector('.detail-panel').style.maxWidth = '';
  document.querySelector('.detail-panel').style.margin = '';

  document.getElementById('month-title').textContent = `${currentYear}년 ${currentMonth + 1}월`;
  grid.innerHTML = '';

  ['일','월','화','수','목','금','토'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'calendar-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const startDate = `${currentYear}-${pad(currentMonth + 1)}-01`;
  const endDate = `${currentYear}-${pad(currentMonth + 1)}-${daysInMonth}`;

  let schedules, memberRows, neisSchedules;
  try {
    const results = await Promise.all([
      supabase.from('schedules').select('date, type, is_dday').eq('class_num', currentClass).gte('date', startDate).lte('date', endDate),
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

  // 수락한 그룹 일정 중 다른 반 것도 점으로 표시
  let acceptedDots = [];
  const acceptedIds = (memberRows || []).map(m => m.schedule_id);
  if (acceptedIds.length > 0) {
    const { data: groupSched } = await supabase
      .from('schedules').select('date, type')
      .in('id', acceptedIds)
      .neq('class_num', currentClass)
      .gte('date', startDate).lte('date', endDate);
    acceptedDots = groupSched || [];
  }

  const dotMap = {};
  [...(schedules || []), ...acceptedDots].forEach(s => {
    if (!dotMap[s.date]) dotMap[s.date] = [];
    dotMap[s.date].push(s.is_dday ? 'dday' : s.type);
  });
  // 학사일정 dot 추가
  (neisSchedules || []).forEach(s => {
    const dateStr = `${s.date.slice(0, 4)}-${s.date.slice(4, 6)}-${s.date.slice(6, 8)}`;
    if (dateStr >= startDate && dateStr <= endDate) {
      if (!dotMap[dateStr]) dotMap[dateStr] = [];
      dotMap[dateStr].push('neis');
    }
  });

  // 내 일과 점 표시
  routines.forEach(r => {
    if ((r.repeat_type || 'specific') === 'specific') {
      (r.specific_dates || []).forEach(d => {
        if (d >= startDate && d <= endDate) {
          if (!dotMap[d]) dotMap[d] = [];
          dotMap[d].push('routine');
        }
      });
    } else {
      for (let day = 1; day <= daysInMonth; day++) {
        const d = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
        if (isRoutineActive(r, d)) {
          if (!dotMap[d]) dotMap[d] = [];
          dotMap[d].push('routine');
        }
      }
    }
  });

  for (let i = 0; i < firstDay; i++) {
    const d = document.createElement('div');
    d.className = 'calendar-day other-month';
    grid.appendChild(d);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
    const d = document.createElement('div');
    d.className = 'calendar-day';
    if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day)
      d.classList.add('today');
    if (selectedDate === dateStr) d.classList.add('selected');

    const numEl = document.createElement('div');
    numEl.className = 'day-num';
    numEl.textContent = day;
    d.appendChild(numEl);

    if (dotMap[dateStr]) {
      dotMap[dateStr].forEach(type => {
        const dot = document.createElement('span');
        dot.className = `day-dot ${type !== 'class' ? type : ''}`;
        d.appendChild(dot);
      });
    }

    // 접근성
    const eventCount = (dotMap[dateStr] || []).length;
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr + 'T00:00:00').getDay()];
    d.setAttribute('aria-label', `${currentMonth + 1}월 ${day}일 ${dayOfWeek}요일${eventCount > 0 ? `, 일정 ${eventCount}개` : ''}`);
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); d.click(); }
    });

    d.addEventListener('click', async () => {
      document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
      d.classList.add('selected');
      selectedDate = dateStr;
      await showDateDetail(dateStr);
    });
    grid.appendChild(d);
  }

  await renderDDayBanner();

  document.getElementById('prev-month').onclick = async () => {
    currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    await renderCalendar();
  };
  document.getElementById('next-month').onclick = async () => {
    currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    await renderCalendar();
  };
}

// ─── 주간 뷰 ──────────────────────────────────────
async function renderWeekView() {
  const pad = n => String(n).padStart(2, '0');

  // 레이아웃 복원
  document.querySelector('.cal-grid-area').style.display = '';
  document.querySelector('.detail-panel').style.maxWidth = '';
  document.querySelector('.detail-panel').style.margin = '';

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  const startDate = dates[0];
  const endDate = dates[6];

  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  document.getElementById('month-title').textContent =
    `${s.getMonth() + 1}/${s.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;

  const [{ data: schedules }, neisForMonth] = await Promise.all([
    supabase.from('schedules')
      .select('date, type, title, is_dday')
      .eq('class_num', currentClass)
      .gte('date', startDate)
      .lte('date', endDate),
    fetchNeisSchedule(s.getFullYear(), s.getMonth())
  ]);

  document.getElementById('prev-month').onclick = async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    await renderWeekView();
  };
  document.getElementById('next-month').onclick = async () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    await renderWeekView();
  };

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
    col.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    });

    grid.appendChild(col);
  });

  await renderDDayBanner();
}

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

  // 그리드 영역 숨기기 (nav는 유지), 데스크탑에서 상세 패널 확장
  document.querySelector('.cal-grid-area').style.display = 'none';
  document.getElementById('dday-banner').style.display = 'none';
  document.querySelector('.detail-panel').style.maxWidth = '720px';
  document.querySelector('.detail-panel').style.margin = '0 auto';

  // 화살표: 하루씩 이동
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
}

// ─── 날짜 상세 ────────────────────────────────────
async function showDateDetail(date) {
  const panel = document.getElementById('detail-card');
  const [m, d] = [date.slice(5, 7), date.slice(8, 10)];
  panel.innerHTML = `
    <h3>${parseInt(m)}월 ${parseInt(d)}일</h3>
    <div class="skeleton skeleton-line medium"></div>
    <div class="skeleton skeleton-line full"></div>
    <div class="skeleton skeleton-line short"></div>
  `;

  const [subjectMap, { data: classSchedules }, { data: memberRows }, neisForMonth] = await Promise.all([
    fetchTimetable(currentClass, date),
    supabase.from('schedules').select('*, attachments(*)').eq('class_num', currentClass).eq('date', date),
    supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted'),
    fetchNeisSchedule(parseInt(date.slice(0, 4)), parseInt(date.slice(5, 7)) - 1)
  ]);
  const neisDateStr = date.replace(/-/g, '');
  const neisDayEvents = (neisForMonth || []).filter(s => s.date === neisDateStr);

  // 수락한 그룹 일정 중 다른 반 것도 포함
  let schedules = classSchedules || [];
  const acceptedIds = (memberRows || []).map(m => m.schedule_id);
  if (acceptedIds.length > 0) {
    const { data: groupSched } = await supabase
      .from('schedules').select('*, attachments(*)')
      .in('id', acceptedIds)
      .eq('date', date)
      .neq('class_num', currentClass);
    schedules = [...schedules, ...(groupSched || [])];
  }

  panel.innerHTML = `<h3>${parseInt(m)}월 ${parseInt(d)}일</h3>`;

  // 학사일정 섹션
  if (neisDayEvents.length > 0) {
    const neisSection = document.createElement('div');
    neisSection.style.cssText = 'background:#FFFBEB;border:1px solid #F59E0B;border-radius:8px;padding:10px 12px;margin-bottom:12px;';
    neisSection.innerHTML = `
      <div style="font-size:0.75rem;font-weight:600;color:#D97706;margin-bottom:4px;">📅 학사일정</div>
      ${neisDayEvents.map(e => `<div style="font-size:0.88rem;color:#92400E;">${escapeHtml(e.name)}</div>`).join('')}
    `;
    panel.appendChild(neisSection);
  }

  // 예외 날짜 적용해서 오늘 보이면 안 되는 루틴 필터링
  const visibleRoutines = routines.filter(r =>
    !routineExceptions.some(e => e.routine_id === r.id && e.exception_date === date)
  );

  // 버튼 영역 (시간표 위에 표시)
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;';
  if (currentClass === profile.class_num) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.style.cssText = 'flex:1;padding:9px;font-size:0.85rem;';
    addBtn.textContent = '+ 일정 추가';
    addBtn.addEventListener('click', () => openModal(date, null, null));
    btnRow.appendChild(addBtn);
  }
  const routineBtn = document.createElement('button');
  routineBtn.className = 'btn btn-secondary';
  routineBtn.style.cssText = 'flex:1;padding:9px;font-size:0.85rem;';
  routineBtn.textContent = '📋 일과 추가';
  routineBtn.addEventListener('click', () => openRoutineModal());
  btnRow.appendChild(routineBtn);
  panel.appendChild(btnRow);

  const ttFrag = renderTimetable(
    subjectMap, schedules || [], visibleRoutines, date, currentClass, profile.class_num,
    (slot, label, time) => openModal(date, slot, label),
    (mealDate, mealCode) => showMealModal(mealDate, mealCode)
  );
  panel.appendChild(ttFrag);

  // 일과 삭제 버튼 이벤트
  panel.querySelectorAll('.btn-delete[data-rid]').forEach(btn => {
    btn.addEventListener('click', () => showRoutineDeleteMenu(btn, btn.dataset.rid, date));
  });

  // 일정 목록
  const allSchedules = schedules || [];
  if (allSchedules.length > 0) {
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = '일정 목록';
    panel.appendChild(title);

    allSchedules.forEach(s => {
      const card = document.createElement('div');
      card.className = 'schedule-card';
      const typeLabel = s.type === 'class' ? '반전체' : s.type === 'personal' ? '개인' : '그룹';
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
            const { error } = await supabase.from('schedules').delete().eq('id', s.id);
            if (error) { showToast('삭제 실패: ' + error.message, 'error'); return; }
            const deleted = {
              class_num: s.class_num, date: s.date, time_slot: s.time_slot,
              title: s.title, detail: s.detail, type: s.type,
              created_by: s.created_by, is_dday: s.is_dday || false,
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
        }
        card.appendChild(del);
      }
      panel.appendChild(card);
    });
  }

}

// ─── 모달 ─────────────────────────────────────────
function setupModal() {
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      document.getElementById('group-section').style.display = selectedType === 'group' ? '' : 'none';
    });
  });

  document.getElementById('file-drop').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', e => {
    selectedFiles = Array.from(e.target.files);
    document.getElementById('file-list').textContent = selectedFiles.map(f => f.name).join(', ');
  });

  document.getElementById('modal-submit').addEventListener('click', submitSchedule);
}

async function loadRoutines() {
  const [{ data: r }, { data: e }] = await Promise.all([
    supabase.from('routines').select('*').eq('user_id', profile.id),
    supabase.from('routine_exceptions').select('*')
  ]);
  routines = r || [];
  routineExceptions = e || [];
}

function showRoutineDeleteMenu(btn, routineId, date) {
  // 기존 메뉴 제거
  document.querySelectorAll('.routine-delete-menu').forEach(el => el.remove());

  const menu = document.createElement('div');
  menu.className = 'routine-delete-menu';
  menu.innerHTML = `
    <button class="rdm-btn" id="rdm-this">이 날만 삭제</button>
    <button class="rdm-btn rdm-danger" id="rdm-all">전체 삭제</button>
  `;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(menu);

  menu.querySelector('#rdm-this').addEventListener('click', async () => {
    await supabase.from('routine_exceptions').insert({ routine_id: routineId, exception_date: date });
    menu.remove();
    await loadRoutines();
    await showDateDetail(date);
  });

  menu.querySelector('#rdm-all').addEventListener('click', async () => {
    await supabase.from('routines').delete().eq('id', routineId);
    menu.remove();
    await loadRoutines();
    await showDateDetail(date);
  });

  // 바깥 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); }
    });
  }, 0);
}

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

function setupRoutineModal() {
  document.getElementById('routine-cancel').addEventListener('click', () => {
    document.getElementById('routine-modal').classList.remove('open');
  });
  document.getElementById('routine-modal').addEventListener('click', e => {
    if (e.target.id === 'routine-modal') document.getElementById('routine-modal').classList.remove('open');
  });
  document.getElementById('routine-submit').addEventListener('click', submitRoutine);

  // 반복 O/X
  document.getElementById('rpt-no').addEventListener('click', () => {
    repeatMode = 'no';
    document.getElementById('rpt-no').classList.add('active');
    document.getElementById('rpt-yes').classList.remove('active');
    document.getElementById('specific-section').style.display = '';
    document.getElementById('repeat-section').style.display = 'none';
  });
  document.getElementById('rpt-yes').addEventListener('click', () => {
    repeatMode = 'yes';
    document.getElementById('rpt-yes').classList.add('active');
    document.getElementById('rpt-no').classList.remove('active');
    document.getElementById('specific-section').style.display = 'none';
    document.getElementById('repeat-section').style.display = '';
  });

  // 반복 간격
  document.querySelectorAll('#interval-selector .type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#interval-selector .type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      repeatInterval = btn.dataset.interval;
      document.getElementById('weekday-section').style.display = repeatInterval === 'weekly' ? '' : 'none';
    });
  });

  // 요일 토글
  document.querySelectorAll('#weekday-section input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('label').classList.toggle('active', cb.checked);
    });
  });
}

let miniCalYear, miniCalMonth, selectedDates = new Set();
let repeatMode = 'no';   // 'no' | 'yes'
let repeatInterval = 'daily'; // 'daily' | 'weekly' | 'monthly' | 'yearly'

function openRoutineModal() {
  document.getElementById('routine-title').value = '';
  document.getElementById('routine-start').value = '';
  document.getElementById('routine-end').value = '';
  document.getElementById('routine-error').classList.remove('show');
  selectedDates = new Set();
  repeatMode = 'no';
  repeatInterval = 'daily';

  // UI 초기화
  document.getElementById('rpt-no').classList.add('active');
  document.getElementById('rpt-yes').classList.remove('active');
  document.getElementById('specific-section').style.display = '';
  document.getElementById('repeat-section').style.display = 'none';
  document.getElementById('weekday-section').style.display = 'none';
  document.querySelectorAll('#interval-selector .type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#interval-selector [data-interval="daily"]').classList.add('active');
  document.querySelectorAll('#weekday-section input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('label').classList.remove('active');
  });
  document.getElementById('routine-selected-count').textContent = '';

  const now = new Date();
  miniCalYear = now.getFullYear();
  miniCalMonth = now.getMonth();
  renderMiniCal();
  document.getElementById('routine-modal').classList.add('open');
}

function renderMiniCal() {
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('mini-month-title').textContent = `${miniCalYear}년 ${miniCalMonth+1}월`;
  const grid = document.getElementById('mini-cal-grid');
  grid.innerHTML = '';

  ['일','월','화','수','목','금','토'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'mini-cal-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  const firstDay = new Date(miniCalYear, miniCalMonth, 1).getDay();
  const daysInMonth = new Date(miniCalYear, miniCalMonth+1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'mini-cal-day other-month';
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${miniCalYear}-${pad(miniCalMonth+1)}-${pad(day)}`;
    const el = document.createElement('div');
    el.className = 'mini-cal-day' + (selectedDates.has(dateStr) ? ' selected' : '');
    el.textContent = day;
    el.addEventListener('click', () => {
      if (selectedDates.has(dateStr)) selectedDates.delete(dateStr);
      else selectedDates.add(dateStr);
      const count = selectedDates.size;
      document.getElementById('routine-selected-count').textContent = count > 0 ? `(${count}일 선택)` : '';
      renderMiniCal();
    });
    grid.appendChild(el);
  }

  document.getElementById('mini-prev').onclick = () => {
    miniCalMonth--; if (miniCalMonth < 0) { miniCalMonth=11; miniCalYear--; }
    renderMiniCal();
  };
  document.getElementById('mini-next').onclick = () => {
    miniCalMonth++; if (miniCalMonth > 11) { miniCalMonth=0; miniCalYear++; }
    renderMiniCal();
  };
}

async function submitRoutine() {
  const title = document.getElementById('routine-title').value.trim();
  const start = document.getElementById('routine-start').value;
  const end = document.getElementById('routine-end').value;
  const errEl = document.getElementById('routine-error');

  if (!title) { errEl.textContent = '제목을 입력해주세요.'; errEl.classList.add('show'); return; }
  if (!start || !end) { errEl.textContent = '시작/종료 시간을 입력해주세요.'; errEl.classList.add('show'); return; }
  if (start >= end) { errEl.textContent = '종료 시간이 시작 시간보다 늦어야 합니다.'; errEl.classList.add('show'); return; }

  let insertData = { user_id: profile.id, title, start_time: start, end_time: end };

  if (repeatMode === 'no') {
    const dates = [...selectedDates];
    if (dates.length === 0) { errEl.textContent = '날짜를 하나 이상 선택해주세요.'; errEl.classList.add('show'); return; }
    insertData.repeat_type = 'specific';
    insertData.specific_dates = dates;
  } else {
    if (repeatInterval === 'weekly') {
      const days = [...document.querySelectorAll('#weekday-section input[type=checkbox]:checked')].map(cb => cb.value);
      if (days.length === 0) { errEl.textContent = '요일을 하나 이상 선택해주세요.'; errEl.classList.add('show'); return; }
      insertData.repeat_days = days;
    }
    insertData.repeat_type = repeatInterval;
    insertData.repeat_start_date = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from('routines').insert(insertData);

  if (error) { errEl.textContent = '저장 실패: ' + error.message; errEl.classList.add('show'); return; }

  document.getElementById('routine-modal').classList.remove('open');
  showToast('일과가 저장됐습니다.', 'success');
  await loadRoutines();
  if (selectedDate) await showDateDetail(selectedDate);
}

async function openModal(date, slot, label) {
  selectedDate = date;
  selectedSlot = slot;
  selectedType = 'class';
  selectedMembers = [];
  selectedFiles = [];

  document.getElementById('modal-title-input').value = '';
  document.getElementById('modal-detail').value = '';
  document.getElementById('file-list').textContent = '';
  document.getElementById('file-input').value = '';
  const ddayCb = document.getElementById('modal-dday');
  if (ddayCb) ddayCb.checked = false;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="class"]').classList.add('active');
  document.getElementById('group-section').style.display = 'none';
  document.getElementById('modal-heading').textContent = label
    ? `${label} 일정 추가`
    : `${date.slice(5).replace('-', '월 ')}일 일정 추가`;

  // 전체 학생 로드 (본인 제외)
  const { data: members } = await supabase
    .from('profiles').select('*')
    .neq('id', profile.id)
    .order('class_num')
    .order('seat_num');

  const memberList = document.getElementById('member-list');
  memberList.innerHTML = '';
  (members || []).forEach(m => {
    const label = document.createElement('label');
    label.className = 'member-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = m.id;
    cb.addEventListener('change', e => {
      if (e.target.checked) selectedMembers.push(m.id);
      else selectedMembers = selectedMembers.filter(id => id !== m.id);
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${m.class_num}반 ${m.seat_num}번 ${m.name}`));
    memberList.appendChild(label);
  });

  document.getElementById('modal').classList.add('open');
  document.getElementById('modal-title-input').focus();
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

async function submitSchedule() {
  const title = document.getElementById('modal-title-input').value.trim();
  const detail = document.getElementById('modal-detail').value.trim();
  const isDday = document.getElementById('modal-dday')?.checked || false;
  if (!title) { alert('제목을 입력해주세요.'); return; }
  if (selectedType === 'group' && selectedMembers.length === 0) { alert('그룹 멤버를 1명 이상 선택해주세요.'); return; }

  // 중복 일정 체크
  if (selectedSlot && selectedSlot !== 'all-day' && selectedSlot !== 'submission') {
    const { data: existing } = await supabase
      .from('schedules')
      .select('id, title')
      .eq('class_num', profile.class_num)
      .eq('date', selectedDate)
      .eq('time_slot', selectedSlot)
      .limit(1);
    if (existing && existing.length > 0) {
      const proceed = confirm(`"${existing[0].title}" 일정이 이미 이 시간에 있습니다.\n그래도 추가하시겠습니까?`);
      if (!proceed) return;
    }
  }

  const submitBtn = document.getElementById('modal-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중...';

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

  if (error) {
    alert('저장 실패: ' + error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = '저장';
    return;
  }

  // 파일 업로드
  for (const file of selectedFiles) {
    const path = `${schedule.id}/${Date.now()}_${file.name}`;
    const { data: uploaded } = await supabase.storage.from('attachments').upload(path, file);
    if (uploaded) {
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path);
      await supabase.from('attachments').insert({ schedule_id: schedule.id, file_url: publicUrl, file_name: file.name });
    }
  }

  // 그룹 초대
  if (selectedType === 'group') {
    for (const userId of selectedMembers) {
      await supabase.from('group_members').insert({ schedule_id: schedule.id, user_id: userId, status: 'pending' });
      await supabase.from('notifications').insert({ user_id: userId, schedule_id: schedule.id, type: 'group_invite' });
    }
  }

  closeModal();
  showToast('일정이 저장됐습니다.', 'success');
  submitBtn.disabled = false;
  submitBtn.textContent = '저장';
  await renderCalendar();
  await showDateDetail(selectedDate);
}

// ─── 알림 ─────────────────────────────────────────
function setupNotificationBtn() {
  const btn = document.getElementById('notif-btn');
  const dropdown = document.getElementById('notif-dropdown');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
}

async function loadNotifications() {
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*, schedules(title, created_by, profiles!schedules_created_by_fkey(name))')
    .eq('user_id', profile.id)
    .eq('is_read', false);

  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');

  if (!notifs || notifs.length === 0) {
    badge.classList.remove('show');
    list.innerHTML = '<div class="notif-empty">새 알림이 없습니다</div>';
    return;
  }

  badge.textContent = notifs.length;
  badge.classList.add('show');
  list.innerHTML = '';

  notifs.forEach(n => {
    const creatorName = n.schedules?.profiles?.name || '누군가';
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = `
      <p class="notif-text">📨 <strong>${creatorName}</strong>님이 그룹 일정 "<strong>${n.schedules?.title || ''}</strong>"에 초대했습니다.</p>
      <div class="notif-actions">
        <button class="btn-accept" data-nid="${n.id}" data-sid="${n.schedule_id}">수락</button>
        <button class="btn-reject" data-nid="${n.id}" data-sid="${n.schedule_id}">거절</button>
      </div>
    `;
    item.querySelector('.btn-accept').addEventListener('click', () => handleInvite(n.id, n.schedule_id, true));
    item.querySelector('.btn-reject').addEventListener('click', () => handleInvite(n.id, n.schedule_id, false));
    list.appendChild(item);
  });
}

async function handleInvite(notifId, scheduleId, accepted) {
  if (accepted) {
    await supabase.from('group_members')
      .update({ status: 'accepted' })
      .eq('schedule_id', scheduleId)
      .eq('user_id', profile.id);
  } else {
    // 거절 시 그룹 일정 전체 취소
    await supabase.from('schedules').delete().eq('id', scheduleId);
  }
  await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
  await loadNotifications();
  if (selectedDate) await showDateDetail(selectedDate);
}

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

// ─── 급식 모달 ─────────────────────────────────────
const MEAL_LABEL = { 1: '🌅 아침 급식', 2: '☀️ 점심 급식', 3: '🌙 저녁 급식' };

async function showMealModal(date, mealCode) {
  const modal = document.getElementById('meal-modal');
  const titleEl = document.getElementById('meal-modal-title');
  const bodyEl = document.getElementById('meal-modal-body');

  titleEl.textContent = `${MEAL_LABEL[mealCode]} (${date.slice(5, 7)}월 ${date.slice(8, 10)}일)`;
  bodyEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem">불러오는 중...</p>';
  modal.classList.add('open');

  try {
    const dateCompact = date.replace(/-/g, '');
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
      li.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border);font-size:0.9rem;';
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

// ─── 토스트 ───────────────────────────────────────
function showToast(message, type = 'info', duration = 2500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ─── XSS 방지 ────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── 뷰 토글 ──────────────────────────────────────
function setupViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view;
      if (view === currentView) return;
      currentView = view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (view === 'week') {
        const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
        currentWeekStart = getWeekStart(base);
      }
      if (view === 'day' && !selectedDate) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        selectedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      }
      await renderView();
    });
  });
}

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

// ─── 다크 모드 ────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const icon = document.getElementById('darkmode-icon');
  if (!icon) return;
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

// ─── Undo 토스트 ──────────────────────────────────
function showUndoToast(message, onUndo, duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast success';
  toast.style.cssText += ';justify-content:space-between;';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);
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

// ─── 오늘 버튼 ────────────────────────────────────
function setupTodayBtn() {
  document.getElementById('today-btn').addEventListener('click', async () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    selectedDate = todayStr;
    currentView = 'month';
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'month'));
    await renderView();
    document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
    document.querySelector('.calendar-day.today')?.classList.add('selected');
    await showDateDetail(todayStr);
  });
}

init();
