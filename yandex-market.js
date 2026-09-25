const yandexToast = document.querySelector('.toast');
let yandexToastTimer;

function showYandexToast(message, isError = false) {
  if (!yandexToast) return;
  yandexToast.textContent = message;
  yandexToast.classList.toggle('toast--error', isError);
  yandexToast.classList.add('is-visible');
  window.clearTimeout(yandexToastTimer);
  yandexToastTimer = window.setTimeout(() => yandexToast.classList.remove('is-visible'), 5600);
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10);
}

function formatYandexPhone(value) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  let result = '+7';
  if (digits.length > 0) result += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 4) result += `) ${digits.slice(3, 6)}`;
  if (digits.length >= 7) result += `-${digits.slice(6, 8)}`;
  if (digits.length >= 9) result += `-${digits.slice(8, 10)}`;
  return result;
}

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!input.matches('input[type="tel"], input[inputmode="tel"]') || input.dataset.raw === 'true') return;
  input.value = formatYandexPhone(input.value);
});

function hiddenField(form, name, value) {
  let input = form.querySelector(`input[type="hidden"][name="${name}"]`);
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    form.append(input);
  }
  input.value = value == null ? '' : String(value);
}

function fillTildaDonor(form, payload) {
  const fieldAliases = {
    name: ['name', 'имя', 'fio', 'username'],
    phone: ['phone', 'tel', 'телефон', 'mobile']
  };

  Object.entries(fieldAliases).forEach(([key, aliases]) => {
    const value = payload[key];
    if (!value) return;
    const input = [...form.querySelectorAll('input:not([type="hidden"]), textarea')].find((field) => {
      const fingerprint = `${field.name || ''} ${field.placeholder || ''}`.toLowerCase();
      return aliases.some((alias) => fingerprint.includes(alias));
    });
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      hiddenField(form, key === 'name' ? 'Name' : 'Phone', value);
    }
  });

  hiddenField(form, 'Форма', payload.formName);
  hiddenField(form, 'Источник', payload.source);
  hiddenField(form, 'Страница', `${document.title} — ${location.pathname}`);
  hiddenField(form, 'Детали', payload.details || '');
}

function sendViaTilda(form, payload) {
  return new Promise((resolve, reject) => {
    fillTildaDonor(form, payload);
    const submitter = form.querySelector('[type="submit"]');
    if (!submitter) {
      reject(new Error('tilda-submit-not-found'));
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => finish(false, new Error('tilda-timeout')), 10000);

    function finish(success, error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      form.removeEventListener('tildaform:aftersuccess', onSuccess);
      form.removeEventListener('tildaform:aftererror', onError);
      success ? resolve() : reject(error);
    }

    function onSuccess() { finish(true); }
    function onError() { finish(false, new Error('tilda-submit-failed')); }

    form.addEventListener('tildaform:aftersuccess', onSuccess, { once: true });
    form.addEventListener('tildaform:aftererror', onError, { once: true });
    form.removeAttribute('data-success-popup');
    submitter.click();
  });
}

function sendLead(payload) {
  const donor = [...document.querySelectorAll('form.js-form-proccess')].find((form) => !form.closest('.fx-block'));
  if (donor) return sendViaTilda(donor, payload);

  if (window.FULFIL_LEAD_ENDPOINT) {
    return fetch(window.FULFIL_LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((response) => {
      if (!response.ok) throw new Error(`lead-endpoint-${response.status}`);
    });
  }

  return Promise.reject(new Error('lead-transport-not-configured'));
}

function setFormError(field, message) {
  const holder = field.closest('label') || field.parentElement;
  let error = holder.querySelector('.field-error');
  if (!message) {
    error?.remove();
    field.removeAttribute('aria-invalid');
    return;
  }
  if (!error) {
    error = document.createElement('span');
    error.className = 'field-error';
    holder.append(error);
  }
  error.textContent = message;
  field.setAttribute('aria-invalid', 'true');
}

function validatePageForm(form) {
  let firstInvalid = null;
  form.querySelectorAll('input[required]').forEach((field) => {
    let message = '';
    if (!field.value.trim()) message = 'Заполните поле';
    else if ((field.type === 'tel' || field.inputMode === 'tel') && phoneDigits(field.value).length !== 10) message = 'Введите телефон полностью';
    setFormError(field, message);
    if (message && !firstInvalid) firstInvalid = field;
  });
  firstInvalid?.focus();
  return !firstInvalid;
}

document.querySelectorAll('.lead-card, .final-form').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validatePageForm(form) || form.dataset.busy === 'true') return;

    const button = form.querySelector('[type="submit"]');
    const original = button.innerHTML;
    form.dataset.busy = 'true';
    button.disabled = true;
    button.textContent = 'Отправляем…';

    try {
      await sendLead({
        formName: form.classList.contains('final-form') ? 'Консультация — Яндекс Маркет' : 'Расчёт — Яндекс Маркет',
        source: 'Яндекс Маркет',
        name: form.elements.name?.value.trim() || '',
        phone: form.elements.phone?.value.trim() || '',
        details: 'Источник — Яндекс Маркет'
      });
      form.reset();
      showYandexToast(form.classList.contains('final-form')
        ? 'Спасибо! Менеджер свяжется с вами и подготовит предварительный расчёт в течение 30 минут в рабочее время.'
        : 'Спасибо! Заявка отправлена. Менеджер свяжется с вами и подготовит предварительный расчёт в течение 30 минут в рабочее время.');
    } catch (error) {
      console.error('[yandex-market] Не удалось отправить заявку', error);
      showYandexToast('Не удалось отправить заявку. Данные сохранены — попробуйте ещё раз или позвоните: +7 (926) 535-24-47.', true);
    } finally {
      form.dataset.busy = 'false';
      button.disabled = false;
      button.innerHTML = original;
    }
  });
});

