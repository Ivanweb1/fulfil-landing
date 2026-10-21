const form = document.querySelector('.lead-card');
const toast = document.querySelector('.toast');

if (!window.CUSTOM_FORM_HANDLER) form?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  toast.textContent = 'Спасибо! Заявка принята — менеджер свяжется с вами.';
  toast.classList.add('is-visible');
  form.reset();
  window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
});

if (!window.CUSTOM_QUIZ_HANDLER) {
const defaultQuizSteps = [
  { question: 'На какие маркетплейсы нужно отгрузить товары?', options: ['Wildberries', 'Ozon', 'Яндекс Маркет', 'Мегамаркет', 'Лемана ПРО', 'Авито', 'Lamoda', 'М.Видео'], multi: true },
  { question: 'Какое количество единиц нужно обработать?', options: ['500–1 000', '1 001–3 000', '3 001–5 000', 'Более 5 000'], multi: false },
  { question: 'Какие услуги вам нужны?', options: ['Полный цикл фулфилмента', 'Упаковка и маркировка', 'Хранение', 'Доставка на маркетплейсы'], multi: true },
  { question: 'Когда планируете начать?', options: ['Нужно сейчас', 'В течение 2 недель', 'В течение месяца', 'На будущее'], multi: false },
  { question: 'Как с вами удобнее связаться?', options: ['Позвонить', 'WhatsApp', 'Telegram'], multi: false }
];

const quizSteps = window.QUIZ_STEPS || defaultQuizSteps;
const quizCountsContact = window.QUIZ_COUNT_CONTACT === true;
const quizTotalSteps = quizSteps.length + (quizCountsContact ? 1 : 0);
const quizNextLabel = window.QUIZ_NEXT_LABEL || 'Следующий вопрос';
const quizToContactLabel = window.QUIZ_TO_CONTACT_LABEL || 'Перейти к контактам';
const quizContactTitle = window.QUIZ_CONTACT_TITLE || 'Оставьте контакты для получения расчета';
const quizSubmitLabel = window.QUIZ_SUBMIT_LABEL || 'Получить предварительный расчёт';
const quizSuccess = window.QUIZ_SUCCESS || 'Свяжемся в течение 30 минут.';

const quizContent = document.querySelector('#quizContent');
const quizStepNumber = document.querySelector('#quizStepNum');
const quizProgress = document.querySelector('#quizProgress');
const quizTotal = document.querySelector('#quizTotal');
const quizNext = document.querySelector('#quizNext');
const quizBack = document.querySelector('#quizBack');
const quizHint = document.querySelector('.quiz__hint');
const quizAnswers = quizSteps.map(() => []);
let quizStep = 0;
let quizStage = 'questions';

function renderQuizProgress(activeIndex) {
  if (!quizProgress) return;
  quizProgress.innerHTML = Array.from({ length: quizTotalSteps }, (item, index) => `<i class="${index <= activeIndex ? 'is-done' : ''}"></i>`).join('');
}

if (quizTotal) quizTotal.textContent = String(quizTotalSteps).padStart(2, '0');

function renderQuiz() {
  if (!quizContent) return;

  if (quizStage === 'done') {
    quizContent.innerHTML = `<div class="quiz__question">Спасибо! ${quizSuccess}</div>`;
    renderQuizProgress(quizSteps.length);
    quizHint?.classList.add('is-hidden');
    if (quizBack) quizBack.hidden = true;
    if (quizNext) quizNext.hidden = true;
    return;
  }

  if (quizStage === 'contact') {
    const isTelegram = (quizAnswers[quizSteps.length - 1] || []).includes('Telegram');
    const contactType = isTelegram ? 'text' : 'tel';
    const contactPlaceholder = isTelegram ? 'Телефон или @username' : '+7 (___) ___-__-__';
    quizContent.innerHTML = `<div class="quiz__question">${quizContactTitle}</div><div class="quiz__contact"><input type="text" placeholder="Ваше имя"><input type="${contactType}" placeholder="${contactPlaceholder}"></div><p class="quiz__privacy">Нажимая на кнопку, вы соглашаетесь с <a href="/politika-konfidencialnosti/">политикой конфиденциальности</a> и <a href="/terms/">условиями использования</a></p>`;
    renderQuizProgress(quizSteps.length);
    if (quizStepNumber) quizStepNumber.textContent = String(quizTotalSteps).padStart(2, '0');
    quizHint?.classList.add('is-hidden');
    if (quizBack) quizBack.disabled = false;
    if (quizNext) quizNext.innerHTML = `${quizSubmitLabel} <span>↗</span>`;
    return;
  }

  const step = quizSteps[quizStep];
  if (!step) return;
  quizContent.innerHTML = `<div class="quiz__question">${step.question}</div><div class="quiz__options">${step.options.map((option) => `<button class="quiz__option${quizAnswers[quizStep].includes(option) ? ' selected' : ''}" type="button">${option}</button>`).join('')}</div>`;
  if (quizStepNumber) quizStepNumber.textContent = String(quizStep + 1).padStart(2, '0');
  renderQuizProgress(quizStep);
  quizHint?.classList.remove('is-hidden');
  if (quizHint) quizHint.textContent = step.multi ? 'Можно выбрать несколько вариантов' : 'Выберите один вариант';
  if (quizBack) quizBack.disabled = quizStep === 0;
  if (quizNext) quizNext.innerHTML = quizStep === quizSteps.length - 1 ? `${quizToContactLabel} <span>→</span>` : `${quizNextLabel} <span>→</span>`;
}

quizContent?.addEventListener('click', (event) => {
  const option = event.target.closest('.quiz__option');
  if (!option || quizStage !== 'questions') return;
  const answers = quizAnswers[quizStep];
  const position = answers.indexOf(option.textContent);
  if (!quizSteps[quizStep].multi) {
    quizContent.querySelectorAll('.quiz__option').forEach((other) => { if (other !== option) other.classList.remove('selected'); });
    answers.length = 0;
    if (position === -1) {
      option.classList.add('selected');
      answers.push(option.textContent);
    } else {
      option.classList.remove('selected');
    }
    return;
  }
  option.classList.toggle('selected');
  if (position === -1) answers.push(option.textContent);
  else answers.splice(position, 1);
});

quizNext?.addEventListener('click', () => {
  if (quizStage === 'contact') quizStage = 'done';
  else if (quizStep < quizSteps.length - 1) quizStep += 1;
  else quizStage = 'contact';
  renderQuiz();
});

quizBack?.addEventListener('click', () => {
  if (quizStage === 'contact') quizStage = 'questions';
  else if (quizStep > 0) quizStep -= 1;
  else return;
  renderQuiz();
});

renderQuiz();
}

