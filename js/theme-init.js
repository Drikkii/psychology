// Подключается синхронно в <head>, чтобы тема применилась до отрисовки страницы
// и не было вспышки светлого фона в тёмной теме.
(function () {
  'use strict';

  var root = document.documentElement;
  var theme = null;

  try {
    theme = localStorage.getItem('theme');
  } catch (e) {
    // localStorage недоступен (приватный режим, запрет cookie) — берём системную тему
  }

  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  root.setAttribute('data-theme', theme);
  root.classList.add('js');
})();
