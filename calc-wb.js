/* Калькулятор доставки до склада Wildberries.
   Прайс — в window.WB_CALC на странице; здесь только логика.
   Подключается после forms.js: валидация формы берёт его validateFields и isBot. */

(() => {
  const config = window.WB_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const select = root.querySelector('#calcWh');
  const qtyInput = root.querySelector('#calcQty');
  const typeButtons = [...root.querySelectorAll('[data-type]')];
  const totalEl = root.querySelector('#calcTotal');
  const formulaEl = root.querySelector('#calcFormula');
  const noteEl = root.querySelector('#calcNote');
  const form = root.querySelector('.calc__form');
  const rub = (value) => `${value.toLocaleString('ru-RU')} ₽`;
  let type = 'box';

  select.innerHTML = config.warehouses.map((item, index) => `<option value="${index}">${item.name}${item.area ? `, ${item.area}` : ''}</option>`).join('');

  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  function readQty() {
    const qty = Math.round(Number(qtyInput.value));
    return Math.min(config.maxQty, Math.max(1, qty || 1));
  }

  function calculate() {
    const warehouse = config.warehouses[select.value] || config.warehouses[0];
    const qty = readQty();
    let unit = type === 'box' ? warehouse.box : warehouse.pallet;
    let note = '';

    if (type === 'pallet' && warehouse.region) {
      const [, discount] = config.regionDiscounts.find(([from]) => qty >= from) || [0, 0];
      if (discount) {
        unit = Math.round(unit * (1 - discount));
        note = `Учтена скидка ${Math.round(discount * 100)}% за объем отправки.`;
      } else {
        note = 'От 5 паллет в одной отправке действует скидка 5%, от 10 — 7%, от 15 — 10%.';
      }
    }
    if (type === 'pallet' && !warehouse.region) {
      note = 'При объеме свыше 30 паллет за предыдущий месяц действует пониженная ставка — смотрите таблицу тарифов.';
    }

    const unitName = type === 'box' ? plural(qty, ['короб', 'короба', 'коробов']) : plural(qty, ['паллета', 'паллеты', 'паллет']);
    totalEl.textContent = rub(unit * qty);
    formulaEl.textContent = `${rub(unit)} × ${qty} ${unitName} · без НДС`;
    noteEl.textContent = note;
    noteEl.hidden = !note;

    form.elements.warehouse.value = warehouse.name;
    form.elements.cargo.value = type === 'box' ? 'Короба до 20 кг' : 'Паллеты';
    form.elements.quantity.value = String(qty);
  }

  typeButtons.forEach((button) => button.addEventListener('click', () => {
    type = button.dataset.type;
    typeButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('selected', active);
      item.setAttribute('aria-pressed', String(active));
    });
    calculate();
  }));

  root.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
    qtyInput.value = Math.min(config.maxQty, Math.max(1, readQty() + Number(button.dataset.step)));
    calculate();
  }));

  qtyInput.addEventListener('input', calculate);
  qtyInput.addEventListener('blur', () => { qtyInput.value = readQty(); });
  select.addEventListener('change', calculate);

  const fields = [...form.querySelectorAll('input:not([type="hidden"])')].filter((field) => !field.closest('.hp-field'));
  fields.forEach((field) => field.addEventListener('blur', () => validateField(field)));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validateFields(fields) || isBot(form)) return;
    const toast = document.querySelector('.toast');
    toast.textContent = 'Спасибо! Расчет отправлен менеджеру — свяжемся в течение 1 часа.';
    toast.classList.add('is-visible');
    form.reset();
    calculate();
    window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
  });

  calculate();
})();
