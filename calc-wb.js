/* Калькулятор доставки до склада Wildberries.
   Прайс — в window.WB_CALC на странице; здесь только логика.
   Форму калькулятора отправляет этот скрипт: в Тильде — через FX.send рантайма,
   на статической странице только показывает тост. Контакт обязателен, имя и
   параметры перевозки — нет (п. 17.1 ТЗ от 24.10). */

(() => {
  const config = window.WB_CALC;
  const root = document.querySelector('#calc');
  if (!config || !root) return;

  const select = root.querySelector('#calcWh');
  const qtyInput = root.querySelector('#calcQty');
  const typeButtons = [...root.querySelectorAll('[data-type]')];
  const channelButtons = [...root.querySelectorAll('[data-channel]')];
  const totalEl = root.querySelector('#calcTotal');
  const formulaEl = root.querySelector('#calcFormula');
  const noteEl = root.querySelector('#calcNote');
  const form = root.querySelector('.calc__form');
  const contactInput = form.elements.phone;
  const submitButton = form.querySelector('[type="submit"]');
  const submitLabel = submitButton.innerHTML;
  const rub = (value) => `${value.toLocaleString('ru-RU')} ₽`;
  const texts = {
    idle: 'Выберите склад, тип грузоместа и количество — покажем ориентировочную стоимость.',
    palletTitle: 'Рассчитаем доставку с учётом паллетирования',
    palletText: 'Оставьте контакт — менеджер уточнит объём партии, количество паллет и подготовит предварительный расчёт.',
    individualTitle: 'Индивидуальный расчёт',
    individualText: `От ${config.individualFrom} паллет на региональных направлениях стоимость считает менеджер — оставьте контакт.`,
    moscow: 'Расчёт показан по базовой ставке. Стоимость может быть ниже в зависимости от объёма паллет за предыдущий календарный месяц.',
    success: 'Спасибо! Заявка отправлена. Подготовим предварительный расчёт в течение 30 минут в рабочее время.',
    error: 'Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.',
    ...config.texts
  };
  let type = 'box';
  let channel = 'Телефон';

  select.innerHTML = `<option value="">Выберите склад</option>` +
    config.warehouses.map((item, index) => `<option value="${index}">${item.name}${item.area ? `, ${item.area}` : ''}</option>`).join('');

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

  /* Региональная ставка за паллету по ступени текущей отправки: 1–4, 5–9, 10–14. */
  function regionPallet(warehouse, qty) {
    const [, index] = config.tiers.find(([from]) => qty >= from) || [0, 0];
    return warehouse.tiers[index];
  }

  /* Что показать: число, обращение к менеджеру или подсказку до выбора склада. */
  function estimate() {
    const warehouse = config.warehouses[select.value];
    if (!warehouse) return { state: 'idle' };
    const qty = readQty();

    if (type === 'box') {
      /* Базовая ставка одной паллеты: в регионах — ступень 1–4, по Москве — без месячной скидки. */
      const basePallet = warehouse.region ? warehouse.tiers[0] : warehouse.pallet;
      const sum = warehouse.box * qty;
      if (qty > config.boxLimit || sum >= basePallet) return { state: 'pallet', warehouse, qty };
      return { state: 'price', warehouse, qty, unit: warehouse.box };
    }

    if (warehouse.region) {
      if (qty >= config.individualFrom) return { state: 'individual', warehouse, qty };
      return { state: 'price', warehouse, qty, unit: regionPallet(warehouse, qty) };
    }
    return { state: 'price', warehouse, qty, unit: warehouse.pallet, note: texts.moscow };
  }

  /* Текстовые состояния выводятся в поле суммы — шрифт уменьшаем, чтобы фраза влезла. */
  function setTotal(text, isText) {
    totalEl.textContent = text;
    totalEl.style.fontSize = isText ? 'clamp(24px, 2.4vw, 34px)' : '';
    totalEl.style.letterSpacing = isText ? '-.02em' : '';
    totalEl.style.lineHeight = isText ? '1.15' : '';
  }

  function calculate() {
    const result = estimate();
    const { warehouse, qty } = result;
    const unitName = type === 'box' ? plural(qty, ['короб', 'короба', 'коробов']) : plural(qty, ['паллета', 'паллеты', 'паллет']);

    if (result.state === 'idle') {
      setTotal('—', false);
      formulaEl.textContent = texts.idle;
    } else if (result.state === 'pallet') {
      setTotal(texts.palletTitle, true);
      formulaEl.textContent = texts.palletText;
    } else if (result.state === 'individual') {
      setTotal(texts.individualTitle, true);
      formulaEl.textContent = texts.individualText;
    } else {
      setTotal(rub(result.unit * qty), false);
      formulaEl.textContent = `${rub(result.unit)} × ${qty} ${unitName} · без НДС`;
    }
    noteEl.textContent = result.note || '';
    noteEl.hidden = !result.note;

    /* Параметры уходят менеджеру, только если склад выбран; сумма — только показанная. */
    form.elements.warehouse.value = warehouse ? warehouse.name : '';
    form.elements.cargo.value = warehouse ? (type === 'box' ? 'Короба до 20 кг' : 'Паллеты') : '';
    form.elements.quantity.value = warehouse ? String(qty) : '';
    form.elements.total.value = result.state === 'price' ? `${rub(result.unit * qty)} (${rub(result.unit)} × ${qty} ${unitName}, без НДС)` : '';
  }

  function press(buttons, active) {
    buttons.forEach((item) => {
      item.classList.toggle('selected', item === active);
      item.setAttribute('aria-pressed', String(item === active));
    });
  }

  /* Telegram принимает и телефон, и @username — снимаем с поля маску телефона. */
  function setChannel(value) {
    channel = value;
    press(channelButtons, channelButtons.find((item) => item.dataset.channel === value));
    const telegram = channel === 'Telegram';
    contactInput.type = telegram ? 'text' : 'tel';
    contactInput.inputMode = telegram ? 'text' : 'tel';
    contactInput.autocomplete = telegram ? 'off' : 'tel';
    contactInput.toggleAttribute('data-fx-raw', telegram);
    contactInput.placeholder = telegram ? 'Телефон или @username' : '+7 (___) ___-__-__';
    form.elements.channel.value = channel;
  }

  function phoneDigits(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits;
  }

  function contactError() {
    const value = contactInput.value.trim();
    if (!value) return 'Укажите контакт для связи.';
    if (channel === 'Telegram' && /^@[A-Za-z0-9_]{5,32}$/.test(value)) return '';
    if (phoneDigits(value).length !== 10) {
      return channel === 'Telegram' ? 'Укажите номер телефона или Telegram username в формате @username.' : 'Введите номер телефона полностью.';
    }
    return '';
  }

  function notify(text) {
    if (window.FX && window.FX.toast) {
      window.FX.toast(text);
      return;
    }
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-visible');
    window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
  }

  function details() {
    const lines = [];
    [...form.querySelectorAll('input[type="hidden"]')].forEach((field) => {
      if (field.value && field.dataset.fxLabel) lines.push(`${field.dataset.fxLabel}: ${field.value}`);
    });
    lines.push(`Контакт: ${contactInput.value.trim()}`);
    return lines.join('\n');
  }

  function finish() {
    notify(texts.success);
    form.reset();
    setChannel('Телефон');
    calculate();
  }

  typeButtons.forEach((button) => button.addEventListener('click', () => {
    type = button.dataset.type;
    press(typeButtons, button);
    calculate();
  }));

  channelButtons.forEach((button) => button.addEventListener('click', () => {
    setChannel(button.dataset.channel);
    contactInput.focus();
  }));

  root.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
    qtyInput.value = Math.min(config.maxQty, Math.max(1, readQty() + Number(button.dataset.step)));
    calculate();
  }));

  qtyInput.addEventListener('input', calculate);
  qtyInput.addEventListener('blur', () => { qtyInput.value = readQty(); });
  select.addEventListener('change', calculate);
  contactInput.addEventListener('input', () => contactInput.removeAttribute('aria-invalid'));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.dataset.busy === '1') return;
    const honeypot = form.querySelector('.hp-field input');
    if (honeypot && honeypot.value) return;
    const error = contactError();
    if (error) {
      contactInput.setAttribute('aria-invalid', 'true');
      contactInput.focus();
      notify(error);
      return;
    }
    if (!(window.FX && window.FX.send)) {
      finish();
      return;
    }
    form.dataset.busy = '1';
    submitButton.disabled = true;
    submitButton.textContent = 'Отправляем…';
    window.FX.send({
      formName: form.dataset.formName || 'Калькулятор доставки до склада WB',
      /* Имя необязательно, а поле имени у формы-приёмника Тильды проверяет формат. */
      name: form.elements.name.value.trim() || 'Без имени',
      phone: contactInput.value.trim(),
      details: details()
    }).then(finish, () => notify(texts.error)).then(() => {
      form.dataset.busy = '';
      submitButton.disabled = false;
      submitButton.innerHTML = submitLabel;
    });
  }, true);

  setChannel(channel);
  calculate();
})();
