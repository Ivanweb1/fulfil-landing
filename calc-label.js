/* Калькулятор печати этикеток.
   Прайс — в window.LABEL_CALC на странице; здесь только логика.
   Подключается после forms.js: валидация формы берёт его validateFields и isBot. */

(() => {
  const config = window.LABEL_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const qtyInput = root.querySelector('#lbQty');
  const markSelect = root.querySelector('#lbMark');
  const tagBox = root.querySelector('#lbTag');
  const scanBox = root.querySelector('#lbScan');
  const totalEl = root.querySelector('#lbTotal');
  const formulaEl = root.querySelector('#lbFormula');
  const linesEl = root.querySelector('#lbLines');
  const noteEl = root.querySelector('#lbNote');
  const form = root.querySelector('.calc__form');

  const money = (value) => (Math.round(value * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const rub = (value) => `${money(value)} ₽`;

  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  /* Пустое поле, ноль, минус и текст приводятся к минимуму, превышение — к максимуму.
     Пробелы между разрядами отбрасываются. */
  function bounded(input, limits) {
    const value = parseInt(String(input.value).replace(/\s/g, ''), 10);
    if (!value || value < limits.min) return { value: limits.min, capped: false };
    if (value > limits.max) return { value: limits.max, capped: true };
    return { value, capped: false };
  }

  function calculate() {
    const qty = bounded(qtyInput, config.qty);
    const q = qty.value;
    const mark = config.marks[markSelect.value] || 0;
    const tag = tagBox.checked ? config.tag : 0;
    const scan = scanBox.checked ? config.scan : 0;
    const unit = mark + tag + scan;

    const lines = [];
    if (mark) lines.push(`${markSelect.value === 'both' ? 'Штрихкод и код Честного Знака' : 'Штрихкод или код Честного Знака'} — ${rub(mark)}`);
    if (tag) lines.push(`Бирка — ${rub(tag)}`);
    if (scan) lines.push(`Сканирование кода Честного Знака — ${rub(scan)}`);

    const notes = [];
    /* Без единой операции считать нечего: подсказка вместо нуля рублей */
    if (!unit) {
      totalEl.textContent = '—';
      formulaEl.textContent = 'Выберите хотя бы одну операцию: штрихкод, бирку или сканирование кода.';
    } else {
      totalEl.textContent = rub(unit * q);
      formulaEl.textContent = `${q.toLocaleString('ru-RU')} ${plural(q, ['единица', 'единицы', 'единиц'])}, ${rub(unit)} за единицу, без НДС`;
    }
    linesEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');
    linesEl.hidden = !lines.length;

    if (qty.capped) notes.push('Показан расчет на 1 000 000 единиц: для большей партии условия согласовываются отдельно.');
    notes.push('Если товар отгружается по FBS с нашего склада, транспортный штрихкод на отправление уже входит в тариф обработки заказа.');
    noteEl.innerHTML = notes.map((note) => `<span>${note}</span>`).join('');

    form.elements.quantity.value = String(q);
    form.elements.marking.value = markSelect.options[markSelect.selectedIndex].text;
    form.elements.tag.value = tagBox.checked ? 'Да' : 'Нет';
    form.elements.scan.value = scanBox.checked ? 'Да' : 'Нет';
    form.elements.per_unit.value = unit ? `${rub(unit)} без НДС` : 'Операция не выбрана';
    form.elements.total.value = unit ? `${rub(unit * q)} без НДС` : 'Операция не выбрана';
  }

  qtyInput.addEventListener('input', calculate);
  [markSelect, tagBox, scanBox].forEach((input) => input.addEventListener('change', calculate));

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
