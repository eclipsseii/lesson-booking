// Вход
document.getElementById('login').onclick = async function () {
  const loginButton = this;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorBox = document.getElementById('login-error');

  loginButton.disabled = true;
  loginButton.textContent = 'Загрузка...';

  const { error } = await db.auth.signInWithPassword({ email: email, password: password });

  loginButton.disabled = false;
  loginButton.textContent = 'Войти';

  if (error) {
    errorBox.textContent = 'Неверная почта или пароль';
    errorBox.hidden = false;
    return;
  }
  errorBox.hidden = true;
  openTab('requests');
};

document.getElementById('logout').onclick = async function () {
  await db.auth.signOut();
  document.getElementById('tabs').hidden = true;
  showScreen('screen-login');
};


// Вкладки
let currentTab = 'requests';

function openTab(name) {
  currentTab = name;
  document.getElementById('tabs').hidden = false;
  document.getElementById('tab-requests').classList.toggle('active', name === 'requests');
  document.getElementById('tab-schedule').classList.toggle('active', name === 'schedule');
  document.getElementById('tab-slots').classList.toggle('active', name === 'slots');

  if (name === 'requests') {
    showScreen('screen-requests');
    loadRequests();
    return;
  }

  if (name === 'schedule') {
    document.getElementById('day-title').textContent = 'Расписание';
    document.getElementById('day-hint').textContent = 'Открытые окошки и записи';
  } else {
    document.getElementById('day-title').textContent = 'Окошки';
    document.getElementById('day-hint').textContent = 'Включи окошки, на которые можно записаться';
  }
  showScreen('screen-day');
  loadMonth();
}

document.getElementById('tab-requests').onclick = function () { openTab('requests'); };
document.getElementById('tab-schedule').onclick = function () { openTab('schedule'); };
document.getElementById('tab-slots').onclick = function () { openTab('slots'); };


// Заявки
async function loadRequests() {
  const { data, error } = await db
    .from('requests')
    .select('*')
    .gte('slot_date', todayString())
    .neq('status', 'rejected')
    .order('slot_date')
    .order('slot_time');

  if (error) {
    alert('Не получилось загрузить заявки');
    return;
  }

  const box = document.getElementById('requests');
  box.innerHTML = '';

  const pending = data.filter(function (r) { return r.status === 'pending'; });
  document.getElementById('pending-count').textContent = 'ждут: ' + pending.length;

  if (data.length === 0) {
    box.appendChild(el('p', 'muted', 'Пока заявок нет'));
    return;
  }

  const order = { pending: 0, approved: 1, rejected: 2 };
  const titles = { pending: 'Ждут решения', approved: 'Одобренные', rejected: 'Отклонённые' };
  data.sort(function (a, b) {
    if (a.status !== b.status) return order[a.status] - order[b.status];
    if (a.status === 'pending') return a.created_at < b.created_at ? 1 : -1;
    if (a.status === 'rejected') return (a.slot_date + a.slot_time) < (b.slot_date + b.slot_time) ? 1 : -1;
    return (a.slot_date + a.slot_time) < (b.slot_date + b.slot_time) ? -1 : 1;
  });

  let lastStatus = null;

  data.forEach(function (r) {
    if (r.status !== lastStatus) {
      box.appendChild(el('h2', 'group-title', titles[r.status]));
      lastStatus = r.status;
    }

    const card = el('div', 'card');

    const top = el('div', 'row-between');
    top.appendChild(el('b', '', r.name));
    top.appendChild(el('span', 'when', niceDate(r.slot_date) + ' · ' + r.slot_time));
    card.appendChild(top);

    card.appendChild(el('p', 'muted', 'Учитель в школе: ' + r.teacher));

    if (r.comment) {
      card.appendChild(el('p', 'comment', r.comment));
    }

    if (r.status === 'pending') {
      const buttons = el('div', 'two');
      const rejectButton = el('button', 'btn btn-light', 'Отклонить');
      const approveButton = el('button', 'btn', 'Одобрить');
      rejectButton.onclick = function () { setStatus(r.id, 'rejected'); };
      approveButton.onclick = function () { setStatus(r.id, 'approved'); };
      buttons.appendChild(rejectButton);
      buttons.appendChild(approveButton);
      card.appendChild(buttons);
    } else if (r.status === 'approved') {
      card.appendChild(el('p', 'status ok', 'Одобрена'));
      const cancelButton = el('button', 'link-btn danger', 'Отменить запись');
      cancelButton.onclick = function () { cancelRequest(r, loadRequests); };
      card.appendChild(cancelButton);
    } else {
      card.appendChild(el('p', 'status no', 'Отклонена · время снова свободно'));
    }

    box.appendChild(card);
  });
}

