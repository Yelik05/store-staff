/* store.js — Web（PHP 接口版）
 * 说明：本文件与静态版 assets/js/store.js 必须不同。
 * 静态版用 localStorage 存整库；Web 版只缓存 bootstrap 返回的当前会话数据，
 * 业务数据一律通过 api.php 读写。请勿用静态版覆盖本文件。
 */
(function (global) {
  'use strict';

  var SESSION_LS = 'ts_web_session_v1';
  var SESSION_SS = 'ts_web_session_v1';
  var PORTAL_KEY = 'ts_portal';

  var data = {
    session: null,
    staff: null,
    store: {},
    settings: {},
    nextEmpNo: '',
    accounts: [],
    shiftStations: [],
    dailyShifts: []
  };

  function getSessionRaw() {
    var raw = null, from = '';
    try {
      raw = localStorage.getItem(SESSION_LS);
      if (raw) from = 'local';
      if (!raw) { raw = sessionStorage.getItem(SESSION_SS); if (raw) from = 'session'; }
    } catch (e) { return null; }
    if (!raw) return null;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return null; }
    if (!s || !s.token) return null;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return null;
    s._persist = from;
    return s;
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_LS);
      sessionStorage.removeItem(SESSION_SS);
    } catch (e) { /* ignore */ }
  }

  var Store = {
    /* 由 app.js / index.html 在 api.bootstrap() 成功后调用 */
    bootstrap: function (d) {
      d = d || {};
      data.session = d.session || null;
      data.staff = d.staff || null;
      data.store = d.store || {};
      data.settings = d.settings || {};
      data.nextEmpNo = d.nextEmpNo || '';
      data.accounts = d.accounts || [];
      data.shiftStations = d.shiftStations || [];
      data.dailyShifts = d.dailyShifts || [];
    },

    /* Web 版只缓存当前登录员工；其他员工请走 api.staffProfile / api.listStaff */
    getStaff: function (id) {
      if (!id) return null;
      if (data.staff && String(data.staff.id) === String(id)) return data.staff;
      var hit = (data.accounts || []).filter(function (a) { return a.staffId && String(a.staffId) === String(id); })[0];
      return hit || null;
    },

    settings: function () { return data.settings || {}; },
    storeInfo: function () { return data.store || {}; },
    nextEmpNo: function () { return data.nextEmpNo || ''; },
    shiftStations: function () { return data.shiftStations || []; },
    dailyShifts: function () { return data.dailyShifts || []; },

    /* 操作日志写入服务端；页面脚本按同步方式调用，因此不阻塞 UI */
    log: function (action, target, detail) {
      try {
        if (typeof api !== 'undefined' && api && typeof api.writeLog === 'function') {
          api.writeLog(action, target || '—', detail || '').catch(function () { /* 日志失败不影响业务 */ });
        }
      } catch (e) { /* ignore */ }
    },

    db: {
      get accounts() { return data.accounts; },
      get staff() { return data.staff ? [data.staff] : []; },
      get settings() { return data.settings; },
      get store() { return data.store; },
      get shiftStations() { return data.shiftStations; },
      get dailyShifts() { return data.dailyShifts; }
    }
  };

  var Auth = {
    current: function () {
      var s = getSessionRaw();
      if (!s) return null;
      if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) { clearSession(); return null; }
      return s;
    },

    setSession: function (s) {
      clearSession();
      if (!s) return null;
      try {
        if (s.expiresAt) localStorage.setItem(SESSION_LS, JSON.stringify(s));
        else sessionStorage.setItem(SESSION_SS, JSON.stringify(s));
      } catch (e) { /* ignore */ }
      return s;
    },

    /* 兼容旧调用：部分页面仍可能使用 Auth.start */
    start: function (payload, remember) {
      return Auth.setSession(Object.assign({ token: 'tk_' + Date.now().toString(36) }, payload, {
        loginAt: new Date().toISOString(),
        expiresAt: remember ? new Date(Date.now() + 7 * 86400000).toISOString() : null
      }));
    },

    logout: function () { clearSession(); },

    isAdmin: function () {
      var s = Auth.current();
      return !!s && (s.role === 'admin' || s.role === 'superadmin');
    },

    isSuper: function () {
      var s = Auth.current();
      return !!s && s.role === 'superadmin';
    },

    setPortal: function (role) {
      try { localStorage.setItem(PORTAL_KEY, role === 'superadmin' ? 'admin' : 'staff'); } catch (e) { /* ignore */ }
    },

    loginPage: function () {
      var s = Auth.current();
      if (s) return s.role === 'superadmin' ? 'admin-login.html' : 'login.html';
      var p = '';
      try { p = localStorage.getItem(PORTAL_KEY) || ''; } catch (e) { /* ignore */ }
      return p === 'admin' ? 'admin-login.html' : 'login.html';
    },

    home: function () {
      var s = Auth.current();
      if (!s) return Auth.loginPage();
      if (s.role === 'staff') {
        var st = Store.getStaff(s.staffId);
        if (st && (st.status === 'pending' || st.status === 'rejected')) return 'pending.html';
      }
      return 'profile.html';
    }
  };

  global.Store = Store;
  global.Auth = Auth;
})(window);
