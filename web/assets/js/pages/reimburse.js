/* P19 员工端 — 我的报销 */
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

  function payeeLabel(p) {
    return (p.type === 'bank' ? '银行卡' : '支付宝') + ' · ' + p.account;
  }

  window.Pages['reimburse'] = function () {
    var state = { status: 'all', list: [], categories: [], payees: [] };
    var main = Layout.staffShell({ title: '我的报销', active: 'profile', back: 'profile.html' }, UI.skeleton(3));
    load();

    function load() {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      Promise.all([
        api.myReimbursements({ status: 'all' }),
        api.reimburseCategories(),
        api.myPayees()
      ]).then(function (r) {
        state.list = (r[0] && r[0].list) || [];
        state.categories = (r[1] && r[1].list) || [];
        state.payees = (r[2] && r[2].list) || [];
        paint();
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paint() {
      main.innerHTML = '';
      var head = U.el('div', { class: 'page-head' }, [
        U.el('div', { class: 'flex-between' }, [
          U.el('p', { style: { margin: 0 }, text: '提交门店费用报销，查看审核与打款进度。' }),
          U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button',
            html: UI.icon('plus', 15) + '<span>提交报销</span>',
            onclick: openSubmit
          })
        ])
      ]);
      main.appendChild(head);

      var tabs = U.el('div', { class: 'tabs' });
      [{ key: 'all', label: '全部' }].concat(Object.keys(STATUS).map(function (k) {
        return { key: k, label: STATUS[k].label };
      })).forEach(function (t) {
        var count = t.key === 'all' ? state.list.length : state.list.filter(function (x) { return x.status === t.key; }).length;
        tabs.appendChild(U.el('button', {
          class: 'tab' + (state.status === t.key ? ' active' : ''), type: 'button',
          onclick: function () {
            if (state.status === t.key) return;
            state.status = t.key;
            paint();
          }
        }, [
          U.el('span', { text: t.label }),
          count ? U.el('span', { class: 'badge badge-muted', style: { marginLeft: '4px' }, text: String(count) }) : null
        ]));
      });
      main.appendChild(tabs);

      var list = state.status === 'all' ? state.list : state.list.filter(function (x) { return x.status === state.status; });
      if (!list.length) {
        main.appendChild(UI.emptyState({
          icon: 'money', title: '暂无报销单',
          desc: '点击右上角「提交报销」上传小票或凭证，提交后由店长审核。'
        }));
        return;
      }

      list.forEach(function (c) {
        var card = U.el('div', { class: 'card', style: { marginBottom: '10px', cursor: 'pointer' } });
        card.appendChild(U.el('div', { class: 'card-body' }, [
          U.el('div', { class: 'flex-between', style: { gap: '8px', alignItems: 'flex-start' } }, [
            U.el('div', { style: { minWidth: '0' } }, [
              U.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' } }, [
                UI.badge(c.categoryName, 'info'),
                statusBadge(c.status)
              ]),
              U.el('div', { class: 'strong', style: { fontSize: '18px' }, text: U.money(c.amount) }),
              U.el('div', { class: 'small muted', style: { marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: c.reason })
            ]),
            U.el('div', { class: 'small muted', style: { flex: 'none' }, text: U.fmtTime(c.createdAt).slice(0, 16) })
          ])
        ]));
        card.addEventListener('click', function () { openDetail(c); });
        main.appendChild(card);
      });
    }

    /* ---------- 详情 ---------- */
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

      UI.openModal({ title: '报销详情', body: body, footer: [{ text: '关闭', class: 'btn-ghost' }] });
    }

    function previewAttachment(f) {
      api.getFileUrl(f.key).then(function (url) {
        if (!url) { UI.toast('附件地址不可用', 'error'); return; }
        if (/pdf/.test(f.mime)) {
          window.open(url, '_blank');
          return;
        }
        var body = U.el('div');
        body.appendChild(U.el('img', { src: url, alt: f.name || '附件', style: { width: '100%', borderRadius: '10px' } }));
        UI.openModal({ title: f.name || '附件预览', body: body, footer: [{ text: '关闭', class: 'btn-ghost' }] });
      });
    }

    /* ---------- 提交 ---------- */
    function openSubmit() {
      if (!state.categories.length) { UI.toast('暂无可用的报销分类，请联系店长在系统设置中启用', 'error'); return; }
      var files = [];
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });

      var catSel = U.el('select', { class: 'select', name: 'categoryId' });
      state.categories.forEach(function (c) {
        catSel.appendChild(U.el('option', { value: c.id, text: c.name }));
      });

      var amount = U.el('input', { class: 'input', name: 'amount', type: 'number', min: '0.01', step: '0.01', placeholder: '如 128.50' });
      var reason = U.el('textarea', { class: 'textarea', name: 'reason', rows: 4, maxlength: 500, placeholder: '说明费用用途、发生时间与地点' });

      var fileInput = U.el('input', { type: 'file', accept: '.jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf', multiple: true, style: { display: 'none' } });
      var fileList = U.el('div');
      var uploadBtn = U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('upload', 15) + '<span>选择附件</span>',
        onclick: function () { fileInput.click(); }
      });
      fileInput.addEventListener('change', function () {
        var picked = Array.prototype.slice.call(fileInput.files || []);
        fileInput.value = '';
        if (files.length + picked.length > 5) { UI.toast('最多上传 5 个附件', 'error'); return; }
        picked.forEach(function (f) {
          if (f.size > 10 * 1024 * 1024) { UI.toast(f.name + ' 超过 10MB', 'error'); return; }
          uploadBtn.disabled = true;
          api.uploadFile(f, 'reimburse').then(function (res) {
            uploadBtn.disabled = false;
            files.push({ key: res.key, name: res.name || f.name, mime: res.type || f.type });
            paintFiles();
          }).catch(function (e) {
            uploadBtn.disabled = false;
            UI.toast(e.message, 'error');
          });
        });
      });

      function paintFiles() {
        fileList.innerHTML = '';
        if (!files.length) {
          fileList.appendChild(U.el('div', { class: 'hint', text: '支持 JPG、PNG、WEBP、PDF，单个不超过 10MB，最多 5 个。' }));
          return;
        }
        files.forEach(function (f, i) {
          fileList.appendChild(U.el('div', { class: 'flex-between', style: { gap: '8px', padding: '6px 0' } }, [
            U.el('span', { class: 'small', text: (i + 1) + '. ' + f.name }),
            U.el('button', {
              class: 'btn-text danger', type: 'button', text: '移除',
              onclick: function () { files.splice(i, 1); paintFiles(); }
            })
          ]));
        });
      }
      paintFiles();

      /* 收款信息 */
      var payeePick = U.el('select', { class: 'select' });
      payeePick.appendChild(U.el('option', { value: '', text: state.payees.length ? '新增收款方式' : '首次填写收款信息' }));
      state.payees.forEach(function (p) {
        payeePick.appendChild(U.el('option', { value: p.id, text: payeeLabel(p) + (p.isDefault ? '（默认）' : '') }));
      });
      var typeSel = U.el('select', { class: 'select' }, [
        U.el('option', { value: 'alipay', text: '支付宝' }),
        U.el('option', { value: 'bank', text: '银行卡' })
      ]);
      var account = U.el('input', { class: 'input', placeholder: '支付宝账号 / 银行卡号' });
      var bankName = U.el('input', { class: 'input', placeholder: '开户银行，如 中国建设银行福州分行' });
      var holderName = U.el('input', { class: 'input', placeholder: '持卡人姓名' });
      var bankRow = U.el('div', { class: 'field', style: { display: 'none' } }, [
        U.el('label', { class: 'label', text: '开户银行' }), bankName,
        U.el('label', { class: 'label', style: { marginTop: '8px' }, text: '持卡人姓名' }), holderName
      ]);
      var defaultChk = U.el('input', { type: 'checkbox' });
      var editingPayeeId = '';

      function fillPayee(p) {
        editingPayeeId = p ? p.id : '';
        typeSel.value = p ? p.type : 'alipay';
        account.value = p ? p.account : '';
        bankName.value = p ? p.bankName : '';
        holderName.value = p ? p.holderName : '';
        defaultChk.checked = !!(p && p.isDefault);
        bankRow.style.display = typeSel.value === 'bank' ? '' : 'none';
      }
      payeePick.addEventListener('change', function () {
        var p = state.payees.filter(function (x) { return x.id === payeePick.value; })[0];
        fillPayee(p || null);
      });
      typeSel.addEventListener('change', function () {
        bankRow.style.display = typeSel.value === 'bank' ? '' : 'none';
      });
      fillPayee(state.payees.filter(function (p) { return p.isDefault; })[0] || state.payees[0] || null);
      if (!state.payees.length) payeePick.value = '';
      else if (state.payees.some(function (p) { return p.isDefault; })) payeePick.value = state.payees.filter(function (p) { return p.isDefault; })[0].id;
      else payeePick.value = state.payees[0].id;
      editingPayeeId = payeePick.value;

      var payeeBox = U.el('div', { class: 'field' }, [
        U.el('div', { class: 'flex-between', style: { marginBottom: '6px' } }, [
          U.el('label', { class: 'label', style: { margin: 0 }, text: '收款信息' }),
          U.el('button', {
            class: 'btn-text', type: 'button', text: '管理收款方式',
            onclick: function (e) { e.preventDefault(); openPayees(); }
          })
        ]),
        payeePick,
        U.el('div', { class: 'field', style: { marginTop: '8px' } }, [
          U.el('label', { class: 'label', text: '收款方式' }), typeSel
        ]),
        U.el('div', { class: 'field', style: { marginTop: '8px' } }, [
          U.el('label', { class: 'label', text: '收款账号' }), account
        ]),
        bankRow,
        U.el('label', { class: 'small', style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', fontWeight: '400' } }, [
          defaultChk, U.el('span', { text: '设为默认收款信息' })
        ])
      ]);

      form.appendChild(U.el('div', { class: 'field' }, [U.el('label', { class: 'label', text: '报销分类' }), catSel]));
      form.appendChild(U.el('div', { class: 'field' }, [U.el('label', { class: 'label', text: '报销金额（元）' }), amount]));
      form.appendChild(U.el('div', { class: 'field' }, [U.el('label', { class: 'label', text: '报销原因' }), reason]));
      form.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '附件（小票 / 发票 / 支付凭证）' }),
        U.el('div', { style: { marginBottom: '6px' } }, [uploadBtn, fileInput]),
        fileList
      ]));
      form.appendChild(payeeBox);

      function openPayees() {
        var box = U.el('div');
        if (!state.payees.length) {
          box.appendChild(U.el('p', { class: 'small muted', text: '还没有保存的收款信息，填写后会自动保存。' }));
        }
        state.payees.forEach(function (p) {
          box.appendChild(U.el('div', { class: 'info-row' }, [
            U.el('span', { class: 'info-label', text: payeeLabel(p) + (p.isDefault ? ' · 默认' : '') }),
            U.el('span', { class: 'info-value' }, [
              p.isDefault ? null : U.el('button', {
                class: 'btn-text', type: 'button', text: '设为默认',
                onclick: function () {
                  api.setDefaultPayee(p.id).then(function () {
                    UI.toast('已设为默认收款信息', 'success');
                    return api.myPayees().then(function (r) { state.payees = r.list || []; openPayees(); });
                  }).catch(function (e) { UI.toast(e.message, 'error'); });
                }
              }),
              U.el('button', {
                class: 'btn-text danger', type: 'button', style: { marginLeft: '10px' }, text: '删除',
                onclick: function () {
                  UI.confirm({ title: '删除收款信息', message: '确认删除「' + payeeLabel(p) + '」？', confirmText: '删除' }).then(function (yes) {
                    if (!yes) return;
                    api.deletePayee(p.id).then(function () {
                      UI.toast('已删除', 'success');
                      return api.myPayees().then(function (r) { state.payees = r.list || []; openPayees(); });
                    }).catch(function (e) { UI.toast(e.message, 'error'); });
                  });
                }
              })
            ])
          ]));
        });
        UI.openModal({
          title: '收款方式管理', body: box,
          footer: [{ text: '关闭', class: 'btn-ghost' }]
        });
      }

      UI.openModal({
        title: '提交报销',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '提交', class: 'btn-primary',
            onClick: function (btn, close) {
              var amt = Number(amount.value);
              if (!(amt > 0)) { UI.toast('请填写正确的报销金额', 'error'); return false; }
              if (String(reason.value || '').trim().length < 2) { UI.toast('请填写报销原因', 'error'); return false; }
              if (!String(account.value || '').trim()) { UI.toast('请填写收款账号', 'error'); return false; }
              if (typeSel.value === 'bank' && (!bankName.value.trim() || !holderName.value.trim())) {
                UI.toast('银行卡收款需填写开户银行与持卡人姓名', 'error'); return false;
              }
              UI.btnLoading(btn, true, '提交中…');
              api.createReimbursement({
                categoryId: catSel.value,
                amount: amt,
                reason: String(reason.value || '').trim(),
                attachments: files.map(function (f) { return f.key; }),
                attachmentMeta: files.map(function (f) { return { key: f.key, name: f.name, mime: f.mime }; }),
                payeeId: editingPayeeId,
                type: typeSel.value,
                account: account.value.trim(),
                bankName: typeSel.value === 'bank' ? bankName.value.trim() : '',
                holderName: typeSel.value === 'bank' ? holderName.value.trim() : '',
                payeeDefault: defaultChk.checked
              }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('报销单已提交，等待店长审核', 'success');
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

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };
})();