// Отмена записи
async function cancelRequest(r, afterDelete) {
  const ok = confirm('Отменить запись: ' + r.name + ', ' + niceDate(r.slot_date) + ' ' + r.slot_time + '?\nОкошко снова станет свободным.');
  if (!ok) return;

  const { error } = await db.from('requests').delete().eq('id', r.id);
  if (error) {
    alert('Не получилось отменить');
    return;
  }
  afterDelete();
}

async function setStatus(id, status) {
  const { error } = await db.from('requests').update({ status: status }).eq('id', id);
  if (error) {
    alert('Не получилось сохранить');
    return;
  }
  loadRequests();
}


// Календарь на месяц
const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let selectedDate = todayString();
let monthOpen = [];
let monthRequests = [];

async function loadMonth() {
  document.getElementById('month-title').textContent = MONTHS[viewMonth] + ' ' + viewYear;

  // назад можно листать только на один месяц
  const monthsBack = (now.getFullYear() - viewYear) * 12 + (now.getMonth() - viewMonth);
  document.getElementById('prev-month').disabled = monthsBack >= 1;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = toDateString(viewYear, viewMonth, 1);
  const lastDay = toDateString(viewYear, viewMonth, daysInMonth);

  const year = viewYear;
  const month = viewMonth;
  monthOpen = [];
  monthRequests = [];
  drawMonth();
  document.getElementById('day-list').innerHTML = '';
  document.getElementById('day-list').appendChild(el('p', 'muted', 'Загружаем...'));

  const results = await Promise.all([
    db.from('open_slots')
      .select('slot_date, slot_time')
      .gte('slot_date', firstDay)
      .lte('slot_date', lastDay),
    db.from('requests')
      .select('id, slot_date, slot_time, name, teacher, comment, status')
      .gte('slot_date', firstDay)
      .lte('slot_date', lastDay)
      .neq('status', 'rejected')
  ]);

  if (year !== viewYear || month !== viewMonth) return;

  if (results[0].error || results[1].error) {
    alert('Не получилось загрузить месяц');
    return;
  }

  monthOpen = results[0].data;
  monthRequests = results[1].data;

  drawMonth();
  drawDay();
}

function drawMonth() {
  const box = document.getElementById('calendar');
  box.innerHTML = '';

  const weekdayOfFirst = new Date(viewYear, viewMonth, 1).getDay();
  const emptyCells = (weekdayOfFirst + 6) % 7;
  for (let i = 0; i < emptyCells; i++) {
    box.appendChild(el('span'));
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateString(viewYear, viewMonth, d);
    const hasOpen = monthOpen.some(function (o) { return o.slot_date === dateStr; });
    const hasRequest = monthRequests.some(function (r) { return r.slot_date === dateStr; });

    const button = el('button', 'day plain', d);
    if (hasOpen) button.classList.add('has-open');
    if (hasRequest) button.classList.add('has-request');
    if (dateStr < todayString()) button.classList.add('past');
    if (dateStr === selectedDate) button.classList.add('selected');

    button.onclick = function () {
      selectedDate = dateStr;
      drawMonth();
      drawDay();
    };
    box.appendChild(button);
  }
}

document.getElementById('prev-month').onclick = function () {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  selectedDate = toDateString(viewYear, viewMonth, 1);
  loadMonth();
};
document.getElementById('next-month').onclick = function () {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  selectedDate = toDateString(viewYear, viewMonth, 1);
  loadMonth();
};


// Выбранный день
function drawDay() {
  document.getElementById('day-label').textContent = niceDate(selectedDate);

  const openTimes = monthOpen
    .filter(function (o) { return o.slot_date === selectedDate; })
    .map(function (o) { return o.slot_time; });
  const requests = monthRequests.filter(function (r) { return r.slot_date === selectedDate; });

  if (currentTab === 'schedule') {
    drawSchedule(openTimes, requests);
  } else {
    drawSlots(openTimes, requests);
  }
}


