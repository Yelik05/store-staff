/* site-title.js — 站点标题（部署版）：先用本地缓存即时渲染，再向服务端拉取最新配置 */
(function (global) {
  'use strict';

  var DEFAULT_TITLE = '塔斯汀门店人员管理系统';
  var CACHE_KEY = 'ts_site_title';
  var raw = document.title || '';
  var label = raw.indexOf(' · ') >= 0 ? raw.split(' · ')[0].replace(/\s+/g, ' ').trim() : '';
  var current = DEFAULT_TITLE;

  function norm(v) {
    var s = String(v || '').replace(/\s+/g, ' ').trim();
    return s || DEFAULT_TITLE;
  }

  try {
    var cached = localStorage.getItem(CACHE_KEY);
    if (cached) current = norm(cached);
  } catch (e) { /* ignore */ }

  function render() {
    document.title = label ? label + ' · ' + current : current;
  }

  var SiteTitle = {
    DEFAULT: DEFAULT_TITLE,
    get: function () { return current; },
    /* 保存配置后立即生效，并写入缓存供其它页面下次加载使用 */
    set: function (v) {
      current = norm(v);
      try { localStorage.setItem(CACHE_KEY, current); } catch (e) { /* ignore */ }
      render();
      return current;
    },
    apply: function (v) {
      current = norm(v);
      render();
      return current;
    }
  };

  render();
  global.SiteTitle = SiteTitle;

  /* 公开接口：未登录页面（登录、注册、公示、公告）同样能拿到站点标题 */
  try {
    fetch('api.php?action=public.siteTitle', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (res) {
      return res.json();
    }).then(function (d) {
      /* 接口统一返回 { ok, data }；仅成功且含标题时套用 */
      var title = d && d.ok && d.data ? d.data.siteTitle : '';
      if (title) SiteTitle.set(title);
    }).catch(function () { /* 离线时沿用缓存/默认值 */ });
  } catch (e) { /* ignore */ }
})(window);
