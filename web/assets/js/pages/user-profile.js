/* 员工端 — 他人用户主页（通讯录进入） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['user-profile'] = function (ctx) {
    var ses = Auth.current() || {};
    var staffId = (ctx.params && ctx.params.id) || '';
    if (!staffId) {
      location.replace('contacts.html');
      return;
    }
    if (staffId === ses.staffId) {
      location.replace('profile.html');
      return;
    }

    var main = Layout.staffShell({ title: '用户主页', active: 'profile', back: 'contacts.html' }, UI.skeleton(3));
    var profile = null;

    load();

    function load() {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.staffProfile(staffId).then(function (p) {
        profile = p;
        render();
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function render() {
      main.innerHTML = '';
      var p = profile;
      main.appendChild(headCard(p));
      /* 健康证与本月休息记录同一行并排；窄屏自动改为上下排列，避免挤压变形 */
      var duo = U.el('div', { class: 'user-duo' });
      duo.appendChild(healthCard(p));
      duo.appendChild(leaveCard(p));
      main.appendChild(duo);
      main.appendChild(scoreCard(p));
      main.appendChild(U.el('p', {
        class: 'text-center small muted',
        text: p.isSuper ? '超管可见敏感资料与证件，查看与修改会写入操作日志。' : '页面仅展示公开基础信息，身份证号与证件附件不对外展示。'
      }));
    }

    function headCard(p) {
      var card = U.el('div', { class: 'card' });
      var actions = U.el('div', { class: 'flex gap-8 wrap', style: { marginTop: '12px' } });
      if (p.phone) {
        actions.appendChild(U.el('a', { class: 'btn btn-ghost btn-sm', href: 'tel:' + p.phone, text: '拨号' }));
      }
      actions.appendChild(U.el('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: '发送消息',
        onclick: function () { openCompose(p); }
      }));
      if (p.canEdit) {
        actions.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '编辑资料',
          onclick: function () { openEdit(p); }
        }));
      }
      if (p.canScore) {
        actions.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '增加/扣除量化分',
          onclick: function () { openAdjust(p); }
        }));
      }

      card.appendChild(U.el('div', { class: 'card-body' }, [
        U.el('div', { class: 'flex gap-12', style: { alignItems: 'center' } }, [
          UI.userAvatar(p.name, p.avatar, 'avatar-lg'),
          U.el('div', { style: { flex: '1 1 auto', minWidth: '0' } }, [
            U.el('div', { class: 'flex gap-8 wrap', style: { alignItems: 'center' } }, [
              U.el('strong', { style: { fontSize: '18px' }, text: p.displayName || p.name }),
              p.position ? UI.badge(p.position, 'brand') : null,
              UI.statusBadge(p.status)
            ]),
            U.el('div', {
              class: 'small muted', style: { marginTop: '4px' },
              text: '飞书工号 ' + (U.empNoOf(p) || '—') + ' · ' + (p.employmentType || '—') + ' · 入职 ' + (p.hireDate ? U.fmtDate(p.hireDate) : '—')
            })
          ])
        ]),
        actions,
        U.el('div', { class: 'info-list', style: { marginTop: '12px' } }, [
          infoRow('联系方式', p.phone || '—')
        ])
      ]));

      if (p.isSuper) {
        var extra = U.el('div', { class: 'card-body tight', style: { borderTop: '1px solid var(--line-2)' } });
        extra.appendChild(infoRow('身份证有效期', p.idCardExpiry ? U.fmtDate(p.idCardExpiry) : '—'));
        extra.appendChild(infoRow('健康证有效期', p.healthCertExpiry ? U.fmtDate(p.healthCertExpiry) : '—'));
        if (p.feishuId) extra.appendChild(infoRow('飞书 ID', p.feishuId));
        if (p.feishuEmpNo && p.empNo) extra.appendChild(infoRow('门店工号', p.empNo));
        if (p.remark) extra.appendChild(infoRow('管理组备注', p.remark, true));
        card.appendChild(extra);
      }
      return card;
    }

    function healthCard(p) {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '健康证' }),
        UI.healthBadge({ state: p.health.state, days: p.health.days })
      ]));
      var body = U.el('div', { class: 'card-body tight' });
      body.appendChild(infoRow('有效期至', p.health.expiry ? U.fmtDate(p.health.expiry) : '未登记'));
      var verify = p.health.verify;
      var vText = !verify ? '未核验' : (verify.result === 'pass' ? '核验通过' : '核验不通过');
      var vCls = !verify ? 'muted' : (verify.result === 'pass' ? 'success' : 'danger');
      body.appendChild(row('核验结果', UI.badge(vText, vCls)));
      if (verify && verify.verifiedAt) body.appendChild(infoRow('核验时间', U.fmtTime(verify.verifiedAt)));
      if (p.isSuper) {
        if (p.health.verifiedByName) body.appendChild(infoRow('核验人', p.health.verifiedByName));
        if (p.health.remark) body.appendChild(infoRow('核验备注', p.health.remark, true));
        var acts = U.el('div', { class: 'flex gap-8 wrap', style: { marginTop: '10px' } });
        if (p.health.certKey) {
          acts.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '查看健康证',
            onclick: function () {
              api.getFileUrl(p.health.certKey).then(function (url) {
                if (!url) { UI.toast('文件已失效', 'error'); return; }
                UI.pdfViewer({ url: url, title: '健康证 · ' + p.name });
                Store.log('查看健康证', p.name, '用户主页');
              });
            }
          }));
        }
        if (p.health.material) {
          acts.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '查看核验附件',
            onclick: function () {
              api.getFileUrl(p.health.material.key).then(function (url) {
                if (!url) { UI.toast('文件已失效', 'error'); return; }
                var isPdf = /pdf/i.test(p.health.material.type || '') || /\.pdf$/i.test(p.health.material.name || '');
                if (isPdf) UI.pdfViewer({ url: url, title: '核验附件 · ' + p.name });
                else UI.imageViewer({ url: url, title: '核验附件 · ' + p.name });
                Store.log('查看核验附件', p.name, '用户主页');
              });
            }
          }));
        }
        if (acts.children.length) body.appendChild(acts);
      }
      card.appendChild(body);
      return card;
    }

    function leaveCard(p) {
      var card = U.el('div', { class: 'card' });
      var d = p.leaves || { used: 0, pending: 0, list: [] };
      card.appendChild(U.el('div', { class: 'card-head stack' }, [
        U.el('div', { class: 'card-title', text: '本月休息记录' }),
        U.el('span', { class: 'small muted', text: '已休 ' + d.used + ' 天 · 审批中 ' + d.pending + ' 天' })
      ]));
      if (!d.list.length) {
        card.appendChild(U.el('div', { class: 'card-body' }, [
          UI.emptyState({ icon: 'calendar', title: '本月暂无休息记录', desc: '仅展示审批通过与待审批的排休。' })
        ]));
        return card;
      }
      var body = U.el('div', { class: 'card-body tight' });
      d.list.forEach(function (l) {
        var st = UI.leaveStatus(l);
        body.appendChild(U.el('div', { class: 'info-row' }, [
          U.el('span', { class: 'info-label', text: l.date }),
          U.el('span', { class: 'info-value flex gap-8', style: { alignItems: 'center' } }, [
            U.el('span', { text: l.type }),
            UI.badge(st.text, st.cls)
          ])
        ]));
      });
      card.appendChild(body);
      return card;
    }

    function scoreCard(p) {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '量化分' }),
        U.el('span', { class: 'small muted', text: p.leaves.month })
      ]));
      var sc = p.score;
      if (!sc) {
        card.appendChild(U.el('div', { class: 'card-body' }, [
          U.el('div', { class: 'small muted', text: '本月量化分尚未发布。' })
        ]));
        return card;
      }
      var body = U.el('div', { class: 'card-body' });
      if (p.isSuper && sc.dims && sc.dims.length) {
        var dims = U.el('div', { class: 'info-list', style: { marginTop: '10px' } });
        sc.dims.forEach(function (x) {
          dims.appendChild(infoRow(x.name, x.score + ' / ' + x.full));
        });
        body.appendChild(dims);
      }
      if (p.isSuper && sc.adjust && sc.adjust.length) {
        body.appendChild(U.el('div', { class: 'small muted', style: { marginTop: '10px', text: '加减分记录' } }));
        sc.adjust.forEach(function (a) {
          var sign = Number(a.value) > 0 ? '+' : '';
          body.appendChild(U.el('div', { class: 'small', style: { marginTop: '4px' }, text: (a.date || '') + ' · ' + sign + a.value + ' 分 · ' + (a.reason || '') + (a.by ? '（' + a.by + '）' : '') }));
        });
      }
      card.appendChild(body);
      return card;
    }

    function infoRow(label, value, block) {
      return U.el('div', { class: 'info-row' + (block ? ' block' : '') }, [
        U.el('span', { class: 'info-label', text: label }),
        U.el('span', { class: 'info-value', text: value === '' || value === null || value === undefined ? '—' : String(value) })
      ]);
    }

    function row(label, value) {
      var v = U.el('span', { class: 'info-value' });
      if (value instanceof Node) v.appendChild(value);
      else v.textContent = value === '' || value === null || value === undefined ? '—' : String(value);
      return U.el('div', { class: 'info-row' }, [U.el('span', { class: 'info-label', text: label }), v]);
    }

    /* ---------- 发消息 ---------- */
    function openCompose(p) {
      var name = p.displayName || p.name;
      var input = U.el('textarea', {
        class: 'input', rows: 4, maxlength: 500,
        placeholder: '输入消息内容（500 字以内）…',
        style: { minHeight: '104px', resize: 'vertical', lineHeight: '1.6' }
      });
      var counter = U.el('div', { class: 'hint', text: '0 / 500' });
      input.addEventListener('input', function () { counter.textContent = input.value.length + ' / 500'; });
      var body = U.el('div', {}, [
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: '发送给 ' + name }),
          input,
          counter
        ]),
        U.el('p', { class: 'hint', text: '消息会进入对方的「信息通知」，对方可直接回复。' })
      ]);
      UI.openModal({
        title: '发消息给 ' + name,
        body: body,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '发送', class: 'btn-primary',
            onClick: function (btn, close) {
              var text = String(input.value || '').trim();
              if (!text) { UI.toast('请输入消息内容', 'error'); return false; }
              UI.btnLoading(btn, true, '发送中…');
              api.sendMessage({ toStaffId: p.id, body: text }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已发送给 ' + name, 'success');
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

    /* ---------- 超管编辑资料 ---------- */
    function openEdit(p) {
      var uploaded = {};
      var positions = V.POSITIONS.map(function (x) {
        return '<option value="' + x + '"' + (x === p.position ? ' selected' : '') + '>' + x + '</option>';
      }).join('');
      var types = V.EMPLOYMENT_TYPES.map(function (x) {
        return '<option value="' + x + '"' + (x === p.employmentType ? ' selected' : '') + '>' + x + '</option>';
      }).join('');
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-info">超级管理员可修改全部信息与证件。姓名、手机号、身份证号变更会同步登录账号，并写入操作日志。</div>' +
        '<div class="form-grid two">' +
        '<div class="field" data-field="name"><label class="label">姓名 <i class="req">*</i></label><input class="input" name="name" value="' + U.esc(p.name) + '"><div class="error-text"></div></div>' +
        '<div class="field" data-field="phone"><label class="label">手机号 <i class="req">*</i></label><input class="input mono" name="phone" value="' + U.esc(p.phone || '') + '"><div class="error-text"></div></div>' +
        '</div>' +
        '<div class="field" data-field="idCard"><label class="label">身份证号</label><input class="input mono" name="idCard" value="' + U.esc(p.idCard || '') + '"><div class="hint">修改后同步更新出生日期与性别。</div><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">现居住地址</label><input class="input" name="address" value="' + U.esc(p.address || '') + '"></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">岗位</label><select class="select" name="position">' + positions + '</select></div>' +
        '<div class="field"><label class="label">用工性质</label><select class="select" name="employmentType">' + types + '</select></div>' +
        '</div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">入职日期</label><input class="input" type="date" name="hireDate" value="' + (p.hireDate || '') + '"></div>' +
        '<div class="field"><label class="label">紧急联系人</label><input class="input" name="emergency" value="' + U.esc(p.emergency || '') + '" placeholder="姓名 手机号"></div>' +
        '</div>' +
        '<div class="field"><label class="label">飞书 ID</label><input class="input mono" name="feishuId" value="' + U.esc(p.feishuId || '') + '" placeholder="open_id / user_id，选填"></div>' +
        '<div class="field"><label class="label">飞书工号</label><input class="input mono" name="feishuEmpNo" value="' + U.esc(p.feishuEmpNo || '') + '" placeholder="飞书侧唯一，选填"></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">身份证有效期至</label><input class="input" type="date" name="idCardExpiry" value="' + (p.idCardExpiry || '') + '"></div>' +
        '<div class="field"><label class="label">健康证有效期至</label><input class="input" type="date" name="healthCertExpiry" value="' + (p.healthCertExpiry || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label class="label">备注</label><textarea class="textarea" name="remark" maxlength="200">' + U.esc(p.remark || '') + '</textarea></div>' +
        '<div class="hint">证件照片：选择新文件后需点击「保存」，保存完成即生效。</div>';

      [
        { key: 'photo', label: '白底一寸照', accept: 'image/*' },
        { key: 'idFront', label: '身份证正面', accept: 'image/*' },
        { key: 'idBack', label: '身份证反面', accept: 'image/*' },
        { key: 'healthCert', label: '健康证（PDF）', accept: 'application/pdf' }
      ].forEach(function (cfg) {
        var has = p.files && p.files[cfg.key];
        var tip = U.el('span', { class: 'small muted', text: has ? '已上传，可重新选择' : '未上传' });
        var fileInput = U.el('input', { type: 'file', accept: cfg.accept });
        fileInput.style.display = 'none';
        var pick = U.el('label', { class: 'btn btn-ghost btn-sm', style: { cursor: 'pointer', margin: 0 } }, [
          U.el('span', { text: '选择文件' }), fileInput
        ]);
        fileInput.addEventListener('change', function () {
          var f = this.files && this.files[0];
          if (!f) return;
          tip.textContent = '上传中…';
          api.uploadFile(f, cfg.key).then(function (res) {
            uploaded[cfg.key] = res.key;
            tip.textContent = '已上传（保存后生效）';
          }).catch(function (e) {
            tip.textContent = '上传失败，请重试';
            UI.toast(e.message, 'error');
          });
        });
        form.appendChild(U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: cfg.label }),
          U.el('div', { class: 'flex gap-8', style: { alignItems: 'center' } }, [pick, tip])
        ]));
      });

      UI.openModal({
        title: '编辑资料 · ' + p.name,
        subtitle: '超级管理员权限',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var payload = {
                name: String(fd.get('name') || '').trim(),
                phone: String(fd.get('phone') || '').trim(),
                idCard: String(fd.get('idCard') || '').trim(),
                address: String(fd.get('address') || '').trim(),
                position: fd.get('position'),
                employmentType: fd.get('employmentType'),
                hireDate: fd.get('hireDate'),
                emergency: String(fd.get('emergency') || '').trim(),
                feishuId: String(fd.get('feishuId') || '').trim(),
                feishuEmpNo: String(fd.get('feishuEmpNo') || '').trim(),
                idCardExpiry: fd.get('idCardExpiry'),
                healthCertExpiry: fd.get('healthCertExpiry'),
                remark: fd.get('remark')
              };
              var nm = V.name(payload.name);
              if (nm) { V.applyFieldError(form, 'name', nm); return false; }
              var pm = V.phone(payload.phone);
              if (pm) { V.applyFieldError(form, 'phone', pm); return false; }
              if (payload.idCard && !V.checkIdCard(payload.idCard)) {
                V.applyFieldError(form, 'idCard', '请输入正确的 18 位身份证号');
                return false;
              }
              if (Object.keys(uploaded).length) payload.files = uploaded;
              UI.btnLoading(btn, true, '保存中…');
              api.updateStaff(p.id, payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('档案已更新并记录操作日志', 'success');
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

    /* ---------- 超管加/扣量化分 ---------- */
    function openAdjust(p) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-info">加减分将写入本月量化分记录与操作日志，并给对方发送站内通知。单次范围 ±1 至 ±5 分。</div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">操作</label><select class="select" name="action">' +
        '<option value="add">加分</option><option value="minus">扣分</option></select></div>' +
        '<div class="field" data-field="value"><label class="label">分值 <i class="req">*</i></label>' +
        '<input class="input mono" name="value" type="number" min="1" max="5" step="0.5" value="1"><div class="error-text"></div></div>' +
        '</div>' +
        '<div class="field" data-field="reason"><label class="label">原因 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="reason" maxlength="120" placeholder="例如：主动补位、拾金不昧、服务获顾客表扬"></textarea><div class="error-text"></div></div>';
      UI.openModal({
        title: '量化分调整 · ' + p.name,
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认调整', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var n = Math.abs(Number(fd.get('value')));
              if (!n || n < 1 || n > 5) { V.applyFieldError(form, 'value', '分值需在 1—5 之间'); return false; }
              var reason = String(fd.get('reason') || '').trim();
              if (!reason) { V.applyFieldError(form, 'reason', '请填写调整原因'); return false; }
              var value = fd.get('action') === 'minus' ? -n : n;
              UI.btnLoading(btn, true, '提交中…');
              api.adjustScore({ staffId: p.id, value: value, reason: reason }).then(function (res) {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已' + (value > 0 ? '加分' : '扣分') + '，本月总分 ' + res.total + ' 分', 'success');
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
  };
})();
