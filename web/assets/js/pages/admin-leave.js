/* P14 管理端 — 排休审批 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-leave'] = function (ctx) {
    var state = {
      month: ctx.params.month || U.curMonth(),
      status: 'all',
      position: 'all',
      kind: 'all',
      date: ctx.params.date || '',
      rows: []
    };
    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '排休通过后计入当月已休天数；排班按日期与时段审批，员工端与台账同步更新；超过 24 小时未处理标红。' }),
      U.el('div', { class: 'page-actions' }, [
        U.el('a', { class: 'btn btn-ghost btn-sm', href: 'admin-attendance.html?month=' + state.month, text: '查看台账' })
      ])
    ]);
    content.appendChild(head);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var monthSel = U.el('select', { class: 'select' });
    U.monthRange(state.month, 8).reverse().forEach(function (m) {
      monthSel.appendChild(U.el('option', { value: m, text: U.monthLabel(m), selected: m === state.month }));
    });
    monthSel.addEventListener('change', function () { state.month = this.value; state.date = ''; dateInput.value = ''; load(); });
    toolbar.appendChild(U.el('div', { class: 'toolbar-group' }, [U.el('span', { class: 'small muted', text: '月份' }), monthSel]));

    var dateInput = U.el('input', { class: 'input', type: 'date', value: state.date });
    dateInput.style.minWidth = '140px';
    dateInput.style.maxWidth = '170px';
    dateInput.addEventListener('change', function () {
      state.date = this.value;
      if (state.date) {
        state.month = state.date.slice(0, 7);
        var exists = false;
        for (var i = 0; i < monthSel.options.length; i++) {
          if (monthSel.options[i].value === state.month) { exists = true; break; }
        }
        if (!exists) monthSel.appendChild(U.el('option', { value: state.month, text: U.monthLabel(state.month) }));
        monthSel.value = state.month;
      }
      load();
    });
    var clearDate = U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: '清除日期',
      onclick: function () { state.date = ''; dateInput.value = ''; load(); }
    });
    toolbar.appendChild(U.el('div', { class: 'toolbar-group' }, [U.el('span', { class: 'small muted', text: '具体日期' }), dateInput, clearDate]));

    var kindSel = U.el('select', { class: 'select' });
    [['all', '全部类别'], ['leave', '排休'], ['shift', '排班']].forEach(function (o) {
      kindSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    kindSel.addEventListener('change', function () { state.kind = this.value; load(); });
    toolbar.appendChild(kindSel);

    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部状态'], ['pending', '待审批'], ['approved', '已通过'], ['rejected', '已驳回'], ['cancelRequest', '取消待审批'], ['withdrawn', '已撤回'], ['cancelled', '已取消']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    statusSel.addEventListener('change', function () { state.status = this.value; load(); });
    toolbar.appendChild(statusSel);

    var pendingBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '仅看待审批' });
    pendingBtn.addEventListener('click', function () {
      state.status = state.status === 'pending' ? 'all' : 'pending';
      statusSel.value = state.status;
      pendingBtn.className = 'btn btn-sm ' + (state.status === 'pending' ? 'btn-primary' : 'btn-ghost');
      load();
    });
    toolbar.appendChild(pendingBtn);

    var posSel = U.el('select', { class: 'select' });
    posSel.appendChild(U.el('option', { value: 'all', text: '全部岗位' }));
    V.POSITIONS.forEach(function (p) { posSel.appendChild(U.el('option', { value: p, text: p })); });
    posSel.addEventListener('change', function () { state.position = this.value; load(); });
    toolbar.appendChild(posSel);

    toolbar.appendChild(U.el('span', { class: 'spacer' }));
    var pendingBadge = U.el('span', { class: 'badge badge-warn', text: '待审批 0' });
    toolbar.appendChild(pendingBadge);
    toolbar.appendChild(U.el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      html: UI.icon('plus', 15) + '<span>代员工补录</span>',
      onclick: openManual
    }));
    card.appendChild(toolbar);

    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);

    Layout.adminShell({ title: '考勤与排休审批', active: 'admin-leave' }, content);

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      var jobs = [];
      if (state.kind !== 'shift') jobs.push(api.listLeaves({ month: state.month, status: state.status, position: state.position, date: state.date }));
      if (state.kind !== 'leave') jobs.push(api.listShifts({ month: state.month, status: state.status, position: state.position, date: state.date }));
      Promise.all(jobs).then(function (res) {
        var rows = [];
        if (state.kind !== 'shift') {
          (res[0].list || []).forEach(function (r) { r.kind = 'leave'; rows.push(r); });
        }
        if (state.kind !== 'leave') {
          var shiftRes = res[state.kind === 'all' ? 1 : 0];
          (shiftRes.list || []).forEach(function (r) { rows.push(r); });
        }
        state.rows = rows;
        Promise.all([
          api.listLeaves({ month: state.month, status: 'pending', position: 'all' }).catch(function () { return { total: 0 }; }),
          api.listShifts({ month: state.month, status: 'pending', position: 'all' }).catch(function () { return { total: 0 }; })
        ]).then(function (cnt) {
          var total = (cnt[0].total || 0) + (cnt[1].total || 0);
          pendingBadge.textContent = '待审批 ' + total;
          pendingBadge.className = 'badge ' + (total ? 'badge-danger' : 'badge-muted');
        });
        paint();
      }).catch(function (e) {
        listBox.innerHTML = '';
        listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paint() {
      listBox.innerHTML = '';
      if (!state.rows.length) {
        listBox.appendChild(UI.emptyState({
          icon: 'calendar', title: '暂无申请记录',
          desc: '当前月份与筛选条件下没有排休或排班申请。员工提交后会出现在这里。'
        }));
        return;
      }

      /* 不做日期分组：按申请日期倒序（31→1），同日按提交时间倒序 */
      var sorted = state.rows.slice().sort(function (a, b) {
        var da = primaryDate(a);
        var db = primaryDate(b);
        if (da !== db) return db.localeCompare(da);
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

      var wrap = U.el('div', { class: 'approval-cards' });
      sorted.forEach(function (r) {
        var isShift = r.kind === 'shift';
        var st = UI.leaveStatus(r);
        var typeCls = isShift ? 'info' : (r.type === '病假' ? 'danger' : (r.type === '事假' ? 'warn' : (r.type === '调休' ? 'info' : 'muted')));

        var head = U.el('div', { class: 'approval-card-head' }, [
          U.el('div', { style: { minWidth: '0' } }, [
            U.el('div', { class: 'approval-card-title' }, [
              U.el('span', { text: r.staffDisplayName || r.staffName || '—' }),
              UI.badge(isShift ? '排班' : r.type, typeCls)
            ]),
            U.el('div', { class: 'approval-card-sub', text: [U.empNoOf(r), r.position, r.employmentType].filter(Boolean).join(' · ') })
          ]),
          UI.badge(st.text, st.cls)
        ]);

        var body = U.el('div', { class: 'approval-card-body' });
        if (isShift) {
          body.appendChild(cardLine('排班时段', (r.slots || []).map(function (s) {
            return s.date.slice(5) + ' ' + s.start + '—' + s.end;
          }).join('、') || '—'));
        } else {
          body.appendChild(cardLine('排休日期', r.date + (r.manual ? '（管理组代录）' : '')));
        }
        body.appendChild(cardLine('提交时间', U.fmtTime(r.createdAt)));
        var waited = (r.status === 'pending' || r.cancelRequested) ? r.waitedHours : null;
        if (waited !== null && waited !== undefined) {
          body.appendChild(lineWithNode('已等待', U.el('span', {
            class: waited > 24 ? 'strong' : '',
            style: waited > 24 ? { color: 'var(--danger)' } : {},
            text: waited + ' 小时' + (waited > 24 ? '（超时）' : '')
          })));
        }
        var desc = isShift ? (r.note || '') : (r.reason || '');
        if (desc) body.appendChild(cardLine('说明', desc));

        var foot = U.el('div', { class: 'approval-card-foot' });
        if (r.status === 'pending') {
          foot.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '驳回',
            onclick: function () { isShift ? rejectShift(r) : reject(r); }
          }));
          foot.appendChild(U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '通过',
            onclick: function () { isShift ? approveShift(r) : approve(r); }
          }));
        } else if (r.status === 'approved' && r.cancelRequested) {
          foot.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '拒绝取消',
            onclick: function () { isShift ? declineShiftCancel(r) : declineCancel(r); }
          }));
          foot.appendChild(U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '同意取消',
            onclick: function () { isShift ? shiftCancel(r) : cancelApprove(r); }
          }));
        }

        wrap.appendChild(U.el('div', { class: 'approval-card' }, [head, body, foot]));
      });

      listBox.appendChild(wrap);
      listBox.appendChild(U.el('p', { class: 'small muted', style: { padding: '6px 16px 14px' }, text: '按申请日期倒序（31 日至 1 日），同日按提交时间倒序，最新申请在前；不做日期分组。' }));
    }

    function cardLine(label, text) {
      return U.el('div', {}, [U.el('span', { class: 'k', text: label }), U.el('span', { text: text })]);
    }

    function lineWithNode(label, node) {
      return U.el('div', {}, [U.el('span', { class: 'k', text: label }), node]);
    }

    function primaryDate(r) {
      if (r.kind === 'shift') {
        var ds = (r.slots || []).map(function (s) { return s.date; }).sort();
        return ds.length ? ds[ds.length - 1] : (r.month || '');
      }
      return r.date || '';
    }

    function approve(r) {
      var stats = r.stats || {};
      var projected = (stats.used || 0) + 1;
      UI.confirm({
        title: '通过排休 · ' + r.staffName,
        message: '通过后 ' + r.staffName + ' ' + U.monthLabel(U.monthOf(r.date)) + ' 已休 ' + projected + '/' + (stats.quota || 0) + ' 天，确定通过 ' + r.date + ' 的' + r.type + '申请？',
        detail: projected > 4
          ? '该员工本月排休已超过4天，通过后将无全勤奖金；通过后员工端已休天数 +1、剩余天数 -1，考勤台账同步更新。'
          : '通过后员工端已休天数 +1、剩余天数 -1，考勤台账同步更新。',
        confirmText: '确认通过'
      }).then(function (yes) {
        if (!yes) return;
        api.reviewLeave({ id: r.id, action: 'approve' }).then(function (res) {
          UI.toast('已通过，该员工本月已休 ' + res.usedRestDays + '/' + res.quota + ' 天', 'success');
          load();
        }).catch(function (e) {
          if (e.code === 'CONFLICT') {
            forceApprove(r, e.conflictName || '');
          } else {
            UI.toast(e.message, 'error');
          }
        });
      });
    }

    function forceApprove(r, conflictName) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-warn">该日 ' + r.position + ' 已有' + (conflictName || '同事') + '排休，同日仅可 1 人休息。</div>' +
        '<div class="field" data-field="forceReason"><label class="label">特批说明 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="reason" placeholder="如：该员工家中有急事，已协调其他同事顶班"></textarea><div class="error-text"></div></div>';
      UI.openModal({
        title: '同日同岗冲突 · 特批通过',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '特批通过', class: 'btn-danger',
            onClick: function (btn, close) {
              var reason = form.querySelector('[name="reason"]').value.trim();
              if (reason.length < 5) { V.applyFieldError(form, 'forceReason', '请填写不少于 5 个字的特批说明'); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewLeave({ id: r.id, action: 'approve', force: true, reason: reason }).then(function (res) {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已特批通过，本月已休 ' + res.usedRestDays + '/' + res.quota + ' 天', 'success');
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

    function reject(r) {
      var quick = ['当日人手不足', '未按规定提前申请', '当月月休已用完'];
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field" data-field="reason"><label class="label">驳回原因 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="reason" placeholder="不少于 5 个字，员工端将原文展示"></textarea><div class="error-text"></div></div>' +
        '<div class="radio-group">' + quick.map(function (q) {
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
        title: '驳回排休 · ' + r.staffName,
        subtitle: r.date + ' · ' + r.type,
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认驳回', class: 'btn-danger',
            onClick: function (btn, close) {
              var msg = V.rejectReason(ta.value);
              if (msg) { V.applyFieldError(form, 'reason', '请填写驳回原因，便于员工调整申请'); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewLeave({ id: r.id, action: 'reject', reason: ta.value.trim() }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已驳回，员工端显示原因', 'success');
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

    function cancelApprove(r) {
      UI.confirm({
        title: '同意取消排休',
        message: '确认同意 ' + r.staffName + ' 取消 ' + r.date + ' 的排休？取消后已休天数将扣回。',
        confirmText: '同意取消'
      }).then(function (yes) {
        if (!yes) return;
        api.reviewLeave({ id: r.id, action: 'cancel' }).then(function (res) {
          UI.toast('已取消，该员工本月已休 ' + res.usedRestDays + ' 天', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function declineCancel(r) {
      UI.confirm({
        title: '不同意取消',
        message: '确认不同意 ' + r.staffName + ' 取消 ' + r.date + ' 的排休？该申请将保持已通过状态。',
        confirmText: '不同意'
      }).then(function (yes) {
        if (!yes) return;
        api.reviewLeave({ id: r.id, action: 'declineCancel' }).then(function () {
          UI.toast('已拒绝取消申请', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function shiftSummary(r) {
      return (r.slots || []).map(function (s) { return s.date.slice(5) + ' ' + s.start + '—' + s.end; }).join('、');
    }

    function approveShift(r) {
      UI.confirm({
        title: '通过排班申请',
        message: '确认通过 ' + r.staffName + ' 的 ' + (r.slots || []).length + ' 个时段？',
        detail: shiftSummary(r),
        confirmText: '通过'
      }).then(function (yes) {
        if (!yes) return;
        api.reviewShift({ id: r.id, action: 'approve' }).then(function () {
          UI.toast('已通过排班申请', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function rejectShift(r) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML = '<div class="field" data-field="reason"><label class="label">驳回原因 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="reason" maxlength="200" placeholder="不少于 5 个字，便于员工调整时段"></textarea><div class="error-text"></div></div>' +
        '<div class="small muted">申请时段：' + shiftSummary(r) + '</div>';
      UI.openModal({
        title: '驳回排班申请',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认驳回', class: 'btn-danger',
            onClick: function (btn, close) {
              var reason = String(new FormData(form).get('reason') || '').trim();
              if (reason.length < 5) { V.applyFieldError(form, 'reason', '请填写不少于 5 个字的驳回原因'); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewShift({ id: r.id, action: 'reject', reason: reason }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已驳回', 'success');
                load();
              }).catch(function (e) { UI.btnLoading(btn, false); UI.toast(e.message, 'error'); });
              return false;
            }
          }
        ]
      });
    }

    function shiftCancel(r) {
      UI.confirm({
        title: '同意取消排班',
        message: '确认同意 ' + r.staffName + ' 取消本次排班？',
        detail: shiftSummary(r),
        confirmText: '同意取消'
      }).then(function (yes) {
        if (!yes) return;
        api.reviewShift({ id: r.id, action: 'cancel' }).then(function () {
          UI.toast('已同意取消', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function declineShiftCancel(r) {
      UI.confirm({
        title: '不同意取消',
        message: '确认不同意 ' + r.staffName + ' 取消本次排班？该申请将保持已通过状态。',
        confirmText: '不同意'
      }).then(function (yes) {
        if (!yes) return;
        api.reviewShift({ id: r.id, action: 'declineCancel' }).then(function () {
          UI.toast('已拒绝取消申请', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function openManual() {      api.listStaff({ status: 'active', page: 1, pageSize: 999 }).then(function (res) {
        var options = res.list.map(function (s) {
          return '<option value="' + s.id + '">' + s.name + ' · ' + s.position + ' · ' + (U.empNoOf(s) || '—') + '</option>';
        }).join('');
        var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
        form.innerHTML =
          '<div class="alert alert-info">代录记录将标注“管理组代录”，直接生成已通过记录并计入当月已休天数。</div>' +
          '<div class="field" data-field="staffId"><label class="label">员工 <i class="req">*</i></label>' +
          '<select class="select" name="staffId"><option value="">请选择员工</option>' + options + '</select><div class="error-text"></div></div>' +
          '<div class="form-grid two">' +
          '<div class="field" data-field="date"><label class="label">休息日期 <i class="req">*</i></label>' +
          '<input class="input" type="date" name="date" max="' + U.monthLastDay(U.curMonth()) + '"><div class="error-text"></div></div>' +
          '<div class="field"><label class="label">休息类型</label><select class="select" name="type"><option>事假</option><option>病假</option></select></div>' +
          '</div>' +
          '<div class="field"><label class="label">补录说明</label><input class="input" name="reason" maxlength="50" placeholder="如：员工突发情况未能线上申请（选填）"></div>';
        UI.openModal({
          title: '代员工补录排休',
          body: form,
          footer: [
            { text: '取消', class: 'btn-ghost' },
            {
              text: '确认补录', class: 'btn-primary',
              onClick: function (btn, close) {
                var fd = new FormData(form);
                if (!fd.get('staffId')) { V.applyFieldError(form, 'staffId', '请选择员工'); return false; }
                if (!fd.get('date')) { V.applyFieldError(form, 'date', '请选择休息日期'); return false; }
                UI.btnLoading(btn, true, '提交中…');
                api.manualLeave({ staffId: fd.get('staffId'), date: fd.get('date'), type: fd.get('type'), reason: fd.get('reason') })
                  .then(function () {
                    UI.btnLoading(btn, false);
                    close();
                    UI.toast('已补录并计入已休天数', 'success');
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
      });
    }

    load();
  };
})();
