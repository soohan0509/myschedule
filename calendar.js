import { supabase, getProfile, requireAuth } from './app.js';
import { fetchTimetable, renderTimetable, isRoutineActive } from './timetable.js';

let routines = [];
let routineExceptions = [];

let profile = null;
let currentClass = 1;
let selectedDate = null;
let selectedSlot = null;
let selectedType = 'class';
let selectedMembers = [];
let selectedFiles = [];
let currentYear, currentMonth;

async function init() {
  const ok = await requireAuth();
  if (!ok) return;

  profile = await getProfile();
  if (!profile) { window.location.href = 'index.html'; return; }

  document.getElementById('user-info').textContent = `${profile.class_num}반 ${profile.seat_num}번 ${profile.name}`;
  if (profile.is_admin) document.getElementById('admin-btn').style.display = '';
  currentClass = profile.class_num;

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  setupTabs();
  setupLogout();
  setupSettings();
  // setupWithdraw는 setupSettings 내부에서 처리
  setupWithdraw();
  setupModal();
  setupRoutineModal();
  setupNotificationBtn();
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
    errEl.textContent = '✅ 이름이 변경됐습니다.';
    errEl.style.color = 'var(--success)';
    errEl.classList.add('show');
    setTimeout(() => { errEl.classList.remove('show'); errEl.style.color = ''; }, 2000);
  });

  // 비밀번호 변경
  document.getElementById('settings-pw-btn').addEventListener('click', async () => {
    const current = document.getElementById('settings-pw-current').value;
    const newPw = document.getElementById('settings-pw-new').value;
    const confirm = document.getElementById('settings-pw-confirm').value;
    const errEl = document.getElementById('settings-pw-error');
    errEl.style.color = '';
    if (!current || !newPw || !confirm) { errEl.textContent = '모든 항목을 입력해주세요.'; errEl.classList.add('show'); return; }
    if (newPw.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다.'; errEl.classList.add('show'); return; }
    if (newPw !== confirm) { errEl.textContent = '새 비밀번호가 일치하지 않습니다.'; errEl.classList.add('show'); return; }
    // 현재 비밀번호 확인
    const email = `c${profile.class_num}n${profile.seat_num}@gbs.kr`;
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authErr) { errEl.textContent = '현재 비밀번호가 올바르지 않습니다.'; errEl.classList.add('show'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { errEl.textContent = '변경 실패: ' + error.message; errEl.classList.add('show'); return; }
    errEl.textContent = '✅ 비밀번호가 변경됐습니다.';
    errEl.style.color = 'var(--success)';
    errEl.classList.add('show');
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

// ─── 캘린더 렌더링 ────────────────────────────────
async function renderCalendar() {
  document.getElementById('month-title').textContent = `${currentYear}년 ${currentMonth + 1}월`;
  const grid = document.getElementById('calendar-grid');
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

  const [{ data: schedules }, { data: memberRows }] = await Promise.all([
    supabase.from('schedules').select('date, type').eq('class_num', currentClass).gte('date', startDate).lte('date', endDate),
    supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted')
  ]);

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
    dotMap[s.date].push(s.type);
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

    d.addEventListener('click', async () => {
      document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
      d.classList.add('selected');
      selectedDate = dateStr;
      await showDateDetail(dateStr);
    });
    grid.appendChild(d);
  }

  document.getElementById('prev-month').onclick = async () => {
    currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    await renderCalendar();
  };
  document.getElementById('next-month').onclick = async () => {
    currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    await renderCalendar();
  };
}

// ─── 날짜 상세 ────────────────────────────────────
async function showDateDetail(date) {
  const panel = document.getElementById('detail-card');
  const [m, d] = [date.slice(5, 7), date.slice(8, 10)];
  panel.innerHTML = `<h3>${parseInt(m)}월 ${parseInt(d)}일</h3><p style="color:var(--text-muted);font-size:0.83rem">불러오는 중...</p>`;

  const [subjectMap, { data: classSchedules }, { data: memberRows }] = await Promise.all([
    fetchTimetable(currentClass, date),
    supabase.from('schedules').select('*, attachments(*)').eq('class_num', currentClass).eq('date', date),
    supabase.from('group_members').select('schedule_id').eq('user_id', profile.id).eq('status', 'accepted')
  ]);

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
    (slot, label, time) => openModal(date, slot, label)
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
          <span class="schedule-card-title">${s.title}</span>
          <span class="slot-badge badge-${s.type}">${typeLabel}</span>
        </div>
        ${s.detail ? `<div class="schedule-card-detail">${s.detail}</div>` : ''}
        ${(s.attachments || []).map(a =>
          `<a class="schedule-card-file" href="${a.file_url}" target="_blank">📎 ${a.file_name}</a>`
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
            await supabase.from('schedules').delete().eq('id', s.id);
            await renderCalendar();
            await showDateDetail(date);
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
  if (!title) { alert('제목을 입력해주세요.'); return; }
  if (selectedType === 'group' && selectedMembers.length === 0) { alert('그룹 멤버를 1명 이상 선택해주세요.'); return; }

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
    created_by: profile.id
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

init();
