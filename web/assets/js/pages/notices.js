/* P16 员工端 — 通知（已并入信箱，保留旧链接兼容） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['notices'] = function () {
    location.replace('messages.html?view=notices');
  };
})();