// Запись в строке: имя, учитель, комментарий
function bookingInfo(request) {
  const box = el('div', 'booking');

  if (request.status === 'approved') {
    box.appendChild(el('span', 'who busy', request.name));
  } else {
    box.appendChild(el('span', 'who', request.name + ' · ждёт'));
  }

  box.appendChild(el('span', 'booking-line', 'Учитель в школе: ' + request.teacher));

  if (request.comment) {
    box.appendChild(el('span', 'booking-comment', request.comment));
  }
  return box;
}

function cancelButtonFor(request) {
  const button = el('button', 'link-btn danger', 'Отменить');
  button.onclick = function () {
    cancelRequest(Object.assign({ slot_date: selectedDate }, request), loadMonth);
  };
  return button;
}


// Прошло ли уже это время сегодня
function isPastTime(dateStr, time) {
  const d = new Date();
  const nowTime = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return dateStr === todayString() && time <= nowTime;
}


// Расписание
function drawSchedule(openTimes, requests) {
  const box = document.getElementById('day-list');
  box.innerHTML = '';
  let shown = 0;

  allTimes().forEach(function (time) {
    const request = requests.find(function (r) { return r.slot_time === time; });
    const isOpen = openTimes.indexOf(time) !== -1;
    if (!request && !isOpen) return;

    const row = el('div', 'slot-row');
    row.appendChild(el('span', 'time', time));

    if (!request) {
      if (isPastTime(selectedDate, time)) {
        row.classList.add('past-row');
        row.appendChild(el('span', 'who', 'прошло'));
      } else {
        row.appendChild(el('span', 'who', 'свободно'));
      }
    } else {
      row.classList.add('booked');
      row.appendChild(bookingInfo(request));
      row.appendChild(cancelButtonFor(request));
    }

    box.appendChild(row);
    shown++;
  });

  if (shown === 0) {
    box.appendChild(el('p', 'muted', 'На этот день окошек нет. Открой их во вкладке «Окошки».'));
  }
}


// Окошки
function drawSlots(openTimes, requests) {
  const box = document.getElementById('day-list');
  box.innerHTML = '';

  if (selectedDate < todayString()) {
    box.appendChild(el('p', 'muted', 'Этот день уже прошёл.'));
    return;
  }

  allTimes().forEach(function (time) {
    const request = requests.find(function (r) { return r.slot_time === time; });
    const isOpen = openTimes.indexOf(time) !== -1;

    const row = el('div', 'slot-row');
    row.appendChild(el('span', 'time', time));

    if (request) {
      row.classList.add('booked');
      row.appendChild(bookingInfo(request));
      row.appendChild(cancelButtonFor(request));
    } else if (isPastTime(selectedDate, time)) {
      row.classList.add('past-row');
      row.appendChild(el('span', 'who', 'прошло'));
    } else {
      row.appendChild(el('span', 'who', isOpen ? 'открыто' : 'закрыто'));

      const toggle = el('button', isOpen ? 'switch on' : 'switch');
      toggle.setAttribute('aria-label', (isOpen ? 'Закрыть ' : 'Открыть ') + time);
      toggle.appendChild(el('span'));
      toggle.onclick = function () { toggleSlot(selectedDate, time, isOpen); };
      row.appendChild(toggle);
    }

    box.appendChild(row);
  });
}

async function toggleSlot(dateStr, time, isOpen) {
  if (isOpen) {
    monthOpen = monthOpen.filter(function (o) {
      return !(o.slot_date === dateStr && o.slot_time === time);
    });
  } else {
    monthOpen.push({ slot_date: dateStr, slot_time: time });
  }
  drawMonth();
  drawDay();

  let result;
  if (isOpen) {
    result = await db.from('open_slots').delete().eq('slot_date', dateStr).eq('slot_time', time);
  } else {
    result = await db.from('open_slots').insert({ slot_date: dateStr, slot_time: time });
  }

  if (result.error) {
    alert('Не получилось сохранить. Проверь интернет.');
    loadMonth();
  }
}


// Старт
async function start() {
  const { data } = await db.auth.getSession();
  if (data.session) {
    openTab('requests');
  } else {
    showScreen('screen-login');
  }
}

start();
