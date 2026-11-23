/* P10 管理端 — 薪资管理 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  var INCOME = [
    { key: 'baseSalary', label: '基本工资' },
    { key: 'postAllowance', label: '岗位/技能津贴' },
    { key: 'performancePay', label: '实发绩效工资' },
    { key: 'fullAttendance', label: '全勤奖' },
    { key: 'dailyOvertimePay', label: '日常加班工资' },
    { key: 'statutoryHolidayPay', label: '法定三薪' },
    { key: 'mealSubsidy', label: '餐费补贴' },
    { key: 'transportSubsidy', label: '交通补贴' },
    { key: 'attendanceSubsidy', label: '出勤补贴' },
    { key: 'socialSubsidy', label: '社保补贴' },
    { key: 'commission', label: '提成' }
  ];
  var DEDUCTION = [
    { key: 'inventoryDeduction', label: '盘点扣款' },
    { key: 'lateDeduction', label: '迟到扣款' },
    { key: 'attendanceDiff', label: '出勤差额' },
    { key: 'leaveDeduction', label: '事假/病假扣款' },
    { key: 'disciplineDeduction', label: '违纪扣款', reason: 'disciplineReason' },
    { key: 'otherDeduction', label: '其他扣款', reason: 'otherReason' },
    { key: 'insurance', label: '社保/公积金个人部分' },
    { key: 'tax', label: '个人所得税' }
  ];

  window.Pages['admin-salary'] = function (ctx) {
    var state = {
      month: ctx.params.month || U.curMonth(),
      status: 'all',
      rows: []
    };

    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '先保存草稿，整月发布后员工端才可见；发布当天可撤回。' })
    ]);
    var actions = U.el('div', { class: 'page-actions' });
    head.appendChild(actions);
    content.appendChild(head);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var monthSel = U.el('select', { class: 'select' });
    U.monthRange(state.month, 8).reverse().forEach(function (m) {
      monthSel.appendChild(U.el('option', { value: m, text: U.monthLabel(m), selected: m === state.month }));
    });
    if (U.monthRange(state.month, 8).indexOf(U.curMonth()) < 0) {
      monthSel.appendChild(U.el('option', { value: U.curMonth(), text: U.monthLabel(U.curMonth()) }));
    }
    monthSel.addEventListener('change', function () { state.month = this.value; load(); });
    toolbar.appendChild(U.el('div', { class: 'toolbar-group' }, [U.el('span', { class: 'small muted', text: '月份' }), monthSel]));

    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部状态'], ['draft', '草稿'], ['published', '已发布'], ['paid', '已发放'], ['none', '未录入']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    statusSel.addEventListener('change', function () { state.status = this.value; paint(); });
    toolbar.appendChild(statusSel);
    toolbar.appendChild(U.el('span', { class: 'spacer' }));

    var copyBtn = U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      html: UI.icon('clipboard', 15) + '<span>复制上月数值</span>',
      onclick: copyLast
    });
    var publishBtn = U.el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      html: UI.icon('upload', 15) + '<span>发布整月</span>',
      onclick: publish
    });
    toolbar.appendChild(U.el('div', { class: 'toolbar-group' }, [copyBtn, publishBtn]));
    if (Auth.isSuper()) {
      toolbar.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('download', 15) + '<span>导出</span>',
        onclick: exportCSV
      }));
    }
    toolbar.appendChild(U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: '撤回本月',
      onclick: withdraw
    }));
    card.appendChild(toolbar);
    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);

    Layout.adminShell({ title: '薪资管理', active: 'admin-salary' }, content);

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      api.listSalaries(state.month).then(function (res) {
        state.rows = res.list;
        paint();
      }).catch(function (e) {
        listBox.innerHTML = '';
        listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function statusOf(s) {
      return s ? s.payStatus : 'none';
    }

    function paint() {
      listBox.innerHTML = '';
      var rows = state.rows.filter(function (r) {
        if (state.status === 'all') return true;
        return statusOf(r.salary) === state.status;
      });

      /* 汇总条 */
      var sum = rows.reduce(function (a, r) {
        if (r.salary) { a.gross += r.salary.grossPay; a.ded += r.salary.deductionTotal; a.net += r.salary.netPay; }
        return a;
      }, { gross: 0, ded: 0, net: 0 });
      listBox.appendChild(U.el('div', { class: 'summary-bar' }, [
        U.el('span', { text: '本月共 ' + state.rows.length + ' 名在职员工' }),
        U.el('span', { text: '应发合计 ' + U.money(sum.gross) }),
        U.el('span', { text: '扣款合计 ' + U.money(sum.ded) }),
        U.el('span', { class: 'strong', text: '实发工资 ' + U.money(sum.net) })
      ]));

      if (!rows.length) {
        listBox.appendChild(UI.emptyState({
          icon: 'money', title: '当前筛选下暂无记录',
          desc: '可切换状态筛选，或点击“复制上月数值”快速带入。'
        }));
        return;
      }

      var tableWrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '980px' } });
      table.innerHTML = '<thead><tr><th class="col-sticky">姓名</th><th>岗位</th><th>总工时</th><th>出勤(应/实)</th>' +
        '<th class="num">应发合计</th><th class="num">扣款合计</th><th class="num">实发工资</th><th>状态</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      rows.forEach(function (r) {
        var s = r.salary;
        var tr = U.el('tr');
        var tdName = U.el('td', { class: 'col-sticky' });
        tdName.appendChild(U.el('div', { class: 'cell-user' }, [
          UI.userAvatar(r.staff.name, r.staff.avatar, ''),
          U.el('div', {}, [
            U.el('div', { class: 'cell-user-name', text: r.staff.displayName || r.staff.name }),
            U.el('div', { class: 'cell-user-sub', text: U.empNoOf(r.staff) || '—' })
          ])
        ]));
        tr.appendChild(tdName);
        tr.appendChild(U.el('td', { text: r.staff.position }));
        tr.appendChild(U.el('td', { class: 'mono', text: s ? U.round2(s.totalHours) + ' h' : '—' }));
        tr.appendChild(U.el('td', { class: 'mono', text: s ? (s.shouldDays + ' / ' + s.actualDays) : '—' }));
        tr.appendChild(U.el('td', { class: 'num money', text: s ? U.money(s.grossPay) : '—' }));
        tr.appendChild(U.el('td', { class: 'num money', text: s ? U.money(s.deductionTotal) : '—' }));
        tr.appendChild(U.el('td', { class: 'num money strong', text: s ? U.money(s.netPay) : '—' }));
        var st = UI.salaryStatus(statusOf(s));
        var tdSt = U.el('td');
        tdSt.appendChild(UI.badge(st.text, st.cls));
        if (s && s.payStatus === 'published') tdSt.appendChild(U.el('div', { class: 'small muted', text: '发布 ' + U.fmtTime(s.publishAt) }));
        tr.appendChild(tdSt);
        var acts = U.el('td');
        var box = U.el('div', { class: 'table-actions' });
        box.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: s ? '编辑' : '录入',
          onclick: function () { openEditor(r.staff, s); }
        }));
        if (s && s.payStatus === 'published') {
          box.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '标记已发放',
            onclick: function () {
              UI.confirm({ title: '标记已发放', message: '确认 ' + U.monthLabel(state.month) + ' 的薪资已发放给 ' + r.staff.name + '？', confirmText: '确认已发放' })
                .then(function (yes) {
                  if (!yes) return;
                  api.markSalaryPaid(r.staff.id, state.month, U.today()).then(function () {
                    UI.toast('已标记发放', 'success');
                    load();
                  }).catch(function (e) { UI.toast(e.message, 'error'); });
                });
            }
          }));
        }
        acts.appendChild(box);
        tr.appendChild(acts);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      listBox.appendChild(tableWrap);
    }

    function openEditor(staffRow, salary) {
      var s = salary || {
        staffId: staffRow.id, month: state.month, shouldDays: 26, actualDays: 0, totalHours: 0,
        baseSalary: 0, postAllowance: 0, performancePay: 0, fullAttendance: 0, dailyOvertimePay: 0,
        statutoryHolidayPay: 0, mealSubsidy: 0, transportSubsidy: 0, attendanceSubsidy: 0,
        socialSubsidy: 0, commission: 0, inventoryDeduction: 0, lateDeduction: 0,
        attendanceDiff: 0, leaveDeduction: 0, disciplineDeduction: 0,
        disciplineReason: '', otherDeduction: 0, otherReason: '', insurance: 0, tax: 0,
        payDate: '', payStatus: 'draft', remark: ''
      };
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });

      var incomeHtml = INCOME.map(function (f) {
        return '<div class="field"><label class="label">' + f.label + '</label>' +
          '<input class="input money-input" type="number" min="0" step="0.01" name="' + f.key + '" value="' + U.num(s[f.key]) + '"></div>';
      }).join('');
      var dedHtml = DEDUCTION.map(function (f) {
        var reason = f.reason ? '<div class="field" data-reason="' + f.key + '"><label class="label">' + f.label + '事由 <i class="req">*</i></label>' +
          '<input class="input" name="' + f.reason + '" value="' + U.esc(s[f.reason] || '') + '" placeholder="扣款大于 0 时必填"></div>' : '';
        return '<div class="field"><label class="label">' + f.label + '</label>' +
          '<input class="input money-input" type="number" min="0" step="0.01" name="' + f.key + '" value="' + U.num(s[f.key]) + '"></div>' + reason;
      }).join('');

      form.innerHTML =
        '<div class="editor-summary">' +
        '<div><span class="muted small">应发合计</span><b id="sum-gross">0.00</b></div>' +
        '<div><span class="muted small">扣款合计</span><b id="sum-ded">0.00</b></div>' +
        '<div class="primary"><span class="small">实发工资</span><b id="sum-net">0.00</b></div>' +
        '</div>' +
        '<h4 class="form-section-title">出勤信息</h4>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">应出勤天数</label><input class="input" type="number" min="0" max="31" name="shouldDays" value="' + U.num(s.shouldDays) + '"></div>' +
        '<div class="field" data-field="actualDays"><label class="label">实际出勤天数 <i class="req">*</i></label><input class="input" type="number" min="0" max="31" name="actualDays" value="' + U.num(s.actualDays) + '"><div class="hint">不含请假日，发布前必填。</div><div class="error-text"></div></div>' +
        '<div class="field" data-field="totalHours"><label class="label">总工时 <i class="req">*</i></label><input class="input" type="number" min="0" step="0.01" name="totalHours" value="' + U.num(s.totalHours) + '"><div class="hint">用于核对工时与实发工资，发布前必填。</div><div class="error-text"></div></div>' +
        '</div>' +
        '<h4 class="form-section-title">收入项目</h4>' +
        '<div class="form-grid two">' + incomeHtml + '</div>' +
        '<h4 class="form-section-title">扣款项目</h4>' +
        '<div class="form-grid two">' + dedHtml + '</div>' +
        '<h4 class="form-section-title">其他</h4>' +
        '<div class="field"><label class="label">发放日期</label><input class="input" type="date" name="payDate" value="' + (s.payDate || '') + '"></div>' +
        '<div class="field"><label class="label">备注（≤100 字）</label><textarea class="textarea" name="remark" maxlength="100">' + U.esc(s.remark || '') + '</textarea></div>' +
        (salary && salary.payStatus === 'published' ? '<div class="alert alert-warn">该员工薪资已发布，修改后员工端立即可见，修改动作将写入操作日志。</div>' : '');

      function recalc() {
        var gross = 0, ded = 0;
        INCOME.forEach(function (f) { gross += U.num(form.elements[f.key].value); });
        DEDUCTION.forEach(function (f) { ded += U.num(form.elements[f.key].value); });
        U.$('#sum-gross', form).textContent = U.money(gross);
        U.$('#sum-ded', form).textContent = U.money(ded);
        U.$('#sum-net', form).textContent = U.money(gross - ded);
        DEDUCTION.forEach(function (f) {
          if (!f.reason) return;
          var box = form.querySelector('[data-reason="' + f.key + '"]');
          if (box) box.style.display = U.num(form.elements[f.key].value) > 0 ? '' : 'none';
        });
      }
      U.$$('.money-input', form).forEach(function (i) { i.addEventListener('input', recalc); });
      recalc();

      UI.drawer({
        title: '薪资录入 · ' + staffRow.name,
        subtitle: U.monthLabel(state.month) + ' · ' + staffRow.position + ' · ' + staffRow.employmentType,
        width: 'lg',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存草稿', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var obj = { staffId: staffRow.id, month: state.month, payStatus: salary ? salary.payStatus : 'draft', payDate: fd.get('payDate') || '' };
              INCOME.concat(DEDUCTION).forEach(function (f) { obj[f.key] = U.num(fd.get(f.key)); });
              obj.shouldDays = U.num(fd.get('shouldDays'));
              obj.actualDays = fd.get('actualDays') === '' ? '' : U.num(fd.get('actualDays'));
              obj.totalHours = fd.get('totalHours') === '' ? '' : U.num(fd.get('totalHours'));
              obj.disciplineReason = fd.get('disciplineReason') || '';
              obj.otherReason = fd.get('otherReason') || '';
              obj.remark = fd.get('remark') || '';
              if (obj.actualDays === '') { UI.toast('请填写实际出勤天数', 'error'); return false; }
              if (obj.totalHours === '') { UI.toast('请填写总工时', 'error'); return false; }
              if (U.num(obj.disciplineDeduction) > 0 && !String(obj.disciplineReason).trim()) {
                UI.toast('违纪扣款需填写事由后才能保存', 'error'); return false;
              }
              if (U.num(obj.otherDeduction) > 0 && !String(obj.otherReason).trim()) {
                UI.toast('其他扣款需填写事由后才能保存', 'error'); return false;
              }
              UI.btnLoading(btn, true, '保存中…');
              api.saveSalary(obj).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已保存草稿，员工端不可见', 'success');
                load();
              }).catch(function (e) {
                UI.btnLoading(btn, false);
                UI.toast(e.message, 'error');
              });
              return false;
            }
          }
        ]
      });
    }

    function copyLast() {
      UI.confirm({
        title: '复制上月数值',
        message: '将 ' + U.monthLabel(U.prevMonth(state.month)) + ' 的薪资数值复制到 ' + U.monthLabel(state.month) + ' 中尚未录入的员工（生成草稿），是否继续？',
        confirmText: '复制'
      }).then(function (yes) {
        if (!yes) return;
        api.copyLastMonthSalary(state.month).then(function (res) {
          UI.toast(res.count ? '已复制 ' + res.count + ' 人的上月数值' : '没有可复制的数据', res.count ? 'success' : 'info');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function incompleteSalary(s) {
      if (!s) return true;
      function blank(v) { return v === null || v === undefined || v === ''; }
      /* 0 是合法值，仅空值视为未填 */
      return blank(s.totalHours) || blank(s.grossPay) || blank(s.actualDays);
    }

    function publish() {
      api.listSalaries(state.month).then(function (res) {
        var missing = res.list.filter(function (r) { return incompleteSalary(r.salary); })
          .map(function (r) { return r.staff.name; });
        if (missing.length) {
          UI.openModal({
            title: '暂不能发布',
            subtitle: '还有 ' + missing.length + ' 人未填写完整',
            body: U.el('div', {}, [
              U.el('p', { class: 'small muted', text: '发布前需补齐总工时、应发合计与实际出勤天数。以下员工需处理：' }),
              U.el('div', { class: 'chip-list', style: { marginTop: '10px' } }, missing.map(function (n) {
                return U.el('span', { class: 'badge badge-danger', text: n });
              }))
            ]),
            footer: [{ text: '知道了', class: 'btn-primary' }]
          });
          return;
        }
        var count = res.list.length;
        UI.confirm({
          title: '发布薪资',
          message: '确认发布 ' + U.monthLabel(state.month) + ' 共 ' + count + ' 人的薪资？发布后员工端立即可见，当天可撤回。',
          detail: '发布前请再次核对实发金额，避免误操作。',
          confirmText: '确认发布'
        }).then(function (yes) {
          if (!yes) return;
          api.publishSalary(state.month).then(function (r) {
            UI.toast('已发布 ' + r.count + ' 人，员工端可见', 'success');
            load();
          }).catch(function (e) { UI.toast(e.message, 'error'); });
        });
      });
    }

    function withdraw() {
      UI.confirm({
        title: '撤回本月薪资',
        message: '确认撤回 ' + U.monthLabel(state.month) + ' 已发布的薪资？撤回后状态回到草稿，员工端不可见（仅发布当天可撤回）。',
        danger: true,
        confirmText: '撤回'
      }).then(function (yes) {
        if (!yes) return;
        api.withdrawSalary(state.month).then(function (r) {
          UI.toast('已撤回 ' + r.count + ' 人', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function exportCSV() {
      api.listSalaries(state.month).then(function (res) {
        var headers = ['姓名', '飞书工号', '岗位', '总工时', '应出勤', '实际出勤'];
        INCOME.forEach(function (f) { headers.push(f.label); });
        DEDUCTION.forEach(function (f) {
          headers.push(f.label);
          if (f.reason) headers.push(f.label + '事由');
        });
        headers.push('应发合计', '扣款合计', '实发工资', '状态', '发放日期');
        var rows = res.list.map(function (r) {
          var s = r.salary || {};
          var st = UI.salaryStatus(r.salary ? s.payStatus : 'none');
          var row = [r.staff.name, U.empNoOf(r.staff) || '—', r.staff.position,
            U.round2(s.totalHours), s.shouldDays || '', s.actualDays || ''];
          INCOME.forEach(function (f) { row.push(U.num(s[f.key]).toFixed(2)); });
          DEDUCTION.forEach(function (f) {
            row.push(U.num(s[f.key]).toFixed(2));
            if (f.reason) row.push(s[f.reason] || '');
          });
          row.push(U.num(s.grossPay).toFixed(2), U.num(s.deductionTotal).toFixed(2),
            U.num(s.netPay).toFixed(2), st.text, s.payDate || '');
          return row;
        });
        U.download('薪资表_' + api.storeInfo().code + '_' + state.month + '.csv', U.toCSV(headers, rows), 'text/csv;charset=utf-8');
        Store.log('导出薪资表', U.monthLabel(state.month), '导出 ' + rows.length + ' 人，含全部薪资明细项');
        UI.toast('已导出本月薪资表', 'success');
      });
    }

    load();
  };
})();
