/* Валидация и телефонная маска для форм страницы.
   Подключается ПЕРЕД script.js: обработчики регистрируются раньше, поэтому
   невалидная отправка останавливается до показа тоста. */

const phonePattern = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10);
  if (!digits) return '';
  let result = '+7';
  if (digits.length > 0) result += ` (${digits.slice(0, 3)}`;
  if (digits.length >= 4) result += `) ${digits.slice(3, 6)}`;
  if (digits.length >= 7) result += `-${digits.slice(6, 8)}`;
  if (digits.length >= 9) result += `-${digits.slice(8, 10)}`;
  return result;
}

function maskPhone(input) {
  input.value = formatPhone(input.value);
  window.requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
}

document.addEventListener('input', (event) => {
  const input = event.target;
  if (input.matches('input[type="tel"], input[inputmode="tel"]')) maskPhone(input);
  /* Подсказку убираем по вводу, а не по blur: иначе она исчезает в момент
     нажатия на кнопку, вёрстка подпрыгивает и клик не доходит до submit. */
  if (input.hasAttribute('aria-invalid')) setError(input, '');
});

function setError(field, message) {
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

function validateField(field) {
  const value = field.value.trim();
  if (field.required && !value) {
    setError(field, 'Заполните поле');
    return false;
  }
  if ((field.type === 'tel' || field.inputMode === 'tel') && value && !phonePattern.test(value)) {
    setError(field, 'Введите телефон полностью');
    return false;
  }
  setError(field, '');
  return true;
}

function validateFields(fields) {
  let firstInvalid = null;
  fields.forEach((field) => {
    if (!validateField(field) && !firstInvalid) firstInvalid = field;
  });
  firstInvalid?.focus();
  return !firstInvalid;
}

/* Приманка для ботов: поле спрятано от людей, заполняется автоматикой. */
function isBot(form) {
  const honeypot = form.querySelector('.hp-field input');
  return Boolean(honeypot && honeypot.value);
}

document.querySelectorAll('.lead-card, .final-form').forEach((form) => {
  const fields = [...form.querySelectorAll('input:not([type="hidden"])')].filter((field) => !field.closest('.hp-field'));
  fields.forEach((field) => field.addEventListener('blur', () => validateField(field)));

  form.addEventListener('submit', (event) => {
    if (validateFields(fields) && !isBot(form)) {
      fields.forEach((field) => setError(field, ''));
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  });
});

/* Шаг контактов в квизе рисуется скриптом на лету — проверяем перед переходом. */
const quizNextButton = document.querySelector('#quizNext');

quizNextButton?.addEventListener('click', (event) => {
  const contact = document.querySelector('.quiz__contact');
  if (!contact) return;
  const fields = [...contact.querySelectorAll('input')];
  fields.forEach((field) => { field.required = true; });
  if (validateFields(fields)) return;
  event.stopImmediatePropagation();
});
