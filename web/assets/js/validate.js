/* validate.js — 集中校验规则（第 6 章 V01—V25），表单与接口共用 */
(function (global) {
  'use strict';

  var V = {};

  var ID_WEIGHT = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var ID_CODE = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

  V.POSITIONS = ['店长', '店助', '值班经理', '店员'];
  V.EMPLOYMENT_TYPES = ['全职', '兼职', '小时工'];

  V.checkIdCard = function (id) {
    id = String(id || '').trim().toUpperCase();
    if (!/^[1-9]\d{16}[\dX]$/.test(id)) return false;
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += Number(id[i]) * ID_WEIGHT[i];
    return ID_CODE[sum % 11] === id[17];
  };

  V.idMeta = function (id) {
    id = String(id || '').trim().toUpperCase();
    if (id.length !== 18) return null;
    var y = id.slice(6, 10), m = id.slice(10, 12), d = id.slice(12, 14);
    return {
      birth: y + '-' + m + '-' + d,
      gender: Number(id[16]) % 2 === 1 ? '男' : '女'
    };
  };

  V.name = function (v) {
    var s = String(v || '').trim();
    if (!/^[\u4e00-\u9fa5A-Za-z]{2,20}$/.test(s)) return '请输入 2—20 个字的姓名，不要包含数字或符号';
    return '';
  };

  V.phone = function (v) {
    if (!/^1[3-9]\d{9}$/.test(String(v || '').trim())) return '请输入正确的 11 位手机号';
    return '';
  };

  V.password = function (v) {
    var s = String(v || '');
    if (!/^.{6,20}$/.test(s) || !/[A-Za-z]/.test(s) || !/\d/.test(s)) return '密码需 6—20 位，且包含字母和数字';
    return '';
  };

  V.address = function (v) {
    var s = String(v || '').trim();
    if (s.length < 5 || s.length > 80) return '现居住地址请填写到具体门牌，不少于 5 个字';
    if (/^\d+$/.test(s)) return '现居住地址请填写到具体门牌，不少于 5 个字';
    return '';
  };

  V.remark = function (v, max) {
    if (String(v || '').length > (max || 200)) return '内容不能超过 ' + (max || 200) + ' 个字';
    return '';
  };

  V.idCardExpiry = function (v) {
    if (!v) return '';
    if (U.diffDays(v) < 0) return '该身份证已过期，请更换后再提交';
    return '';
  };

  V.healthExpiry = function (v) {
    if (!v) return '健康证已过期或未填写有效期，请补充';
    if (U.diffDays(v) < 0) return '健康证已过期或未填写有效期，请补充';
    return '';
  };

  V.hireDate = function (v) {
    if (!v) return '请选择入职日期';
    var d = U.diffDays(v);
    if (U.diffDays(v, '2010-01-01') < 0) return '入职日期超出可填写范围，请核对';
    if (d > 30) return '入职日期超出可填写范围，请核对';
    return '';
  };

  V.amount = function (v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    if (isNaN(n) || n < 0) return '金额需为不小于 0 的数字，最多两位小数';
    if (!/^\d+(\.\d{1,2})?$/.test(String(v).trim())) return '金额需为不小于 0 的数字，最多两位小数';
    if (n > 999999.99) return '金额需为不小于 0 的数字，最多两位小数';
    return '';
  };

  V.days = function (v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    if (isNaN(n) || n < 0 || n > 31) return '天数需为 0—31 之间的数字';
    return '';
  };

  V.dimScore = function (v, full) {
    var n = Number(v);
    if (v === '' || isNaN(n)) return '得分需在 0—' + full + ' 之间';
    if (n < 0 || n > full) return '得分需在 0—' + full + ' 之间';
    return '';
  };

  V.rejectReason = function (v) {
    if (String(v || '').trim().length < 5) return '请填写至少 5 个字的驳回原因，便于员工修改';
    return '';
  };

  V.leaveDate = function (date, today) {
    today = today || U.today();
    if (!date) return '请选择休息日期';
    if (U.monthOf(date) !== U.monthOf(today)) return '排休需选择当月日期';
    var diff = U.diffDays(date, today);
    if (diff < 0) return '休息日期不能早于今天，请选择今天或之后的日期';
    return '';
  };

  /* 将字段错误渲染到 .field[data-field] 内 */
  V.applyFieldError = function (form, field, msg) {
    if (!form) return;
    var wrap = form.querySelector('[data-field="' + field + '"]');
    if (!wrap) return;
    wrap.classList.toggle('has-error', !!msg);
    var box = wrap.querySelector('.error-text');
    if (!box) {
      box = document.createElement('div');
      box.className = 'error-text';
      wrap.appendChild(box);
    }
    box.textContent = msg || '';
  };

  V.clearErrors = function (form) {
    if (!form) return;
    U.$$('.has-error', form).forEach(function (n) { n.classList.remove('has-error'); });
    U.$$('.error-text', form).forEach(function (n) { n.textContent = ''; });
  };

  global.V = V;
})(window);
