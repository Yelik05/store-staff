/* P20 管理端 — 健康证核验（仅超级管理员） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-health-verify'] = function () {
    var state = { status: 'all', q: '', rows: [], counts: null };
    var content = U.el('div');
    content.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '核验在职员工健康证原件，记录核验结论与材料；员工更换证件后自动回到「未核验」。' }),
      U.el('div', { class: 'page-actions' })
    ]));

    var statRow = U.el('div', { class: 'stat-grid', style: { marginBottom: '12px' } });
    content.appendChild(statRow);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部核验状态'], ['none', '未核验'], ['pass', '已通过'], ['reject', '不通过']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    statusSel.addEventListener('change', function () { state.status = this.value; paint(); });
    toolbar.appendChild(statusSel);
    var search = U.el('input', { class: 'input', placeholder: '搜索姓名 / 飞书工号', style: { maxWidth: '220px' } });
    search.addEventListener('input', function () { state.q = this.value.trim(); paint(); });
    toolbar.appendChild(search);
    toolbar.appendChild(U.el('span', { class: 'spacer' }));
    var refreshBtn = U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('refresh', 15) + '<span>刷新</span>',
      onclick: function () { load(); }
    });
    toolbar.appendChild(refreshBtn);
    card.appendChild(toolbar);

    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);
    Layout.adminShell({ title: '健康证核验', active: 'admin-health-verify' }, content);

    load();

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      api.healthVerifyList().then(function (res) {
        state.rows = res.list || [];
        state.counts = res.counts || null;
        paintStats();
        paint();
      }).catch(function (e) {
        listBox.innerHTML = '';
        listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paintStats() {
      statRow.innerHTML = '';
      var c = state.counts || {};
      statRow.appendChild(statCard('待核验', c.none || 0, '人', 'warn'));
      statRow.appendChild(statCard('已通过', c.pass || 0, '人', 'success'));
      statRow.appendChild(statCard('不通过', c.reject || 0, '人', 'danger'));
      statRow.appendChild(statCard('未上传证件', c.unuploaded || 0, '人', 'muted'));
    }

    function statCard(label, value, unit, cls) {
      return U.el('div', { class: 'stat-card' + (cls === 'muted' ? '' : ' ' + cls) }, [
        U.el('div', { class: 'stat-label', text: label }),
        U.el('div', { class: 'stat-value', html: String(value) + '<small>' + unit + '</small>' }),
        U.el('div', {
          class: 'stat-sub',
          text: cls === 'warn' ? '待处理' : (cls === 'success' ? '已完成' : (cls === 'danger' ? '需跟进' : '待补交'))
        })
      ]);
    }

    function statusMeta(s) {
      return { pass: ['已通过', 'success'], reject: ['不通过', 'danger'], none: ['未核验', 'muted'] }[s] || ['未核验', 'muted'];
    }

    function filtered() {
      return state.rows.filter(function (r) {
        if (state.status !== 'all' && r.verifyStatus !== state.status) return false;
        if (state.q && (r.name || '').indexOf(state.q) < 0 && U.empNoOf(r).toUpperCase().indexOf(state.q.toUpperCase()) < 0) return false;
        return true;
      });
    }

    function paint() {
      listBox.innerHTML = '';
      var rows = filtered();
      if (!rows.length) {
        listBox.appendChild(UI.emptyState({
          icon: 'shield', title: '暂无符合条件的员工',
          desc: state.rows.length ? '试试调整筛选条件。' : '当前没有在职员工，或已有员工均不参与核验。'
        }));
        return;
      }
      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '860px' } });
      table.innerHTML = '<thead><tr><th>员工</th><th>证件与有效期</th><th>核验状态</th><th>上次核验</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      rows.forEach(function (r) {
        var tr = U.el('tr');
        tr.appendChild(U.el('td', {}, [
          U.el('div', { class: 'strong', text: r.name + (U.empNoOf(r) ? '（' + U.empNoOf(r) + '）' : '') }),
          U.el('div', { class: 'small muted', text: r.position + ' · ' + r.employmentType })
        ]));

        var expiryText = r.expiry ? (r.expiry + (r.expiryState === 'expired' ? '（已过期）' : (r.expiryState === 'soon' ? '（即将到期）' : ''))) : '未登记有效期';
        tr.appendChild(U.el('td', {}, [
          U.el('div', {}, [
            r.hasCert ? UI.badge('已上传', 'success') : UI.badge('未上传', 'muted'),
            r.hasCert && !r.certIsPdf ? U.el('span', { class: 'badge badge-warn', text: '非 PDF' }) : null
          ]),
          U.el('div', {
            class: 'small',
            style: { marginTop: '4px', color: r.expiryState === 'expired' ? 'var(--danger)' : '' },
            text: expiryText
          })
        ]));

        var sm = statusMeta(r.verifyStatus);
        tr.appendChild(U.el('td', {}, [UI.badge(sm[0], sm[1])]));

        tr.appendChild(U.el('td', { class: 'small' }, [
          r.verifiedAt ? U.el('div', { text: U.fmtTime(r.verifiedAt) }) : U.el('div', { class: 'muted', text: '—' }),
          U.el('div', { class: 'muted', text: r.verifiedByName ? ('核验人：' + r.verifiedByName) : ' ' })
        ]));

        var ops = U.el('div', { class: 'table-actions' });
        if (r.hasCert && r.certIsPdf) {
          ops.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '查看原件',
            onclick: function () { viewCert(r); }
          }));
          ops.appendChild(U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '核验',
            onclick: function () { openVerify(r); }
          }));
        }
        ops.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '历史',
          onclick: function () { openHistory(r); }
        }));
        tr.appendChild(U.el('td', {}, [ops]));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      listBox.appendChild(wrap);
    }

    function viewCert(r) {
      api.getFileUrl(r.certKey).then(function (url) {
        if (!url) { UI.toast('证件文件已失效，请让员工重新上传', 'error'); return; }
        UI.pdfViewer({ url: url, title: '健康证 · ' + r.name });
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function openVerify(r) {
      var result = 'pass';
      var remark = U.el('textarea', { class: 'textarea', rows: 3, maxlength: 500, placeholder: '核验不通过时必填：说明问题与需补充的材料' });
      var chips = U.el('div', { class: 'radio-group' });
      var chipPass = U.el('label', { class: 'radio-chip checked' }, [
        U.el('input', { type: 'radio', name: 'hcv-result', value: 'pass', checked: true, onchange: function () { setResult('pass'); } }),
        U.el('span', { text: '通过' })
      ]);
      var chipReject = U.el('label', { class: 'radio-chip' }, [
        U.el('input', { type: 'radio', name: 'hcv-result', value: 'reject', onchange: function () { setResult('reject'); } }),
        U.el('span', { text: '不通过' })
      ]);
      function setResult(v) {
        result = v;
        chipPass.classList.toggle('checked', v === 'pass');
        chipReject.classList.toggle('checked', v === 'reject');
        remark.placeholder = v === 'reject'
          ? '核验不通过时必填：说明问题与需补充的材料'
          : '可选：补充核验说明';
      }
      chips.appendChild(chipPass);
      chips.appendChild(chipReject);

      var material = null;
      var fileInput = U.el('input', { type: 'file', accept: '.jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf', style: { display: 'none' } });
      var materialBox = U.el('div', { class: 'hint', text: '可选：支持 JPG、PNG、WEBP、PDF，单个不超过 10MB；材料仅内部留存，不在公示页展示。' });
      var uploadBtn = U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('upload', 15) + '<span>上传核验材料</span>',
        onclick: function () { fileInput.click(); }
      });
      fileInput.addEventListener('change', function () {
        var f = (fileInput.files || [])[0];
        fileInput.value = '';
        if (!f) return;
        uploadBtn.disabled = true;
        api.uploadFile(f, 'healthVerify').then(function (res) {
          uploadBtn.disabled = false;
          material = { key: res.key, name: res.name || f.name, type: res.type || '' };
          materialBox.innerHTML = '';
          materialBox.appendChild(U.el('div', { class: 'flex-between', style: { gap: '8px' } }, [
            U.el('span', { class: 'small', text: '已上传：' + material.name }),
            U.el('button', {
              class: 'btn-text danger', type: 'button', text: '移除',
              onclick: function () {
                material = null;
                materialBox.className = 'hint';
                materialBox.textContent = '可选：支持 JPG、PNG、WEBP、PDF，单个不超过 10MB；材料仅内部留存，不在公示页展示。';
              }
            })
          ]));
        }).catch(function (e) {
          uploadBtn.disabled = false;
          UI.toast(e.message, 'error');
        });
      });

      var body = U.el('div');
      body.appendChild(U.el('div', { class: 'alert alert-info' }, [
        U.el('div', { text: '员工：' + r.name + ' · ' + r.position + (U.empNoOf(r) ? ' · ' + U.empNoOf(r) : '') }),
        U.el('div', { class: 'small', style: { marginTop: '4px' }, text: '证件有效期：' + (r.expiry || '未登记') + '　当前状态：' + statusMeta(r.verifyStatus)[0] })
      ]));
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('file', 15) + '<span>查看健康证原件</span>',
          onclick: function () { viewCert(r); }
        })
      ]));
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '核验结论' }), chips
      ]));
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '核验备注' }), remark
      ]));
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '核验结果截图 / 材料（可选）' }),
        U.el('div', { class: 'flex-between', style: { gap: '8px', marginBottom: '6px' } }, [uploadBtn, fileInput]),
        materialBox
      ]));

      UI.openModal({
        title: '健康证核验 · ' + r.name,
        subtitle: '核验人与时间将自动记录；提交后立即生效',
        body: body,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '提交核验', class: 'btn-primary',
            onClick: function (btn, close) {
              if (result === 'reject' && !remark.value.trim()) {
                UI.toast('核验不通过时必须填写备注', 'error');
                return false;
              }
              btn.disabled = true;
              api.healthVerifySave({
                staffId: r.staffId, result: result, remark: remark.value.trim(),
                materialKey: material ? material.key : '',
                materialName: material ? material.name : '',
                materialType: material ? material.type : ''
              }).then(function () {
                UI.toast('核验结果已保存', 'success');
                close();
                load();
              }).catch(function (e) {
                btn.disabled = false;
                UI.toast(e.message, 'error');
              });
              return false;
            }
          }
        ]
      });
    }

    function openHistory(r) {
      var box = U.el('div');
      box.appendChild(U.el('div', { class: 'hint', text: '保留全部历史核验记录；仅「当前证件」的最近一条生效。' }));
      box.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(2)]));
      UI.openModal({ title: '核验历史 · ' + r.name, body: box, size: 'lg' });
      api.healthVerifyHistory(r.staffId).then(function (res) {
        box.innerHTML = '';
        box.appendChild(U.el('div', { class: 'hint', text: '保留全部历史核验记录；仅「当前证件」的最近一条生效。' }));
        if (!res.list.length) {
          box.appendChild(UI.emptyState({ icon: 'shield', title: '暂无核验记录', desc: '该员工尚未进行过健康证核验。' }));
          return;
        }
        res.list.forEach(function (h) {
          var sm = statusMeta(h.result);
          var row = U.el('div', { class: 'history-row', style: { padding: '10px 0', borderBottom: '1px solid var(--line-2)' } }, [
            U.el('div', { class: 'flex-between', style: { gap: '8px' } }, [
              U.el('div', {}, [
                UI.badge(sm[0], sm[1]),
                h.current ? U.el('span', { class: 'badge badge-info', style: { marginLeft: '6px' }, text: '当前证件' }) : U.el('span', { class: 'badge badge-muted', style: { marginLeft: '6px' }, text: '旧证件' })
              ]),
              U.el('span', { class: 'small muted', text: U.fmtTime(h.verifiedAt) + ' · ' + (h.verifiedByName || '—') })
            ]),
            U.el('div', { class: 'small', style: { marginTop: '4px', whiteSpace: 'pre-wrap' }, text: h.remark || '（无备注）' })
          ]);
          if (h.material) {
            row.appendChild(U.el('button', {
              class: 'btn-text', type: 'button', text: '查看核验材料：' + h.material.name,
              onclick: function () {
                api.getFileUrl(h.material.key).then(function (url) {
                  if (!url) { UI.toast('核验材料已失效', 'error'); return; }
                  if (/pdf/i.test(h.material.type) || /\.pdf$/i.test(h.material.key)) UI.pdfViewer({ url: url, title: '核验材料 · ' + r.name });
                  else UI.imageViewer({ url: url, title: '核验材料 · ' + r.name });
                });
              }
            }));
          }
          box.appendChild(row);
        });
      }).catch(function (e) {
        box.innerHTML = '';
        box.appendChild(UI.errorState({ message: e.message }));
      });
    }
  };
})();
