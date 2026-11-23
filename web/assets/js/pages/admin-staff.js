/* P08 管理端 — 员工档案列表 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-staff'] = function (ctx) {
    var state = {
      keyword: '',
      status: ctx.params.status || 'all',
      position: 'all',
      includeResigned: false,
      expiry: ctx.params.expiry || '',
      page: 1,
      pageSize: 20
    };
    var quota = { total: 0, list: [] };

    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '按姓名、手机号、飞书工号搜索；身份证号不在列表展示，需在详情页二次确认后查看。' })
    ]);
    var exportBtn = null;
    if (Auth.isSuper()) {
      exportBtn = U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('download', 16) + '<span>导出名单</span>',
        onclick: exportList
      });
      head.appendChild(U.el('div', { class: 'page-actions' }, [exportBtn]));
    }
    content.appendChild(head);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var search = U.el('div', { class: 'search-box' }, [
      U.el('span', { html: UI.icon('search', 17) }),
      U.el('input', { class: 'input', type: 'search', placeholder: '搜索姓名 / 手机号 / 飞书工号' })
    ]);
    toolbar.appendChild(search);

    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部状态'], ['pending', '待审核'], ['active', '在职'], ['resigned', '已离职'], ['rejected', '已驳回']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1], selected: o[0] === state.status }));
    });
    toolbar.appendChild(statusSel);

    var posSel = U.el('select', { class: 'select' });
    posSel.appendChild(U.el('option', { value: 'all', text: '全部岗位' }));
    V.POSITIONS.forEach(function (p) {
      posSel.appendChild(U.el('option', { value: p, text: p, selected: p === state.position }));
    });
    toolbar.appendChild(posSel);

    var switchLabel = U.el('label', { class: 'switch' }, [
      U.el('input', { type: 'checkbox', checked: state.includeResigned }),
      U.el('span', { text: '显示离职人员' })
    ]);
    toolbar.appendChild(switchLabel);
    card.appendChild(toolbar);

    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);

    if (state.expiry) {
      content.insertBefore(U.el('div', { class: 'alert alert-warn' }, [
        U.el('span', { class: 'alert-icon', html: UI.icon('alert', 17) }),
        U.el('div', { class: 'flex-between' }, [
          U.el('span', { text: '当前仅显示健康证已过期或 30 天内到期的员工。' }),
          U.el('a', { class: 'link', href: 'admin-staff.html', text: '清除筛选' })
        ])
      ]), card);
    }

    Layout.adminShell({ title: '员工档案', active: 'admin-staff' }, content);

    search.querySelector('input').addEventListener('input', U.debounce(function () {
      state.keyword = this.value.trim();
      state.page = 1;
      load();
    }, 300));
    statusSel.addEventListener('change', function () {
      state.status = this.value;
      state.page = 1;
      load();
    });
    posSel.addEventListener('change', function () {
      state.position = this.value;
      state.page = 1;
      load();
    });
    switchLabel.querySelector('input').addEventListener('change', function () {
      state.includeResigned = this.checked;
      state.page = 1;
      load();
    });

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(2)]));
      if (state.expiry) {
        api.listStaff({ keyword: state.keyword, status: state.status, position: state.position, includeResigned: state.includeResigned, page: 1, pageSize: 999 })
          .then(function (res) {
            var filtered = res.list.filter(function (r) {
              return (r.expiry.health.state === 'soon' || r.expiry.health.state === 'expired') && r.status === 'active';
            });
            quota.total = filtered.length;
            var start = (state.page - 1) * state.pageSize;
            quota.list = filtered.slice(start, start + state.pageSize);
            paint();
          })
          .catch(fail);
      } else {
        api.listStaff({
          keyword: state.keyword, status: state.status, position: state.position,
          includeResigned: state.includeResigned, page: state.page, pageSize: state.pageSize
        }).then(function (res) {
          quota.total = res.total;
          quota.list = res.list;
          paint();
        }).catch(fail);
      }
    }

    function fail(e) {
      listBox.innerHTML = '';
      listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
    }

    function paint() {
      listBox.innerHTML = '';
      if (!quota.list.length) {
        listBox.appendChild(UI.emptyState({
          icon: 'users', title: '没有符合条件的员工',
          desc: state.keyword ? '换个关键词试试，或清除筛选条件。' : '当前筛选条件下暂无员工档案。',
          actionText: '清除筛选',
          onAction: function () {
            state.keyword = ''; state.status = 'all'; state.position = 'all';
            state.includeResigned = false; state.expiry = ''; state.page = 1;
            search.querySelector('input').value = '';
            statusSel.value = 'all'; posSel.value = 'all';
            switchLabel.querySelector('input').checked = false;
            load();
          }
        }));
        return;
      }

      /* 桌面表格 */
      var tableWrap = U.el('div', { class: 'table-wrap desktop-only' });
      var table = U.el('table', { class: 'data-table' });
      table.innerHTML = '<thead><tr>' +
        '<th>照片</th><th>姓名</th><th>飞书工号</th><th>岗位</th><th>手机号</th><th>入职日期</th>' +
        '<th>健康证</th><th>档案状态</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      quota.list.forEach(function (r) {
        var tr = U.el('tr');
        var tdPhoto = U.el('td');
        tdPhoto.appendChild(UI.userAvatar(r.name, r.avatar || r.photo, 'avatar-sm'));
        tr.appendChild(tdPhoto);
        tr.appendChild(U.el('td', {}, [U.el('a', { class: 'link strong', href: 'admin-staff-detail.html?id=' + r.id, text: r.displayName || r.name })]));
        tr.appendChild(U.el('td', { class: 'mono', text: U.empNoOf(r) || '—' }));
        tr.appendChild(U.el('td', { text: r.position }));
        tr.appendChild(U.el('td', { class: 'mono', text: r.maskedPhone }));
        tr.appendChild(U.el('td', { class: 'mono', text: U.fmtDate(r.hireDate) }));
        var tdHealth = U.el('td');
        tdHealth.appendChild(UI.healthBadge(r.expiry.health));
        tr.appendChild(tdHealth);
        var tdStatus = U.el('td');
        tdStatus.appendChild(UI.statusBadge(r.status));
        if (r.status === 'pending') {
          var waited = Math.floor((Date.now() - new Date(r.submittedAt).getTime()) / 3600000);
          if (waited > 24) {
            tdStatus.appendChild(U.el('div', { class: 'small', style: { color: 'var(--danger)', marginTop: '2px' }, text: '已等待 ' + waited + ' 小时' }));
          }
        }
        tr.appendChild(tdStatus);
        var acts = U.el('td');
        var box = U.el('div', { class: 'table-actions' });
        box.appendChild(U.el('a', { class: 'btn-text', href: 'admin-staff-detail.html?id=' + r.id, text: '查看' }));
        if (r.status === 'pending') box.appendChild(U.el('a', { class: 'btn-text', href: 'admin-staff-detail.html?id=' + r.id + '&action=review', text: '审核' }));
        acts.appendChild(box);
        tr.appendChild(acts);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      listBox.appendChild(tableWrap);

      /* 移动端卡片：左文字（姓名 / 职务 / 在职状态），右「查看档案」 */
      var cards = U.el('div', { class: 'mobile-cards' });
      quota.list.forEach(function (r) {
        var main = U.el('div', { class: 'mobile-card-main' }, [
          U.el('div', { class: 'mobile-card-title' }, [
            U.el('span', { class: 'strong', text: r.displayName || r.name })
          ]),
          U.el('div', { class: 'mobile-card-sub', text: r.position }),
          U.el('div', { style: { marginTop: '5px' } }, [UI.statusBadge(r.status)])
        ]);
        var action = U.el('div', { class: 'mobile-card-action' }, [
          U.el('a', { class: 'btn btn-ghost btn-sm', href: 'admin-staff-detail.html?id=' + r.id, text: '查看档案' })
        ]);
        cards.appendChild(U.el('div', { class: 'mobile-card mobile-card-row' }, [main, action]));
      });
      listBox.appendChild(cards);

      listBox.appendChild(UI.pagination({
        page: state.page, pageSize: state.pageSize, total: quota.total,
        onChange: function (p) { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      }));
    }

    function exportList() {
      UI.btnLoading(exportBtn, true, '导出中…');
      api.listStaff({ keyword: state.keyword, status: state.status, position: state.position, includeResigned: true, page: 1, pageSize: 9999 })
        .then(function (res) {
          var headers = ['姓名', '飞书工号', '岗位', '用工性质', '手机号', '入职日期', '健康证有效期', '档案状态'];
          var rows = res.list.map(function (r) {
            return [r.name, U.empNoOf(r) || '—', r.position, r.employmentType, r.phone, r.hireDate, r.healthCertExpiry, UI.staffStatus(r.status).text];
          });
          U.download('在职员工名单_' + api.storeInfo().code + '_' + U.today() + '.csv', U.toCSV(headers, rows), 'text/csv;charset=utf-8');
          Store.log('导出名单', '员工列表', '导出 ' + rows.length + ' 条，手机号完整导出，不含身份证与住址');
          UI.btnLoading(exportBtn, false);
          UI.toast('已导出 ' + rows.length + ' 条记录（身份证号与住址不导出）', 'success');
        })
        .catch(function (e) {
          UI.btnLoading(exportBtn, false);
          UI.toast(e.message, 'error');
        });
    }

    load();
  };
})();
