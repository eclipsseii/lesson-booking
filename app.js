const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let selectedDate = null;
let selectedTime = null;
let free = [];
const monthCache = {};

// Статистика: случайный номер визита, без личных данных
const visitId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const device = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

function track(event) {
  db.from('events').insert({
    visit_id: visitId,
    event: event,
    slot_date: selectedDate,
    slot_time: selectedTime,
    device: device
  }).then(function () {});
}

function fetchMonth(year, month) {
  const key = year + '-' + month;
  if (!monthCache[key]) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    monthCache[key] = db.rpc('get_free_slots', {
      from_date: toDateString(year, month, 1),
      to_date: toDateString(year, month, daysInMonth)
    });
  }
  return monthCache[key];
}

async function loadMonth(fresh) {
  const year = viewYear;
  const month = viewMonth;

  document.getElementById('month-title').textContent = MONTHS[month] + ' ' + year;
  document.getElementById('prev-month').disabled =
    year === now.getFullYear() && month === now.getMonth();

  if (fresh) delete monthCache[year + '-' + month];

  free = [];
  drawCalendar();
  document.getElementById('slots').innerHTML = '';
  document.getElementById('slots').appendChild(el('p', 'muted', 'Загружаем расписание...'));

  const { data, error } = await fetchMonth(year, month);

  if (year !== viewYear || month !== viewMonth) return;

  if (error) {
    delete monthCache[year + '-' + month];
    alert('Не получилось загрузить расписание. Обновите страницу.');
    return;
  }
  free = data;

  drawCalendar();
  drawSlots();

  fetchMonth(month === 11 ? year + 1 : year, (month + 1) % 12);
}

function freeTimes(dateStr) {
  const nowTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  return allTimes().filter(function (time) {
    const isFree = free.some(function (slot) {
      return slot.slot_date === dateStr && slot.slot_time === time;
    });
    const isPast = dateStr === todayString() && time <= nowTime;
    return isFree && !isPast;
  });
}

function drawCalendar() {
  const box = document.getElementById('calendar');
  box.innerHTML = '';

  const weekdayOfFirst = new Date(viewYear, viewMonth, 1).getDay();
  const emptyCells = (weekdayOfFirst + 6) % 7;
  for (let i = 0; i < emptyCells; i++) {
    box.appendChild(el('span'));
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateString(viewYear, viewMonth, day);
    const canBook = dateStr >= todayString() && freeTimes(dateStr).length > 0;

    if (!canBook) {
      box.appendChild(el('span', 'day off', day));
      continue;
    }

    const button = el('button', 'day', day);
    if (dateStr === selectedDate) button.classList.add('selected');
    button.onclick = function () {
      selectedDate = dateStr;
      selectedTime = null;
      drawCalendar();
      drawSlots();
      track('day_selected');
    };
    box.appendChild(button);
  }
}

function drawSlots() {
  const box = document.getElementById('slots');
  box.innerHTML = '';

  if (!selectedDate) {
    document.getElementById('day-label').textContent = '';
    box.appendChild(el('p', 'muted', 'Сначала выберите день в календаре'));
    updateNextButton();
    return;
  }

  document.getElementById('day-label').textContent = niceDate(selectedDate);

  freeTimes(selectedDate).forEach(function (time) {
    const button = el('button', 'slot', time);
    if (time === selectedTime) button.classList.add('selected');
    button.onclick = function () {
      selectedTime = time;
      drawSlots();
      track('time_selected');
    };
    box.appendChild(button);
  });

  updateNextButton();
}

function updateNextButton() {
  const button = document.getElementById('to-form');
  if (selectedDate && selectedTime) {
    button.disabled = false;
    button.textContent = 'Дальше · ' + niceDate(selectedDate) + ', ' + selectedTime;
  } else {
    button.disabled = true;
    button.textContent = 'Выберите день и время';
  }
}

document.getElementById('prev-month').onclick = function () {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  loadMonth();
};

document.getElementById('next-month').onclick = function () {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  loadMonth();
};

document.getElementById('to-form').onclick = function () {
  document.getElementById('chosen-label').textContent = niceDate(selectedDate) + ' · ' + selectedTime;
  document.getElementById('form-error').hidden = true;
  showScreen('screen-form');
  track('form_opened');
};

document.getElementById('back').onclick = function () { showScreen('screen-day'); };
document.getElementById('change').onclick = function () { showScreen('screen-day'); };

document.getElementById('other-day').onclick = function () {
  selectedDate = null;
  selectedTime = null;
  loadMonth(true);
  showScreen('screen-day');
};

document.getElementById('comment').oninput = function () {
  document.getElementById('counter').textContent = this.value.length + '/200';
};

document.getElementById('send').onclick = async function () {
  const sendButton = this;
  const errorBox = document.getElementById('form-error');
  const name = document.getElementById('name').value.trim();
  const teacher = document.getElementById('teacher').value.trim();
  const comment = document.getElementById('comment').value.trim();

  if (!name || !teacher) {
    errorBox.textContent = 'Заполните фамилию с именем и учителя';
    errorBox.hidden = false;
    return;
  }

  sendButton.disabled = true;
  sendButton.textContent = 'Отправляем...';

  const { data, error } = await db.rpc('send_request', {
    p_date: selectedDate,
    p_time: selectedTime,
    p_name: name,
    p_teacher: teacher,
    p_comment: comment
  });

  sendButton.disabled = false;
  sendButton.textContent = 'Отправить заявку';

  if (error) {
    errorBox.textContent = 'Что-то пошло не так. Попробуйте ещё раз.';
    errorBox.hidden = false;
  } else if (data === 'ok') {
    track('request_sent');
    document.getElementById('done-date').textContent = niceDate(selectedDate);
    document.getElementById('done-time').textContent = selectedTime;
    showScreen('screen-done');
  } else if (data === 'already') {
    track('request_already');
    showScreen('screen-already');
  } else if (data === 'busy') {
    track('request_busy');
    alert('Это время только что заняли. Выберите другое.');
    selectedTime = null;
    loadMonth(true);
    showScreen('screen-day');
  } else {
    errorBox.textContent = 'Проверьте, что всё заполнено правильно.';
    errorBox.hidden = false;
  }
};

track('page_open');
loadMonth();