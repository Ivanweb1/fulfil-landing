/* Калькулятор переупаковки.
   Прайс — в window.REPACK_CALC на странице; здесь только логика.
   Подключается после forms.js: валидация формы берёт его validateFields и isBot. */

(() => {
  const config = window.REPACK_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const volInput = root.querySelector('#rpVol');
  const matSelect = root.querySelector('#rpMat');
  const qtyInput = root.querySelector('#rpQty');
  const markSelect = root.querySelector('#rpMark');
  const checkBox = root.querySelector('#rpCheck');
  const oddBox = root.querySelector('#rpOdd');
  const totalEl = root.querySelector('#rpTotal');
  const formulaEl = root.querySelector('#rpFormula');
  const linesEl = root.querySelector('#rpLines');
  const noteEl = root.querySelector('#rpNote');
  const form = root.querySelector('.calc__form');

  const money = (value) => (Math.round(value * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const rub = (value) => `${money(value)} ₽`;
  const range = (min, max, odd) => (odd ? `${money(min)}–${money(max)} ₽` : rub(min));

  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  /* Пустое поле, ноль, минус и текст приводятся к минимуму, превышение — к максимуму.
     Запятая принимается как десятичный разделитель, пробелы между разрядами отбрасываются. */
  function bounded(input, limits, isFloat) {
    const raw = String(input.value).replace(/\s/g, '').replace(',', '.');
    const value = isFloat ? parseFloat(raw) : parseInt(raw, 10);
    if (!value || value < limits.min) return { value: limits.min, capped: false };
    if (value > limits.max) return { value: limits.max, capped: true };
    return { value, capped: false };
  }

  /* Ставка по ступени объема; свыше 50 л — ставка на 50 л плюс доплата за каждый литр сверх. */
  function filmRate(volume, material) {
    const step = config.film.find(([upTo]) => volume <= upTo);
    if (step) return step[1][material];
    const [limit, rates] = config.film[config.film.length - 1];
    return rates[material] + config.over50[material] * (volume - limit);
  }

  function calculate() {
    const volume = bounded(volInput, config.volume, true);
    const qty = bounded(qtyInput, config.qty, false);
    const material = Number(matSelect.value);
    const mark = Number(markSelect.value);
    const check = checkBox.checked ? config.check : 0;
    const odd = oddBox.checked;

    /* Скидка за партию относится только к упаковке, не к маркировке и осмотру */
    const [, discount] = config.batchDiscounts.find(([from]) => qty.value >= from) || [0, 0];
    const film = filmRate(volume.value, material) * (1 - discount);
    const filmMin = film * (odd ? config.odd[0] : 1);
    const filmMax = film * (odd ? config.odd[1] : 1);
    const unitMin = filmMin + mark + check;
    const unitMax = filmMax + mark + check;
    const units = plural(qty.value, ['единица', 'единицы', 'единиц']);

    totalEl.textContent = range(unitMin * qty.value, unitMax * qty.value, odd);
    totalEl.classList.toggle('calc__total--range', odd);
    formulaEl.textContent = `Партия ${qty.value.toLocaleString('ru-RU')} ${units}, ${range(unitMin, unitMax, odd)} за единицу, без НДС`;

    const lines = [`Упаковка — ${range(filmMin, filmMax, odd)}${discount ? `, с учетом скидки ${Math.round(discount * 100)}% за партию` : ''}`];
    if (mark) lines.push(`Маркировка — ${rub(mark)}`);
    if (check) lines.push(`Визуальный осмотр — ${rub(check)}`);
    linesEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');

    const notes = [];
    if (odd) notes.push('Для нестандартной формы ставка на упаковку выше на 20–50%, точный коэффициент определяется по образцу товара.');
    if (!discount) notes.push('Скидка за партию начинается с 1 001 единицы.');
    if (volume.capped) notes.push('Показан расчет для 200 литров: крупногабаритный товар считается индивидуально.');
    if (qty.capped) notes.push('Показан расчет на 1 000 000 единиц: для большей партии условия согласовываются отдельно.');
    notes.push('Снятие старой упаковки считается отдельно по партии.');
    noteEl.innerHTML = notes.map((note) => `<span>${note}</span>`).join('');

    form.elements.volume.value = `${money(volume.value)} л`;
    form.elements.material.value = matSelect.options[matSelect.selectedIndex].text;
    form.elements.quantity.value = String(qty.value);
    form.elements.marking.value = markSelect.options[markSelect.selectedIndex].text;
    form.elements.inspection.value = check ? 'Да' : 'Нет';
    form.elements.odd_shape.value = odd ? 'Да' : 'Нет';
    form.elements.total.value = `${range(unitMin * qty.value, unitMax * qty.value, odd)} (${range(unitMin, unitMax, odd)} за единицу, без НДС)`;
  }

  [volInput, qtyInput].forEach((input) => input.addEventListener('input', calculate));
  [matSelect, markSelect, checkBox, oddBox].forEach((input) => input.addEventListener('change', calculate));

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