const yandexQuizSteps = [
  {
    question: 'Какую схему работы рассматриваете?',
    hint: 'Можно выбрать несколько вариантов',
    multi: true,
    exclusive: 'Пока не определился — нужна консультация.',
    options: [
      'FBS — хранение и сборка заказов на нашем складе.',
      'FBY — подготовка и поставка товаров на склады Яндекс Маркета.',
      'Экспресс — сборка и передача заказов курьеру Маркета.',
      'Пока не определился — нужна консультация.'
    ]
  },
  {
    question: 'Какой объём товара планируете обрабатывать в месяц?',
    hint: 'Укажите примерный суммарный объём по выбранным моделям',
    options: ['До 5 000 единиц.', '5 001–20 000 единиц.', '20 001–50 000 единиц.', 'Более 50 000 единиц.']
  },
  {
    question: 'Когда планируете запуск проекта?',
    hint: 'Выберите один вариант',
    options: ['Как можно скорее.', 'В течение двух недель.', 'В течение месяца.', 'Позже чем через месяц.']
  },
  {
    question: 'Как удобнее обсудить проект?',
    hint: 'Выберите способ связи и укажите контакт',
    contact: true,
    options: ['Телефон', 'WhatsApp', 'Telegram']
  }
];

const quizContent = document.querySelector('#quizContent');
const quizStepNumber = document.querySelector('#quizStepNum');
const quizProgress = document.querySelector('#quizProgress');
const quizTotal = document.querySelector('#quizTotal');
const quizNext = document.querySelector('#quizNext');
const quizBack = document.querySelector('#quizBack');
const quizHint = document.querySelector('.quiz__hint');
const quizAnswers = yandexQuizSteps.map(() => []);
let quizStep = 0;
let quizSending = false;

function renderYandexProgress() {
  quizStepNumber.textContent = String(quizStep + 1).padStart(2, '0');
  quizTotal.textContent = '04';
  quizProgress.innerHTML = yandexQuizSteps.map((item, index) => `<i class="${index <= quizStep ? 'is-done' : ''}"></i>`).join('');
}

function quizError(message = '') {
  const error = quizContent.querySelector('.quiz__error');
  if (error) error.textContent = message;
}

function contactMarkup() {
  const channel = quizAnswers[3][0] || '';
  const telegram = channel === 'Telegram';
  const disabled = !channel;
  const placeholder = telegram ? 'Телефон или @username' : (disabled ? 'Сначала выберите способ связи' : '+7 (___) ___-__-__');
  const savedName = quizContent.dataset.contactName || '';
  const savedContact = quizContent.dataset.contactValue || '';
  return `<div class="quiz__contact">
    <label><span class="sr-only">Ваше имя</span><input name="quiz-name" autocomplete="name" placeholder="Ваше имя — необязательно" value="${savedName.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></label>
    <label><span class="sr-only">Контакт</span><input name="quiz-contact" ${telegram ? 'type="text" data-raw="true"' : 'type="tel" inputmode="tel"'} autocomplete="${telegram ? 'off' : 'tel'}" placeholder="${placeholder}" value="${savedContact.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" ${disabled ? 'disabled' : ''} required></label>
  </div>`;
}

