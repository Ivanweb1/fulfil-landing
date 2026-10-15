/* Калькулятор паллетного хранения.
   Ставки — в window.PALLET_CALC на странице; здесь только логика.
   Подключается после forms.js: валидация формы берёт его validateFields и isBot. */

(() => {
  const config = window.PALLET_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const qtyInput = root.querySelector('#plQty');
  const daysInput = root.querySelector('#plDays');
  const modeButtons = [...root.querySelectorAll('[data-mode]')];
  const totalEl = root.querySelector('#plTotal');
  const formulaEl = root.querySelector('#plFormula');
  const linesEl = root.querySelector('#plLines');
  const noteEl = root.querySelector('#plNote');
  const form = root.querySelector('.calc__form');
  const barFree = root.querySelector('#plBarFree');
  const barPaid = root.querySelector('#plBarPaid');
  const freeText = root.querySelector('#plFreeText');
  const paidText = root.querySelector('#plPaidText');
  const rub = (value) => `${value.toLocaleString('ru-RU')} ₽`;
  let mode = 'ready';

  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }
  const days = (n) => `${n} ${plural(n, ['сутки', 'суток', 'суток'])}`;

  /* Пустое поле, ноль, минус и текст приводятся к минимуму, превышение — к максимуму. */
  function bounded(input, limits) {
    const value = parseInt(String(input.value).replace(/\s/g, ''), 10);
    if (!value || value < limits.min) return { value: limits.min, capped: false };
    if (value > limits.max) return { value: limits.max, capped: true };
    return { value, capped: false };
  }

  function calculate() {
    const qty = bounded(qtyInput, config.qty);
    const term = bounded(daysInput, config.days);
    const paidDays = Math.max(0, term.value - config.freeDays);
    const storage = qty.value * paidDays * config.rate;
    const handling = qty.value * (config.unload + config.accept + config.load);
    const building = qty.value * (config.build[mode] || 0);
    const total = storage + handling + building;
    const places = plural(qty.value, ['паллетоместо', 'паллетоместа', 'паллетомест']);

    /* Шкала срока: доля бесплатных и платных суток */
    const freeShown = Math.min(term.value, config.freeDays);
    barFree.style.width = `${(freeShown / term.value) * 100}%`;
    barPaid.style.width = `${(paidDays / term.value) * 100}%`;
    freeText.textContent = days(freeShown);
    paidText.textContent = paidDays ? `${days(paidDays)} × ${rub(config.rate)} за место` : 'нет';

    totalEl.textContent = rub(total);
    formulaEl.textContent = `${qty.value.toLocaleString('ru-RU')} ${places} за ${days(term.value)}, без НДС`;

    const lines = [`Хранение — ${rub(storage)}${paidDays > 0 ? ` (за ${days(paidDays)}, первые ${config.freeDays} бесплатно)` : ''}`];
    lines.push(`Выгрузка, приемка и погрузка — ${rub(handling)}`);
    if (building) lines.push(`Формирование паллет — ${rub(building)}`);
    linesEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');

    const notes = [];
    if (paidDays === 0) notes.push('Весь срок укладывается в бесплатный период: в счет войдут только операции с паллетами.');
    if (qty.capped) notes.push('Показан расчет на 4 000 мест — это вместимость склада целиком. Под больший объем подбираем площадку отдельно.');
    if (term.capped) notes.push('Показан расчет на 365 суток: более длительное хранение согласовывается отдельно.');
    notes.push('Ставка за паллетоместо предварительная и фиксируется в договоре под ваш объем и срок.');
    noteEl.innerHTML = notes.map((note) => `<span>${note}</span>`).join('');

    form.elements.quantity.value = String(qty.value);
    form.elements.days.value = String(term.value);
    form.elements.arrival.value = modeButtons.find((button) => button.dataset.mode === mode).textContent;
    form.elements.total.value = `${rub(total)} (${qty.value} ${places} за ${days(term.value)}, без НДС)`;
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

  [qtyInput, daysInput].forEach((input) => input.addEventListener('input', calculate));

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
