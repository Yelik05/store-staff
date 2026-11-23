/* theme.js — 外观模式：跟随系统 / 浅色 / 深色，记住手动选择 */
(function (global) {
  'use strict';

  var KEY = 'ts_theme';
  var MODES = ['auto', 'light', 'dark'];
  var media = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function safeGet() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function safeSet(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }
  function normalize(v) {
    return MODES.indexOf(v) >= 0 ? v : 'auto';
  }
  function get() {
    return normalize(safeGet());
  }
  function resolved(mode) {
    mode = normalize(mode || get());
    return mode === 'dark' || (mode === 'auto' && media && media.matches) ? 'dark' : 'light';
  }
  function label(mode) {
    mode = normalize(mode);
    return mode === 'auto' ? '跟随系统' : (mode === 'light' ? '浅色' : '深色');
  }
  function icon(mode) {
    mode = normalize(mode);
    var common = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    if (mode === 'light') {
      return '<svg ' + common + '><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>';
    }
    if (mode === 'dark') {
      return '<svg ' + common + '><path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
    }
    return '<svg ' + common + '><circle cx="12" cy="12" r="8.2"/><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4Z" fill="currentColor" stroke="none"/></svg>';
  }
  function syncControls() {
    var mode = get();
    var list = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      el.setAttribute('data-mode', mode);
      el.setAttribute('aria-label', '外观：' + label(mode) + '（点击切换）');
      el.setAttribute('title', '外观：' + label(mode));
      var glyph = el.querySelector('[data-theme-glyph]');
      if (glyph) glyph.innerHTML = icon(mode);
    }
    var sets = document.querySelectorAll('[data-theme-set]');
    for (var j = 0; j < sets.length; j++) {
      sets[j].classList.toggle('active', sets[j].getAttribute('data-theme-set') === mode);
      sets[j].setAttribute('aria-pressed', sets[j].getAttribute('data-theme-set') === mode ? 'true' : 'false');
    }
  }
  function apply() {
    var mode = get();
    var theme = resolved(mode);
    document.documentElement.setAttribute('data-mode', mode);
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F0F0F' : '#F5F4F2');
    syncControls();
    try {
      global.dispatchEvent(new CustomEvent('themechange', { detail: { mode: mode, theme: theme } }));
    } catch (e) {}
  }
  function set(mode) {
    mode = normalize(mode);
    safeSet(mode);
    apply();
    return mode;
  }
  function cycle() {
    var mode = get();
    var next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    return set(next);
  }
  function markMotion() {
    try {
      var nav = global.navigator || {};
      var low = (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) ||
        (nav.deviceMemory > 0 && nav.deviceMemory <= 4);
      if (low) document.documentElement.classList.add('motion-low');
    } catch (e) {}
  }
  function init() {
    markMotion();
    apply();
    if (media) {
      var onChange = function () { if (get() === 'auto') apply(); };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncControls);
    } else {
      syncControls();
    }
  }

  global.Theme = {
    KEY: KEY,
    get: get,
    set: set,
    cycle: cycle,
    resolved: resolved,
    label: label,
    icon: icon,
    apply: apply,
    sync: syncControls
  };
  init();
})(window);