document.querySelectorAll('.faq__list article > button').forEach((button) => {
  button.addEventListener('click', () => {
    const item = button.parentElement;
    /* data-multiple — ответы раскрываются независимо, несколько сразу */
    if (item.closest('.faq__list').hasAttribute('data-multiple')) {
      item.classList.toggle('is-open');
      return;
    }
    const wasOpen = item.classList.contains('is-open');
    document.querySelectorAll('.faq__list article').forEach((faqItem) => faqItem.classList.remove('is-open'));
    if (!wasOpen) item.classList.add('is-open');
  });
});

const finalForm = document.querySelector('.final-form');
if (!window.CUSTOM_FORM_HANDLER) finalForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!finalForm.reportValidity()) return;
  toast.textContent = 'Спасибо! Предложение будет готово в течение 1 часа.';
  toast.classList.add('is-visible');
  finalForm.reset();
  window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
});

const backToTop = document.querySelector('.back-to-top');
window.addEventListener('scroll', () => backToTop?.classList.toggle('is-visible', window.scrollY > 400), { passive: true });
backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

const flowSteps = [...document.querySelectorAll('.steps__flow .step')];

function updateFlowSteps() {
  const threshold = window.innerHeight * 0.68;
  flowSteps.forEach((item) => item.classList.toggle('is-passed', item.getBoundingClientRect().top < threshold));
}

if (flowSteps.length) {
  window.addEventListener('scroll', updateFlowSteps, { passive: true });
  window.addEventListener('resize', updateFlowSteps, { passive: true });
  updateFlowSteps();
}

const priceTabs = [...document.querySelectorAll('.pricetab')];
const pricePanels = [...document.querySelectorAll('.pricelist')];

function activatePriceTab(index) {
  priceTabs.forEach((item, itemIndex) => {
    const active = itemIndex === index;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', String(active));
  });
  pricePanels.forEach((panel, panelIndex) => {
    const active = panelIndex === index;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
}

function activatePriceHash(scroll = false) {
  if (!window.location.hash) return;
  const target = document.getElementById(window.location.hash.slice(1));
  const panel = target?.closest('.pricelist');
  const index = pricePanels.indexOf(panel);
  if (index < 0) return;
  activatePriceTab(index);
  if (scroll) window.requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
}

priceTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activatePriceTab(index));
});

window.addEventListener('hashchange', () => activatePriceHash(true));
activatePriceHash();

/* Ссылка на вкладку прайса (href="#id-панели") открывает её и тогда, когда адрес
   уже совпадает и hashchange не срабатывает. Панель показываем до перехода по якорю. */
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  const panel = link && document.getElementById(link.getAttribute('href').slice(1));
  const index = pricePanels.indexOf(panel);
  if (index >= 0) activatePriceTab(index);
});

const siteHeader = document.querySelector('.site-header');
window.addEventListener('scroll', () => siteHeader?.classList.toggle('is-stuck', window.scrollY > 10), { passive: true });
const menuButton = document.querySelector('.menu-button');

function setMenu(open) {
  if (!siteHeader || !menuButton) return;
  siteHeader.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
}

menuButton?.addEventListener('click', () => setMenu(!siteHeader.classList.contains('is-open')));

