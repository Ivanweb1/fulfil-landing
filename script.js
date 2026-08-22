const form = document.querySelector('.lead-card');
const toast = document.querySelector('.toast');
const slides = [...document.querySelectorAll('.hero-slide')];
const sliderDots = [...document.querySelectorAll('.slider-dot')];
let currentSlide = 0;
let sliderTimer;

function showSlide(index) {
  currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => slide.classList.toggle('is-active', slideIndex === currentSlide));
  sliderDots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === currentSlide));
}

function startSlider() {
  window.clearInterval(sliderTimer);
  sliderTimer = window.setInterval(() => showSlide(currentSlide + 1), 5200);
}

sliderDots.forEach((dot) => dot.addEventListener('click', () => {
  showSlide(Number(dot.dataset.slide));
  startSlider();
}));

if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) startSlider();

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  toast.textContent = 'Спасибо! Заявка принята — менеджер свяжется с вами.';
  toast.classList.add('is-visible');
  form.reset();
  window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
});

const defaultQuizSteps = [
  { question: 'На какие маркетплейсы нужно отгрузить товары?', options: ['Wildberries', 'Ozon', 'Яндекс Маркет', 'Мегамаркет', 'Лемана ПРО', 'Авито', 'Lamoda', 'М.Видео'] },
  { question: 'Какое количество единиц нужно обработать?', options: ['500–1 000', '1 001–3 000', '3 001–5 000', 'Более 5 000'] },
  { question: 'Какие услуги вам нужны?', options: ['Полный цикл фулфилмента', 'Упаковка и маркировка', 'Хранение', 'Доставка на маркетплейсы'] },
  { question: 'Когда планируете начать?', options: ['Нужно сейчас', 'В течение 2 недель', 'В течение месяца', 'На будущее'] },
  { question: 'Как с вами удобнее связаться?', options: ['Позвонить', 'WhatsApp', 'Telegram'] }
];

const quizSteps = window.QUIZ_STEPS || defaultQuizSteps;
const quizCountsContact = window.QUIZ_COUNT_CONTACT === true;
const quizTotalSteps = quizSteps.length + (quizCountsContact ? 1 : 0);

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
    quizContent.innerHTML = '<div class="quiz__question">Спасибо! Свяжемся в течение 1 часа.</div>';
    renderQuizProgress(quizSteps.length);
    quizHint?.classList.add('is-hidden');
    if (quizBack) quizBack.hidden = true;
    if (quizNext) quizNext.hidden = true;
    return;
  }

  if (quizStage === 'contact') {
    quizContent.innerHTML = '<div class="quiz__question">Оставьте контакты для получения расчета</div><div class="quiz__contact"><input type="text" placeholder="Ваше имя"><input type="tel" placeholder="+7 (___) ___-__-__"></div>';
    renderQuizProgress(quizSteps.length);
    if (quizStepNumber) quizStepNumber.textContent = String(quizTotalSteps).padStart(2, '0');
    quizHint?.classList.add('is-hidden');
    if (quizBack) quizBack.disabled = false;
    if (quizNext) quizNext.innerHTML = 'Получить расчет <span>↗</span>';
    return;
  }

  const step = quizSteps[quizStep];
  if (!step) return;
  quizContent.innerHTML = `<div class="quiz__question">${step.question}</div><div class="quiz__options">${step.options.map((option) => `<button class="quiz__option${quizAnswers[quizStep].includes(option) ? ' selected' : ''}" type="button">${option}</button>`).join('')}</div>`;
  if (quizStepNumber) quizStepNumber.textContent = String(quizStep + 1).padStart(2, '0');
  renderQuizProgress(quizStep);
  quizHint?.classList.remove('is-hidden');
  if (quizBack) quizBack.disabled = quizStep === 0;
  if (quizNext) quizNext.innerHTML = 'Следующий вопрос <span>→</span>';
}

quizContent?.addEventListener('click', (event) => {
  const option = event.target.closest('.quiz__option');
  if (!option || quizStage !== 'questions') return;
  option.classList.toggle('selected');
  const answers = quizAnswers[quizStep];
  const position = answers.indexOf(option.textContent);
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

document.querySelectorAll('.faq__list article > button').forEach((button) => {
  button.addEventListener('click', () => {
    const item = button.parentElement;
    const wasOpen = item.classList.contains('is-open');
    document.querySelectorAll('.faq__list article').forEach((faqItem) => faqItem.classList.remove('is-open'));
    if (!wasOpen) item.classList.add('is-open');
  });
});

const finalForm = document.querySelector('.final-form');
finalForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!finalForm.reportValidity()) return;
  toast.textContent = 'Спасибо! Предложение будет готово в течение 1 часа.';
  toast.classList.add('is-visible');
  finalForm.reset();
  window.setTimeout(() => toast.classList.remove('is-visible'), 4200);
});

const backToTop = document.querySelector('.back-to-top');
window.addEventListener('scroll', () => backToTop?.classList.toggle('is-visible', window.scrollY > 700), { passive: true });
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

priceTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
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
  });
});
