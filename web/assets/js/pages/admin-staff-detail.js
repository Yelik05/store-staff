/* P09 管理端 — 档案详情与审核 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-staff-detail'] = function (ctx) {
    var staffId = ctx.params.id || '';
    var staff = null;
    var revealed = false;
    var corrections = [];

    var content = U.el('div', {}, [UI.skeleton(4)]);
    Layout.adminShell({ title: '档案详情', active: 'admin-staff' }, content);

    api.getStaff(staffId).then(function (s) {
      staff = s;
      return api.listCorrections({ staffId: staffId }).then(function (r) {
        corrections = r.list || [];
        return s;
      });
    }).then(function () {
      content.innerHTML = '';
      content.appendChild(render());
    }).catch(function (e) {
      content.innerHTML = '';
      content.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function render() {
      var wrap = U.el('div');
      var info = api.expiryInfo(staff);

      wrap.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'flex gap-8 wrap' }, [
            U.el('h1', { text: staff.displayName || UI.displayName(staff.name, staff.nickname) }),
            UI.statusBadge(staff.status),
            UI.badge(staff.position, 'brand')
          ]),
          U.el('p', { text: '飞书工号 ' + (U.empNoOf(staff) || '待分配') + ' · ' + staff.employmentType + ' · 入职 ' + U.fmtDate(staff.hireDate) })
        ]),
        U.el('div', { class: 'page-actions' }, [
          U.el('a', { class: 'btn btn-ghost btn-sm', href: 'admin-staff.html', text: '返回列表' })
        ])
      ]));

      if (info.health.state === 'expired') {
        wrap.appendChild(U.el('div', { class: 'alert alert-danger' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('alert', 17) }),
          U.el('div', { text: '健康证已过期 ' + Math.abs(info.health.days) + ' 天（有效期至 ' + U.fmtDate(staff.healthCertExpiry) + '），请提醒员工尽快补办。' })
        ]));
      } else if (info.health.state === 'soon') {
        wrap.appendChild(U.el('div', { class: 'alert alert-warn' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('clock', 17) }),
          U.el('div', { text: '健康证将于 ' + U.fmtDate(staff.healthCertExpiry) + ' 到期（剩余 ' + info.health.days + ' 天）。' })
        ]));
      }
      if (staff.status === 'rejected') {
        wrap.appendChild(U.el('div', { class: 'alert alert-danger' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('alert', 17) }),
          U.el('div', {}, [
            U.el('div', { class: 'alert-title', text: '已驳回' }),
            U.el('div', { text: '原因：' + (staff.rejectReason || '—') })
          ])
        ]));
      }

      var grid = U.el('div', { class: 'detail-grid' });

      /* 左侧证件 */
      var side = U.el('div', { class: 'detail-side' });
      var certCard = U.el('div', { class: 'card' });
      certCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '证件资料' }),
        U.el('span', { class: 'small muted', text: '查看将留痕' })
      ]));
      var cbody = U.el('div', { class: 'card-body' });
      var certs = [
        { key: 'idFront', label: '身份证正面', type: 'image' },
        { key: 'idBack', label: '身份证反面', type: 'image' },
        { key: 'photo', label: '白底一寸照', type: 'image' },
        { key: 'healthCert', label: '健康证', type: 'pdf' }
      ];
      var cgrid = U.el('div', { class: 'cert-grid' });
      certs.forEach(function (c) {
        var fk = staff.files && staff.files[c.key];
        var item = U.el('button', { class: 'cert-item' + (c.type === 'pdf' ? ' pdf' : ''), type: 'button' });
        if (c.type === 'pdf') {
          item.appendChild(U.el('div', { class: 'pdf-badge', text: fk ? 'PDF' : '未上传' }));
          item.appendChild(U.el('span', { text: c.label + ' · ' + U.fmtDate(staff.healthCertExpiry) }));
        } else {
          var img = U.el('img', { alt: c.label });
          if (fk) api.getFileUrl(fk).then(function (u) { if (u) img.src = u; });
          item.appendChild(img);
          item.appendChild(U.el('span', { text: c.label }));
        }
        item.addEventListener('click', function () {
          if (!fk) { UI.toast('该证件尚未上传', 'error'); return; }
          confirmView(c.label, function () {
            api.getFileUrl(fk).then(function (url) {
              if (!url) { UI.toast('文件已失效，请让员工重新上传', 'error'); return; }
              if (c.type === 'pdf') UI.pdfViewer({ url: url, title: c.label + ' · ' + staff.name });
              else UI.imageViewer({ url: url, title: c.label + ' · ' + staff.name });
              Store.log('查看证件原图', staff.name, c.label);
            });
          });
        });
        cgrid.appendChild(item);
      });
      cbody.appendChild(cgrid);
      cbody.appendChild(U.el('div', { class: 'hint mt-12', text: '证件影像仅对本人与管理组可见，查看行为会写入操作日志。' }));
      certCard.appendChild(cbody);
      side.appendChild(certCard);

      if (corrections.length) {
        var cc = U.el('div', { class: 'card' });
        cc.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '更正申请' })]));
        corrections.forEach(function (c) {
          var node = U.el('div', { class: 'card-body', style: { borderBottom: '1px solid var(--line-2)' } }, [
            U.el('div', { class: 'flex-between' }, [
              U.el('strong', { text: c.fieldLabel }),
              c.status === 'pending' ? UI.badge('待处理', 'warn') : UI.badge(c.status === 'accepted' ? '已采纳' : '已驳回', c.status === 'accepted' ? 'success' : 'muted')
            ]),
            correctionValue(c),
            c.note ? U.el('div', { class: 'small muted', text: '说明：' + c.note }) : null,
            U.el('div', { class: 'small muted', text: U.fmtTime(c.createdAt) + (c.reviewedBy ? ' · ' + c.reviewedBy + ' 处理' : '') }),
            c.status === 'pending'
              ? (c.superOnly && !Auth.isSuper()
                ? U.el('div', { class: 'small muted', style: { marginTop: '8px' } }, '该申请需店长（超级管理员）审核')
                : U.el('div', { class: 'table-actions', style: { marginTop: '8px' } }, [
                  U.el('button', {
                    class: 'btn btn-primary btn-sm', type: 'button', text: '采纳并应用',
                    onclick: function () {
                      var isFile = ['idFront', 'idBack', 'photo', 'healthCert'].indexOf(c.field) >= 0;
                      UI.confirm({
                        title: '采纳更正',
                        message: isFile ? '确认采纳该员工上传的新「' + c.fieldLabel + '」？' : '确认将「' + c.fieldLabel + '」更正为“' + c.newValue + '”？该操作会写入操作日志。',
                        confirmText: '采纳'
                      })
                        .then(function (yes) {
                          if (!yes) return;
                          api.resolveCorrection({ id: c.id, action: 'accept' }).then(function () {
                            UI.toast('已采纳更正', 'success');
                            setTimeout(function () { location.reload(); }, 500);
                          }).catch(function (e2) { UI.toast(e2.message, 'error'); });
                        });
                    }
                  }),
                  U.el('button', {
                    class: 'btn btn-ghost btn-sm', type: 'button', text: '驳回',
                    onclick: function () {
                      UI.confirm({ title: '驳回更正', message: '确认驳回该更正申请？', danger: true, confirmText: '驳回' })
                        .then(function (yes) {
                          if (!yes) return;
                          api.resolveCorrection({ id: c.id, action: 'reject', reason: '请本人到店核对后联系店长' }).then(function () {
                            UI.toast('已驳回', 'success');
                            setTimeout(function () { location.reload(); }, 500);
                          }).catch(function (e2) { UI.toast(e2.message, 'error'); });
                        });
                    }
                  })
                ]))
              : null
          ]);
          cc.appendChild(node);
        });
        side.appendChild(cc);
      }
      grid.appendChild(side);

      /* 右侧信息 */
      var right = U.el('div');
      var base = U.el('div', { class: 'card' });
      base.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '基础信息' }),
        U.el('span', { class: 'small muted', text: '身份证号默认脱敏' })
      ]));
      var bb = U.el('div', { class: 'card-body tight' });
      bb.appendChild(row('姓名', staff.name));
      bb.appendChild(row('性别', staff.gender || '—'));
      bb.appendChild(row('出生日期', U.fmtDate(staff.birth)));
      var idRow = U.el('div', { class: 'info-row' });
      idRow.appendChild(U.el('span', { class: 'info-label', text: '身份证号' }));
      var idVal = U.el('span', { class: 'info-value' });
      paintId(idVal);
      idRow.appendChild(idVal);
      bb.appendChild(idRow);
      bb.appendChild(row('手机号', staff.phone));
      bb.appendChild(row('现居住地址', staff.address, true));
      bb.appendChild(row('应聘岗位', staff.position));
      bb.appendChild(row('用工性质', staff.employmentType));
      bb.appendChild(row('入职日期', U.fmtDate(staff.hireDate)));
      bb.appendChild(row('身份证有效期', U.fmtDate(staff.idCardExpiry)));
      var hRow = U.el('div', { class: 'info-row' });
      hRow.appendChild(U.el('span', { class: 'info-label', text: '健康证有效期' }));
      var hVal = U.el('span', { class: 'info-value' }, [U.el('span', { class: 'mono', text: U.fmtDate(staff.healthCertExpiry) + ' ' }), UI.healthBadge(info.health)]);
      hRow.appendChild(hVal);
      bb.appendChild(hRow);
      bb.appendChild(row('紧急联系人', staff.emergency || '—'));
      bb.appendChild(row('飞书 ID', staff.feishuId || '—'));
      bb.appendChild(row('飞书工号', staff.feishuEmpNo || '—'));
      bb.appendChild(row('门店工号', staff.empNo || '—'));
      base.appendChild(bb);
      right.appendChild(base);

      var acc = U.el('div', { class: 'card' });
      acc.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '账号信息' })]));
      var ab = U.el('div', { class: 'card-body tight' });
      var account = Store.db.accounts.filter(function (a) { return a.staffId === staff.id; })[0];
      ab.appendChild(row('登录手机号', staff.phone));
      ab.appendChild(row('账号角色', account ? api.roleLabel(account.role) : '员工'));
      ab.appendChild(row('账号状态', account && account.status === 'disabled' ? '已停用' : '正常'));
      ab.appendChild(row('创建时间', U.fmtTime(staff.createdAt)));
      ab.appendChild(row('最近更新', U.fmtTime(staff.updatedAt)));
      acc.appendChild(ab);
      right.appendChild(acc);

      var rev = U.el('div', { class: 'card' });
      rev.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '审核信息' })]));
      var rb = U.el('div', { class: 'card-body tight' });
      rb.appendChild(row('档案状态', UI.staffStatus(staff.status).text));
      rb.appendChild(row('提交时间', U.fmtTime(staff.submittedAt || staff.createdAt)));
      rb.appendChild(row('审核人', staff.reviewedBy || '—'));
      rb.appendChild(row('审核时间', staff.reviewedAt ? U.fmtTime(staff.reviewedAt) : '—'));
      if (staff.rejectReason) rb.appendChild(row('驳回原因', staff.rejectReason, true));
      if (staff.resignDate) rb.appendChild(row('离职日期', U.fmtDate(staff.resignDate)));
      if (staff.resignReason) rb.appendChild(row('离职原因', staff.resignReason, true));
      if (staff.handover) rb.appendChild(row('交接说明', staff.handover, true));
      rev.appendChild(rb);
      right.appendChild(rev);

      var remarkCard = U.el('div', { class: 'card' });
      remarkCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '管理组备注' }),
        U.el('span', { class: 'small muted', text: '仅管理组可见' })
      ]));
      var rmb = U.el('div', { class: 'card-body' });
      var ta = U.el('textarea', { class: 'textarea', maxlength: '200', placeholder: '记录特殊情况，如岗位临时调整、证件待补（≤200 字）' });
      ta.value = staff.remark || '';
      rmb.appendChild(ta);
      rmb.appendChild(U.el('div', { class: 'flex-between mt-8' }, [
        U.el('span', { class: 'small muted', text: '修改后立即生效，并写入操作日志。' }),
        U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '保存备注',
          onclick: function () {
            api.saveRemark(staff.id, ta.value).then(function () {
              UI.toast('备注已保存', 'success');
            }).catch(function (e) { UI.toast(e.message, 'error'); });
          }
        })
      ]));
      remarkCard.appendChild(rmb);
      right.appendChild(remarkCard);

      grid.appendChild(right);
      wrap.appendChild(grid);

      /* 底部操作 */
      var actions = U.el('div', { class: 'detail-actions' });
      if (staff.status === 'pending') {
        actions.appendChild(U.el('button', {
          class: 'btn btn-ghost', type: 'button', text: '驳回',
          onclick: openReject
        }));
        actions.appendChild(U.el('button', {
          class: 'btn btn-primary', type: 'button', text: '审核通过',
          onclick: openApprove
        }));
      } else if (staff.status === 'active') {
        actions.appendChild(U.el('button', {
          class: 'btn btn-ghost', type: 'button', text: '编辑档案',
          onclick: openEdit
        }));
        actions.appendChild(U.el('button', {
          class: 'btn btn-danger-ghost', type: 'button', text: '标记离职',
          onclick: openResign
        }));
      } else if (staff.status === 'resigned') {
        actions.appendChild(U.el('button', {
          class: 'btn btn-primary', type: 'button', text: '恢复在职',
          onclick: function () {
            UI.confirm({
              title: '恢复在职',
              message: '确认将 ' + staff.name + ' 恢复为在职状态？恢复后账号将重新启用，可继续查看薪资与排休。',
              confirmText: '恢复在职'
            }).then(function (yes) {
              if (!yes) return;
              api.reactivateStaff(staff.id).then(function () {
                UI.toast('已恢复在职', 'success');
                setTimeout(function () { location.reload(); }, 500);
              }).catch(function (e) { UI.toast(e.message, 'error'); });
            });
          }
        }));
      } else if (staff.status === 'rejected') {
        actions.appendChild(U.el('button', {
          class: 'btn btn-primary', type: 'button', text: '重新审核（通过）',
          onclick: openApprove
        }));
      }
      if (Auth.isSuper() && (staff.status === 'pending' || staff.status === 'rejected')) {
        actions.appendChild(U.el('button', {
          class: 'btn btn-ghost', type: 'button', text: '编辑全部信息',
          onclick: openSuperEdit
        }));
      }
      if (actions.children.length) {
        wrap.appendChild(U.el('div', { class: 'detail-action-wrap' }, [actions]));
      }
      return wrap;
    }

    function paintId(container) {
      container.innerHTML = '';
      container.appendChild(U.el('span', { class: 'mono', text: revealed ? staff.idCard : U.maskId(staff.idCard) }));
      container.appendChild(U.el('button', {
        class: 'btn-text', type: 'button', text: revealed ? '隐藏' : '查看完整',
        onclick: function () {
          if (revealed) { revealed = false; paintId(container); return; }
          UI.confirm({
            title: '查看完整身份证号',
            message: '本次查看将被记录（操作人、时间、对象、动作），并可在系统设置的操作日志中追溯。确认查看？',
            confirmText: '确认查看'
          }).then(function (yes) {
            if (!yes) return;
            revealed = true;
            paintId(container);
            Store.log('查看完整身份证号', staff.name, '档案详情页，二次确认后显示');
          });
        }
      }));
    }

    function confirmView(label, cb) {
      UI.confirm({
        title: '查看证件原图',
        message: '即将查看 ' + staff.name + ' 的' + label + '原图，本次查看将被记录（操作人、时间、对象、动作）。',
        confirmText: '确认查看'
      }).then(function (yes) { if (yes) cb(); });
    }

    function correctionValue(c) {
      var fileLabels = { healthCert: '健康证', idFront: '身份证正面', idBack: '身份证反面', photo: '白底一寸照' };
      if (fileLabels[c.field]) {
        var a = U.el('a', { class: 'link', href: 'javascript:void(0)', text: '已上传新的' + fileLabels[c.field] + '（点击查看）' });
        a.addEventListener('click', function () {
          api.getFileUrl(c.newValue).then(function (url) {
            if (!url) { UI.toast('文件已失效，请驳回后让员工重新上传', 'error'); return; }
            if (c.field === 'healthCert') UI.pdfViewer({ url: url, title: '健康证 · ' + staff.name });
            else UI.imageViewer({ url: url, title: fileLabels[c.field] + ' · ' + staff.name });
          });
        });
        return U.el('div', { class: 'small', style: { marginTop: '4px' } }, [U.el('span', { text: '更正为：' }), a]);
      }
      return U.el('div', { class: 'small', style: { marginTop: '4px' }, text: '更正为：' + c.newValue });
    }

    function row(label, value, block) {
      var v = U.el('span', { class: 'info-value' });
      if (value instanceof Node) v.appendChild(value);
      else v.textContent = value === '' || value === null || value === undefined ? '—' : String(value);
      return U.el('div', { class: 'info-row' + (block ? ' block' : '') }, [
        U.el('span', { class: 'info-label', text: label }), v
      ]);
    }

    /* ---------- 审核通过 ---------- */
    function openApprove() {
      var positions = V.POSITIONS.map(function (p) {
        return '<option value="' + p + '"' + (p === staff.position ? ' selected' : '') + '>' + p + '</option>';
      }).join('');
      var types = V.EMPLOYMENT_TYPES.map(function (t) {
        return '<option value="' + t + '"' + (t === staff.employmentType ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-info">通过后档案状态变为「在职」，员工端立即解锁薪资、量化分与排休功能。</div>' +
        '<div class="field" data-field="empNo"><label class="label">门店工号 <i class="req">*</i></label>' +
        '<input class="input mono" name="empNo" value="' + Store.nextEmpNo() + '"><div class="hint">建议规则 TA0051-序号，全店唯一。</div><div class="error-text"></div></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">岗位</label><select class="select" name="position">' + positions + '</select></div>' +
        '<div class="field"><label class="label">用工性质</label><select class="select" name="employmentType">' + types + '</select></div>' +
        '</div>' +
        '<div class="field" data-field="hireDate"><label class="label">入职日期 <i class="req">*</i></label>' +
        '<input class="input" type="date" name="hireDate" value="' + staff.hireDate + '" max="' + U.addDays(U.today(), 30) + '"><div class="error-text"></div></div>';
      UI.openModal({
        title: '审核通过 · ' + staff.name,
        subtitle: '补充入职信息后确认',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认通过', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var payload = {
                empNo: String(fd.get('empNo') || '').trim(),
                position: fd.get('position'), employmentType: fd.get('employmentType'),
                hireDate: fd.get('hireDate')
              };
              if (!payload.empNo) { UI.toast('请填写门店工号', 'error'); return false; }
              var hm = V.hireDate(payload.hireDate);
              if (hm) { V.applyFieldError(form, 'hireDate', hm); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewStaff({ staffId: staff.id, action: 'approve', payload: payload }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('审核通过，员工端已解锁', 'success');
                setTimeout(function () { location.reload(); }, 600);
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

    /* ---------- 驳回 ---------- */
    function openReject() {
      var quick = ['证件照片模糊', '信息与证件不一致', '健康证已过期', '缺少必要附件'];
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field" data-field="reason"><label class="label">驳回原因 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="reason" maxlength="100" placeholder="请填写不少于 5 个字的驳回原因，员工端将原文展示"></textarea>' +
        '<div class="hint">常用原因可点选后补充。</div><div class="error-text"></div></div>' +
        '<div class="radio-group">' + quick.map(function (q, i) {
          return '<button type="button" class="radio-chip" data-quick="' + q + '">' + q + '</button>';
        }).join('') + '</div>';
      var ta = form.querySelector('[name="reason"]');
      U.$$('[data-quick]', form).forEach(function (b) {
        b.addEventListener('click', function () {
          ta.value = this.dataset.quick;
          U.$$('[data-quick]', form).forEach(function (x) { x.classList.remove('checked'); });
          this.classList.add('checked');
        });
      });
      UI.openModal({
        title: '驳回资料 · ' + staff.name,
        subtitle: '驳回后员工可修改并重新提交',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认驳回', class: 'btn-danger',
            onClick: function (btn, close) {
              var msg = V.rejectReason(ta.value);
              if (msg) { V.applyFieldError(form, 'reason', msg); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewStaff({ staffId: staff.id, action: 'reject', payload: { reason: ta.value.trim() } }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已驳回，员工端显示原因', 'success');
                setTimeout(function () { location.reload(); }, 600);
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

    /* ---------- 编辑档案 ---------- */
    function openEdit() {
      if (Auth.isSuper()) { openSuperEdit(); return; }
      var positions = V.POSITIONS.map(function (p) {
        return '<option value="' + p + '"' + (p === staff.position ? ' selected' : '') + '>' + p + '</option>';
      }).join('');
      var types = V.EMPLOYMENT_TYPES.map(function (t) {
        return '<option value="' + t + '"' + (t === staff.employmentType ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">岗位</label><select class="select" name="position">' + positions + '</select></div>' +
        '<div class="field"><label class="label">用工性质</label><select class="select" name="employmentType">' + types + '</select></div>' +
        '</div>' +
        '<div class="field"><label class="label">入职日期</label><input class="input" type="date" name="hireDate" value="' + staff.hireDate + '"></div>' +
        '<div class="field"><label class="label">紧急联系人</label><input class="input" name="emergency" value="' + U.esc(staff.emergency || '') + '" placeholder="姓名 手机号"></div>' +
        '<div class="field"><label class="label">备注</label><textarea class="textarea" name="remark" maxlength="200">' + U.esc(staff.remark || '') + '</textarea></div>' +
        '<div class="hint">姓名、身份证号、手机号如需变更，请通过员工提交的更正申请处理，确保留痕。</div>';
      UI.openModal({
        title: '编辑档案 · ' + staff.name,
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              UI.btnLoading(btn, true, '保存中…');
              api.updateStaff(staff.id, {
                position: fd.get('position'), employmentType: fd.get('employmentType'),
                hireDate: fd.get('hireDate'), emergency: fd.get('emergency'), remark: fd.get('remark')
              }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('档案已更新', 'success');
                setTimeout(function () { location.reload(); }, 500);
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

    /* ---------- 超级管理员编辑全部档案与证件 ---------- */
    function openSuperEdit() {
      var uploaded = {};
      var positions = V.POSITIONS.map(function (p) {
        return '<option value="' + p + '"' + (p === staff.position ? ' selected' : '') + '>' + p + '</option>';
      }).join('');
      var types = V.EMPLOYMENT_TYPES.map(function (t) {
        return '<option value="' + t + '"' + (t === staff.employmentType ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-info">超级管理员可修改全部信息与证件。姓名、手机号、身份证号变更会同步登录账号，并写入操作日志。</div>' +
        '<div class="form-grid two">' +
        '<div class="field" data-field="name"><label class="label">姓名 <i class="req">*</i></label><input class="input" name="name" value="' + U.esc(staff.name) + '"><div class="error-text"></div></div>' +
        '<div class="field" data-field="phone"><label class="label">手机号 <i class="req">*</i></label><input class="input mono" name="phone" value="' + U.esc(staff.phone || '') + '"><div class="error-text"></div></div>' +
        '</div>' +
        '<div class="field" data-field="idCard"><label class="label">身份证号</label><input class="input mono" name="idCard" value="' + U.esc(staff.idCard || '') + '"><div class="hint">修改后同步更新出生日期与性别。</div><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">现居住地址</label><input class="input" name="address" value="' + U.esc(staff.address || '') + '"></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">岗位</label><select class="select" name="position">' + positions + '</select></div>' +
        '<div class="field"><label class="label">用工性质</label><select class="select" name="employmentType">' + types + '</select></div>' +
        '</div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">入职日期</label><input class="input" type="date" name="hireDate" value="' + (staff.hireDate || '') + '"></div>' +
        '<div class="field"><label class="label">紧急联系人</label><input class="input" name="emergency" value="' + U.esc(staff.emergency || '') + '" placeholder="姓名 手机号"></div>' +
        '</div>' +
        '<div class="field"><label class="label">飞书 ID</label><input class="input mono" name="feishuId" value="' + U.esc(staff.feishuId || '') + '" placeholder="open_id / user_id，选填"><div class="hint">open_id / user_id，选填；留空时可改用飞书工号、手机号或姓名匹配。</div></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">门店工号</label><input class="input mono" name="empNo" value="' + U.esc(staff.empNo || '') + '" placeholder="门店内部工号"><div class="hint">列表与员工端优先展示飞书工号，飞书工号为空时回退显示此工号。</div></div>' +
        '<div class="field"><label class="label">飞书工号</label><input class="input mono" name="feishuEmpNo" value="' + U.esc(staff.feishuEmpNo || '') + '" placeholder="飞书侧唯一，选填"><div class="hint">与门店工号分开保存；考勤/薪资导入按飞书工号 → 门店工号 → 姓名匹配。</div></div>' +
        '</div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">身份证有效期至</label><input class="input" type="date" name="idCardExpiry" value="' + (staff.idCardExpiry || '') + '"></div>' +
        '<div class="field"><label class="label">健康证有效期至</label><input class="input" type="date" name="healthCertExpiry" value="' + (staff.healthCertExpiry || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label class="label">备注</label><textarea class="textarea" name="remark" maxlength="200">' + U.esc(staff.remark || '') + '</textarea></div>' +
        '<div class="hint">证件照片：选择新文件后需点击「保存」，保存完成即生效。</div>';

      [
        { key: 'photo', label: '白底一寸照', accept: 'image/*' },
        { key: 'idFront', label: '身份证正面', accept: 'image/*' },
        { key: 'idBack', label: '身份证反面', accept: 'image/*' },
        { key: 'healthCert', label: '健康证（PDF）', accept: 'application/pdf' }
      ].forEach(function (cfg) {
        var tip = U.el('span', {
          class: 'small muted',
          text: (staff.files && staff.files[cfg.key]) ? '已上传，可重新选择' : '未上传'
        });
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
        title: '编辑档案 · ' + staff.name,
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
                empNo: String(fd.get('empNo') || '').trim(),
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
              api.updateStaff(staff.id, payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('档案已更新并记录操作日志', 'success');
                setTimeout(function () { location.reload(); }, 500);
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

    /* ---------- 标记离职 ---------- */
    function openResign() {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-warn">标记离职后，档案保留，账号停用；员工端登录将提示“账号已停用”，薪资与量化分入口关闭。</div>' +
        '<div class="field" data-field="resignDate"><label class="label">离职日期 <i class="req">*</i></label>' +
        '<input class="input" type="date" name="resignDate" value="' + U.today() + '"><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">离职原因</label><textarea class="textarea" name="reason" maxlength="100" placeholder="如：个人发展、家庭原因（选填）"></textarea></div>' +
        '<div class="field"><label class="label">交接说明</label><textarea class="textarea" name="handover" maxlength="100" placeholder="如：收银台钥匙、备用金已交接（选填）"></textarea></div>';
      UI.openModal({
        title: '标记离职 · ' + staff.name,
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认离职', class: 'btn-danger',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              if (!fd.get('resignDate')) { UI.toast('请选择离职日期', 'error'); return false; }
              UI.btnLoading(btn, true, '处理中…');
              api.resignStaff({
                staffId: staff.id, resignDate: fd.get('resignDate'),
                reason: fd.get('reason'), handover: fd.get('handover')
              }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已标记离职，账号已停用', 'success');
                setTimeout(function () { location.reload(); }, 600);
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
