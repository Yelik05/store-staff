/* zoom-lock.js — 移动端整页缩放兜底（iOS Safari 会忽略 viewport 的 user-scalable=no） */
(function () {
  'use strict';

  /* 双指 touchmove 阻止页面缩放；单指滚动与横滑不受影响 */
  function onTouchMove(e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }

  /* Safari 私有手势事件（两指捏合） */
  function onGesture(e) {
    e.preventDefault();
  }

  function bind(body) {
    if (!body || body.getAttribute('data-zoom-lock') === '1') return;
    body.setAttribute('data-zoom-lock', '1');
    body.addEventListener('touchmove', onTouchMove, { passive: false });
    body.addEventListener('gesturestart', onGesture, { passive: false });
    body.addEventListener('gesturechange', onGesture, { passive: false });
    body.addEventListener('gestureend', onGesture, { passive: false });
  }

  if (document.body) {
    bind(document.body);
  } else {
    document.addEventListener('DOMContentLoaded', function () { bind(document.body); });
  }
})();
