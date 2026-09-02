/*!
 * Fulfil.pro — общий рантайм для Tilda Vibe-блоков.
 * Вставляется ОДИН раз в «Настройки сайта → Ещё → HTML-код для HEAD».
 * Каждый Vibe-блок — это только разметка: <div class="fx-block">…</div> + свой <style>.
 * Рантайм сам находит блоки и включает нужное поведение.
 */
(function () {
  'use strict';

  // Меняется при каждой правке рантайма. По ней видно, что на странице
  // остались блоки от прошлой сборки.
  var VERSION = '2026-09-02.1';

  // В автономной сборке рантайм лежит в каждом блоке. Первая копия берёт
  // управление, остальные только досматривают новые блоки, не заводя ещё один
  // набор наблюдателей.
  if (window.FX && window.FX.init) {
    if (window.FX.version !== VERSION) {
      console.warn('[fx] На странице блоки от разных сборок: работает версия ' +
        window.FX.version + ', а этот блок собран как ' + VERSION +
        '. Вставьте заново все блоки страницы, начиная с первого.');
      window.FX.mixed = true;
    }
    window.FX.init();
    return;
  }

  var DEFAULTS = {
    // Форма Тильды-приёмник. По умолчанию — первая нативная форма на странице,
    // которая не лежит внутри наших блоков.
    donorSelector: 'form.js-form-proccess',
    // Прячем блок с формой-приёмником автоматически.
    hideDonor: true,
    // Запасной канал, если формы Тильды на странице нет.
    webhook: '',
    // Страна для поля телефона в форме Тильды. Без этого она определяется по IP,
    // и посетитель из-за границы (или через VPN) получает чужую маску, под которую
    // российский номер не подходит — Тильда отвечает «слишком короткое значение».
    phoneCountry: 'ru',
    // Язык страницы для <html lang>. В настройках Тильды такого поля нет.
    lang: 'ru',
    successText: 'Спасибо! Заявка принята — менеджер свяжется с вами.',
    errorText: 'Не удалось отправить заявку. Позвоните нам: +7 (926) 535-24-47',
    phoneText: 'Проверьте номер телефона — нужно 10 цифр после +7',
    // Сколько ждать ответа Тильды, прежде чем показать тост.
    submitTimeout: 8000,
    // Прайс-лист. Кнопка «Скачать прайс» открывает файл после отправки заявки,
    // поэтому без адреса она просто уводит на форму.
    priceUrl: '',
    // Страница политики обработки персональных данных.
    policyUrl: '/politika-konfidencialnosti/',
    // Порог появления кнопки «Наверх», px. Страница задаёт свой через
    // data-fx-back-to-top на любом блоке.
    backToTop: 600
  };

  var CFG = window.FX_CONFIG = merge(DEFAULTS, window.FX_CONFIG || {});

  function merge(base, extra) {
    var out = {};
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (var j in extra) if (Object.prototype.hasOwnProperty.call(extra, j)) out[j] = extra[j];
    return out;
  }

  function list(root, selector) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  // Тильда дорисовывает содержимое блоков после запуска рантайма, поэтому
  // инициализация повторяется на каждое изменение DOM. Метка ставится на сам
  // элемент — так повторный проход не навешивает второй обработчик, но и не
  // пропускает то, чего в прошлый раз ещё не было.
  function once(element, key) {
    if (!element || element.dataset[key] === '1') return false;
    element.dataset[key] = '1';
    return true;
  }

  /* ---------------------------------------------------------------- тост */

  var toastNode;
  var toastTimer;

  function toastEl() {
    if (toastNode && document.body.contains(toastNode)) return toastNode;
    toastNode = document.querySelector('.fx-toast');
    if (!toastNode) {
      toastNode = document.createElement('div');
      toastNode.className = 'toast fx-toast';
      toastNode.setAttribute('role', 'status');
      toastNode.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastNode);
    }
    return toastNode;
  }

  function showToast(text) {
    var el = toastEl();
    el.textContent = text;
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove('is-visible'); }, 4600);
  }

  /* -------------------------------------------------------- кнопка наверх */

  function ensureBackToTop() {
    var button = document.querySelector('.fx-back-to-top');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'back-to-top fx-back-to-top';
      button.setAttribute('aria-label', 'Наверх');
      button.textContent = '↑';
      document.body.appendChild(button);
      button.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      var holder = document.querySelector('[data-fx-back-to-top]');
      var threshold = holder ? parseInt(holder.dataset.fxBackToTop, 10) : CFG.backToTop;
      if (!(threshold > 0)) threshold = CFG.backToTop;
      window.addEventListener('scroll', function () {
        button.classList.toggle('is-visible', window.scrollY > threshold);
      }, { passive: true });
    }
    return button;
  }

  /* ------------------------------------------------------------- слайдер */

  function initSlider(root) {
    var slides = list(root, '.hero-slide');
    var dots = list(root, '.slider-dot');
    if (slides.length < 2) return;
    if (!once(slides[0].parentElement, 'fxSlider')) return;

    var current = 0;
    var timer;

    function show(index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (slide, i) { slide.classList.toggle('is-active', i === current); });
      dots.forEach(function (dot, i) { dot.classList.toggle('is-active', i === current); });
    }

    function start() {
      window.clearInterval(timer);
      timer = window.setInterval(function () { show(current + 1); }, 5200);
    }

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        show(Number(dot.dataset.slide));
        start();
      });
    });

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) start();
  }

  /* ---------------------------------------------------------------- меню */

  function initMenu(root) {
    var header = root.querySelector('.site-header');
    var button = root.querySelector('.menu-button');
    if (!header || !button) return;
    if (!once(header, 'fxMenu')) return;

    function setMenu(open) {
      header.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    }

    button.addEventListener('click', function () {
      setMenu(!header.classList.contains('is-open'));
    });
    list(root, '.main-nav a').forEach(function (link) {
      link.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1180) setMenu(false);
    }, { passive: true });
  }

  /* --------------------------------------------------------- липкая шапка */

  // В Тильде шапка лежит внутри обёртки блока, а position: sticky прилипает
  // только в пределах своего родителя — то есть на высоту самой шапки.
  // Поэтому фиксируем её, а место в потоке держит обёртка блока.
  function initSticky(root) {
    var header = root.querySelector('.site-header');
    if (!header) return;
    if (!once(header, 'fxSticky')) return;

    var host = header.parentElement;
    if (!host) return;

    header.style.position = 'fixed';
    header.style.top = '0';
    header.style.left = '0';
    header.style.right = '0';
    header.style.zIndex = '9000';

    function sync() {
      var height = header.offsetHeight;
      if (height) host.style.height = height + 'px';
    }

    sync();
    // Высота шапки меняется после подгрузки шрифтов и логотипа.
    window.setTimeout(sync, 400);
    window.setTimeout(sync, 1600);
    window.addEventListener('load', sync);
    window.addEventListener('resize', sync, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(sync).observe(header);

    window.addEventListener('scroll', function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    }, { passive: true });
  }

  /* ------------------------------------------------------------ прайс-лист */

  // По критериям приёмки прайс открывается после отправки заявки, поэтому
  // кнопка уводит на форму и запоминает намерение до успешной отправки.
  var priceWanted = '';

  function initPrice(root) {
    list(root, '[data-fx-price]').forEach(function (link) {
      if (!once(link, 'fxPrice')) return;
      link.addEventListener('click', function (event) {
        var form = document.querySelector('.fx-block form.lead-card, .fx-block form.final-form');
        var url = CFG.priceUrl || link.getAttribute('href');
        if (!form || !url || url === '#' || url.indexOf('[[') === 0) return;
        event.preventDefault();
        priceWanted = url;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('Оставьте контакты — прайс откроется сразу после отправки');
        var field = form.querySelector('input[name="name"], input');
        if (field) window.setTimeout(function () { field.focus(); }, 700);
      });
    });
  }

  function openPrice() {
    if (!priceWanted) return;
    var url = priceWanted;
    priceWanted = '';
    // Окно открывается уже после ответа сервера, вне клика, — браузер вправе
    // его заблокировать. Тогда показываем ссылку в уведомлении: по ней клик
    // будет настоящий, и никакой блокировщик не помешает.
    var opened = window.open(url, '_blank', 'noopener');
    if (!opened) showToastLink('Заявка принята. ', 'Скачать прайс', url);
  }

  function showToastLink(text, label, url) {
    var el = toastEl();
    el.textContent = text;
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    link.style.textDecoration = 'underline';
    el.appendChild(link);
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove('is-visible'); }, 12000);
  }

  /* ---------------------------------------------------------------- квиз */

  var DEFAULT_QUIZ = [
    { question: 'На какие маркетплейсы нужно отгрузить товары?', options: ['Wildberries', 'Ozon', 'Яндекс Маркет', 'Мегамаркет', 'Лемана ПРО', 'Авито', 'Lamoda', 'М.Видео'] },
    { question: 'Какое количество единиц нужно обработать?', options: ['500–1 000', '1 001–3 000', '3 001–5 000', 'Более 5 000'] },
    { question: 'Какие услуги вам нужны?', options: ['Полный цикл фулфилмента', 'Упаковка и маркировка', 'Хранение', 'Доставка на маркетплейсы'] },
    { question: 'Когда планируете начать?', options: ['Нужно сейчас', 'В течение 2 недель', 'В течение месяца', 'На будущее'] },
    { question: 'Как с вами удобнее связаться?', options: ['Позвонить', 'WhatsApp', 'Telegram'] }
  ];

  function readQuizConfig(root) {
    var holder = root.querySelector('script.fx-quiz-config');
    if (!holder) return { steps: DEFAULT_QUIZ, countContact: false, marketplace: '' };
    try {
      var parsed = JSON.parse(holder.textContent);
      return {
        steps: Array.isArray(parsed.steps) && parsed.steps.length ? parsed.steps : DEFAULT_QUIZ,
        countContact: parsed.countContact === true,
        marketplace: parsed.marketplace || ''
      };
    } catch (error) {
      console.error('[fx] Не разобран конфиг квиза', error);
      return { steps: DEFAULT_QUIZ, countContact: false, marketplace: '' };
    }
  }

  function initQuiz(root) {
    var content = root.querySelector('#quizContent, .fx-quiz-content');
    if (!content) return;
    if (!once(content, 'fxQuiz')) return;

    var config = readQuizConfig(root);
    var steps = config.steps;
    var totalSteps = steps.length + (config.countContact ? 1 : 0);

    var stepNumber = root.querySelector('#quizStepNum, .fx-quiz-step');
    var progress = root.querySelector('#quizProgress, .fx-quiz-progress');
    var total = root.querySelector('#quizTotal, .fx-quiz-total');
    var next = root.querySelector('#quizNext, .fx-quiz-next');
    var back = root.querySelector('#quizBack, .fx-quiz-back');
    var hint = root.querySelector('.quiz__hint');
    var answers = steps.map(function () { return []; });
    var step = 0;
    var stage = 'questions';

    if (total) total.textContent = String(totalSteps).padStart(2, '0');

    function renderProgress(activeIndex) {
      if (!progress) return;
      var cells = [];
      for (var i = 0; i < totalSteps; i++) cells.push('<i class="' + (i <= activeIndex ? 'is-done' : '') + '"></i>');
      progress.innerHTML = cells.join('');
    }

    function render() {
      if (stage === 'done') {
        content.innerHTML = '<div class="quiz__question">Спасибо! Свяжемся в течение 1 часа.</div>';
        renderProgress(steps.length);
        if (hint) hint.classList.add('is-hidden');
        if (back) back.hidden = true;
        if (next) next.hidden = true;
        return;
      }

      if (stage === 'contact') {
        content.innerHTML = '<div class="quiz__question">Оставьте контакты для получения расчета</div>' +
          '<div class="quiz__contact">' +
          '<input type="text" name="name" autocomplete="name" placeholder="Ваше имя" required>' +
          '<input type="tel" name="phone" autocomplete="tel" placeholder="+7 (___) ___-__-__" required>' +
          '</div>' +
          '<p class="quiz__privacy">Нажимая на кнопку, вы соглашаетесь с ' +
          '<a href="' + CFG.policyUrl + '">политикой конфиденциальности</a></p>';
        renderProgress(steps.length);
        if (stepNumber) stepNumber.textContent = String(totalSteps).padStart(2, '0');
        if (hint) hint.classList.add('is-hidden');
        if (back) back.disabled = false;
        if (next) next.innerHTML = 'Получить расчет <span>↗</span>';
        return;
      }

      var current = steps[step];
      if (!current) return;
      content.innerHTML = '<div class="quiz__question">' + current.question + '</div><div class="quiz__options">' +
        current.options.map(function (option) {
          var selected = answers[step].indexOf(option) !== -1 ? ' selected' : '';
          return '<button class="quiz__option' + selected + '" type="button">' + option + '</button>';
        }).join('') + '</div>';
      if (stepNumber) stepNumber.textContent = String(step + 1).padStart(2, '0');
      renderProgress(step);
      if (hint) {
        hint.classList.remove('is-hidden');
        hint.textContent = current.multi ? 'Можно выбрать несколько вариантов' : 'Выберите один вариант';
      }
      if (back) back.disabled = step === 0;
      if (next) next.innerHTML = 'Следующий вопрос <span>→</span>';
    }

    content.addEventListener('click', function (event) {
      var option = event.target.closest('.quiz__option');
      if (!option || stage !== 'questions') return;
      var current = answers[step];
      var position = current.indexOf(option.textContent);
      // Мультивыбор работает только там, где он задан в конфиге шага.
      if (!steps[step].multi) {
        list(content, '.quiz__option').forEach(function (other) {
          if (other !== option) other.classList.remove('selected');
        });
        current.length = 0;
        if (position === -1) {
          option.classList.add('selected');
          current.push(option.textContent);
        } else {
          option.classList.remove('selected');
        }
        return;
      }
      option.classList.toggle('selected');
      if (position === -1) current.push(option.textContent);
      else current.splice(position, 1);
    });

    if (next) next.addEventListener('click', function () {
      if (stage === 'contact') {
        var nameInput = content.querySelector('input[name="name"]');
        var phoneInput = content.querySelector('input[name="phone"]');
        if (!nameInput || !phoneInput) return;
        if (!nameInput.value.trim() || !phoneInput.value.trim()) {
          (nameInput.value.trim() ? phoneInput : nameInput).focus();
          return;
        }
        var details = steps.map(function (item, index) {
          return item.question + ' — ' + (answers[index].length ? answers[index].join(', ') : 'нет ответа');
        });
        if (config.marketplace) details.unshift('Маркетплейс — ' + config.marketplace);
        details = details.join('\n');
        next.disabled = true;
        send({
          name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          formName: 'Квиз-расчёт',
          details: details
        }).then(function () {
          stage = 'done';
          render();
          showToast(CFG.successText);
        }).catch(function () {
          next.disabled = false;
          showToast(CFG.errorText);
        });
        return;
      }
      if (step < steps.length - 1) step += 1;
      else stage = 'contact';
      render();
    });

    if (back) back.addEventListener('click', function () {
      if (stage === 'contact') stage = 'questions';
      else if (step > 0) step -= 1;
      else return;
      render();
    });

    render();
  }

  /* ----------------------------------------------------------- аккордеон */

  function initFaq(root) {
    var items = list(root, '.faq__list article');
    if (!items.length) return;
    items.forEach(function (item) {
      var button = item.querySelector(':scope > button');
      if (!button || !once(item, 'fxFaq')) return;
      button.addEventListener('click', function () {
        var wasOpen = item.classList.contains('is-open');
        items.forEach(function (other) { other.classList.remove('is-open'); });
        if (!wasOpen) item.classList.add('is-open');
      });
    });
  }

  /* --------------------------------------------------------- табы тарифов */

  function initTabs(root) {
    var tabs = list(root, '.pricetab');
    var panels = list(root, '.pricelist');
    if (!tabs.length || !panels.length) return;
    tabs.forEach(function (tab, index) {
      if (!once(tab, 'fxTab')) return;
      tab.addEventListener('click', function () {
        tabs.forEach(function (item, i) {
          var active = i === index;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-selected', String(active));
        });
        panels.forEach(function (panel, i) {
          var active = i === index;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  /* ----------------------------------------------------- подсветка шагов */

  function initFlow(root) {
    var steps = list(root, '.steps__flow .step');
    if (!steps.length) return;
    if (!once(steps[0].parentElement, 'fxFlow')) return;

    function update() {
      var threshold = window.innerHeight * 0.68;
      steps.forEach(function (item) {
        item.classList.toggle('is-passed', item.getBoundingClientRect().top < threshold);
      });
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* --------------------------------------------------------------- формы */

  // Подписи для полей, которые уезжают в «Детали» письма.
  var FIELD_LABELS = {
    marketplace: 'Маркетплейсы',
    comment: 'Комментарий',
    sku: 'Количество SKU',
    volume: 'Объём отгрузок',
    message: 'Сообщение'
  };

  var FIELD_ALIASES = {
    name: ['name', 'имя', 'fio', 'username'],
    phone: ['phone', 'tel', 'телефон', 'mobile'],
    email: ['email', 'mail', 'почта']
  };

  function findDonor() {
    var forms = list(document, CFG.donorSelector);
    for (var i = 0; i < forms.length; i++) {
      if (!forms[i].closest('.fx-block')) return forms[i];
    }
    return null;
  }

  function hideDonor(donor) {
    if (!CFG.hideDonor) return;
    var record = donor.closest('.r') || donor.closest('[id^="rec"]') || donor;
    if (record.dataset.fxHidden === '1') return;
    record.dataset.fxHidden = '1';
    record.style.position = 'absolute';
    record.style.left = '-9999px';
    record.style.top = '0';
    record.style.width = '1px';
    record.style.height = '1px';
    record.style.overflow = 'hidden';
    record.setAttribute('aria-hidden', 'true');
  }

  function matchField(donor, key) {
    var aliases = FIELD_ALIASES[key] || [key];
    var inputs = list(donor, 'input, textarea, select');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      if (input.type === 'hidden' || input.type === 'submit') continue;
      var haystack = ((input.name || '') + ' ' + (input.placeholder || '')).toLowerCase();
      for (var j = 0; j < aliases.length; j++) {
        if (haystack.indexOf(aliases[j]) !== -1) return input;
      }
    }
    return null;
  }

  function setHidden(donor, name, value) {
    var input = donor.querySelector('input[type="hidden"][name="' + name + '"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      donor.appendChild(input);
    }
    input.value = value == null ? '' : String(value);
  }

  // У формы Тильды могут быть свои обязательные поля — например галка согласия
  // на обработку данных. Посетитель их не видит, форма спрятана, а проверка
  // Тильды на них спотыкается и молча отменяет отправку.
  function satisfyRequired(donor) {
    list(donor, '[required], .js-tilda-rule').forEach(function (field) {
      if (field.type === 'checkbox' || field.type === 'radio') {
        if (!field.checked) {
          field.checked = true;
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      if (field.value) return;
      field.value = field.type === 'email' ? 'no-reply@fulfil.pro' : '—';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // Поле телефона в Тильде — это виджет с выбором страны: видимое поле хранит
  // номер БЕЗ кода страны, рядом лежит скрытый код (…-iso), а итоговое значение
  // Тильда собирает сама в скрытое поле Phone. Если написать в видимое поле
  // номер целиком, маска примет код страны за начало номера и покалечит его.
  // Раскладывает цифры по шаблону маски: «(000) 000-00-00» → «(926) 535-24-47».
  function applyPhoneTemplate(template, digits) {
    var out = '';
    var index = 0;
    for (var i = 0; i < template.length && index < digits.length; i++) {
      var char = template.charAt(i);
      out += char === '0' ? digits.charAt(index++) : char;
    }
    return out;
  }

  // Пересобирает маску под нужную страну, если она уже построена под чужую.
  function forcePhoneCountry(donor, visible) {
    if (!CFG.phoneCountry || typeof window.t_form_phonemask_do !== 'function') return;
    if (visible && visible.getAttribute('data-phonemask-iso') === CFG.phoneCountry) return;
    var record = donor.closest('[id^="rec"]');
    var holder = donor.querySelector('[data-input-lid]');
    if (!record || !holder || !once(holder, 'fxPhoneCountry')) return;
    try {
      window.t_form_phonemask_do(record.id.replace('rec', ''), holder.getAttribute('data-input-lid'), CFG.phoneCountry);
    } catch (error) {
      console.warn('[fx] Не удалось переключить страну в поле телефона', error);
    }
  }

  // Разметка поля телефона у Тильды (снято с опубликованной страницы):
  //   <input class="t-input-phonemask" name="tildaspec-phone-part[]"
  //          data-phonemask-code="+7" data-phonemask-without-code="(000) 000-00-00">
  //   <input class="js-phonemask-result js-tilda-rule" name="Phone"
  //          data-tilda-req="1" data-tilda-rule-minlength="18">
  // Проверяется скрытое поле, и его длина должна быть не меньше 18 символов —
  // то есть «+7 (926) 535-24-47». Слитная запись эту проверку не проходит.
  function fillPhone(donor, value) {
    var visible = donor.querySelector('.t-input-phonemask, [name^="tildaspec-phone-part"]:not([type="hidden"])');
    if (!visible) return false;

    forcePhoneCountry(donor, visible);

    var digits = phoneDigits(value);
    var template = visible.getAttribute('data-phonemask-without-code') || '(000) 000-00-00';
    var code = visible.getAttribute('data-phonemask-code');
    if (!code) {
      var codeNode = donor.querySelector('.t-input-phonemask__select-code');
      code = (codeNode && codeNode.textContent.trim()) || '+7';
    }

    // Формируем значение сами: при программном вводе маска Тильды теряет цифры.
    var formatted = applyPhoneTemplate(template, digits);
    visible.value = formatted;
    visible.dispatchEvent(new Event('input', { bubbles: true }));

    // Маска могла переписать поле по-своему — возвращаем своё значение.
    visible.value = formatted;

    var result = donor.querySelector('.js-phonemask-result, input[type="hidden"][name="Phone"]');
    if (result) {
      result.value = code + ' ' + formatted;
      result.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }

  function fillDonor(donor, payload) {
    if (payload.phone && fillPhone(donor, payload.phone)) payload = merge(payload, { phone: '' });

    ['name', 'phone', 'email'].forEach(function (key) {
      if (!payload[key]) return;
      var input = matchField(donor, key);
      if (input) {
        input.value = payload[key];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        setHidden(donor, key === 'name' ? 'Name' : key === 'phone' ? 'Phone' : 'Email', payload[key]);
      }
    });

    setHidden(donor, 'Форма', payload.formName || 'Заявка с сайта');
    setHidden(donor, 'Страница', document.title + ' — ' + location.pathname);
    if (payload.details) setHidden(donor, 'Детали', payload.details);

    satisfyRequired(donor);
  }

  // Как это работает на стороне Тильды (по её же tilda-forms-1.0.min.js):
  // обработчик submit у формы просто нажимает [type="submit"], а вся отправка
  // живёт в обработчике клика на контейнере записи. Значит канонический способ
  // отправить форму из кода — нажать её кнопку. Проверок на «настоящесть»
  // события там нет. Ход отправки виден по свойству кнопки tildaSendingStatus:
  // «1» — идёт отправка, «0» — Тильда отказала (обычно не прошла проверка полей).
  function tildaError(donor) {
    var box = donor.querySelector('.js-rule-error-all, .js-errorbox-all');
    var text = box ? box.textContent.trim() : '';
    return text || 'причина не указана';
  }

  function submitViaTilda(donor, payload) {
    return new Promise(function (resolve, reject) {
      fillDonor(donor, payload);

      var button = donor.querySelector('[type="submit"]');
      if (!button) {
        window.FX_LAST_ERROR = 'В форме-приёмнике нет кнопки отправки';
        console.error('[fx] В форме Тильды нет элемента [type="submit"] — отправлять нечем.', donor);
        reject(new Error('no-submit-button'));
        return;
      }

      var settled = false;
      var timer;

      // Страховка от перезагрузки: если обработчик Тильды почему-то не сработает,
      // браузер отправит форму сам и уведёт со страницы вместе с заявкой.
      function guard(event) {
        if (event.target === donor) event.preventDefault();
      }

      function cleanup() {
        donor.removeEventListener('tildaform:aftersuccess', onSuccess);
        donor.removeEventListener('tildaform:aftererror', onTildaError);
        document.removeEventListener('submit', guard, true);
        window.clearTimeout(timer);
      }
      function onSuccess() { if (settled) return; settled = true; cleanup(); resolve(); }
      function fail(reason, message) {
        if (settled) return;
        settled = true;
        cleanup();
        window.FX_LAST_ERROR = message;
        console.error('[fx] ' + message + ' Подробности: FX.debug()', donor);
        reject(new Error(reason));
      }
      function onTildaError() { fail('tilda-form-error', 'Тильда сообщила об ошибке: ' + tildaError(donor) + '.'); }

      document.addEventListener('submit', guard, true);
      donor.addEventListener('tildaform:aftersuccess', onSuccess);
      donor.addEventListener('tildaform:aftererror', onTildaError);

      // Форма-приёмник спрятана, но её окно об успешной отправке всплыло бы
      // поверх страницы — посетителю мы показываем своё уведомление.
      donor.removeAttribute('data-success-popup');

      // Статус мог застрять от прошлой попытки — тогда клик молча игнорируется.
      button.tildaSendingStatus = '';
      button.click();

      // Тильда выставляет статус синхронно в обработчике клика, так что уже
      // на следующем тике видно, взялась она за отправку или нет.
      window.setTimeout(function () {
        if (settled) return;
        var status = button.tildaSendingStatus;
        if (status === '1') return; // отправка пошла, ждём событие
        if (status === '0') {
          fail('tilda-validation', 'Тильда отказалась отправлять форму: ' + tildaError(donor) + '.');
          return;
        }
        fail('tilda-not-listening', 'Форма-приёмник найдена, но Тильда её не обслуживает — ' +
          'её обработчик не сработал. Проверьте, что страница опубликована и в блоке формы ' +
          'подключён приёмник данных.');
      }, 60);

      timer = window.setTimeout(function () {
        // Приёмник ответил молча — так бывает, дальше посетителя не держим.
        onSuccess();
      }, CFG.submitTimeout);
    });
  }

  function submitViaWebhook(payload) {
    return fetch(CFG.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error('webhook-' + response.status);
    });
  }

  function send(payload) {
    var donor = findDonor();
    if (donor) {
      hideDonor(donor);
      return submitViaTilda(donor, payload);
    }
    if (CFG.webhook) return submitViaWebhook(payload);

    window.FX_LAST_ERROR = 'Приёмник заявок не найден';
    console.error('[fx] Заявка никуда не ушла. Добавьте на страницу стандартную форму Тильды ' +
      'с подключённым приёмником данных либо задайте FX_CONFIG.webhook.', payload);
    return Promise.reject(new Error('no-transport'));
  }

  function collect(form) {
    var payload = { formName: form.dataset.fxForm || 'Заявка с сайта' };
    var extra = [];
    list(form, 'input, textarea, select').forEach(function (field) {
      if (!field.name || field.type === 'submit' || !field.value) return;
      var key = field.name.toLowerCase();
      if (key === 'name' || key === 'phone' || key === 'email') payload[key] = field.value.trim();
      else extra.push((field.dataset.fxLabel || FIELD_LABELS[key] || field.name) + ': ' + field.value.trim());
    });
    if (extra.length) payload.details = extra.join('\n');
    return payload;
  }

  var OUR_FORMS = 'form.lead-card, form.final-form, form[data-fx-form]';
  var PHONE_FIELDS = 'input[name="phone"], input[type="tel"], input[inputmode="tel"]';

  /* --------------------------------------------------- маска телефона у нас */

  // Оставляет 10 цифр национального номера. Ведущая семёрка — это наш префикс
  // «+7», ведущая восьмёрка — привычная запись; и то и другое не часть номера.
  function phoneDigits(raw) {
    var digits = String(raw || '').replace(/\D/g, '');
    while (digits.length > 10 && (digits.charAt(0) === '7' || digits.charAt(0) === '8')) {
      digits = digits.slice(1);
    }
    if (digits.charAt(0) === '7' || digits.charAt(0) === '8') digits = digits.slice(1);
    return digits.slice(0, 10);
  }

  function renderPhone(digits) {
    if (!digits) return '+7 ';
    var out = '+7 (' + digits.slice(0, 3);
    if (digits.length > 3) out += ') ' + digits.slice(3, 6);
    if (digits.length > 6) out += '-' + digits.slice(6, 8);
    if (digits.length > 8) out += '-' + digits.slice(8, 10);
    return out;
  }

  function isOurPhoneField(field) {
    return field && field.matches && field.matches(PHONE_FIELDS) && field.closest('.fx-block');
  }

  // Через делегирование: поля квиза рисуются скриптом уже после запуска.
  function initPhoneMask() {
    document.addEventListener('input', function (event) {
      var field = event.target;
      if (!isOurPhoneField(field)) return;
      field.value = renderPhone(phoneDigits(field.value));
      try {
        field.setSelectionRange(field.value.length, field.value.length);
      } catch (error) { /* у некоторых типов полей выделения нет */ }
    }, true);

    document.addEventListener('focusin', function (event) {
      var field = event.target;
      if (isOurPhoneField(field) && !field.value) field.value = '+7 ';
    }, true);

    // Пустое поле возвращаем в исходное состояние, чтобы был виден плейсхолдер
    // и сработала проверка обязательного поля.
    document.addEventListener('focusout', function (event) {
      var field = event.target;
      if (isOurPhoneField(field) && !phoneDigits(field.value)) field.value = '';
    }, true);
  }

  function handleSubmit(form) {
    if (form.dataset.fxBusy === '1') return;
    if (!form.reportValidity()) return;

    // Свою проверку делаем до отправки: иначе номер уйдёт в форму Тильды,
    // и посетитель увидит её «слишком короткое значение» вместо понятного текста.
    var phoneField = form.querySelector(PHONE_FIELDS);
    if (phoneField && phoneDigits(phoneField.value).length !== 10) {
      showToast(CFG.phoneText);
      phoneField.focus();
      return;
    }

    var button = form.querySelector('button[type="submit"], button:not([type])');
    var label = button ? button.innerHTML : '';
    form.dataset.fxBusy = '1';
    if (button) { button.disabled = true; button.textContent = 'Отправляем…'; }

    send(collect(form)).then(function () {
      showToast(form.dataset.fxSuccess || CFG.successText);
      form.reset();
      openPrice();
    }).catch(function () {
      showToast(CFG.errorText);
    }).then(function () {
      form.dataset.fxBusy = '';
      if (button) { button.disabled = false; button.innerHTML = label; }
    });
  }

  // Слушаем на документе, в фазе перехвата. Вешать обработчик на каждую форму
  // нельзя: Тильда дорисовывает содержимое блоков уже после запуска рантайма,
  // и форма, появившаяся позже, осталась бы без обработчика — а значит
  // отправилась бы обычным запросом с перезагрузкой страницы.
  function initFormDelegation() {
    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.matches || !form.matches(OUR_FORMS)) return;
      if (!form.closest('.fx-block')) return;
      event.preventDefault();
      form.setAttribute('novalidate', 'novalidate');
      handleSubmit(form);
    }, true);
  }

  /* ------------------------------------------------------------- запуск */

  // Блок целиком метить нельзя: содержимое внутри него может появиться позже.
  // Каждый инициализатор сам следит, чтобы не сработать дважды на одном элементе.
  function initBlock(root) {
    root.dataset.fxReady = '1';
    initSlider(root);
    initMenu(root);
    initSticky(root);
    initPrice(root);
    initQuiz(root);
    initFaq(root);
    initTabs(root);
    initFlow(root);
  }

  var delegationReady = false;

  function initAll() {
    if (!delegationReady) {
      delegationReady = true;
      // 1.5 — Тильда не даёт задать lang у <html>, а без него поисковик хуже
      // определяет язык текста и экранная читалка берёт чужое произношение.
      // Код из HEAD выполняется до отрисовки, поэтому атрибут появляется сразу.
      if (!document.documentElement.getAttribute('lang')) {
        document.documentElement.setAttribute('lang', CFG.lang);
      }
      initFormDelegation();
      initPhoneMask();
      // Маска телефона Тильды берёт страну отсюда и только потом лезет
      // за геолокацией. Задаём заранее, пока форма не построилась.
      if (CFG.phoneCountry) window.geo_iso = CFG.phoneCountry;
    }
    var blocks = list(document, '.fx-block');
    if (!blocks.length) return;
    blocks.forEach(initBlock);
    toastEl();
    ensureBackToTop();
    var donor = findDonor();
    if (donor) hideDonor(donor);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
  window.addEventListener('load', initAll);
  // Тильда дорисовывает блоки после загрузки — подхватываем новые, но не чаще кадра.
  if (window.MutationObserver) {
    var scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () { scheduled = false; initAll(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ---------------------------------------------------------- диагностика */

  // Вызвать в консоли опубликованной страницы: FX.debug()
  function debug() {
    var donor = findDonor();
    var report = {
      'версия рантайма': VERSION + (window.FX && window.FX.mixed
        ? ' — НА СТРАНИЦЕ БЛОКИ ОТ РАЗНЫХ СБОРОК, вставьте заново все' : ''),
      'блоков на странице': list(document, '.fx-block').length,
      'форм Тильды найдено': list(document, CFG.donorSelector).length,
      'форма-приёмник': donor ? 'найдена' : 'НЕ НАЙДЕНА — добавьте блок с формой Тильды',
      'jQuery': window.jQuery ? 'есть' : 'нет',
      'скрипт форм Тильды': window.tildaForm || document.querySelector('script[src*="tilda-forms"]')
        ? 'подключён' : 'НЕ ПОДКЛЮЧЁН',
      'последняя ошибка': window.FX_LAST_ERROR || 'нет'
    };
    if (donor) {
      var invalid = list(donor, 'input, textarea, select').filter(function (field) {
        return field.willValidate && !field.checkValidity();
      });
      report['поля формы-приёмника'] = list(donor, 'input, textarea, select')
        .map(function (field) { return (field.name || '?') + ':' + (field.type || field.tagName.toLowerCase()); })
        .join(', ');
      report['обязательные поля'] = list(donor, '[required], .js-tilda-rule')
        .map(function (field) { return (field.name || '?') + '=' + (field.type === 'checkbox' ? field.checked : field.value || 'пусто'); })
        .join(', ') || 'нет';
      report['не проходят проверку'] = invalid.length
        ? invalid.map(function (field) { return field.name || '?'; }).join(', ')
        : 'нет';
      report['action формы'] = donor.getAttribute('action') || 'не задан';
      report['кнопка отправки'] = donor.querySelector('[type="submit"]') ? 'есть' : 'НЕ НАЙДЕНА — Тильда без неё не отправит';
      report['статус кнопки'] = (donor.querySelector('[type="submit"]') || {}).tildaSendingStatus || 'чистый';
      report['data-formactiontype'] = donor.getAttribute('data-formactiontype') || 'не задан';
      // Тильда считает приёмник подключённым, если есть .js-formaction-services,
      // либо formactiontype=1, либо ключ проекта на #allrecords.
      var records = document.getElementById('allrecords');
      report['js-formaction-services'] = donor.querySelectorAll('.js-formaction-services').length;
      report['ключ проекта'] = records && records.getAttribute('data-tilda-formskey') || 'нет';
      report['ошибка от Тильды'] = tildaError(donor);
      var visiblePhone = donor.querySelector('.t-input-phonemask, [name^="tildaspec-phone-part"]:not([type="hidden"])');
      var phoneResult = donor.querySelector('.js-phonemask-result, input[type="hidden"][name="Phone"]');
      if (visiblePhone || phoneResult) {
        report['телефон: видимое поле'] = visiblePhone ? (visiblePhone.value || 'пусто') : 'нет';
        report['телефон: итог для Тильды'] = phoneResult ? (phoneResult.value || 'пусто') : 'нет';
        report['страна маски'] = window.geo_iso || 'определяется по IP';
      }
      report['классы формы'] = donor.className;
      report['приёмники (formservices)'] = list(donor, '[name="formservices[]"]')
        .map(function (field) { return field.value; }).join(', ') || 'НЕ ЗАДАНЫ — приёмник не подключён';
    }
    console.table ? console.table(report) : console.log(report);
    return report;
  }

  window.FX = { version: VERSION, init: initAll, send: send, toast: showToast, debug: debug };
})();
