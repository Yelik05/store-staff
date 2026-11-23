/* P15 管理端 — 考勤与月休台账 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-attendance'] = function (ctx) {
    var state = { month: ctx.params.month || U.curMonth(), rows: [], summary: {} };
    var content = U.el('div');
    var headActions = U.el('div', { class: 'page-actions' });
    if (Auth.isSuper()) {
      headActions.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('upload', 15) + '<span>导入考勤日报</span>',
        onclick: function () { ImportFlow.pick('attendance', load); }
      }));
      headActions.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('upload', 15) + '<span>导入薪资</span>',
        onclick: function () { ImportFlow.pick('salary', load); }
      }));
    }
    headActions.appendChild(U.el('a', { class: 'btn btn-ghost btn-sm', href: 'admin-leave.html?month=' + state.month, text: '排休审批' }));
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '本页是“该员工这个月休了几天”的最终账面，员工端与管理端数字均以此为准。' }),
      headActions
    ]);
    content.appendChild(head);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var monthSel = U.el('select', { class: 'select' });
    U.monthRange(state.month, 8).reverse().forEach(function (m) {
      monthSel.appendChild(U.el('option', { value: m, text: U.monthLabel(m), selected: m === state.month }));
    });
    monthSel.addEventListener('change', function () { state.month = this.value; load(); });
    toolbar.appendChild(U.el('div', { class: 'toolbar-group' }, [U.el('span', { class: 'small muted', text: '月份' }), monthSel]));
    toolbar.appendChild(U.el('span', { class: 'spacer' }));
    toolbar.appendChild(U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      html: UI.icon('download', 15) + '<span>导出台账</span>',
      onclick: exportCSV
    }));
    card.appendChild(toolbar);
    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);
    content.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '10px' }, text: '出勤天数与未休天数供薪资录入参考，本期不自动折算金额。应休天数调整会写入操作日志。' }));

    Layout.adminShell({ title: '考勤与月休台账', active: 'admin-attendance' }, content);

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      api.getAttendance(state.month).then(function (res) {
        state.rows = res.list;
        state.summary = res.summary;
        paint();
      }).catch(function (e) {
        listBox.innerHTML = '';
        listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paint() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'summary-bar' }, [
        U.el('span', { class: 'strong', text: U.monthLabel(state.month) }),
        U.el('span', { text: '全店应休合计 ' + state.summary.should + ' 天' }),
        U.el('span', { text: '已休合计 ' + state.summary.used + ' 天' }),
        U.el('span', { text: '未休合计 ' + state.summary.unused + ' 天' })
      ]));

      if (!state.rows.length) {
        listBox.appendChild(UI.emptyState({ icon: 'clipboard', title: '暂无台账数据', desc: '当前月份没有在职员工，或数据尚未生成。' }));
        return;
      }

      var tableWrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '1000px' } });
      table.innerHTML = '<thead><tr><th class="col-sticky">姓名</th><th>岗位</th><th>用工性质</th>' +
        '<th class="num">应休天数</th><th class="num">已休</th><th class="num">审批中</th><th class="num">剩余</th>' +
        '<th class="num">未休</th><th class="num">出勤天数</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      state.rows.forEach(function (r) {
        var tr = U.el('tr');
        var tdName = U.el('td', { class: 'col-sticky' });
        tdName.appendChild(U.el('div', { class: 'cell-user-name', text: r.staff.name }));
        tdName.appendChild(U.el('div', { class: 'cell-user-sub', text: U.empNoOf(r.staff) || '' }));
        tr.appendChild(tdName);
        tr.appendChild(U.el('td', { text: r.staff.position }));
        tr.appendChild(U.el('td', { text: r.staff.employmentType }));

        var tdShould = U.el('td', { class: 'num' });
        var shouldInput = U.el('input', {
          class: 'inline-number', type: 'number', min: '0', max: '31',
          value: String(r.shouldRestDays)
        });
        shouldInput.addEventListener('change', function () {
          var v = Number(this.value);
          if (isNaN(v) || v < 0 || v > 31) { UI.toast('应休天数需为 0—31 之间的数字', 'error'); this.value = r.shouldRestDays; return; }
          api.saveAttendance({ staffId: r.staff.id, month: state.month, patch: { shouldRestDays: v } })
            .then(function () { UI.toast('应休天数已调整并记录操作人', 'success'); load(); })
            .catch(function (e) { UI.toast(e.message, 'error'); });
        });
        tdShould.appendChild(shouldInput);
        tr.appendChild(tdShould);

        tr.appendChild(U.el('td', { class: 'num', text: String(r.usedRestDays) }));
        tr.appendChild(U.el('td', { class: 'num', text: String(r.pendingRestDays) }));
        var tdRem = U.el('td', { class: 'num' });
        tdRem.appendChild(U.el('span', {
          class: r.remainingRestDays < 0 ? 'strong' : '',
          style: r.remainingRestDays < 0 ? { color: 'var(--danger)' } : {},
          text: String(r.remainingRestDays)
        }));
        if (r.remainingRestDays < 0) {
          tdRem.appendChild(U.el('div', { class: 'small', style: { color: 'var(--danger)' }, text: '已超休 ' + Math.abs(r.remainingRestDays) + ' 天' }));
        }
        tr.appendChild(tdRem);
        tr.appendChild(U.el('td', { class: 'num', text: String(r.unusedRestDays) }));
        var tdWork = U.el('td', { class: 'num' });
        var workInput = U.el('input', {
          class: 'inline-number', type: 'number', min: '0', max: '31', value: String(r.actualWorkDays || 0)
        });
        workInput.addEventListener('change', function () {
          var v = Number(this.value);
          if (isNaN(v) || v < 0 || v > 31) { UI.toast('出勤天数需为 0—31 之间的数字', 'error'); this.value = r.actualWorkDays; return; }
          api.saveAttendance({ staffId: r.staff.id, month: state.month, patch: { actualWorkDays: v } })
            .then(function () { UI.toast('出勤天数已更新', 'success'); })
            .catch(function (e) { UI.toast(e.message, 'error'); });
        });
        tdWork.appendChild(workInput);
        tr.appendChild(tdWork);
        var tdOps = U.el('td');
        tdOps.appendChild(U.el('button', { class: 'btn-text', type: 'button', text: '明细', onclick: function () { openDetail(r); } }));
        tr.appendChild(tdOps);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      listBox.appendChild(tableWrap);
    }

    function openDetail(r) {
      api.getAttendanceDetail(r.staff.id, state.month).then(function (res) {
        var body = U.el('div');
        body.appendChild(U.el('div', { class: 'stat-grid', style: { gridTemplateColumns: 'repeat(2,1fr)' } }, [
          U.el('div', { class: 'stat-card', style: { cursor: 'default' } }, [
            U.el('div', { class: 'stat-label', text: '应休 / 已休' }),
            U.el('div', { class: 'stat-value', text: res.stats.quota + ' / ' + res.stats.used })
          ]),
          U.el('div', { class: 'stat-card', style: { cursor: 'default' } }, [
            U.el('div', { class: 'stat-label', text: '审批中 / 剩余' }),
            U.el('div', { class: 'stat-value', text: res.stats.pending + ' / ' + res.stats.remaining })
          ])
        ]));
        if (!res.list.length) {
          body.appendChild(UI.emptyState({ icon: 'calendar', title: '本月无排休记录', desc: '该员工本月没有提交过排休申请。' }));
        } else {
          var card = U.el('div', { class: 'card' });
          card.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '排休记录（' + res.list.length + ' 条）' })]));
          res.list.forEach(function (l) {
            var st = UI.leaveStatus(l);
            card.appendChild(U.el('div', { class: 'card-body', style: { borderBottom: '1px solid var(--line-2)' } }, [
              U.el('div', { class: 'flex-between' }, [
                U.el('strong', { class: 'mono', text: l.date }),
                UI.badge(st.text, st.cls)
              ]),
              U.el('div', { class: 'small muted', style: { marginTop: '4px' }, text: l.type + (l.manual ? ' · 管理组代录' : '') + (l.reason ? ' · ' + l.reason : '') }),
              U.el('div', { class: 'small muted', text: '提交 ' + U.fmtTime(l.createdAt) + (l.reviewedBy ? ' · 审批 ' + l.reviewedBy + ' ' + U.fmtTime(l.reviewedAt) : '') }),
              l.rejectReason ? U.el('div', { class: 'leave-reason', text: '驳回原因：' + l.rejectReason }) : null
            ]));
          });
          body.appendChild(card);
        }
        UI.drawer({
          title: r.staff.name + ' · 排休明细',
          subtitle: U.monthLabel(state.month) + ' · ' + r.staff.position,
          body: body,
          footer: [{ text: '关闭', class: 'btn-ghost', close: true }]
        });
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function exportCSV() {
      api.getAttendance(state.month).then(function (res) {
        var headers = ['姓名', '飞书工号', '岗位', '用工性质', '应休天数', '已休天数', '审批中', '剩余天数', '未休天数', '出勤天数'];
        var rows = res.list.map(function (r) {
          return [r.staff.name, U.empNoOf(r.staff) || '—', r.staff.position, r.staff.employmentType,
            r.shouldRestDays, r.usedRestDays, r.pendingRestDays, r.remainingRestDays, r.unusedRestDays, r.actualWorkDays];
        });
        U.download('月休台账_' + api.storeInfo().code + '_' + state.month + '.csv', U.toCSV(headers, rows), 'text/csv;charset=utf-8');
        Store.log('导出考勤台账', U.monthLabel(state.month), '导出 ' + rows.length + ' 人');
        UI.toast('已导出台账', 'success');
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    load();
  };
})();
