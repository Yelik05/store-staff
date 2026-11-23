/* api.js — 数据访问统一入口：全部通过 PHP 接口读写 MySQL */
(function (global) {
  'use strict';

  var API_URL = 'api.php';

  function err(msg, extra) {
    var e = new Error(msg);
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  /* 服务端 500 / 非 JSON 时给出可执行的排查提示，避免只显示“未知错误” */
  function dbHint(status, code) {
    if (code === 'SERVER_ERROR' || status >= 500) {
      return '；可能是数据库缺少后续新增的表（feedbacks、feedback_replies、birthday_greetings、task_kinds、expiry_* 等）或 PHP 报错，请先执行 schema.sql 中缺失的建表语句，再查看 PHP 错误日志';
    }
    return '';
  }

  /* 导入行字段归一：兼容旧版解析器输出的 workDate / emp_no / staffName 等字段名，
   * 统一成 date / empNo / name / month，避免前端解析器与导入接口版本不一致导致整批为空 */
  function normalizeImportRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (r) {
      if (!r || typeof r !== 'object') return r;
      var o = {};
      Object.keys(r).forEach(function (k) { o[k] = r[k]; });
      if ((o.date === undefined || o.date === '') && o.workDate !== undefined) o.date = o.workDate;
      if ((o.date === undefined || o.date === '') && o.work_date !== undefined) o.date = o.work_date;
      if ((o.empNo === undefined || o.empNo === '') && o.emp_no !== undefined) o.empNo = o.emp_no;
      if ((o.name === undefined || o.name === '') && o.staffName !== undefined) o.name = o.staffName;
      if ((o.name === undefined || o.name === '') && o.staff_name !== undefined) o.name = o.staff_name;
      if ((o.month === undefined || o.month === '') && o.salaryMonth !== undefined) o.month = o.salaryMonth;
      return o;
    });
  }

  function call(action, params) {
    var url = API_URL + '?action=' + encodeURIComponent(action);
    var isForm = (typeof FormData !== 'undefined') && (params instanceof FormData);
    var opts = {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {}
    };
    if (isForm) {
      opts.body = params;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(params || {});
    }
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        if (!json) {
          throw err('服务器返回异常（HTTP ' + res.status + '），请检查 PHP 错误日志' + dbHint(res.status, 'BAD_RESPONSE'), { code: 'BAD_RESPONSE', status: res.status });
        }
        if (!json.ok) {
          var code = json.code || 'API_ERROR';
          throw err((json.error || '请求失败') + dbHint(res.status, code), {
            code: code,
            status: res.status,
            missing: json.missing,
            conflictName: json.conflictName
          });
        }
        return json.data;
      });
    }).catch(function (e) {
      if (e && e.code && e.message) throw e;
      throw err('网络连接异常，请检查网络或服务器状态', { code: 'NETWORK' });
    });
  }

  function num(v) { return U.num(v); }

  function calcSalary(o) {
    var gross = U.round2(num(o.baseSalary) + num(o.postAllowance) + num(o.performancePay) +
      num(o.fullAttendance) + num(o.dailyOvertimePay) + num(o.statutoryHolidayPay) +
      num(o.mealSubsidy) + num(o.transportSubsidy) + num(o.attendanceSubsidy) +
      num(o.socialSubsidy) + num(o.commission));
    var deduction = U.round2(num(o.inventoryDeduction) + num(o.lateDeduction) +
      num(o.attendanceDiff) + num(o.leaveDeduction) + num(o.disciplineDeduction) +
      num(o.otherDeduction) + num(o.insurance) + num(o.tax));
    return { grossPay: gross, deductionTotal: deduction, netPay: U.round2(gross - deduction) };
  }

  function gradeOf(total) {
    var grades = (Store.settings().grades || []).slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < grades.length; i++) if (total >= grades[i].min) return grades[i];
    return grades[grades.length - 1] || { key: 'D', min: 0, coef: 0.5, desc: '待改进' };
  }

  function expiryInfo(staff) {
    var cfg = Store.settings().expiry || { healthCert: 30, idCard: 60 };
    function calc(date, threshold) {
      if (!date) return { state: 'none', days: null };
      var days = U.diffDays(date);
      if (days < 0) return { state: 'expired', days: days };
      if (days <= threshold) return { state: 'soon', days: days };
      return { state: 'ok', days: days };
    }
    return {
      health: calc(staff.healthCertExpiry, cfg.healthCert),
      id: calc(staff.idCardExpiry, cfg.idCard)
    };
  }

  function fileUrl(key) {
    if (!key) return '';
    if (/^https?:\/\//.test(key) || key.indexOf('uploads/') === 0) return key;
    if (key.indexOf('demo/') === 0) return '';
    return 'uploads/' + key.replace(/^\/+/, '');
  }

  var Api = {
    /* ---------- 启动与账号 ---------- */
    getPublicNotice: function (id) { return call('public.notice', { id: id }); },

    scheduleList: function (params) { return call('schedule.list', params || {}); },
    scheduleSave: function (payload) { return call('schedule.save', payload || {}); },
    scheduleCancel: function (id) { return call('schedule.cancel', { id: id }); },
    scheduleRemove: function (id) { return call('schedule.remove', { id: id }); },

    bootstrap: function () { return call('auth.bootstrap'); },

    login: function (params) {
      return call('auth.login', params).then(function (res) {
        if (res && res.session) Auth.setSession(res.session);
        if (res && res.role) Auth.setPortal(res.role);
        return res;
      });
    },

    logout: function () {
      return call('auth.logout').catch(function () { return { ok: true }; }).then(function (r) {
        Auth.logout();
        return r;
      });
    },

    getMe: function () { return call('staff.me'); },

    register: function (payload) { return call('auth.register', payload); },
    checkUnique: function (params) { return call('auth.checkUnique', params); },
    resubmitRegistration: function (payload) { return call('auth.resubmit', payload); },
    updateMe: function (req) { return call('staff.updateMe', req); },
    saveMyProfile: function (payload) { return call('staff.saveMe', payload || {}); },

    listCorrections: function (filter) { return call('staff.corrections.list', filter || {}); },
    resolveCorrection: function (params) { return call('staff.corrections.resolve', params); },

    /* ---------- 档案 ---------- */
    listStaff: function (params) { return call('staff.list', params || {}); },
    getStaff: function (id) { return call('staff.get', { id: id }); },
    staffProfile: function (id) { return call('staff.profile', { id: id }); },
    reviewStaff: function (params) { return call('staff.review', params); },
    resignStaff: function (params) { return call('staff.resign', params); },
    reactivateStaff: function (staffId) { return call('staff.reactivate', { staffId: staffId }); },
    saveRemark: function (staffId, remark) { return call('staff.remark', { staffId: staffId, remark: remark }); },
    updateStaff: function (staffId, patch) { return call('staff.update', { staffId: staffId, patch: patch }); },

    /* ---------- 附件（服务器 uploads 目录） ---------- */
    uploadFile: function (file, type) {
      return new Promise(function (resolve, reject) {
        if (!file) return reject(err('请选择文件'));
        var ext = String(file.name || '').split('.').pop().toLowerCase();
        var isPdf = ext === 'pdf' || file.type === 'application/pdf';
        var isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif'].indexOf(ext) >= 0 || /^image\/(jpeg|png|webp|gif)/.test(file.type);
        if (type === 'reimburse' || type === 'healthVerify') {
          var label = type === 'healthVerify' ? '核验材料' : '报销附件';
          var reimburseOk = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].indexOf(ext) >= 0 || isPdf || isImg;
          if (!reimburseOk) return reject(err(label + '支持 JPG、PNG、WEBP 或 PDF'));
          if (file.size > 10 * 1024 * 1024) return reject(err(label + '单个不能超过 10MB'));
        } else if (type === 'healthCert') {
          if (!isPdf) return reject(err('健康证需为 PDF 文件且不超过 10MB'));
          if (file.size > 10 * 1024 * 1024) return reject(err('健康证需为 PDF 文件且不超过 10MB'));
        } else {
          if (!isImg) return reject(err('图片格式不符合要求，请上传 JPG、PNG、WEBP 或 GIF'));
          var limit = type === 'photo' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
          if (file.size > limit) return reject(err('图片大小超过限制，' + (type === 'photo' ? '照片不超过 10MB' : '证件不超过 20MB')));
        }
        var fd = new FormData();
        fd.append('file', file);
        fd.append('type', type || 'idFront');
        call('file.upload', fd).then(resolve).catch(reject);
      });
    },

    getFileUrl: function (key) { return Promise.resolve(fileUrl(key)); },

    getFileMeta: function (key) {
      if (!key) return Promise.resolve(null);
      return call('file.meta', { key: key }).catch(function () { return null; });
    },

    /* ---------- 薪资 ---------- */
    getSalary: function (month) { return call('salary.get', { month: month }); },
    getMySalaryMonths: function () { return call('salary.myMonths', {}); },
    listSalaries: function (month) { return call('salary.list', { month: month }); },
    saveSalary: function (obj) { return call('salary.save', obj); },
    deleteSalaryDraft: function (staffId, month) { return call('salary.deleteDraft', { staffId: staffId, month: month }); },
    publishSalary: function (month) { return call('salary.publish', { month: month }); },
    withdrawSalary: function (month) { return call('salary.withdraw', { month: month }); },
    markSalaryPaid: function (staffId, month, payDate) {
      return call('salary.markPaid', { staffId: staffId, month: month, payDate: payDate });
    },
    copyLastMonthSalary: function (month) { return call('salary.copyLastMonth', { month: month }); },
    previewSalaryImport: function (rows) { return call('salary.import', { rows: normalizeImportRows(rows), dryRun: 1 }); },
    importSalaries: function (rows) { return call('salary.import', { rows: normalizeImportRows(rows) }); },

    /* ---------- 量化分 ---------- */
    getScore: function (month) { return call('score.get', { month: month }); },
    getMyScores: function () { return call('score.my', {}); },
    listScores: function (month) { return call('score.list', { month: month }); },
    saveScore: function (obj) { return call('score.save', obj); },
    adjustScore: function (params) { return call('score.adjust', params || {}); },
    publishScore: function (month) { return call('score.publish', { month: month }); },
    withdrawScore: function (month) { return call('score.withdraw', { month: month }); },
    copyLastMonthScore: function (month) { return call('score.copyLastMonth', { month: month }); },

    getDimensions: function () { return call('settings.dimensions', {}); },
    saveDimensions: function (dims) { return call('settings.saveDimensions', { dims: dims }); },

    getSettings: function () { return call('settings.get', {}); },
    saveSettings: function (patch) {
      return call('settings.save', { patch: patch }).then(function (r) {
        var s = Store.settings();
        if (s && patch) Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
        if (patch && patch.siteTitle !== undefined && window.SiteTitle) window.SiteTitle.set(patch.siteTitle);
        return r;
      });
    },
    testWebhook: function (params) { return call('settings.webhook.test', params || {}); },
    testPersonalWebhook: function (params) { return call('settings.webhook.testPersonal', params || {}); },
    previewWebhookTemplate: function (params) { return call('settings.webhook.preview', params || {}); },
    webhookLogs: function (params) { return call('settings.webhook.logs', params || {}); },

    /* ---------- 排休 ---------- */
    getMyLeave: function (month) { return call('leave.my', { month: month }); },
    leaveQuick: function (params) { return call('leave.quick', params || {}); },

    expiryAdminData: function () { return call('expiry.adminData'); },
    expiryConfig: function () { return call('expiry.config'); },
    expirySaveCategory: function (params) { return call('expiry.categorySave', params || {}); },
    expirySaveCloseTime: function (params) { return call('expiry.closeTimeSave', params || {}); },
    expiryToggleCategory: function (params) { return call('expiry.categoryToggle', params || {}); },
    expirySaveMaterial: function (params) { return call('expiry.materialSave', params || {}); },
    expiryDeleteCategory: function (params) { return call('expiry.categoryDelete', params || {}); },
    expiryDeleteMaterial: function (params) { return call('expiry.materialDelete', params || {}); },
    expiryBulkMaterials: function (params) { return call('expiry.materialBulk', params || {}); },
    expiryCheckData: function (params) { return call('expiry.checkData', params || {}); },
    expirySaveCheck: function (params) { return call('expiry.checkSave', params || {}); },
    expiryDueList: function (params) { return call('expiry.dueList', params || {}); },
    expiryDayList: function (params) { return call('expiry.dayList', params || {}); },
    expiryProcess: function (params) { return call('expiry.process', params || {}); },
    leaveDayStats: function (date) { return call('leave.dayStats', { date: date }); },
    applyLeave: function (params) { return call('leave.apply', params); },
    cancelLeave: function (params) { return call('leave.cancel', params); },
    listLeaves: function (params) { return call('leave.list', params || {}); },
    reviewLeave: function (params) { return call('leave.review', params); },
    manualLeave: function (params) { return call('leave.manual', params); },

    getMyShifts: function (month) { return call('shift.my', { month: month }); },
    applyShift: function (params) { return call('shift.apply', params); },
    cancelShift: function (params) { return call('shift.cancel', params); },
    listShifts: function (params) { return call('shift.list', params || {}); },
    reviewShift: function (params) { return call('shift.review', params); },

    noticeList: function (category, page) { return call('notice.employee.list', { category: category || '', page: page || '' }); },
    noticeUnread: function () { return call('notice.unread', {}); },
    noticeGet: function (id) { return call('notice.employee.get', { id: id }); },
    markNoticeRead: function (id) { return call('notice.markRead', { id: id }); },
    staffContacts: function () { return call('staff.contacts', {}); },
    birthdayList: function () { return call('staff.birthdays', {}); },
    messageList: function (params) { return call('message.list', params || {}); },
    messageThreads: function () { return call('message.threads', {}); },
    messageThread: function (params) { return call('message.thread', params); },
    messageUnread: function () { return call('message.unread', {}); },
    messageUnreadList: function () { return call('message.unreadList', {}); },
    messageRead: function (id) { return call('message.read', { id: id }); },
    messageReadAll: function () { return call('message.readAll', {}); },
    sendMessage: function (params) { return call('message.send', params); },
    submitFeedback: function (params) { return call('feedback.submit', params); },
    feedbackThread: function (id) { return call('feedback.thread', { id: id }); },
    replyFeedback: function (params) { return call('feedback.reply', params); },
    adminNoticeList: function (params) { return call('notice.admin.list', params || {}); },
    saveNotice: function (params) { return call('notice.admin.save', params); },
    withdrawNotice: function (id) { return call('notice.admin.withdraw', { id: id }); },
    deleteNotice: function (id) { return call('notice.admin.delete', { id: id }); },
    noticeReaders: function (id) { return call('notice.admin.readers', { id: id }); },

    healthVerifyList: function () { return call('health.verify.list', {}); },
    healthVerifyHistory: function (staffId) { return call('health.verify.history', { staffId: staffId }); },
    healthVerifySave: function (params) { return call('health.verify.save', params); },
    publicHealthList: function () { return call('public.healthList', {}); },
    publicHealthFile: function (staffId) { return call('public.healthFile', { staffId: staffId }); },
    publicHealthMaterial: function (staffId) { return call('public.healthMaterial', { staffId: staffId }); },

    /* ---------- 报销 ---------- */
    reimburseCategories: function () { return call('reimburse.categories', {}); },
    saveReimburseCategory: function (params) { return call('reimburse.category.save', params); },
    myPayees: function () { return call('reimburse.payees', {}); },
    savePayee: function (params) { return call('reimburse.payee.save', params); },
    deletePayee: function (id) { return call('reimburse.payee.delete', { id: id }); },
    setDefaultPayee: function (id) { return call('reimburse.payee.default', { id: id }); },
    myReimbursements: function (params) { return call('reimburse.my', params || {}); },
    getReimbursement: function (id) { return call('reimburse.get', { id: id }); },
    createReimbursement: function (params) { return call('reimburse.create', params); },
    adminReimbursements: function (params) { return call('reimburse.admin.list', params || {}); },
    adminReimbursement: function (id) { return call('reimburse.admin.get', { id: id }); },
    reviewReimbursement: function (params) { return call('reimburse.review', params); },
    payReimbursement: function (id) { return call('reimburse.pay', { id: id }); },

    /* ---------- 任务下发 ---------- */
    taskMyList: function () { return call('task.employee.list', {}); },
    taskCompleted: function (params) { return call('task.completed', params || {}); },
    taskOverdue: function (params) { return call('task.employee.overdue', params || {}); },
    submitTask: function (params) { return call('task.employee.submit', params); },
    reassignTask: function (params) { return call('task.reassign', params); },
    adminTaskTemplates: function () { return call('task.admin.templates', {}); },
    saveTaskTemplate: function (params) { return call('task.admin.template.save', params); },
    toggleTaskTemplate: function (id) { return call('task.admin.template.toggle', { id: id }); },
    deleteTaskTemplate: function (id) { return call('task.admin.template.delete', { id: id }); },
    taskKinds: function () { return call('task.kinds', {}); },
    saveTaskKind: function (params) { return call('task.kind.save', params || {}); },
    deleteTaskKind: function (id) { return call('task.kind.delete', { id: id }); },
    quickCreateTask: function (params) { return call('task.quick.create', params || {}); },
    manageCompleteTask: function (params) { return call('task.manage.complete', params || {}); },
    adminTaskInstances: function (params) { return call('task.admin.instances', params || {}); },
    reviewTask: function (params) { return call('task.admin.review', params); },
    adminTaskApprovals: function (params) { return call('task.admin.approvals', params || {}); },
    reviewTaskApproval: function (params) { return call('task.admin.approval.review', params); },
    taskDetail: function (id) { return call('task.admin.detail', { id: id }); },

    /* ---------- 考勤台账 ---------- */
    getAttendance: function (month) { return call('attendance.list', { month: month }); },

    getShiftStations: function () { return call('shift.stations', {}); },
    getTodayShift: function () { return call('shift.today', {}); },
    getDailyShift: function (staffId, date) { return call('shift.get', { staffId: staffId, date: date }); },
    saveDailyShift: function (payload) { return call('shift.save', payload || {}); },
    saveAttendance: function (params) { return call('attendance.save', params); },
    getAttendanceDetail: function (staffId, month) {
      return call('attendance.detail', { staffId: staffId, month: month });
    },
    myAttendance: function (month) { return call('attendance.my', { month: month }); },
    previewAttendanceImport: function (rows) { return call('attendance.import', { rows: normalizeImportRows(rows), dryRun: 1 }); },
    importAttendanceDaily: function (rows) { return call('attendance.import', { rows: normalizeImportRows(rows) }); },

    /* ---------- 工作台 ---------- */
    getDashboard: function () { return call('dashboard.get', {}); },

    /* ---------- 账号 ---------- */
    listAccounts: function () { return call('accounts.list', {}); },
    createAccount: function (params) { return call('accounts.create', params); },
    toggleAccount: function (accountId) { return call('accounts.toggle', { accountId: accountId }); },
    resetPassword: function (params) { return call('accounts.resetPassword', params); },
    changePassword: function (params) { return call('accounts.changePassword', params); },

    /* ---------- 日志 / 备份 ---------- */
    listAuditLogs: function (filter) { return call('audit.list', filter || {}); },
    writeLog: function (action, target, detail) {
      return call('audit.log', { action: action, target: target, detail: detail });
    },

    backup: function () { return call('backup.export', {}); },
    restore: function (jsonText) { return call('backup.restore', { json: jsonText }); },
    /* 排班表：一次取齐某日全部在职员工、班段、岗位与低峰任务字典 */
    getShiftBoard: function (date) { return call('shift.board', { date: date || '' }); },

    /* 清空某员工某日全部班段（保持 daily_shifts 两段结构，不新增表） */
    clearDailyShift: function (payload) { return call('shift.clear', payload || {}); },

    clearDemo: function () { return call('data.clear', {}); },
    resetData: function () { return call('data.reset', {}); },

    /* ---------- 辅助（与旧接口保持同名） ---------- */
    settings: function () { return Store.settings(); },
    storeInfo: function () { return Store.storeInfo(); },
    session: function () { return Auth.current(); }
  };

  function roleLabel(role) {
    return { staff: '员工', admin: '管理组', superadmin: '超级管理员', guest: '访客' }[role] || role;
  }

  Api.roleLabel = roleLabel;
  Api.calcSalary = calcSalary;
  Api.gradeOf = gradeOf;
  Api.expiryInfo = expiryInfo;

  global.api = Api;
})(window);
