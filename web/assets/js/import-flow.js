/* 共享导入流程：考勤日报 / 工资明细
 * 被「考勤与月休台账」页头与「我的」主页快捷按钮复用，上传、预览、确认、结果弹层只有这一份实现。
 */
(function () {
  'use strict';

  var currentMode = '';
  var currentDone = null;
  var fileInput = null;

  function ensureInput() {
    if (fileInput) return fileInput;
    fileInput = U.el('input', { type: 'file', accept: '.xlsx', style: { display: 'none' } });
    fileInput.addEventListener('change', onFilePicked);
    document.body.appendChild(fileInput);
    return fileInput;
  }

  function pick(mode, onDone) {
    if (typeof XLite === 'undefined') {
      UI.toast('解析组件未加载，请刷新页面后重试', 'error');
      return;
    }
    if (mode !== 'attendance' && mode !== 'salary') return;
    currentMode = mode;
    currentDone = typeof onDone === 'function' ? onDone : null;
    var input = ensureInput();
    input.value = '';
    input.click();
  }

  function onFilePicked() {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var mode = currentMode;
    if (!/\.xlsx$/i.test(f.name)) { UI.toast('请选择 .xlsx 格式的表格文件', 'error'); return; }
    if (f.size > 12 * 1024 * 1024) { UI.toast('文件超过 12MB，请拆分后再导入', 'error'); return; }
    UI.toast('正在解析 ' + f.name + ' …', 'info', 1600);
    var reader = new FileReader();
    reader.onload = function () {
      XLite.parse(reader.result).then(function (wb) {
        var sheet = wb.sheets[0];
        var mapped = mode === 'attendance' ? XLite.mapAttendanceRows(sheet.rows) : XLite.mapSalaryRows(sheet.rows);
        if (!mapped.rows.length) throw new Error('没有解析到有效记录，请确认表格内容与表头');
        /* 自检：解析结果必须带日期/月份字段，避免旧版脚本缓存导致后续整批匹配失败 */
        var first = mapped.rows[0] || {};
        if (mode === 'attendance' && !first.date && !first.workDate) {
          throw new Error('解析结果缺少日期字段，可能是浏览器缓存了旧版解析脚本，请按 Ctrl+F5 强制刷新页面后重试');
        }
        if (mode !== 'attendance' && !first.month && !first.salaryMonth) {
          throw new Error('解析结果缺少工资年月字段，可能是浏览器缓存了旧版解析脚本，请按 Ctrl+F5 强制刷新页面后重试');
        }
        openPreview(mode, mapped);
      }).catch(function (e) {
        UI.toast(e.message || '解析失败，请检查文件', 'error', 4000);
      });
    };
    reader.onerror = function () { UI.toast('读取文件失败，请重试', 'error'); };
    reader.readAsArrayBuffer(f);
  }

  function openPreview(mode, mapped) {
    var isAtt = mode === 'attendance';
    /* 统一发送给接口的行：日期/月份强制取展示用的同一个已归一化字符串，避免字段别名不一致 */
    var apiRows = canonicalRows(mode, mapped.rows);
    var body = U.el('div');
    body.appendChild(UI.skeleton(2));
    var layer = UI.openModal({
      title: isAtt ? '预览考勤日报' : '预览薪资导入',
      subtitle: isAtt ? '确认后将写入员工考勤明细' : '确认后将写入薪资记录（默认草稿，不影响已发布数据的状态）',
      body: body,
      footer: [{ text: '取消', class: 'btn-ghost' }]
    });
    var promise = isAtt ? api.previewAttendanceImport(apiRows) : api.previewSalaryImport(apiRows);
    promise.then(function (st) {
      body.innerHTML = '';
      body.appendChild(previewContent(mode, mapped, st));
      layer.footer.innerHTML = '';
      layer.footer.appendChild(U.el('button', { class: 'btn btn-ghost', type: 'button', text: '取消', onclick: function () { layer.close(); } }));
      var ok = U.el('button', {
        class: 'btn btn-primary', type: 'button', text: '确认导入',
        disabled: !st.matchedCount
      });
      if (!st.matchedCount) ok.style.opacity = '.5';
      ok.addEventListener('click', function () {
        ok.disabled = true;
        ok.textContent = '导入中…';
        var run = isAtt ? api.importAttendanceDaily(apiRows) : api.importSalaries(apiRows);
        run.then(function (rs) {
          layer.close();
          UI.toast('导入完成：新增 ' + rs.inserted + ' 条，覆盖 ' + rs.updated + ' 条，失败 ' + rs.failed + ' 条', rs.failed ? 'info' : 'success', 4000);
          showResult(mode, mapped, rs);
          if (currentDone) currentDone(rs);
        }).catch(function (e) {
          ok.disabled = false;
          ok.textContent = '确认导入';
          UI.toast(e.message, 'error', 4000);
        });
      });
      layer.footer.appendChild(ok);
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(UI.errorState({ message: e.message, onRetry: function () { layer.close(); } }));
    });
  }

  function previewContent(mode, mapped, st) {
    var isAtt = mode === 'attendance';
    var wrap = U.el('div');
    var card = U.el('div', { class: 'card' });
    var body = U.el('div', { class: 'card-body tight' });
    if (isAtt) {
      body.appendChild(infoRow('识别日期', st.dateFrom ? st.dateFrom + ' 至 ' + st.dateTo : '—'));
    } else {
      body.appendChild(infoRow('识别月份', (st.months && st.months.length) ? st.months.join('、') : '—'));
    }
    body.appendChild(infoRow('识别员工', st.staffCount + ' 人'));
    body.appendChild(infoRow('记录条数', mapped.rows.length + ' 条'));
    body.appendChild(infoRow('客户端校验', dateCheckText(mapped, isAtt)));
    body.appendChild(infoRow('可匹配记录', st.matchedCount + ' 条'));
    body.appendChild(infoRow('匹配来源', sourceText(st.matchedBy)));
    body.appendChild(infoRow('库中索引', indexText(st.index)));
    body.appendChild(infoRow('将新增', st.inserted + ' 条'));
    body.appendChild(infoRow('将覆盖', st.updated + ' 条'));
    if (st.failed) body.appendChild(infoRow('未匹配 / 失败', st.failed + ' 条'));
    if (st.failed) body.appendChild(infoRow('未匹配原因', reasonsText(st.reasons)));
    body.appendChild(infoRow('表头行', '第 ' + ((mapped.headerIndex || 0) + 1) + ' 行'));
    body.appendChild(infoRow('导入脚本', 'import-flow.js ' + scriptVersion('import-flow.js')));
    body.appendChild(infoRow('解析脚本', 'xlsx-lite.js ' + scriptVersion('xlsx-lite.js')));
    card.appendChild(body);
    wrap.appendChild(card);
    if (st.near && st.near.length) wrap.appendChild(nearBlock(st.near));
    wrap.appendChild(sampleBlock(mapped, isAtt));

    if (mapped.invalid && mapped.invalid.length) {
      wrap.appendChild(alertBox('warn', '文件内有 ' + mapped.invalid.length + ' 行无法识别日期' + (isAtt ? '' : '或工资年月') + '，导入时会跳过。'));
    }
    if (!isAtt && st.mismatch) {
      wrap.appendChild(alertBox('warn', '金额校验：' + st.mismatch + ' 条按薪资项计算后的实发工资与文件「实发工资」不一致，请核对后再确认。'));
    }
    if (!st.matchedCount) {
      wrap.appendChild(alertBox('danger', '没有任何记录能匹配到员工，请先核对员工的飞书工号、门店工号或姓名，再重新导入。'));
    } else if (st.unmatched && st.unmatched.length) {
      wrap.appendChild(alertBox('info', '有 ' + st.unmatched.length + ' 人未匹配，确认导入时这些记录会跳过。'));
    }
    if (st.unmatched && st.unmatched.length) wrap.appendChild(unmatchedBlock(st.unmatched));
    wrap.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '10px' }, text: '同员工同日期同班段（薪资为同员工同月份）重复导入会覆盖原记录，不会产生重复行。' }));
    return wrap;
  }

  function showResult(mode, mapped, st) {
    var isAtt = mode === 'attendance';
    var wrap = U.el('div');
    wrap.appendChild(alertBox(st.failed ? 'warn' : 'success',
      '导入完成：新增 ' + st.inserted + ' 条，覆盖 ' + st.updated + ' 条，失败 ' + st.failed + ' 条。'));
    var card = U.el('div', { class: 'card' });
    var body = U.el('div', { class: 'card-body tight' });
    if (isAtt) body.appendChild(infoRow('导入日期', st.dateFrom ? st.dateFrom + ' 至 ' + st.dateTo : '—'));
    else body.appendChild(infoRow('导入月份', (st.months && st.months.length) ? st.months.join('、') : '—'));
    body.appendChild(infoRow('匹配员工', (st.matchedStaffCount !== undefined ? st.matchedStaffCount : st.staffCount) + ' 人'));
    body.appendChild(infoRow('匹配来源', sourceText(st.matchedBy)));
    body.appendChild(infoRow('未匹配人员', (st.unmatched ? st.unmatched.length : 0) + ' 人'));
    card.appendChild(body);
    wrap.appendChild(card);
    if (st.unmatched && st.unmatched.length) wrap.appendChild(unmatchedBlock(st.unmatched));
    if (!isAtt && st.inserted) {
      wrap.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '10px' }, text: '新导入的薪资为草稿状态，需在「薪资管理」核对并发布后，员工端「我的薪资」才可见。' }));
    }
    UI.openModal({
      title: '导入结果', body: wrap,
      footer: [{ text: '知道了', class: 'btn-primary' }]
    });
  }

  function infoRow(label, value) {
    return U.el('div', { class: 'info-row' }, [
      U.el('span', { class: 'info-label', text: label }),
      U.el('span', { class: 'info-value', text: value })
    ]);
  }

  function sourceText(mb) {
    if (!mb) return '—';
    return '飞书工号 ' + (mb.feishu || 0) + ' 条 / 门店工号 ' + (mb.empNo || 0) + ' 条 / 姓名 ' + (mb.name || 0) + ' 条';
  }

  function indexText(ix) {
    if (!ix) return '—';
    var txt = '飞书工号 ' + (ix.feishu || 0) + ' 人 / 门店工号 ' + (ix.empNo || 0) + ' 人 / 姓名 ' + (ix.name || 0) + ' 人';
    if (ix.emptyName) {
      txt += ' · 缺姓名 ' + ix.emptyName + ' 人';
      if (ix.emptyNameEmpNos && ix.emptyNameEmpNos.length) txt += '（工号 ' + ix.emptyNameEmpNos.join('、') + '）';
    }
    return txt;
  }

  function reasonsText(rs) {
    if (!rs) return '—';
    var labels = {
      empMismatch: '工号不符', nameDup: '姓名重复', notFound: '库中无此人',
      invalidDate: '日期无效', invalidMonth: '月份无效'
    };
    var parts = [];
    Object.keys(rs).forEach(function (k) {
      if (rs[k]) parts.push((labels[k] || k) + ' ' + rs[k] + ' 条');
    });
    return parts.length ? parts.join(' · ') : '无';
  }

  /* 报表工号与档案工号相近但不同：提示疑似档案录错 */
  function nearBlock(list) {
    var wrap = U.el('div', { class: 'card', style: { marginTop: '10px' } });
    wrap.appendChild(U.el('div', { class: 'card-head' }, [
      U.el('div', { class: 'card-title', text: '工号相近但不同（疑似档案录错）' })
    ]));
    var box = U.el('div', { class: 'card-body tight', style: { maxHeight: '180px', overflowY: 'auto' } });
    list.slice(0, 20).forEach(function (x) {
      box.appendChild(U.el('div', { class: 'small', style: { padding: '5px 0', borderBottom: '1px solid var(--line-2)' } }, [
        U.el('div', { text: '报表 ' + (x.empNo || '—') + ' · ' + (x.name || '无姓名') }),
        U.el('div', { class: 'muted', text: '档案 ' + (x.near.no || '—') + ' · ' + (x.near.name || (x.near.staff && x.near.staff.name) || '—') + '（' + x.rows + ' 条）' })
      ]));
    });
    wrap.appendChild(box);
    return wrap;
  }

  /* 从实际 script 引用读取版本号，不在代码里写死 */
  function scriptVersion(match) {
    var tags = document.getElementsByTagName('script');
    for (var i = 0; i < tags.length; i++) {
      var src = tags[i].getAttribute('src') || '';
      if (src.indexOf(match) < 0) continue;
      var m = /[?&]v=([^&]+)/.exec(src);
      return m ? 'v' + m[1] : '未带版本号';
    }
    return '未加载';
  }

  /* 预览中展示前 3 条解析样本，线上截图即可判断字段是否为空 */
  function sampleBlock(mapped, isAtt) {
    var rows = (mapped.rows || []).slice(0, 3);
    var wrap = U.el('div', { class: 'card', style: { marginTop: '10px' } });
    wrap.appendChild(U.el('div', { class: 'card-head' }, [
      U.el('div', { class: 'card-title', text: '解析样本（前 ' + rows.length + ' 条）' })
    ]));
    var box = U.el('div', { class: 'card-body tight' });
    rows.forEach(function (r, i) {
      var line = (r.empNo || '（空工号）') + ' · ' + (r.name || '（空姓名）') + ' · ' +
        (isAtt ? (dateStr(r.date) || dateStr(r.workDate) || '（空日期）') : (dateStr(r.month) || dateStr(r.salaryMonth) || '（空月份）'));
      box.appendChild(U.el('div', {
        class: 'small mono',
        style: { padding: '5px 0', borderBottom: '1px solid var(--line-2)' },
        text: (i + 1) + '. ' + line
      }));
    });
    if (!rows.length) box.appendChild(U.el('div', { class: 'small muted', text: '没有解析到任何数据行。' }));
    if (rows.length && !rows[0].empNo && !rows[0].name) {
      box.appendChild(U.el('div', {
        class: 'small',
        style: { color: '#e10600', paddingTop: '6px' },
        text: '首行工号与姓名均为空：请核对表头行、列名是否与模板一致，或页面脚本是否已更新。'
      }));
    }
    wrap.appendChild(box);
    return wrap;
  }

  /* 把日期值统一成字符串；Date 对象按本地年月日格式化，避免直接 String() 变成英文长串 */
  function dateStr(v) {
    if (v === undefined || v === null || v === '') return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      var m = v.getMonth() + 1, d = v.getDate();
      return v.getFullYear() + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
    }
    if (Array.isArray(v)) v = v[0];
    return String(v).trim();
  }

  /* 发送给接口前统一日期/月份字段：date/workDate/work_date/rawDate 都写成同一个字符串 */
  function canonicalRows(mode, rows) {
    return (rows || []).map(function (r) {
      var o = {};
      Object.keys(r || {}).forEach(function (k) { o[k] = r[k]; });
      if (mode === 'attendance') {
        var d = dateStr(r.date) || dateStr(r.workDate) || dateStr(r.work_date) || dateStr(r.rawDate);
        o.date = d; o.workDate = d; o.work_date = d; o.rawDate = d;
      } else {
        var mth = dateStr(r.month) || dateStr(r.salaryMonth) || dateStr(r.salary_month) || dateStr(r.rawMonth);
        o.month = mth; o.salaryMonth = mth; o.salary_month = mth; o.rawMonth = mth;
      }
      return o;
    });
  }

  /* 客户端按展示值做一次日期/月份校验，和接口结果对照 */
  function dateCheckText(mapped, isAtt) {
    var total = mapped.rows.length, ok = 0;
    mapped.rows.forEach(function (r) {
      var v = isAtt ? (dateStr(r.date) || dateStr(r.workDate)) : (dateStr(r.month) || dateStr(r.salaryMonth));
      if (isAtt ? /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) : /^\d{4}-\d{2}$/.test(String(v || ''))) ok++;
    });
    return '有效 ' + ok + ' / 共 ' + total + ' 条';
  }

  function alertBox(type, text) {
    return U.el('div', { class: 'alert alert-' + type, style: { marginTop: '10px' } }, [
      U.el('span', { class: 'alert-icon', html: UI.icon(type === 'danger' || type === 'warn' ? 'alert' : 'info', 17) }),
      U.el('div', { text: text })
    ]);
  }

  function unmatchedBlock(list) {
    var wrap = U.el('div', { class: 'card', style: { marginTop: '10px' } });
    wrap.appendChild(U.el('div', { class: 'card-head' }, [
      U.el('div', { class: 'card-title', text: '未匹配员工（' + list.length + ' 人）' })
    ]));
    var box = U.el('div', { class: 'card-body tight', style: { maxHeight: '190px', overflowY: 'auto' } });
    var typeLabel = { empMismatch: '工号不符', nameDup: '姓名重复', notFound: '库中无此人', invalidDate: '日期无效', invalidMonth: '月份无效' };
    list.slice(0, 100).forEach(function (x) {
      box.appendChild(U.el('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--line-2)' } }, [
        U.el('div', { class: 'small', text: (x.empNo || '无飞书工号') + ' · ' + (x.name || '无姓名') }),
        U.el('div', { class: 'small muted', text: (x.type ? '【' + (typeLabel[x.type] || x.type) + '】' : '') + x.reason + (x.rows > 1 ? ' · ' + x.rows + ' 条记录' : '') })
      ]));
    });
    if (list.length > 100) {
      box.appendChild(U.el('div', { class: 'small muted', style: { paddingTop: '6px' }, text: '仅显示前 100 人，其余同理跳过。' }));
    }
    wrap.appendChild(box);
    return wrap;
  }

  window.ImportFlow = { pick: pick };
})();
