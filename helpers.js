// =====================================================
// Маленькие помощники, которые нужны и ученикам, и админке
// =====================================================

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Показать один экран, остальные спрятать
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (screen) {
    screen.hidden = screen.id !== id;
  });
}

// (2026, 10, 7) → '2026-11-07'   (месяцы в JavaScript считаются с 0)
function toDateString(year, month, day) {
  return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

// Сегодняшняя дата в виде '2026-10-27'
function todayString() {
  const now = new Date();
  return toDateString(now.getFullYear(), now.getMonth(), now.getDate());
}

// '2026-11-07' → 'Сб, 7 ноября'
function niceDate(dateStr) {
  const parts = dateStr.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return WEEKDAYS_SHORT[date.getDay()] + ', ' + date.getDate() + ' ' + MONTHS_OF[date.getMonth()];
}

// Все окошки дня: ['10:00', '10:30', ... '18:30']
function allTimes() {
  const times = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    times.push(String(hour).padStart(2, '0') + ':00');
    times.push(String(hour).padStart(2, '0') + ':30');
  }
  return times;
}

// Создать элемент: el('p', 'muted', 'текст').
// textContent безопасен: если кто-то впишет в имя код, он покажется просто текстом
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
