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

  // Safari до 14 знает только устаревший addListener
  function onMediaChange(query, handler) {
    if (query.addEventListener) {
      query.addEventListener('change', handler);
    } else if (query.addListener) {
      query.addListener(handler);
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
  const THEME_COLORS = { light: '#f7f4ef', dark: '#000000' };

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

  onMediaChange(darkQuery, () => {
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

    onMediaChange(window.matchMedia('(min-width: 901px)'), (event) => {
      if (event.matches) setMenu(false);
    });
  }

  /* ------------------------------------------------------------------------
     Бесконечная лента: по краям добавляются копии карточек, и после перехода
     на копию лента незаметно перескакивает на оригинал. Поэтому после
     последнего слайда сразу идёт первый, без прокрутки назад через все.
     ------------------------------------------------------------------------ */
  function createLoop(viewport, track, onChange) {
    const originals = Array.from(track.children);
    const count = originals.length;

    function makeClones() {
      return originals.map((el) => {
        const clone = el.cloneNode(true);
        clone.classList.add('is-clone');
        // Копии кликабельны мышью (их видно у краёв ленты), но скрыты от
        // скринридеров и клавиатуры
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        clone.querySelectorAll('a, button').forEach((node) => node.setAttribute('tabindex', '-1'));
        return clone;
      });
    }

    track.prepend(...makeClones());
    track.append(...makeClones());

    const all = Array.from(track.children);
    let pos = count;
    let busy = false;
    let fallback = null;

    function current() {
      return (((pos - count) % count) + count) % count;
    }

    function render(animate) {
      if (!animate) track.style.transition = 'none';
      track.style.transform = `translateX(${-all[pos].offsetLeft}px)`;
      if (!animate) {
        void track.offsetWidth; // применить позицию без анимации
        track.style.transition = '';
      }
    }

    function settle() {
      clearTimeout(fallback);
      busy = false;
      if (pos >= count * 2) {
        pos -= count;
        render(false);
      } else if (pos < count) {
        pos += count;
        render(false);
      }
    }

    function move(delta) {
      if (busy || !delta) return;
      busy = true;
      pos += delta;
      render(true);
      onChange(current());
      // страховка, если transitionend не придёт (вкладка в фоне и т. п.)
      fallback = setTimeout(settle, 1000);
    }

    track.addEventListener('transitionend', (event) => {
      if (event.target === track && event.propertyName === 'transform') settle();
    });

    window.addEventListener('resize', () => render(false));

    // Свайп пальцем / мышью
    let startX = null;
    let startY = null;

    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
    });

    viewport.addEventListener('pointerup', (event) => {
      if (startX === null) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        suppressClick = true;
        move(dx < 0 ? 1 : -1);
      }
    });

    // После свайпа браузер присылает click — не даём ему открыть карточку
    let suppressClick = false;
    viewport.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    viewport.addEventListener('pointerdown', () => {
      suppressClick = false;
    });

    viewport.addEventListener('pointercancel', () => {
      startX = null;
    });

    render(false);
    onChange(current());

    return {
      move,
      current,
      goTo: (index) => move(index - current()),
      onSwipe: (handler) => viewport.addEventListener('pointerup', handler)
    };
  }

  /* ------------------------------------------------------------------------
     Слайдер на главной: стрелки, точки, свайп, клавиатура, автопрокрутка
     (пауза при наведении/фокусе, отключена при «уменьшить движение»).
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const track = slider.querySelector('.slider__track');
    const slides = Array.from(track.children);
    const prev = slider.querySelector('.slider__arrow--prev');
    const next = slider.querySelector('.slider__arrow--next');
    const dotsBox = slider.querySelector('.slider__dots');
    const interval = Number(slider.getAttribute('data-autoplay')) || 0;
    let timer = null;
    let paused = false;

    const dots = slides.map((slide, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slider__dot';
      dot.setAttribute('aria-label', `Слайд ${i + 1} из ${slides.length}`);
      dotsBox.appendChild(dot);
      return dot;
    });

    function markActive(index) {
      slides.forEach((slide, n) => {
        const active = n === index;
        slide.toggleAttribute('inert', !active);
        slide.setAttribute('aria-hidden', String(!active));
      });
      dots.forEach((dot, n) => dot.setAttribute('aria-current', String(n === index)));
    }

    const loop = createLoop(slider, track, markActive);

    function restart() {
      clearInterval(timer);
      timer = null;
      if (interval && !paused && !reducedMotion.matches && !document.hidden) {
        timer = setInterval(() => loop.move(1), interval);
      }
    }

    function step(delta) {
      loop.move(delta);
      restart();
    }

    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => {
      loop.goTo(i);
      restart();
    }));

    slider.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
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
    loop.onSwipe(restart);

    restart();
  });

  /* ------------------------------------------------------------------------
     Карусели отзывов и сертификатов — та же бесконечная лента, по одной
     карточке за клик.
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const viewport = carousel.querySelector('.carousel__viewport');
    const track = carousel.querySelector('.carousel__track');
    const loop = createLoop(viewport, track, () => {});

    carousel.querySelector('[data-carousel-prev]').addEventListener('click', () => loop.move(-1));
    carousel.querySelector('[data-carousel-next]').addEventListener('click', () => loop.move(1));
  });

  /* ------------------------------------------------------------------------
     Просмотр документа во весь экран: клик по сертификату, стрелки,
     клавиши ←/→, Esc и клик по фону закрывают.
     ------------------------------------------------------------------------ */
  const lightbox = document.querySelector('[data-lightbox]');

  if (lightbox && typeof lightbox.showModal === 'function') {
    const items = Array.from(lightbox.querySelectorAll('[data-lightbox-item]')).map((el) => ({
      src: el.getAttribute('data-src'),
      title: el.getAttribute('data-title')
    }));
    const image = lightbox.querySelector('[data-lightbox-image]');
    const caption = lightbox.querySelector('[data-lightbox-caption]');
    let current = 0;

    function show(index) {
      current = (index + items.length) % items.length;
      image.src = items[current].src;
      image.alt = items[current].title;
      caption.textContent = items[current].title;
      // заранее грузим соседний документ, чтобы листание было мгновенным
      new Image().src = items[(current + 1) % items.length].src;
    }

    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-lightbox-open]');
      if (!opener) return;
      show(Number(opener.getAttribute('data-lightbox-open')));
      lightbox.showModal();
    });

    lightbox.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(current - 1));
    lightbox.querySelector('[data-lightbox-next]').addEventListener('click', () => show(current + 1));
    lightbox.querySelector('[data-lightbox-close]').addEventListener('click', () => lightbox.close());

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) lightbox.close();
    });

    lightbox.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') show(current - 1);
      else if (event.key === 'ArrowRight') show(current + 1);
    });
  }

  /* ------------------------------------------------------------------------
     Согласие на cookie и Яндекс Метрика.
     Метрика загружается только после «Принять». Изменить решение можно
     ссылкой в подвале.
     ------------------------------------------------------------------------ */
  const CONSENT_KEY = 'cookie-consent';
  const CONSENT_VERSION = 1;
  const banner = document.querySelector('[data-cookie-banner]');
  const settingsWraps = document.querySelectorAll('[data-cookie-settings-wrap]');
  const settingsButtons = document.querySelectorAll('[data-cookie-settings]');
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
    banner.hidden = !show;
    root.classList.toggle('cookie-open', show);
  }

  function renderConsent() {
    const consent = readConsent();
    if (banner) showBanner(!consent);
    settingsWraps.forEach((wrap) => {
      wrap.hidden = !consent;
    });
    settingsButtons.forEach((button) => {
      button.textContent = consent && consent.analytics
        ? 'Отключить аналитические cookie'
        : 'Включить аналитические cookie';
    });
  }

  if (banner) {
    banner.querySelector('[data-cookie-accept]').addEventListener('click', () => {
      saveConsent(true);
      renderConsent();
      loadMetrika();
    });

    banner.querySelector('[data-cookie-decline]').addEventListener('click', () => {
      saveConsent(false);
      renderConsent();
    });
  }

  settingsButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const consent = readConsent();
      if (consent && consent.analytics) {
        // Отзыв согласия: удаляем cookie Метрики и перезагружаем страницу без неё
        saveConsent(false);
        clearMetrikaCookies();
        location.reload();
      } else if (banner) {
        showBanner(true);
        banner.querySelector('[data-cookie-accept]').focus();
      }
    });
  });

  renderConsent();
  const consent = readConsent();
  if (consent && consent.analytics) loadMetrika();

  // Облачко «Написать»: меню закрывается повторным нажатием, вне его, по Esc и после выбора ссылки
  const fab = document.querySelector('[data-fab]');
  if (fab) {
    const fabToggle = fab.querySelector('.fab__toggle');
    const setFab = (open) => {
      fab.classList.toggle('is-open', open);
      fabToggle.setAttribute('aria-expanded', String(open));
    };

    fabToggle.addEventListener('click', () => setFab(!fab.classList.contains('is-open')));
    fab.querySelector('.fab__menu').addEventListener('click', (event) => {
      if (event.target.closest('a')) setFab(false);
    });
    document.addEventListener('click', (event) => {
      if (!fab.contains(event.target)) setFab(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && fab.classList.contains('is-open')) {
        setFab(false);
        fabToggle.focus();
      }
    });

    // У низа страницы облачко останавливается над строкой с политикой
    const footerLegal = document.querySelector('.footer__legal');
    if (footerLegal) {
      const FAB_LEGAL_GAP = 8;
      const liftFab = () => {
        const overlap = window.innerHeight - footerLegal.getBoundingClientRect().top + FAB_LEGAL_GAP;
        fab.style.transform = overlap > 0 ? 'translateY(-' + overlap + 'px)' : '';
      };
      liftFab();
      window.addEventListener('scroll', liftFab, { passive: true });
      window.addEventListener('resize', liftFab);
    }
  }

  // Облачко прячется, пока видны кнопки всех способов связи (CSS — только на мобилке)
  const slideContacts = document.querySelectorAll('.contact-buttons');
  if (slideContacts.length && 'IntersectionObserver' in window) {
    const visibleContacts = new Set();
    const contactsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleContacts.add(entry.target);
        else visibleContacts.delete(entry.target);
      });
      root.classList.toggle('contacts-in-view', visibleContacts.size > 0);
    });
    slideContacts.forEach((el) => contactsObserver.observe(el));
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
     Кнопки «Скопировать номер»
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-copy]').forEach((button) => {
    const label = button.textContent;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.getAttribute('data-copy'));
        button.textContent = 'Номер скопирован';
      } catch (e) {
        button.textContent = button.getAttribute('data-copy');
      }
      setTimeout(() => {
        button.textContent = label;
      }, 2500);
    });
  });

  /* ------------------------------------------------------------------------
     Текущий год в подвале
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
})();