function renderYandexQuiz() {
  const step = yandexQuizSteps[quizStep];
  const options = step.options.map((option) => `<button class="quiz__option${quizAnswers[quizStep].includes(option) ? ' selected' : ''}" type="button" data-option="${option.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${option}</button>`).join('');
  const body = step.contact
    ? `<div class="quiz__contact-wrap"><div class="quiz__options">${options}</div>${contactMarkup()}<p class="quiz__privacy">Нажимая на кнопку, вы соглашаетесь с <a href="/privacy-policy/" target="_blank" rel="noopener">политикой конфиденциальности</a></p><p class="quiz__error" role="alert"></p></div>`
    : `<div class="quiz__options">${options}</div><p class="quiz__error" role="alert"></p>`;

  quizContent.innerHTML = `<div class="quiz__question">${step.question}</div>${body}`;
  quizHint.textContent = step.hint;
  quizHint.classList.remove('is-hidden');
  quizBack.disabled = quizStep === 0;
  quizBack.hidden = false;
  quizNext.hidden = false;
  quizNext.disabled = false;
  quizNext.innerHTML = step.contact ? 'Получить предварительный расчёт <span>↗</span>' : 'Следующий вопрос <span>→</span>';
  renderYandexProgress();
}

quizContent?.addEventListener('input', (event) => {
  if (event.target.name === 'quiz-name') quizContent.dataset.contactName = event.target.value;
  if (event.target.name === 'quiz-contact') quizContent.dataset.contactValue = event.target.value;
  quizError();
});

quizContent?.addEventListener('click', (event) => {
  const option = event.target.closest('.quiz__option');
  if (!option) return;
  const step = yandexQuizSteps[quizStep];
  const value = option.dataset.option;
  const answers = quizAnswers[quizStep];

  if (!step.multi) {
    answers.splice(0, answers.length, value);
  } else if (value === step.exclusive) {
    answers.splice(0, answers.length, value);
  } else {
    const exclusiveIndex = answers.indexOf(step.exclusive);
    if (exclusiveIndex !== -1) answers.splice(exclusiveIndex, 1);
    const valueIndex = answers.indexOf(value);
    if (valueIndex === -1) answers.push(value);
    else answers.splice(valueIndex, 1);
  }

  renderYandexQuiz();
});

function validQuizContact() {
  const channel = quizAnswers[3][0];
  const value = (quizContent.dataset.contactValue || '').trim();
  if (!channel) return 'Выберите способ связи.';
  if (!value) return 'Укажите контакт для связи.';
  if (channel === 'Telegram') {
    const isUsername = /^@[A-Za-z0-9_]{5,32}$/.test(value);
    if (!isUsername && phoneDigits(value).length !== 10) return 'Укажите номер телефона или Telegram username в формате @username.';
  } else if (phoneDigits(value).length !== 10) {
    return 'Введите номер телефона полностью.';
  }
  return '';
}

quizNext?.addEventListener('click', async () => {
  if (quizSending) return;
  if (!quizAnswers[quizStep].length) {
    quizError(quizStep === 3 ? 'Выберите способ связи.' : 'Выберите хотя бы один вариант.');
    return;
  }

  if (quizStep < yandexQuizSteps.length - 1) {
    quizStep += 1;
    renderYandexQuiz();
    return;
  }

  const validationMessage = validQuizContact();
  if (validationMessage) {
    quizError(validationMessage);
    quizContent.querySelector('[name="quiz-contact"]')?.focus();
    return;
  }

  quizSending = true;
  quizNext.disabled = true;
  quizNext.textContent = 'Отправляем…';
  const details = [
    `Модель работы — ${quizAnswers[0].join(', ')}`,
    `Месячный объём — ${quizAnswers[1][0]}`,
    `Срок запуска — ${quizAnswers[2][0]}`,
    `Способ связи — ${quizAnswers[3][0]}`,
    `Контакт — ${(quizContent.dataset.contactValue || '').trim()}`,
    `Источник — Яндекс Маркет`
  ].join('\n');

  try {
    await sendLead({
      formName: 'Квиз — Яндекс Маркет',
      source: 'Яндекс Маркет',
      name: (quizContent.dataset.contactName || '').trim(),
      phone: (quizContent.dataset.contactValue || '').trim(),
      details
    });
    quizContent.innerHTML = `<div class="quiz__success"><div class="quiz__question">Спасибо! Заявка отправлена.</div><p>Менеджер свяжется с вами и подготовит предварительный расчёт в течение 30 минут в рабочее время.</p></div>`;
    quizHint.classList.add('is-hidden');
    quizBack.hidden = true;
    quizNext.hidden = true;
    quizProgress.querySelectorAll('i').forEach((item) => item.classList.add('is-done'));
  } catch (error) {
    console.error('[yandex-market] Не удалось отправить квиз', error);
    quizError('Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз. Введённые данные сохранены.');
    quizNext.disabled = false;
    quizNext.innerHTML = 'Повторить отправку <span>↗</span>';
  } finally {
    quizSending = false;
  }
});

quizBack?.addEventListener('click', () => {
  if (quizSending || quizStep === 0) return;
  quizStep -= 1;
  renderYandexQuiz();
});

if (quizContent) renderYandexQuiz();
