/* P05 员工端 — 我的薪资 */
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

  window.Pages['salary'] = function (ctx) {
    var main = Layout.staffShell({ title: '我的薪资', active: 'profile' }, UI.skeleton(3));
    var hidden = sessionStorage.getItem('ts_salary_hidden') === '1';
    var months = [];
    var current = '';

    api.getMySalaryMonths().then(function (list) {
      months = list || [];
      if (!months.length) {
        renderEmpty();
        return;
      }
      current = months.indexOf(U.curMonth()) >= 0 ? U.curMonth() : months[0];
      load(current);
    }).catch(function (e) {
      main.innerHTML = '';
      main.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function fmt(n) {
      return hidden ? '****' : U.money(n);
    }

    function load(month) {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.getSalary(month).then(function (salary) {
        main.innerHTML = '';
        main.appendChild(render(salary, month));
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { load(month); } }));
      });
    }

    function monthBar(month) {
      var bar = U.el('div', { class: 'month-bar' });
      var left = U.el('div', { class: 'month-select' });
      var sel = U.el('select', { class: 'select' });
      months.forEach(function (m) {
        sel.appendChild(U.el('option', { value: m, text: U.monthLabel(m), selected: m === month }));
      });
      sel.addEventListener('change', function () { load(this.value); });
      left.appendChild(sel);
      bar.appendChild(left);
      bar.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon(hidden ? 'eye' : 'eyeOff', 16) + '<span>' + (hidden ? '显示金额' : '隐藏金额') + '</span>',
        onclick: function () {
          hidden = !hidden;
          sessionStorage.setItem('ts_salary_hidden', hidden ? '1' : '0');
          load(month);
        }
      }));
      return bar;
    }

    function render(salary, month) {
      var wrap = U.el('div');
      wrap.appendChild(monthBar(month));

      if (U.curMonth() !== month && months.indexOf(U.curMonth()) < 0) {
        wrap.appendChild(U.el('div', { class: 'alert alert-info' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('info', 17) }),
          U.el('div', { text: '本月薪资尚未发布，当前展示 ' + U.monthLabel(month) + ' 的已发布数据。' })
        ]));
      }
      if (!salary) {
        wrap.appendChild(U.el('div', { class: 'card' }, [
          UI.emptyState({
            icon: 'money', title: '该月薪资尚未发布',
            desc: '该月薪资尚未发布，发布后可在此查看。'
          })
        ]));
        return wrap;
      }

      var sum = U.el('div', { class: 'sum-grid' }, [
        U.el('div', { class: 'sum-card' }, [
          U.el('div', { class: 'sum-label', text: '应发合计' }),
          U.el('div', { class: 'sum-value', text: fmt(salary.grossPay) })
        ]),
        U.el('div', { class: 'sum-card' }, [
          U.el('div', { class: 'sum-label', text: '扣款合计' }),
          U.el('div', { class: 'sum-value', text: fmt(salary.deductionTotal) })
        ]),
        U.el('div', { class: 'sum-card primary' }, [
          U.el('div', { class: 'sum-label', text: '实发工资' }),
          U.el('div', { class: 'sum-value', text: fmt(salary.netPay) })
        ])
      ]);
      wrap.appendChild(sum);
      wrap.appendChild(U.el('p', { class: 'small muted', style: { margin: '8px 0 0' }, text: '实发工资 = 应发合计 − 扣款合计，下方明细项加总与上方金额一致。' }));

      var att = U.el('div', { class: 'card' });
      att.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '出勤信息' })]));
      var attBody = U.el('div', { class: 'card-body tight' });
      attBody.appendChild(U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: '应出勤' }),
        U.el('span', { class: 'info-value', text: salary.shouldDays + ' 天' })
      ]));
      attBody.appendChild(U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: '实际出勤' }),
        U.el('span', { class: 'info-value', text: salary.actualDays + ' 天' })
      ]));
      attBody.appendChild(U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: '总工时' }),
        U.el('span', { class: 'info-value', text: U.round2(salary.totalHours) + ' 小时' })
      ]));
      att.appendChild(attBody);
      wrap.appendChild(att);

      /* 收入 */
      var inc = U.el('div', { class: 'card' });
      inc.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '收入项目' }),
        U.el('span', { class: 'small muted', text: '单位：元' })
      ]));
      var incList = U.el('div', { class: 'money-list' });
      INCOME.forEach(function (f) {
        incList.appendChild(U.el('div', { class: 'money-item' }, [
          U.el('span', { class: 'mi-label', text: f.label }),
          U.el('span', { class: 'mi-value', text: fmt(salary[f.key]) })
        ]));
      });
      incList.appendChild(U.el('div', { class: 'money-item total' }, [
        U.el('span', { class: 'mi-label', text: '应发合计' }),
        U.el('span', { class: 'mi-value', text: fmt(salary.grossPay) })
      ]));
      inc.appendChild(incList);
      wrap.appendChild(inc);

      /* 扣款 */
      var ded = U.el('div', { class: 'card' });
      ded.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '扣款项目' }),
        U.el('span', { class: 'small muted', text: '单位：元' })
      ]));
      var dedList = U.el('div', { class: 'money-list' });
      DEDUCTION.forEach(function (f) {
        var item = U.el('div', { class: 'money-item' });
        var left = U.el('div', {});
        left.appendChild(U.el('div', { class: 'mi-label', text: f.label }));
        if (f.reason && U.num(salary[f.key]) > 0) {
          left.appendChild(U.el('div', { class: 'mi-sub', text: '事由：' + (salary[f.reason] || '—') }));
        }
        item.appendChild(left);
        item.appendChild(U.el('span', { class: 'mi-value', text: fmt(salary[f.key]) }));
        dedList.appendChild(item);
      });
      dedList.appendChild(U.el('div', { class: 'money-item total' }, [
        U.el('span', { class: 'mi-label', text: '扣款合计' }),
        U.el('span', { class: 'mi-value', text: fmt(salary.deductionTotal) })
      ]));
      ded.appendChild(dedList);
      wrap.appendChild(ded);

      /* 发放信息 */
      var pay = U.el('div', { class: 'card' });
      pay.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '发放信息' })]));
      var pbody = U.el('div', { class: 'card-body tight' });
      var st = UI.salaryStatus(salary.payStatus);
      pbody.appendChild(U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: '发放状态' }),
        U.el('span', { class: 'info-value' }, [UI.badge(st.text, st.cls)])
      ]));
      pbody.appendChild(U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: '发放日期' }),
        U.el('span', { class: 'info-value', text: salary.payDate ? U.fmtDate(salary.payDate) : '待发放' })
      ]));
      pbody.appendChild(U.el('div', { class: 'info-row block' }, [
        U.el('span', { class: 'info-label', text: '备注' }),
        U.el('span', { class: 'info-value', text: salary.remark || '无' })
      ]));
      pay.appendChild(pbody);
      wrap.appendChild(pay);

      wrap.appendChild(U.el('p', { class: 'text-center small muted', text: '如对薪资有疑问，请当面联系店长核对；本页不提供线上申诉。' }));
      return wrap;
    }

    function renderEmpty() {
      main.innerHTML = '';
      main.appendChild(U.el('div', { class: 'card' }, [
        UI.emptyState({
          icon: 'money', title: '暂无薪资记录',
          desc: '该月薪资尚未发布，发布后可在此查看。'
        })
      ]));
      main.appendChild(U.el('p', { class: 'text-center small muted', text: '如对薪资有疑问，请当面联系店长核对' }));
    }
  };
})();
