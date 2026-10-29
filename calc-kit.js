/* Калькулятор копакинга.
   Прайс — в window.KIT_CALC на странице; здесь только логика.
   Подключается после forms.js: валидация формы берёт его validateFields и isBot. */

(() => {
  const config = window.KIT_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const unitsInput = root.querySelector('#kpUnits');
  const qtyInput = root.querySelector('#kpQty');
  const packSelect = root.querySelector('#kpPack');
  const markSelect = root.querySelector('#kpMark');
  const recvBox = root.querySelector('#kpRecv');
  const totalEl = root.querySelector('#kpTotal');
  const formulaEl = root.querySelector('#kpFormula');
  const linesEl = root.querySelector('#kpLines');
  const noteEl = root.querySelector('#kpNote');
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
    if (!value || value < limits.min) return { value: limits.min, raised: true, capped: false };
    if (value > limits.max) return { value: limits.max, raised: false, capped: true };
    return { value, raised: false, capped: false };
  }

  function calculate() {
    const units = bounded(unitsInput, config.units);
    const qty = bounded(qtyInput, config.qty);
    const n = units.value;
    const q = qty.value;
    const pack = packSelect.value;
    const mark = Number(markSelect.value);
    const recv = recvBox.checked;

    const assembly = config.assembly.base + Math.max(0, n - config.assembly.baseUnits) * config.assembly.extra;
    const receiving = recv ? n * config.receiving : 0;

    /* Скидка за партию в прайсе действует только на упаковку в пленку */
    let packing = 0;
    let packLine = '';
    if (pack === 'zip') {
      packing = config.zip;
      packLine = `Зип-пакет заказчика, работа — ${rub(packing)}`;
    } else if (config.film[pack]) {
      const [, discount] = config.filmDiscounts.find(([from]) => q >= from) || [0, 0];
      const [rate, label] = config.film[pack];
      packing = rate * (1 - discount);
      packLine = `Термоусадка ${label} — ${rub(packing)}${discount ? `, с учетом скидки ${Math.round(discount * 100)}% за партию` : ''}`;
    }

    const perKit = assembly + receiving + packing + mark;
    const kits = plural(q, ['набор', 'набора', 'наборов']);

    totalEl.textContent = rub(perKit * q);
    formulaEl.textContent = `${q.toLocaleString('ru-RU')} ${kits}, ${rub(perKit)} за набор, без НДС`;

    /* От 2 до 20 единиц после «из» — всегда родительный падеж множественного числа */
    const lines = [`Сборка набора из ${n} единиц — ${rub(assembly)}`];
    if (receiving) lines.push(`Приемка ${n} × ${config.receiving} ₽ — ${rub(receiving)}`);
    if (packLine) lines.push(packLine);
    if (mark) lines.push(`${mark === 8 ? 'Штрихкод и код Честного Знака' : 'Штрихкод набора'} — ${rub(mark)}`);
    linesEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');

    const notes = [];
    if (units.raised) notes.push('В наборе минимум две единицы: расчет показан для двух.');
    if (units.capped) notes.push('Показан расчет для 20 единиц: набор крупнее считаем по спецификации.');
    if (qty.capped) notes.push('Показан расчет на 1 000 000 наборов: для большей партии условия согласовываются отдельно.');
    if (n * q < config.minUnits) notes.push(`Минимальная партия для обработки — от ${config.minUnits} единиц товара, в этой партии ${n * q}.`);
    if (recv) notes.push('Если вы работаете с нами по FBS, приемка считается по тарифу FBS.');
    notes.push('Вложение листовки или открытки считается единицей набора: добавьте его в число единиц. Подарочные коробки и доставка на склад площадки в расчет не входят.');
    noteEl.innerHTML = notes.map((note) => `<span>${note}</span>`).join('');

    form.elements.units.value = String(n);
    form.elements.quantity.value = String(q);
    form.elements.packing.value = packSelect.options[packSelect.selectedIndex].text;
    form.elements.marking.value = markSelect.options[markSelect.selectedIndex].text;
    form.elements.receiving.value = recv ? 'Да' : 'Нет';
    form.elements.per_kit.value = `${rub(perKit)} без НДС`;
    form.elements.total.value = `${rub(perKit * q)} без НДС`;
  }

  [unitsInput, qtyInput].forEach((input) => input.addEventListener('input', calculate));
  [packSelect, markSelect, recvBox].forEach((input) => input.addEventListener('change', calculate));

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
