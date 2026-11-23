/* app.js — 页面入口：启动数据加载 + 鉴权守卫 + 渲染分发 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};
  var MIGRATED_KEY = 'ts_php_migrated_v1';

  /* 清理旧静态版遗留的浏览器本地数据（仅执行一次） */
  function clearLegacy() {
    try {
      if (localStorage.getItem(MIGRATED_KEY)) return;
      localStorage.removeItem('ts_db_v1');
      localStorage.removeItem('ts_session_v1');
      sessionStorage.removeItem('ts_session_v1_tmp');
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('ts_file_') === 0) localStorage.removeItem(k);
      }
      if (window.indexedDB && indexedDB.deleteDatabase) {
        try { indexedDB.deleteDatabase('ts_files_v1'); } catch (e) { /* ignore */ }
      }
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function esc(s) {
    try {
      if (window.U && typeof U.esc === 'function') return U.esc(String(s));
    } catch (e) { /* fallthrough */ }
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function migrationHint(e) {
    if (e && (e.code === 'SERVER_ERROR' || e.code === 'BAD_RESPONSE' || e.status >= 500)) {
      return '\n\n若刚更新过代码，通常是数据库缺少后续新增的表。请先执行 web/schema.sql 中缺失的建表语句（feedbacks、feedback_replies、birthday_greetings、task_kinds、expiry_* 等），再刷新本页。';
    }
    return '';
  }

  /* 纯 DOM 兜底：即使 U/UI/Layout 没加载成功，也能看到错误而不是白屏 */
  function fatal(title, message, opts) {
    opts = opts || {};
    var root = document.getElementById('app') || document.body;
    if (!root) return;
    root.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'center-page';
    var box = document.createElement('div');
    box.className = 'state-box';
    var icon = document.createElement('div');
    icon.className = 'state-icon danger';
    icon.textContent = '!';
    var h = document.createElement('h3');
    h.className = 'state-title';
    h.textContent = title;
    var p = document.createElement('p');
    p.className = 'state-desc';
    p.style.whiteSpace = 'pre-line';
    p.textContent = message || '未知错误';
    box.appendChild(icon);
    box.appendChild(h);
    box.appendChild(p);
    if (opts.install) {
      var a = document.createElement('a');
      a.className = 'btn btn-primary';
      a.href = 'install.php';
      a.textContent = '打开安装向导';
      box.appendChild(a);
    } else {
      var btn = document.createElement('button');
      btn.className = 'btn btn-ghost';
      btn.type = 'button';
      btn.textContent = '重新加载';
      btn.addEventListener('click', function () { location.reload(); });
      box.appendChild(btn);
    }
    wrap.appendChild(box);
    root.appendChild(wrap);
  }

  /* 页脚支持说明：所有网页端页面统一追加一行，指向介绍站 */
  function mountSupport() {
    if (document.querySelector('.site-support')) return;
    var el = document.createElement('div');
    el.className = 'site-support';
    el.innerHTML = '系统支持 <a href="landing/index.html">塔斯汀门店助手</a>';
    var app = document.querySelector('.staff-app');
    if (app) {
      var nav = app.querySelector('.bottom-nav');
      if (nav) app.insertBefore(el, nav); else app.appendChild(el);
      return;
    }
    var admin = document.querySelector('.admin-app');
    if (admin) {
      (admin.querySelector('.admin-main') || admin).appendChild(el);
      return;
    }
    var auth = document.querySelector('.auth-page');
    if (auth) { auth.appendChild(el); return; }
    var root = document.getElementById('app');
    if (root) root.appendChild(el);
  }

  function boot() {
    var page = document.body.dataset.page;
    var root = document.getElementById('app');
    var guard;
    try {
      guard = Layout.guard(page);
    } catch (e) {
      console.error(e);
      fatal('页面初始化失败', '权限校验或布局脚本执行异常：' + (e.message || '未知错误') + migrationHint(e));
      return;
    }
    if (!guard.ok) {
      if (guard.denied) {
        try {
          Layout.renderDenied(root, guard.denied, guard.staff);
        } catch (e) {
          console.error(e);
          fatal('页面渲染出现异常', e.message || '未知错误');
        }
      }
      return;
    }
    var fn = window.Pages[page];
    if (typeof fn !== 'function') {
      root.innerHTML = '<div class="center-page"><p>页面正在建设中：' + esc(page) + '</p></div>';
      return;
    }
    var params = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    try {
      fn({
        root: root,
        params: params,
        meta: guard.meta,
        session: guard.session,
        staff: guard.staff
      });
    } catch (e) {
      console.error(e);
      fatal('页面渲染出现异常', (e.message || '未知错误') + migrationHint(e));
      return;
    }
    mountSupport();
  }

  function showBootError(e) {
    var install = e && e.code === 'INSTALL_REQUIRED';
    fatal('系统暂时无法启动', ((e && e.message) || '未知错误') + migrationHint(e), { install: install });
  }

  function start() {
    try {
      clearLegacy();
      /* 员工端视觉 v2：仅员工端页面挂主题，后台 admin-* 与 admin-login 保持原样 */
      var page = document.body.dataset.page || '';
      if (page !== 'admin-login' && !/^admin-/.test(page)) {
        document.body.classList.add('staff-theme');
      }
    } catch (e) {
      console.error(e);
    }

    if (typeof api === 'undefined' || !api || typeof api.bootstrap !== 'function') {
      fatal('接口脚本未正确加载', 'assets/js/api.js 不是 PHP 接口版（缺少 bootstrap），或文件未上传、被浏览器缓存。请上传 web 版 api.js 后强制刷新（Ctrl+F5）。');
      return;
    }

    var task;
    try {
      task = api.bootstrap();
    } catch (e) {
      console.error(e);
      showBootError(e);
      return;
    }
    if (!task || typeof task.then !== 'function') {
      showBootError(new Error('启动接口未返回有效结果，请检查 api.php 是否可访问'));
      return;
    }

    task.then(function (data) {
      Store.bootstrap(data);
      Auth.setSession(data.session);
      boot();
    }).catch(function (e) {
      console.error(e);
      showBootError(e);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.addEventListener('error', function (e) {
    if (e && e.message && window.console) console.error('运行异常：', e.message);
  });
})();
