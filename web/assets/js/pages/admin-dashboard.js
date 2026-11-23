/* P07 管理端 — 工作台 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-dashboard'] = function (ctx) {
    var wrap = U.el('div', UI.skeleton(4));
    Layout.adminShell({ title: '工作台', active: 'admin-dashboard' }, wrap);

    api.getDashboard().then(function (d) {
      wrap.innerHTML = '';
      wrap.appendChild(render(d));
    }).catch(function (e) {
      wrap.innerHTML = '';
      wrap.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function render(d) {
      var box = U.el('div');
      var ses = Auth.current();

      box.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('p', { text: U.today() + ' · ' + api.storeInfo().shortName + ' · 在职 ' + d.staffTotals.active + ' 人，待审核 ' + d.staffTotals.pending + ' 人' }),
        U.el('div', { class: 'page-actions' }, [
          U.el('a', { class: 'btn btn-ghost btn-sm', href: 'admin-staff.html', text: '员工档案' }),
          U.el('a', { class: 'btn btn-primary btn-sm', href: 'admin-leave.html', text: '处理排休（' + d.leaves.pending + '）' })
        ])
      ]));

      var healthSoon = d.expiry.list.filter(function (x) { return x.type === '健康证' && x.state === 'soon'; }).length;
      var healthExpired = d.expiry.list.filter(function (x) { return x.type === '健康证' && x.state === 'expired'; }).length;

      var stats = U.el('div', { class: 'stat-grid' });
      stats.appendChild(statCard({
        label: '待审核档案', value: d.pending.count, unit: '份',
        sub: d.pending.overdue ? d.pending.overdue + ' 份已超过 24 小时' : '暂无超时',
        cls: d.pending.overdue ? 'danger' : 'warn',
        href: 'admin-staff.html?status=pending'
      }));
      stats.appendChild(statCard({
        label: '健康证 30 天内到期', value: healthSoon, unit: '人',
        sub: healthExpired ? healthExpired + ' 人已过期' : '暂无过期',
        cls: healthExpired ? 'danger' : (healthSoon ? 'warn' : 'success'),
        href: 'admin-staff.html?expiry=health'
      }));
      stats.appendChild(statCard({
        label: '本月薪资未发布', value: d.salary.entered, unit: '/ ' + d.salary.total + ' 已录',
        sub: d.salary.published ? '已发布 ' + d.salary.published + ' 人' : '尚未整月发布',
        cls: d.salary.published ? 'success' : 'warn',
        href: 'admin-salary.html?month=' + d.month
      }));
      stats.appendChild(statCard({
        label: '本月量化分未完成', value: d.score.entered, unit: '/ ' + d.score.total + ' 已打',
        sub: d.score.published ? '已发布 ' + d.score.published + ' 人' : '尚未整月发布',
        cls: d.score.published ? 'success' : 'warn',
        href: 'admin-score.html?month=' + d.month
      }));
      box.appendChild(stats);

      /* 待办 */
      var todoCard = U.el('div', { class: 'card' });
      todoCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'card-title', text: '待办清单' }),
          U.el('div', { class: 'card-sub', text: '按紧急度排序：超时审核、过期证件、待发布数据' })
        ]),
        U.el('span', { class: 'badge badge-warn', text: '共 ' + todoCount(d) + ' 项' })
      ]));
      var list = U.el('div', { class: 'todo-list' });

      d.pending.list.forEach(function (p) {
        var overdue = p.waitedHours > 24;
        list.appendChild(todo({
          icon: 'user', cls: overdue ? 'danger' : '',
          title: p.name + ' 的入职资料待审核',
          sub: p.position + ' · 提交于 ' + U.fmtTime(p.submittedAt),
          tag: overdue ? '已等待 ' + p.waitedHours + ' 小时' : '等待 ' + Math.max(p.waitedHours, 0) + ' 小时',
          tagCls: overdue ? 'red' : 'muted',
          href: 'admin-staff-detail.html?id=' + p.id
        }));
      });

      d.expiry.list.forEach(function (x) {
        list.appendChild(todo({
          icon: 'file', cls: x.state === 'expired' ? 'danger' : 'warn',
          title: x.name + ' 的' + x.type + (x.state === 'expired' ? '已过期' : '即将到期'),
          sub: x.position + ' · 有效期至 ' + U.fmtDate(x.date),
          tag: x.state === 'expired' ? '已过期 ' + Math.abs(x.days) + ' 天' : '剩余 ' + x.days + ' 天',
          tagCls: x.state === 'expired' ? 'red' : '',
          href: 'admin-staff-detail.html?id=' + x.id
        }));
      });

      if (!d.salary.published || d.salary.published < d.salary.total) {
        list.appendChild(todo({
          icon: 'money', cls: 'warn',
          title: '本月薪资尚未整月发布',
          sub: '已录入 ' + d.salary.entered + ' 人 / 共 ' + d.salary.total + ' 人，发布后员工端可见',
          tag: '去处理',
          href: 'admin-salary.html?month=' + d.month
        }));
      }
      if (!d.score.published || d.score.published < d.score.total) {
        list.appendChild(todo({
          icon: 'star', cls: 'warn',
          title: '本月量化分尚未完成',
          sub: '已打分 ' + d.score.entered + ' 人 / 共 ' + d.score.total + ' 人',
          tag: '去处理',
          href: 'admin-score.html?month=' + d.month
        }));
      }
      if (d.leaves.pending) {
        list.appendChild(todo({
          icon: 'calendar', cls: '',
          title: '有 ' + d.leaves.pending + ' 条排休申请待审批',
          sub: d.leaves.cancel ? '另有 ' + d.leaves.cancel + ' 条取消申请待确认' : '通过后自动计入当月已休天数',
          tag: '去审批',
          href: 'admin-leave.html?month=' + d.month
        }));
      }
      var isSuper = Auth.isSuper && Auth.isSuper();
      d.corrections.list.forEach(function (c) {
        if (c.superOnly && !isSuper) return;
        list.appendChild(todo({
          icon: 'edit', cls: '',
          title: c.staffName + ' 申请更正' + c.fieldLabel,
          sub: '更正为 ' + c.newValue + ' · ' + U.fmtTime(c.createdAt),
          tag: '去处理',
          href: 'admin-staff-detail.html?id=' + c.staffId
        }));
      });

      if (!list.children.length) {
        list.appendChild(UI.emptyState({
          icon: 'check', title: '暂无待办事项', desc: '所有档案、证件与数据均已处理完毕。'
        }));
      }
      todoCard.appendChild(list);
      box.appendChild(todoCard);

      /* 快捷入口 */
      var quickCard = U.el('div', { class: 'card' });
      quickCard.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '快捷入口' })]));
      var qbody = U.el('div', { class: 'card-body' });
      var qgrid = U.el('div', { class: 'quick-grid' }, [
        quickItem('users', '员工档案列表', 'admin-staff.html'),
        quickItem('money', '薪资录入与发布', 'admin-salary.html'),
        quickItem('star', '量化分打分', 'admin-score.html'),
        quickItem('calendar', '排休审批', 'admin-leave.html'),
        quickItem('clipboard', '考勤与月休台账', 'admin-attendance.html')
      ]);
      if (ses.role === 'superadmin') qgrid.appendChild(quickItem('settings', '系统设置与备份', 'admin-settings.html'));
      qbody.appendChild(qgrid);
      quickCard.appendChild(qbody);
      box.appendChild(quickCard);

      return box;
    }

    function todoCount(d) {
      var isSuper = Auth.isSuper && Auth.isSuper();
      var correctionCount = (d.corrections.list || []).filter(function (c) { return isSuper || !c.superOnly; }).length;
      return d.pending.count + d.expiry.list.length + (d.salary.published < d.salary.total ? 1 : 0) +
        (d.score.published < d.score.total ? 1 : 0) + d.leaves.pending + correctionCount;
    }

    function statCard(o) {
      return U.el('a', { class: 'stat-card ' + (o.cls || ''), href: o.href }, [
        U.el('div', { class: 'stat-label', text: o.label }),
        U.el('div', { class: 'stat-value' }, [
          U.el('span', { text: String(o.value) }),
          U.el('small', { text: o.unit || '' })
        ]),
        U.el('div', { class: 'stat-sub', text: o.sub })
      ]);
    }

    function todo(o) {
      return U.el('a', { class: 'todo-item', href: o.href }, [
        U.el('span', { class: 'todo-icon ' + (o.cls || ''), html: UI.icon(o.icon, 18) }),
        U.el('div', { class: 'todo-main' }, [
          U.el('div', { class: 'todo-title', text: o.title }),
          U.el('div', { class: 'todo-sub', text: o.sub })
        ]),
        U.el('span', { class: 'todo-tag ' + (o.tagCls || ''), text: o.tag })
      ]);
    }

    function quickItem(icon, label, href) {
      return U.el('a', { class: 'quick-item', href: href }, [
        U.el('span', { html: UI.icon(icon, 18) }),
        U.el('span', { text: label })
      ]);
    }
  };
})();
