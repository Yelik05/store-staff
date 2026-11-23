/* P20 管理端 — 报销管理（仅店长） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  var STATUS = {
    pending: { label: '待审核', tone: 'warn' },
    approved: { label: '已通过', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    paid: { label: '已打款', tone: 'brand' }
  };

  function statusBadge(s) {
    var m = STATUS[s] || { label: s, tone: 'muted' };
    return UI.badge(m.label, m.tone);
  }

  window.Pages['admin-reimburse'] = function () {
    var state = { status: 'all', categoryId: '', staffId: '', from: '', to: '', rows: [], categories: [], staff: [], counts: {}, amounts: {} };
    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '查看全部报销单，审核通过或驳回，并对已通过单据标记打款；仅店长可操作。' }),
      U.el('div', { class: 'page-actions' })
    ]);
    content.appendChild(head);

    var summary = U.el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '12px' } });
    content.appendChild(summary);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar', style: { flexWrap: 'wrap', gap: '8px' } });
    card.appendChild(toolbar);
    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);
    Layout.adminShell({ title: '报销管理', active: 'admin-reimburse' }, content);

    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部状态'], ['pending', '待审核'], ['approved', '已通过'], ['rejected', '已驳回'], ['paid', '已打款']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    statusSel.addEventListener('change', function () { state.status = statusSel.value; load(); });
    toolbar.appendChild(statusSel);

    var catSel = U.el('select', { class: 'select' });
    catSel.appendChild(U.el('option', { value: '', text: '全部分类' }));
    catSel.addEventListener('change', function () { state.categoryId = catSel.value; load(); });
    toolbar.appendChild(catSel);

    var staffSel = U.el('select', { class: 'select' });
    staffSel.appendChild(U.el('option', { value: '', text: '全部员工' }));
    staffSel.addEventListener('change', function () { state.staffId = staffSel.value; load(); });
    toolbar.appendChild(staffSel);

    var fromInput = U.el('input', { class: 'input', type: 'date', style: { width: '140px' } });
    var toInput = U.el('input', { class: 'input', type: 'date', style: { width: '140px' } });
    fromInput.addEventListener('change', function () { state.from = fromInput.value; load(); });
    toInput.addEventListener('change', function () { state.to = toInput.value; load(); });
    toolbar.appendChild(U.el('span', { class: 'small muted', text: '日期' }));
    toolbar.appendChild(fromInput);
    toolbar.appendChild(U.el('span', { class: 'small muted', text: '至' }));
    toolbar.appendChild(toInput);

    loadBase();
    load();

    function loadBase() {
      api.reimburseCategories().then(function (r) {
        state.categories = (r && r.list) || [];
        state.categories.forEach(function (c) {
          catSel.appendChild(U.el('option', { value: c.id, text: c.name + (c.enabled ? '' : '（停用）') }));
        });
      }).catch(function () {});
      api.listStaff({}).then(function (r) {
        state.staff = (r && r.list) || [];
        state.staff.slice().sort(function (a, b) { return U.empNoOf(a).localeCompare(U.empNoOf(b)); }).forEach(function (s) {
          staffSel.appendChild(U.el('option', { value: s.id, text: s.name + (U.empNoOf(s) ? ' · ' + U.empNoOf(s) : '') }));
        });
      }).catch(function () {});
    }

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      api.adminReimbursements({
        status: state.status, categoryId: state.categoryId, staffId: state.staffId,
        from: state.from, to: state.to
      }).then(function (res) {
        state.rows = res.list || [];
        state.counts = res.counts || {};
        state.amounts = res.amounts || {};
        paintSummary();
        paint();
      }).catch(function (e) {
        listBox.innerHTML = '';
        listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paintSummary() {
      summary.innerHTML = '';
      [
        ['待审核', state.counts.pending || 0, state.amounts.pending || 0, 'warn'],
        ['已通过待打款', state.counts.approved || 0, state.amounts.approved || 0, 'success'],
        ['已打款', state.counts.paid || 0, state.amounts.paid || 0, 'brand']
      ].forEach(function (x) {
        summary.appendChild(U.el('div', { class: 'card' }, [
          U.el('div', { class: 'card-body' }, [
            U.el('div', { class: 'small muted', text: x[0] }),
            U.el('div', { class: 'strong', style: { fontSize: '20px', marginTop: '4px' }, text: U.money(x[2]) }),
            U.el('div', { class: 'small muted', style: { marginTop: '2px' }, text: x[1] + ' 单' })
          ])
        ]));
      });
    }

    function paint() {
      listBox.innerHTML = '';
      if (!state.rows.length) {
        listBox.appendChild(UI.emptyState({
          icon: 'money', title: '暂无报销单',
          desc: '当前筛选条件下没有报销记录，员工提交后会出现在这里。'
        }));
        return;
      }
      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '900px' } });
      table.innerHTML = '<thead><tr><th>员工</th><th>分类</th><th>金额</th><th>收款方式</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      state.rows.forEach(function (c) {
        var tr = U.el('tr');
        tr.appendChild(U.el('td', {}, [
          U.el('div', { class: 'strong', text: c.staffName }),
          U.el('div', { class: 'small muted', text: c.staffId })
        ]));
        tr.appendChild(U.el('td', { text: c.categoryName }));
        tr.appendChild(U.el('td', {}, [U.el('span', { class: 'strong', text: U.money(c.amount) })]));
        tr.appendChild(U.el('td', { class: 'small', text: (c.payeeType === 'bank' ? '银行卡 · ' : '支付宝 · ') + c.payeeAccount }));
        tr.appendChild(U.el('td', {}, [statusBadge(c.status)]));
        tr.appendChild(U.el('td', { class: 'small', text: U.fmtTime(c.createdAt) }));
        var ops = U.el('div', { class: 'table-actions' });
        ops.appendChild(U.el('button', { class: 'btn-text', type: 'button', text: '详情', onclick: function () { openDetail(c); } }));
        if (c.status === 'pending') {
          ops.appendChild(U.el('button', { class: 'btn-text', type: 'button', text: '通过', onclick: function () { review(c, 'approve'); } }));
          ops.appendChild(U.el('button', { class: 'btn-text danger', type: 'button', text: '驳回', onclick: function () { review(c, 'reject'); } }));
        }
        if (c.status === 'approved') {
          ops.appendChild(U.el('button', { class: 'btn-text', type: 'button', text: '标记打款', onclick: function () { pay(c); } }));
        }
        var td = U.el('td');
        td.appendChild(ops);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      listBox.appendChild(wrap);
    }

    function openDetail(c) {
      var body = U.el('div');
      body.appendChild(U.el('div', { class: 'flex-between', style: { marginBottom: '10px' } }, [
        U.el('div', { class: 'strong', style: { fontSize: '22px' }, text: U.money(c.amount) }),
        statusBadge(c.status)
      ]));
      var info = U.el('div', { class: 'info-list' });
      function row(label, value) {
        if (!value) return;
        info.appendChild(U.el('div', { class: 'info-row' }, [
          U.el('span', { class: 'info-label', text: label }),
          U.el('span', { class: 'info-value', text: value })
        ]));
      }
      row('申请人', c.staffName + '（' + c.staffId + '）');
      row('报销分类', c.categoryName);
      row('提交时间', U.fmtTime(c.createdAt));
      row('收款方式', c.payeeType === 'bank' ? '银行卡' : '支付宝');
      row('收款账号', c.payeeAccount);
      if (c.payeeType === 'bank') {
        row('开户银行', c.payeeBank);
        row('持卡人', c.payeeHolder);
      }
      if (c.reviewedAt) row('审核人', (c.reviewedBy || '') + ' · ' + U.fmtTime(c.reviewedAt));
      if (c.rejectReason) row('驳回原因', c.rejectReason);
      if (c.paidAt) row('打款时间', U.fmtTime(c.paidAt) + (c.paidBy ? ' · ' + c.paidBy : ''));
      body.appendChild(info);

      body.appendChild(U.el('div', { class: 'field', style: { marginTop: '12px' } }, [
        U.el('label', { class: 'label', text: '报销原因' }),
        U.el('div', { class: 'small', style: { whiteSpace: 'pre-wrap', lineHeight: '1.7' }, text: c.reason })
      ]));

      if (c.attachments && c.attachments.length) {
        var att = U.el('div', { class: 'field', style: { marginTop: '12px' } }, [U.el('label', { class: 'label', text: '附件' })]);
        c.attachments.forEach(function (f) {
          att.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm btn-block', type: 'button', style: { marginBottom: '6px', justifyContent: 'flex-start' },
            html: UI.icon(/pdf/.test(f.mime) ? 'file' : 'image', 16) + '<span>' + escapeHtml(f.name || f.key) + '</span>',
            onclick: function () { previewAttachment(f); }
          }));
        });
        body.appendChild(att);
      }

      var footer = [{ text: '关闭', class: 'btn-ghost' }];
      if (c.status === 'pending') {
        footer.push({ text: '驳回', class: 'btn-danger', onClick: function (btn, close) { close(); setTimeout(function () { review(c, 'reject'); }, 120); } });
        footer.push({ text: '通过', class: 'btn-primary', onClick: function (btn, close) { close(); setTimeout(function () { review(c, 'approve'); }, 120); } });
      } else if (c.status === 'approved') {
        footer.push({ text: '标记打款', class: 'btn-primary', onClick: function (btn, close) { close(); setTimeout(function () { pay(c); }, 120); } });
      }
      UI.openModal({ title: '报销详情', body: body, footer: footer });
    }

    function previewAttachment(f) {
      api.getFileUrl(f.key).then(function (url) {
        if (!url) { UI.toast('附件地址不可用', 'error'); return; }
        if (/pdf/.test(f.mime)) { window.open(url, '_blank'); return; }
        var body = U.el('div');
        body.appendChild(U.el('img', { src: url, alt: f.name || '附件', style: { width: '100%', borderRadius: '10px' } }));
        UI.openModal({ title: f.name || '附件预览', body: body, footer: [{ text: '关闭', class: 'btn-ghost' }] });
      });
    }

    function review(c, action) {
      if (action === 'approve') {
        UI.confirm({ title: '通过报销', message: '确认通过「' + c.staffName + '」的' + c.categoryName + ' ' + U.money(c.amount) + '？', confirmText: '通过' })
          .then(function (yes) {
            if (!yes) return;
            api.reviewReimbursement({ id: c.id, action: 'approve' }).then(function () {
              UI.toast('已通过，等待打款', 'success');
              load();
            }).catch(function (e) { UI.toast(e.message, 'error'); });
          });
        return;
      }
      var input = U.el('textarea', { class: 'textarea', rows: 3, maxlength: 200, placeholder: '请填写驳回原因（必填，200 字以内）' });
      var body = U.el('div', { class: 'field' }, [U.el('label', { class: 'label', text: '驳回原因' }), input]);
      UI.openModal({
        title: '驳回报销', body: body,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认驳回', class: 'btn-danger',
            onClick: function (btn, close) {
              var reason = String(input.value || '').trim();
              if (reason.length < 2) { UI.toast('请填写驳回原因', 'error'); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewReimbursement({ id: c.id, action: 'reject', reason: reason }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已驳回并通知申请人', 'success');
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

    function pay(c) {
      UI.confirm({
        title: '标记打款',
        message: '确认已向「' + c.staffName + '」打款 ' + U.money(c.amount) + '？标记后不可撤销。',
        confirmText: '标记已打款'
      }).then(function (yes) {
        if (!yes) return;
        api.payReimbursement(c.id).then(function () {
          UI.toast('已标记打款并通知申请人', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };
})();
