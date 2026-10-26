'use strict';

(function () {
  const root = document.documentElement;
  const config = window.SITE_CONFIG || {};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // хранилище недоступно — настройка просто не запомнится
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // хранилище недоступно
    }
  }

  /* ------------------------------------------------------------------------
     Тема: по умолчанию системная, переключатель запоминает ручной выбор.
     Если ручной выбор совпал с системным — снова следуем за системой.
     ------------------------------------------------------------------------ */
  const THEME_KEY = 'theme';
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const themeSwitches = document.querySelectorAll('.theme-switch');
  const themeColorMeta = document.querySelectorAll('meta[name="theme-color"]');
  const THEME_COLORS = { light: '#f7f4ef', dark: '#151715' };

  function systemTheme() {
    return darkQuery.matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    themeSwitches.forEach((el) => el.setAttribute('aria-checked', String(theme === 'dark')));
    themeColorMeta.forEach((el) => el.setAttribute('content', THEME_COLORS[theme]));
  }

  function storedTheme() {
    const value = storageGet(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  }

  applyTheme(storedTheme() || systemTheme());

  themeSwitches.forEach((el) => {
    el.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      if (next === systemTheme()) {
        storageRemove(THEME_KEY);
      } else {
        storageSet(THEME_KEY, next);
      }
      applyTheme(next);
    });
  });

  darkQuery.addEventListener('change', () => {
    if (!storedTheme()) applyTheme(systemTheme());
  });

  // Синхронизация между открытыми вкладками
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) applyTheme(storedTheme() || systemTheme());
  });

  /* ------------------------------------------------------------------------
     Мобильное меню
     ------------------------------------------------------------------------ */
  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('.nav-toggle');

  function setMenu(open) {
    if (!header || !navToggle) return;
    header.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        navToggle.focus();
      }
    });

    window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
      if (event.matches) setMenu(false);
    });
  }

  /* ------------------------------------------------------------------------
     Слайдер на главной: стрелки, точки, свайп, клавиатура, автопрокрутка
     (пауза при наведении/фокусе, отключена при «уменьшить движение»).
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const track = slider.querySelector('.slider__track');
    const slides = Array.from(slider.querySelectorAll('.slide'));
    const prev = slider.querySelector('.slider__arrow--prev');
    const next = slider.querySelector('.slider__arrow--next');
    const dotsBox = slider.querySelector('.slider__dots');
    const interval = Number(slider.getAttribute('data-autoplay')) || 0;
    let index = 0;
    let timer = null;
    let paused = false;

    const dots = slides.map((slide, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slider__dot';
      dot.setAttribute('aria-label', `Слайд ${i + 1} из ${slides.length}`);
      dot.addEventListener('click', () => {
        goTo(i);
        restart();
      });
      dotsBox.appendChild(dot);
      return dot;
    });

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(${-index * 100}%)`;
      slides.forEach((slide, n) => {
        const active = n === index;
        slide.toggleAttribute('inert', !active);
        slide.setAttribute('aria-hidden', String(!active));
      });
      dots.forEach((dot, n) => dot.setAttribute('aria-current', String(n === index)));
    }

    function stop() {
      clearInterval(timer);
      timer = null;
    }

    function restart() {
      stop();
      if (interval && !paused && !reducedMotion.matches && !document.hidden) {
        timer = setInterval(() => goTo(index + 1), interval);
      }
    }

    prev.addEventListener('click', () => {
      goTo(index - 1);
      restart();
    });

    next.addEventListener('click', () => {
      goTo(index + 1);
      restart();
    });

    slider.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        goTo(index - 1);
        restart();
      } else if (event.key === 'ArrowRight') {
        goTo(index + 1);
        restart();
      }
    });

    function pause(state) {
      paused = state;
      restart();
    }

    slider.addEventListener('mouseenter', () => pause(true));
    slider.addEventListener('mouseleave', () => pause(false));
    slider.addEventListener('focusin', () => pause(true));
    slider.addEventListener('focusout', (event) => {
      if (!slider.contains(event.relatedTarget)) pause(false);
    });
    document.addEventListener('visibilitychange', restart);

    // Свайп пальцем / мышью
    let startX = null;
    let startY = null;

    slider.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
    });

    slider.addEventListener('pointerup', (event) => {
      if (startX === null) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        goTo(dx < 0 ? index + 1 : index - 1);
        restart();
      }
    });

    slider.addEventListener('pointercancel', () => {
      startX = null;
    });

    goTo(0);
    restart();
  });

  /* ------------------------------------------------------------------------
     Карусель сертификатов (горизонтальная прокрутка со стрелками)
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('.carousel__track');
    const prev = carousel.querySelector('[data-carousel-prev]');
    const next = carousel.querySelector('[data-carousel-next]');

    function update() {
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    }

    function scrollByPage(direction) {
      track.scrollBy({
        left: direction * track.clientWidth * 0.8,
        behavior: reducedMotion.matches ? 'auto' : 'smooth'
      });
    }

    prev.addEventListener('click', () => scrollByPage(-1));
    next.addEventListener('click', () => scrollByPage(1));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  /* ------------------------------------------------------------------------
     Согласие на cookie и Яндекс Метрика.
     Метрика загружается ТОЛЬКО после нажатия «Принять».
     ------------------------------------------------------------------------ */
  const CONSENT_KEY = 'cookie-consent';
  const CONSENT_VERSION = 1;
  const banner = document.querySelector('[data-cookie-banner]');
  let metrikaLoaded = false;

  function readConsent() {
    try {
      const value = JSON.parse(storageGet(CONSENT_KEY));
      if (value && value.v === CONSENT_VERSION) return value;
    } catch (e) {
      // повреждённая запись — спросим заново
    }
    return null;
  }

  function saveConsent(analytics) {
    storageSet(CONSENT_KEY, JSON.stringify({
      v: CONSENT_VERSION,
      analytics: analytics,
      date: new Date().toISOString()
    }));
  }

  function loadMetrika() {
    const id = Number(config.metrikaId);
    if (!id || metrikaLoaded) return;
    metrikaLoaded = true;

    window.ym = window.ym || function () {
      (window.ym.a = window.ym.a || []).push(arguments);
    };
    window.ym.l = Date.now();

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js';
    document.head.appendChild(script);

    window.ym(id, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      // Вебвизор выключен: запись сессий на сайте психолога избыточна
      webvisor: false
    });
  }

  function clearMetrikaCookies() {
    const host = location.hostname;
    const domains = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    document.cookie.split(';').forEach((part) => {
      const name = part.split('=')[0].trim();
      if (!name.startsWith('_ym')) return;
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; path=/` + (domain ? `; domain=${domain}` : '');
      });
    });
  }

  function showBanner(show) {
    if (banner) banner.hidden = !show;
  }

  if (banner) {
    banner.querySelector('[data-cookie-accept]').addEventListener('click', () => {
      saveConsent(true);
      showBanner(false);
      loadMetrika();
    });

    banner.querySelector('[data-cookie-decline]').addEventListener('click', () => {
      const previous = readConsent();
      saveConsent(false);
      showBanner(false);
      if (previous && previous.analytics) {
        // Скрипт уже работает на странице — удаляем его cookie и перезагружаем без него
        clearMetrikaCookies();
        location.reload();
      }
    });
  }

  document.querySelectorAll('[data-cookie-settings]').forEach((button) => {
    button.addEventListener('click', () => showBanner(true));
  });

  const consent = readConsent();
  if (!consent) {
    showBanner(true);
  } else if (consent.analytics) {
    loadMetrika();
  }

  // Цели Метрики: клики по кнопкам связи (data-goal="telegram" и т. п.)
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-goal]');
    const id = Number(config.metrikaId);
    if (link && id && metrikaLoaded && typeof window.ym === 'function') {
      window.ym(id, 'reachGoal', 'contact_' + link.getAttribute('data-goal'));
    }
  });

  /* ------------------------------------------------------------------------
     Текущий год в подвале
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
})();