document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => setMenu(false)));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 1599) setMenu(false);
}, { passive: true });

/* Окно «Заказать звонок»: кнопка в шапке, в мобильном меню и в подвале.
   В Тильде то же поведение даёт рантайм (tilda/fx-runtime.js), там заявка уходит
   в ту же форму-приёмник, что и заявки из форм расчета. */
const callbackDialog = document.querySelector('.callback');
const callbackPhonePattern = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;

function callbackFormatPhone(value) {
  const digits = value.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10);
  if (!digits) return '';
  let result = `+7 (${digits.slice(0, 3)}`;
  if (digits.length >= 4) result += `) ${digits.slice(3, 6)}`;
  if (digits.length >= 7) result += `-${digits.slice(6, 8)}`;
  if (digits.length >= 9) result += `-${digits.slice(8, 10)}`;
  return result;
}

function openCallback() {
  if (!callbackDialog) return;
  setMenu(false);
  callbackDialog.querySelector('.callback__step').hidden = false;
  callbackDialog.querySelector('.callback__done').hidden = true;
  if (typeof callbackDialog.showModal === 'function') callbackDialog.showModal();
  else callbackDialog.setAttribute('open', '');
  callbackDialog.querySelector('input[name="name"]')?.focus();
}

function closeCallback() {
  if (!callbackDialog) return;
  if (typeof callbackDialog.close === 'function') callbackDialog.close();
  else callbackDialog.removeAttribute('open');
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-callback-open]')) openCallback();
  else if (event.target.closest('[data-callback-close]')) closeCallback();
});

/* Клик по затемнению вокруг окна закрывает его */
callbackDialog?.addEventListener('click', (event) => {
  if (event.target === callbackDialog) closeCallback();
});

const callbackForm = callbackDialog?.querySelector('.callback__form');

callbackForm?.addEventListener('input', (event) => {
  const field = event.target;
  /* Маску ставит forms.js, если он подключен; иначе — здесь */
  if (field.type === 'tel' && typeof formatPhone !== 'function') field.value = callbackFormatPhone(field.value);
  field.removeAttribute('aria-invalid');
});

callbackForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (callbackForm.querySelector('.hp-field input')?.value) return;
  const name = callbackForm.querySelector('input[name="name"]');
  const phone = callbackForm.querySelector('input[name="phone"]');
  const invalid = [name, phone].filter((field) => !field.value.trim() || (field === phone && !callbackPhonePattern.test(field.value.trim())));
  [name, phone].forEach((field) => field.toggleAttribute('aria-invalid', invalid.includes(field)));
  if (invalid.length) {
    invalid[0].focus();
    return;
  }
  callbackForm.reset();
  callbackDialog.querySelector('.callback__step').hidden = true;
  callbackDialog.querySelector('.callback__done').hidden = false;
});

/* Вакансии: если карточек не осталось, вместо перечня выводится текст «Сейчас открытых вакансий нет» */
const jobsSection = document.querySelector('.jobs');
if (jobsSection && !jobsSection.querySelector('.job')) {
  jobsSection.hidden = true;
  const noJobs = document.querySelector('.vac-empty');
  if (noJobs) noJobs.hidden = false;
}

/* Виджеты отзывов (data-review-widget): iframe создается, только когда блок доходит до экрана,
   чтобы сторонние скрипты не тормозили загрузку страницы. Скрытый блок (hidden) не грузится. */
function loadReviewWidget(holder) {
  if (holder.dataset.loaded) return;
  holder.dataset.loaded = '1';
  const frame = document.createElement('iframe');
  frame.src = holder.dataset.reviewWidget;
  frame.title = holder.dataset.reviewTitle || 'Отзывы';
  frame.loading = 'lazy';
  holder.append(frame);
}

const reviewWidgets = [...document.querySelectorAll('[data-review-widget]')].filter((holder) => !holder.hidden && !holder.closest('[hidden]'));
if ('IntersectionObserver' in window) {
  const widgetObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      loadReviewWidget(entry.target);
      widgetObserver.unobserve(entry.target);
    });
  }, { rootMargin: '300px 0px' });
  reviewWidgets.forEach((holder) => widgetObserver.observe(holder));
} else {
  reviewWidgets.forEach(loadReviewWidget);
}

/* Благодарственные письма: превью открывается в увеличенном виде */
const lightbox = document.querySelector('.lightbox');
document.addEventListener('click', (event) => {
  const thumb = event.target.closest('[data-lightbox]');
  if (thumb && lightbox) {
    const image = lightbox.querySelector('.lightbox__img');
    image.src = thumb.dataset.lightbox;
    image.alt = thumb.querySelector('img')?.alt || '';
    lightbox.querySelector('.lightbox__caption').textContent = thumb.dataset.lightboxCaption || '';
    lightbox.showModal();
    return;
  }
  if (event.target.closest('[data-lightbox-close]') || event.target === lightbox) lightbox?.close();
});
