/* util.js — 通用工具函数（无依赖，file:// 可直接运行） */
(function (global) {
  'use strict';

  var U = {};

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
      else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (sk) { node.style[sk] = v[sk]; });
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  U.esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  U.uid = function (prefix) {
    var s = (prefix || 'ID') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    return s;
  };

  U.seq = function (arr, field, prefix) {
    var max = 0;
    (arr || []).forEach(function (it) {
      var m = String(it[field] || '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return prefix + String(max + 1).padStart(3, '0');
  };

  U.pad = function (n, len) { return String(n).padStart(len || 2, '0'); };

  U.today = function () {
    var d = new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.now = function () { return new Date().toISOString(); };

  U.dateStr = function (d) {
    if (!d) return '';
    if (typeof d === 'string') return d.slice(0, 10);
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.parseDate = function (s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split('-');
    if (p.length !== 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };

  U.diffDays = function (dateStr, base) {
    var a = U.parseDate(dateStr);
    var b = base ? U.parseDate(base) : U.parseDate(U.today());
    if (!a || !b) return 0;
    return Math.round((a - b) / 86400000);
  };

  U.addDays = function (dateStr, n) {
    var d = U.parseDate(dateStr) || new Date();
    d.setDate(d.getDate() + n);
    return U.dateStr(d);
  };

  U.curMonth = function () { return U.today().slice(0, 7); };

  U.monthOf = function (dateStr) { return String(dateStr || '').slice(0, 7); };

  U.monthLabel = function (month) {
    if (!month) return '';
    var p = month.split('-');
    return p[0] + ' 年 ' + Number(p[1]) + ' 月';
  };

  U.prevMonth = function (month) {
    var p = String(month).split('-');
    var y = Number(p[0]), m = Number(p[1]) - 1;
    if (m === 0) { m = 12; y -= 1; }
    return y + '-' + U.pad(m);
  };

  U.nextMonth = function (month) {
    var p = String(month).split('-');
    var y = Number(p[0]), m = Number(p[1]) + 1;
    if (m === 13) { m = 1; y += 1; }
    return y + '-' + U.pad(m);
  };

  U.monthRange = function (month, back) {
    var arr = [], m = month;
    for (var i = 0; i < (back || 6); i++) { arr.push(m); m = U.prevMonth(m); }
    return arr.reverse();
  };

  U.monthLastDay = function (month) {
    var p = String(month).split('-');
    var d = new Date(Number(p[0]), Number(p[1]), 0);
    return U.dateStr(d);
  };

  U.fmtTime = function (iso, withSec) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var s = d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()) + ' ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    if (withSec) s += ':' + U.pad(d.getSeconds());
    return s;
  };

  U.fmtDate = function (iso) {
    if (!iso) return '—';
    return String(iso).slice(0, 10);
  };

  U.money = function (n) {
    var v = Number(n || 0);
    var neg = v < 0;
    v = Math.abs(v);
    var parts = v.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts[0] + '.' + parts[1];
  };

  /* 统一工号展示：飞书工号优先，为空时回退门店工号 */
  U.empNoOf = function (s) {
    if (!s) return '';
    return String(s.feishuEmpNo || s.empNo || '').trim();
  };

  U.round2 = function (n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  };

  U.num = function (v, def) {
    if (v === '' || v === null || v === undefined) return def === undefined ? 0 : def;
    var n = Number(v);
    return isNaN(n) ? (def === undefined ? 0 : def) : n;
  };

  /* 身份证号脱敏：前 3 位 + 后 4 位 */
  U.maskId = function (id) {
    if (!id) return '—';
    var s = String(id);
    if (s.length < 8) return s;
    return s.slice(0, 3) + '*'.repeat(s.length - 7) + s.slice(-4);
  };

  U.maskPhone = function (p) {
    if (!p) return '—';
    var s = String(p);
    if (s.length < 8) return s;
    return s.slice(0, 3) + '****' + s.slice(-4);
  };

  U.nameIndex = function (name) {
    return String(name || '?').slice(-2);
  };

  U.avg = function (arr) {
    if (!arr.length) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  };

  U.download = function (filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
  };

  U.csvCell = function (v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  U.toCSV = function (headers, rows) {
    var lines = [headers.map(U.csvCell).join(',')];
    rows.forEach(function (r) { lines.push(r.map(U.csvCell).join(',')); });
    return '\ufeff' + lines.join('\r\n');
  };

  U.svgData = function (svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  /* 演示用 SVG 头像（姓名尾两字） */
  U.avatarSvg = function (name, bg) {
    var txt = U.nameIndex(name);
    var color = bg || '#E10600';
    return U.svgData('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280">' +
      '<rect width="200" height="280" fill="#F2F3F5"/>' +
      '<circle cx="100" cy="105" r="46" fill="' + color + '" opacity="0.12"/>' +
      '<circle cx="100" cy="96" r="30" fill="' + color + '" opacity="0.55"/>' +
      '<path d="M100 134c-34 0-56 20-56 46v100h112V180c0-26-22-46-56-46z" fill="' + color + '" opacity="0.35"/>' +
      '<text x="100" y="250" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="22" fill="#6B7280" text-anchor="middle">' + U.esc(txt) + '</text>' +
      '</svg>');
  };

  global.U = U;
})(window);
