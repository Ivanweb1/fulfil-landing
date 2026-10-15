/* Калькулятор ответственного хранения.
   Шкала ставок — в window.STORAGE_CALC на странице; здесь только логика.
   Подключается после forms.js: валидация формы берёт его validateFields и isBot. */

(() => {
  const config = window.STORAGE_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const volInput = root.querySelector('#stVol');
  const daysInput = root.querySelector('#stDays');
  const modeButtons = [...root.querySelectorAll('[data-mode]')];
  const totalEl = root.querySelector('#stTotal');
  const formulaEl = root.querySelector('#stFormula');
  const linesEl = root.querySelector('#stLines');
  const noteEl = root.querySelector('#stNote');
  const barEl = root.querySelector('#stBar');
  const legendEl = root.querySelector('#stLegend');
  const form = root.querySelector('.calc__form');
  const rub = (value) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
  let mode = 'sale';

  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }
  const days = (n) => `${n} ${plural(n, ['сутки', 'суток', 'суток'])}`;
  const cubes = (n) => `${n} ${plural(n, ['кубометр', 'кубометра', 'кубометров'])}`;

  /* Пустое поле, ноль, минус и текст приводятся к минимуму, превышение — к максимуму. */
  function bounded(input, limits) {
    const value = parseInt(String(input.value).replace(/\s/g, ''), 10);
    if (!value || value < limits.min) return { value: limits.min, capped: false };
    if (value > limits.max) return { value: limits.max, capped: true };
    return { value, capped: false };
  }

  /* Сумма по диапазонам шкалы: ставка следующего диапазона действует только
     для последующих суток, прошлые дни не пересчитываются. */
  function split(scale, term) {
    const parts = [];
    let prev = 0;
    for (const [upTo, rate] of scale) {
      const inRange = Math.min(term, upTo === null ? Infinity : upTo) - prev;
      if (inRange <= 0) break;
      parts.push({ days: inRange, rate });
      prev += inRange;
    }
    return parts;
  }

  function calculate() {
    const vol = bounded(volInput, config.volume);
    const term = bounded(daysInput, config.days);
    const parts = split(config.scales[mode], term.value);
    const total = parts.reduce((sum, part) => sum + part.days * part.rate, 0) * vol.value;
    const freeDays = parts.filter((part) => part.rate === 0).reduce((sum, part) => sum + part.days, 0);
    const paidDays = term.value - freeDays;

    totalEl.textContent = rub(total);
    formulaEl.textContent = `Хранение ${cubes(vol.value)} за ${days(term.value)}, без НДС`;

    const lines = [];
    if (freeDays > 0 && paidDays > 0) {
      lines.push(`Бесплатно — ${days(freeDays)}, оплачиваются ${paidDays}`);
      lines.push(`Средняя ставка за весь срок — ${rub(total / vol.value / term.value)} за кубометр в сутки`);
    } else if (paidDays > 0) {
      lines.push(`Оплачиваются все ${days(paidDays)} по ${rub(parts[0].rate)} за кубометр`);
    }
    linesEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');
    linesEl.hidden = !lines.length;

    const notes = [];
    if (freeDays > 0 && paidDays === 0) notes.push('Весь срок укладывается в бесплатный период: за такую партию хранение не тарифицируется.');
    if (mode === 'long') notes.push('Ровная ставка 60 ₽ действует с первых суток: бесплатной недели на долгосрочном хранении нет.');
    if (mode === 'sale' && term.value > 45) {
      const alt = config.scales.long[0][1] * term.value * vol.value;
      if (alt < total) notes.push(`На таком сроке долгосрочное хранение обошлось бы в ${rub(alt)} — оно выгоднее, если поштучный подбор с партии не идет.`);
    }
    if (vol.capped) notes.push('Показан расчет на 500 кубометров: больший объем считается индивидуально, напишите менеджеру.');
    if (term.capped) notes.push('Показан расчет на 365 суток: более длительное хранение согласовывается отдельно.');
    notes.push('В сумму не входят приемка, подбор и погрузочные работы — они считаются по прайсу отдельно.');
    noteEl.innerHTML = notes.map((note) => `<span>${note}</span>`).join('');

    /* Шкала срока: сегмент на каждый диапазон, бесплатные сутки — зеленым */
    barEl.innerHTML = parts.map((part, index) => `<i class="calc__seg calc__seg--${part.rate === 0 ? 'free' : `paid-${Math.min(index, 5)}`}" style="width:${(part.days / term.value) * 100}%" title="${days(part.days)} по ${rub(part.rate)}"></i>`).join('');
    legendEl.innerHTML = parts.map((part, index) => `<span><b class="calc__dot calc__seg--${part.rate === 0 ? 'free' : `paid-${Math.min(index, 5)}`}"></b>${days(part.days)}<em>${part.rate === 0 ? 'бесплатно' : `по ${rub(part.rate)}`}</em></span>`).join('');

    form.elements.mode.value = modeButtons.find((button) => button.dataset.mode === mode).textContent;
    form.elements.volume.value = `${vol.value} м³`;
    form.elements.days.value = String(term.value);
    form.elements.total.value = `${rub(total)} (${cubes(vol.value)} за ${days(term.value)}, без НДС)`;
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    modeButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('selected', active);
      item.setAttribute('aria-pressed', String(active));
    });
    calculate();
  }));

  [volInput, daysInput].forEach((input) => input.addEventListener('input', calculate));

  /* После отправки форма очищается вместе со скрытыми полями — пересчитываем. */
  form.addEventListener('reset', () => window.setTimeout(calculate));

  /* На статической странице заявку проверяет forms.js и показывает тост этот скрипт.
     В Тильде forms.js нет: форму отправляет fx-runtime (по data-fx-form). */
  if (typeof validateFields === 'function') {
    const fields = [...form.querySelectorAll('input:not([type="hidden"])')].filter((field) => !field.closest('.hp-field'));
    fields.forEach((field) => field.addEventListener('blur', () => validateField(field)));

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validateFields(fields) || isBot(form)) return;
      const toast = document.querySelector('.toast');
      toast.textContent = 'Спасибо! Расчет отправлен менеджеру — свяжемся в течение 1 часа.';
      toast.classList.add('is-visible');
      form.reset();
      window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
    });
  }

  calculate();
})();
