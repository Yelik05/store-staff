/* P13 员工端 — 排休申请（全职）/ 排班申请（兼职·小时工） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['leave'] = function (ctx) {
    var ses = Auth.current();
    var me = Store.getStaff(ses.staffId) || {};
    var partTime = !!me.employmentType && me.employmentType !== '全职';
    var isSuper = Auth.isSuper && Auth.isSuper();
    var state = { month: U.curMonth(), data: null };
    var main = Layout.staffShell({
      title: isSuper ? '排班审批' : (partTime ? '排班申请' : '排休申请'),
      active: 'leave'
    }, UI.skeleton(2));

    /* ================= 超管：排班审批（排休 + 排班按日期合并） ================= */
    /* 超管排班审批默认只看今天，可切换日期或点「全部日期」 */
    var quickState = { date: U.today(), onlyPending: false, res: null };

    if (isSuper) renderApprovalPage();
    else if (partTime) loadShifts(state.month);
    else loadLeaves(state.month);

    function renderApprovalPage() {
      main.innerHTML = '';
      var wrap = U.el('div');
      wrap.appendChild(quickSection());
      main.appendChild(wrap);
    }

    function quickSection() {
      if (!Auth.isSuper || !Auth.isSuper()) return null;

      var card = U.el('div', { class: 'card' });
      var summaryEl = U.el('span', { class: 'small muted', text: '排休 / 排班统一处理' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '排班审批' }),
        summaryEl
      ]));
      var body = U.el('div', { class: 'card-body' });

      var listPanel = U.el('div', { style: { marginTop: '10px' } });
      var actions = U.el('div', { class: 'flex gap-8 wrap', style: { alignItems: 'center' } });

      var filterBtn = U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        text: quickState.onlyPending ? '显示全部' : '只看待审批'
      });
      var dateInput = U.el('input', { class: 'input', type: 'date', value: quickState.date, style: { maxWidth: '160px' } });
      var allBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '全部日期' });
      var refreshBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '刷新' });

      actions.appendChild(filterBtn);
      actions.appendChild(dateInput);
      actions.appendChild(allBtn);
      actions.appendChild(refreshBtn);
      body.appendChild(actions);
      body.appendChild(U.el('div', { class: 'hint', text: '排休与排班按日期合并展示，日期从近到远；同一天先排休、后排班，排班按开始时间排序。' }));
      body.appendChild(listPanel);
      card.appendChild(body);

      filterBtn.addEventListener('click', function () {
        quickState.onlyPending = !quickState.onlyPending;
        filterBtn.textContent = quickState.onlyPending ? '显示全部' : '只看待审批';
        paintDays(quickState.res || { days: [] });
      });
      dateInput.addEventListener('change', function () {
        quickState.date = dateInput.value || '';
        loadQuick();
      });
      allBtn.addEventListener('click', function () {
        quickState.date = '';
        dateInput.value = '';
        loadQuick();
      });
      refreshBtn.addEventListener('click', loadQuick);

      function loadQuick() {
        api.leaveQuick({ date: quickState.date }).then(function (res) {
          quickState.res = res;
          paintDays(res);
        }).catch(function (e) {
          listPanel.innerHTML = '';
          listPanel.appendChild(U.el('div', { class: 'alert alert-danger', text: '排班审批加载失败：' + e.message }));
        });
      }

      function shiftSummary(slots) {
        var arr = (slots || []).map(function (s) {
          return String(s.date || '').slice(5) + ' ' + s.start + '—' + s.end;
        });
        if (!arr.length) return '未填写时段';
        if (arr.length <= 2) return arr.join('；');
        return arr.slice(0, 2).join('；') + ' 等 ' + arr.length + ' 个时段';
      }

      function mergedRow(r) {
        var isShift = r.kind === 'shift';
        var status = r.status === 'pending'
          ? { text: '待审批', cls: 'warn' }
          : { text: '已通过', cls: 'success' };
        var timeText = isShift
          ? ((r.slots || []).map(function (s) { return s.start + '—' + s.end; }).join('、') || '未填写时段')
          : r.type;
        var item = U.el('div', { class: 'leave-item' });
        item.appendChild(U.el('div', { class: 'leave-item-top' }, [
          U.el('div', {}, [
            U.el('div', { class: 'flex gap-8 wrap', style: { alignItems: 'center' } }, [
              UI.badge(isShift ? '排班' : '排休', isShift ? 'info' : 'brand'),
              U.el('span', { class: 'leave-date', text: (r.staffDisplayName || r.staffName) + ' · ' + timeText })
            ]),
            U.el('div', {
              class: 'leave-sub',
              text: (r.position || '') + (U.empNoOf(r) ? ' · ' + U.empNoOf(r) : '') +
                (r.createdAt ? ' · 提交 ' + U.fmtTime(r.createdAt) : '') +
                (r.status === 'approved' && r.cancelRequested ? ' · 取消申请中' : '')
            })
          ]),
          UI.badge(status.text, status.cls)
        ]));
        var note = isShift ? r.note : r.reason;
        if (note) item.appendChild(U.el('div', { class: 'leave-sub', text: '说明：' + note }));
        if (r.status === 'pending') {
          var acts = U.el('div', { class: 'leave-actions' });
          acts.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '驳回',
            onclick: function () { quickReject(r); }
          }));
          acts.appendChild(U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '通过',
            onclick: function () { quickApprove(r); }
          }));
          item.appendChild(acts);
        }
        return item;
      }

      function paintDays(res) {
        listPanel.innerHTML = '';
        var days = res.days || [];
        var onlyPending = quickState.onlyPending;
        var shown = 0;
        summaryEl.textContent = '待审批 ' + (res.pendingTotal || 0) + ' 条';
        days.forEach(function (day) {
          var items = (day.items || []).filter(function (it) {
            return !onlyPending || it.status === 'pending';
          });
          if (!items.length) return;
          shown++;
          listPanel.appendChild(U.el('div', { class: 'flex-between', style: { margin: '12px 2px 6px' } }, [
            U.el('strong', { text: day.date }),
            U.el('span', {
              class: 'small muted',
              text: onlyPending
                ? '待审批 ' + items.length + ' 条'
                : '休息 ' + day.leaveCount + ' 人 · 上班 ' + day.shiftPeople + ' 人 · 待审批 ' + day.pendingCount + ' 条'
            })
          ]));
          items.forEach(function (it) { listPanel.appendChild(mergedRow(it)); });
        });
        if (!shown) {
          listPanel.appendChild(U.el('div', { class: 'small muted', style: { padding: '8px 2px' }, text: onlyPending ? '暂无待审批的排休或排班' : '所选范围内暂无排休或排班记录' }));
        }
      }

      function quickApprove(r) {
        var isShift = r.kind === 'shift';
        var label = isShift ? '排班' : '排休';
        var detail = isShift ? shiftSummary(r.slots) : (r.date + ' 的' + r.type);
        UI.confirm({
          title: '通过' + label + ' · ' + r.staffName,
          message: '确认通过 ' + r.staffName + ' ' + detail + '？' +
            (isShift ? '通过后按原时间段安排班次。' : '通过后已休天数 +1。'),
          confirmText: '确认通过'
        }).then(function (yes) {
          if (!yes) return;
          var req = isShift
            ? api.reviewShift({ id: r.id, action: 'approve' })
            : api.reviewLeave({ id: r.id, action: 'approve' });
          req.then(function () {
            UI.toast('已通过', 'success');
            loadQuick();
          }).catch(function (e) {
            if (!isShift && e && e.code === 'CONFLICT') quickForce(r, e.conflictName || '');
            else UI.toast(e.message, 'error');
          });
        });
      }

      function quickForce(r, conflictName) {
        var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
        form.innerHTML =
          '<div class="alert alert-warn">该日 ' + (r.position || '同岗位') + ' 已有' + (conflictName || '同事') + '排休，同日仅可 1 人休息。</div>' +
          '<div class="field" data-field="forceReason"><label class="label">特批说明 <i class="req">*</i></label>' +
          '<textarea class="textarea" name="reason" placeholder="不少于 5 个字，如：已协调其他同事顶班"></textarea><div class="error-text"></div></div>';
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
                api.reviewLeave({ id: r.id, action: 'approve', force: true, reason: reason }).then(function () {
                  UI.btnLoading(btn, false);
                  close();
                  UI.toast('已特批通过', 'success');
                  loadQuick();
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

      function quickReject(r) {
        var isShift = r.kind === 'shift';
        var label = isShift ? '排班' : '排休';
        var quick = isShift
          ? ['该时段人手已满', '与其他班次安排冲突', '请调整可上班时段']
          : ['当日人手不足', '未按规定提前申请', '当月月休已用完'];
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
          title: '驳回' + label + ' · ' + r.staffName,
          body: form,
          footer: [
            { text: '取消', class: 'btn-ghost' },
            {
              text: '确认驳回', class: 'btn-danger',
              onClick: function (btn, close) {
                var reason = ta.value.trim();
                if (reason.length < 5) { V.applyFieldError(form, 'reason', '请填写不少于 5 个字的驳回原因'); return false; }
                UI.btnLoading(btn, true, '提交中…');
                var req = isShift
                  ? api.reviewShift({ id: r.id, action: 'reject', reason: reason })
                  : api.reviewLeave({ id: r.id, action: 'reject', reason: reason });
                req.then(function () {
                  UI.btnLoading(btn, false);
                  close();
                  UI.toast('已驳回', 'success');
                  loadQuick();
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

      loadQuick();
      return card;
    }

    /* ================= 全职：排休 ================= */
    function loadLeaves(month) {
      state.month = month;
      main.innerHTML = '';
      main.appendChild(UI.skeleton(2));
      api.getMyLeave(month).then(function (res) {
        state.data = res;
        main.innerHTML = '';
        main.appendChild(renderLeaves(res));
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { loadLeaves(month); } }));
      });
    }

    /* 员工端仅展示当月申请，不再提供历史月份切换 */
    function monthBar(onChange, btnText, onApply) {
      var bar = U.el('div', { class: 'month-bar' }, [
        U.el('div', { class: 'month-select' }, [
          U.el('span', { class: 'small muted', text: U.monthLabel(U.curMonth()) + ' · 仅显示当月申请' })
        ]),
        U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: btnText, onclick: onApply })
      ]);
      return bar;
    }

    function renderLeaves(d) {
      var wrap = U.el('div');
      var qs = quickSection();
      if (qs) wrap.appendChild(qs);
      wrap.appendChild(monthBar(loadLeaves, '申请排休', openLeaveApply));

      var pendingList = d.list.filter(function (l) { return l.status === 'pending'; });
      var card = U.el('div', { class: 'card' });
      var bt = d.byType || {};
      card.appendChild(U.el('div', { class: 'leave-hero' }, [
        U.el('div', { class: 'leave-remain' }, [
          U.el('div', { class: 'lr-num' }, [U.el('span', { text: String(d.remaining) }), U.el('small', { text: '天' })]),
          U.el('div', { class: 'lr-label', text: '本月剩余可休' }),
          U.el('div', { class: 'lr-label', text: '应休 ' + d.quota + ' 天 / 已休 ' + d.used + ' 天 / 审批中 ' + d.pending + ' 天' }),
          U.el('div', { class: 'lr-label', text: '事假 ' + (bt['事假'] || 0) + ' 天 · 病假 ' + (bt['病假'] || 0) + ' 天（均计入已休）' })
        ]),
        U.el('div', { style: { textAlign: 'center' } }, [
          (function () {
            var span = U.el('span', { html: UI.ring(d.quota ? Math.min(100, d.used / d.quota * 100) : 0, 82) });
            var label = U.el('div', { class: 'small muted', style: { marginTop: '-52px', marginBottom: '30px' }, text: '已休 ' + d.used + '/' + d.quota });
            return U.el('div', {}, [span, label]);
          })()
        ])
      ]));
      card.appendChild(U.el('div', { class: 'leave-rule', text: '同一岗位每日仅 1 人可休息；事假、病假均占用本月月休额度，扣薪以薪资明细中的扣款项为准。' }));
      if (pendingList.length) {
        card.appendChild(U.el('div', { class: 'card-foot' }, [
          U.el('div', { class: 'small', text: '待审批：' + pendingList.map(function (l) { return l.date.slice(5) + '（' + l.type + '）'; }).join('、') + '（等待审批后可在此撤回）' })
        ]));
      }
      wrap.appendChild(card);

      var rec = U.el('div', { class: 'card' });
      rec.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '我的申请记录' }),
        U.el('span', { class: 'small muted', text: U.monthLabel(state.month) })
      ]));
      var list = d.list.filter(function (l) { return l.status !== 'cancelled'; })
        .sort(function (a, b) { return b.date.localeCompare(a.date); });
      if (!list.length) {
        rec.appendChild(U.el('div', { class: 'card-body' }, [
          UI.emptyState({
            icon: 'calendar', title: '本月还没有排休记录',
            desc: '需要休息时点上方按钮申请。',
            actionText: '申请排休',
            onAction: openLeaveApply
          })
        ]));
      } else {
        list.forEach(function (l) {
          var st = UI.leaveStatus(l);
          var item = U.el('div', { class: 'leave-item' });
          item.appendChild(U.el('div', { class: 'leave-item-top' }, [
            U.el('div', {}, [
              U.el('div', { class: 'leave-date', text: l.date + ' · ' + l.type + (l.manual ? '（管理组代录）' : '') }),
              U.el('div', { class: 'leave-sub' }, [
                U.el('span', { text: '提交 ' + U.fmtTime(l.createdAt) }),
                l.reviewedBy ? U.el('span', { text: l.reviewedBy + ' 审批' }) : null
              ])
            ]),
            UI.badge(st.text, st.cls)
          ]));
          if (l.reason) item.appendChild(U.el('div', { class: 'leave-sub', text: '说明：' + l.reason }));
          if (l.rejectReason) item.appendChild(U.el('div', { class: 'leave-reason', text: '驳回原因：' + l.rejectReason }));
          var actions = U.el('div', { class: 'leave-actions' });
          if (l.status === 'pending') {
            actions.appendChild(U.el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', text: '撤回申请',
              onclick: function () {
                UI.confirm({ title: '撤回申请', message: '确认撤回 ' + l.date + ' 的' + l.type + '申请？撤回后不计入已休天数。', confirmText: '撤回' })
                  .then(function (yes) {
                    if (!yes) return;
                    api.cancelLeave({ id: l.id, action: 'withdraw' }).then(function () {
                      UI.toast('已撤回', 'success');
                      loadLeaves(state.month);
                    }).catch(function (e) { UI.toast(e.message, 'error'); });
                  });
              }
            }));
          }
          if (l.status === 'approved' && !l.cancelRequested) {
            actions.appendChild(U.el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', text: '申请取消',
              onclick: function () {
                UI.confirm({ title: '申请取消排休', message: '取消已通过的排休需店长同意，确认提交取消申请？', confirmText: '提交申请' })
                  .then(function (yes) {
                    if (!yes) return;
                    api.cancelLeave({ id: l.id, action: 'cancel' }).then(function () {
                      UI.toast('取消申请已提交，等待店长确认', 'success');
                      loadLeaves(state.month);
                    }).catch(function (e) { UI.toast(e.message, 'error'); });
                  });
              }
            }));
          }
          if (l.status === 'rejected') {
            actions.appendChild(U.el('button', {
              class: 'btn btn-primary btn-sm', type: 'button', text: '重新申请',
              onclick: openLeaveApply
            }));
          }
          if (actions.children.length) item.appendChild(actions);
          rec.appendChild(item);
        });
      }
      wrap.appendChild(rec);
      wrap.appendChild(U.el('p', {
        class: 'text-center small muted',
        text: (Auth.isSuper && Auth.isSuper())
          ? '下方为你本人的排休记录；其他员工的待审批与当日排休/排班请使用上方「排班审批」。'
          : '页面仅显示你本人的排休记录，不展示其他员工的排休情况。'
      }));
      return wrap;
    }

    function openLeaveApply() {
      var d = state.data || { quota: 0, used: 0, pending: 0 };
      var maxDate = U.monthLastDay(U.curMonth());
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-info">本月应休 ' + d.quota + ' 天，已休 ' + d.used + ' 天，审批中 ' + d.pending + ' 天。须选择当月日期，今天及以后均可提交。</div>' +
        '<div class="field" data-field="date"><label class="label">休息日期 <i class="req">*</i></label>' +
        '<input class="input" type="date" name="date" min="' + U.today() + '" max="' + maxDate + '">' +
        '<div class="hint">可选择今天及以后的当月日期。</div>' +
        '<div class="alert alert-danger" data-day-stats style="display:none;padding:8px 10px;margin-top:6px"></div><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">类型</label><select class="select" name="type"><option>事假</option><option>病假</option></select><div class="hint">事假、病假均占用本月月休额度；扣薪以薪资明细中的「事假/病假扣款」为准。</div></div>' +
        '<div class="field"><label class="label">申请说明</label><textarea class="textarea" name="reason" maxlength="50" placeholder="选填，供店长判断当日人手（≤50 字）"></textarea></div>';

      var dateInput = form.querySelector('input[name="date"]');
      var statsEl = form.querySelector('[data-day-stats]');
      var statsSeq = 0;
      function refreshDayStats() {
        var date = dateInput.value;
        if (!date) {
          statsEl.style.display = 'none';
          statsEl.textContent = '';
          return;
        }
        var seq = ++statsSeq;
        statsEl.style.display = '';
        statsEl.textContent = '正在查询当天排休人数…';
        api.leaveDayStats(date).then(function (s) {
          if (seq !== statsSeq) return;
          statsEl.textContent = s.total
            ? '当天已有 ' + s.total + ' 人排休（已通过 ' + s.approved + '、审批中 ' + s.pending + '）'
            : '当天暂无排休申请';
        }).catch(function (e) {
          if (seq !== statsSeq) return;
          statsEl.textContent = '排休人数查询失败：' + e.message;
        });
      }
      dateInput.addEventListener('change', refreshDayStats);
      dateInput.addEventListener('input', refreshDayStats);
      if (dateInput.value) refreshDayStats();

      UI.openModal({
        title: '申请排休',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '提交申请', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var date = fd.get('date');
              var msg = V.leaveDate(date);
              if (msg) {
                V.applyFieldError(form, 'date', msg);
                return false;
              }
              var reason = String(fd.get('reason') || '').trim();
              var payload = { date: date, type: fd.get('type'), reason: reason };

              function doSubmit() {
                UI.btnLoading(btn, true, '提交中…');
                api.applyLeave(payload).then(function () {
                  UI.btnLoading(btn, false);
                  close();
                  UI.toast('已提交，等待审批', 'success');
                  loadLeaves(state.month);
                }).catch(function (e) {
                  UI.btnLoading(btn, false);
                  V.applyFieldError(form, 'date', e.message);
                  UI.toast(e.message, 'error');
                });
              }

              var projected = (d.used || 0) + (d.pending || 0) + 1;
              if (projected > 4) {
                UI.confirm({
                  title: '排休天数提醒',
                  message: '排休已超过4天，无全勤奖金',
                  detail: '是否仍要提交本次排休申请？提交后仍需店长按当日人手审批。',
                  confirmText: '仍要提交',
                  cancelText: '返回修改'
                }).then(function (yes) { if (yes) doSubmit(); });
                return false;
              }
              doSubmit();
              return false;
            }
          }
        ]
      });
    }

    /* ================= 兼职/小时工：排班 ================= */
    function loadShifts(month) {
      state.month = month;
      main.innerHTML = '';
      main.appendChild(UI.skeleton(2));
      api.getMyShifts(month).then(function (res) {
        state.data = res;
        main.innerHTML = '';
        main.appendChild(renderShifts(res));
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { loadShifts(month); } }));
      });
    }

    function slotText(s) {
      return s.date.slice(5) + ' ' + s.start + '—' + s.end;
    }

    function renderShifts(d) {
      var wrap = U.el('div');
      var qs = quickSection();
      if (qs) wrap.appendChild(qs);
      wrap.appendChild(monthBar(loadShifts, '申请排班', function () { openShiftApply(); }));

      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-body' }, [
        U.el('div', { class: 'stat-grid' }, [
          statBox('已通过时段', d.approvedSlots, 'success'),
          statBox('审批中时段', d.pendingSlots, d.pendingSlots ? 'warn' : 'muted')
        ])
      ]));
      card.appendChild(U.el('div', { class: 'leave-rule', text: '按你填写的可上班日期与时段提交，店长审批后安排班次；单个时段不得与其他待审批/已通过时段重叠。' }));
      wrap.appendChild(card);

      var rec = U.el('div', { class: 'card' });
      rec.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '我的排班申请' }),
        U.el('span', { class: 'small muted', text: U.monthLabel(state.month) })
      ]));
      var list = (d.list || []).filter(function (r) { return r.status !== 'cancelled'; });
      if (!list.length) {
        rec.appendChild(U.el('div', { class: 'card-body' }, [
          UI.emptyState({
            icon: 'calendar', title: '本月还没有排班申请',
            desc: '填写可上班的日期与时段，提交后等待店长审批。',
            actionText: '申请排班',
            onAction: function () { openShiftApply(); }
          })
        ]));
      } else {
        list.forEach(function (r) {
          var st = UI.leaveStatus(r);
          var waited = 0;
          if (r.status === 'pending') waited = Math.max(0, Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 3600000));
          var item = U.el('div', { class: 'leave-item' });
          var titleRow = U.el('div', { class: 'leave-item-top' }, [
            U.el('div', {}, [
              U.el('div', { class: 'leave-date', text: '排班 · ' + (r.slots || []).length + ' 个时段' }),
              U.el('div', { class: 'leave-sub' }, [
                U.el('span', { text: '提交 ' + U.fmtTime(r.createdAt) }),
                r.reviewedBy ? U.el('span', { text: r.reviewedBy + ' 审批' }) : null
              ])
            ]),
            UI.badge(st.text, st.cls)
          ]);
          item.appendChild(titleRow);
          (r.slots || []).slice().sort(function (a, b) { return a.date.localeCompare(b.date) || a.start.localeCompare(b.start); }).forEach(function (s) {
            item.appendChild(U.el('div', { class: 'leave-sub mono', text: slotText(s) }));
          });
          if (r.note) item.appendChild(U.el('div', { class: 'leave-sub', text: '说明：' + r.note }));
          if (r.status === 'pending' && waited > 24) {
            item.appendChild(U.el('div', { class: 'leave-reason', text: '已等待审批 ' + waited + ' 小时，可提醒店长处理' }));
          }
          if (r.rejectReason) item.appendChild(U.el('div', { class: 'leave-reason', text: '驳回原因：' + r.rejectReason }));
          var actions = U.el('div', { class: 'leave-actions' });
          if (r.status === 'pending') {
            actions.appendChild(U.el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', text: '撤回申请',
              onclick: function () {
                UI.confirm({ title: '撤回排班申请', message: '确认撤回本次排班申请？撤回后时段不再保留。', confirmText: '撤回' })
                  .then(function (yes) {
                    if (!yes) return;
                    api.cancelShift({ id: r.id, action: 'withdraw' }).then(function () {
                      UI.toast('已撤回', 'success');
                      loadShifts(state.month);
                    }).catch(function (e) { UI.toast(e.message, 'error'); });
                  });
              }
            }));
          }
          if (r.status === 'approved' && !r.cancelRequested) {
            actions.appendChild(U.el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', text: '申请取消',
              onclick: function () {
                UI.confirm({ title: '申请取消排班', message: '取消已通过的排班需店长同意，确认提交？', confirmText: '提交申请' })
                  .then(function (yes) {
                    if (!yes) return;
                    api.cancelShift({ id: r.id, action: 'cancel' }).then(function () {
                      UI.toast('取消申请已提交，等待店长确认', 'success');
                      loadShifts(state.month);
                    }).catch(function (e) { UI.toast(e.message, 'error'); });
                  });
              }
            }));
          }
          if (r.status === 'rejected') {
            actions.appendChild(U.el('button', {
              class: 'btn btn-primary btn-sm', type: 'button', text: '修改后重新提交',
              onclick: function () { openShiftApply(r); }
            }));
          }
          if (actions.children.length) item.appendChild(actions);
          rec.appendChild(item);
        });
      }
      wrap.appendChild(rec);
      wrap.appendChild(U.el('p', { class: 'text-center small muted', text: '页面仅显示你本人的排班记录，不展示其他兼职的排班情况。' }));
      return wrap;
    }

    function statBox(label, value, cls) {
      return U.el('div', { class: 'stat-card stat-' + cls, style: { padding: '14px' } }, [
        U.el('div', { class: 'stat-value', text: String(value) }),
        U.el('div', { class: 'stat-label', text: label })
      ]);
    }

    function openShiftApply(from) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      var minDate = U.today();
      var maxDate = U.monthLastDay(U.curMonth());
      form.innerHTML = '<div class="alert alert-info">填写可上班的日期与具体时段，可一次提交多个日期/时段；可选择今天及以后的当月日期。</div>';
      var rows = U.el('div', { class: 'form-stack', style: { gap: '8px' } });
      form.appendChild(rows);

      function addRow(slot) {
        slot = slot || {};
        var row = U.el('div', { class: 'flex-between', dataset: { slot: '1' }, style: { gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' } });
        var dInput = U.el('input', { class: 'input', type: 'date', min: minDate, max: maxDate, value: slot.date || '', style: { maxWidth: '150px' } });
        var sInput = U.el('input', { class: 'input', type: 'time', value: slot.start || '17:00', style: { maxWidth: '110px' } });
        var eInput = U.el('input', { class: 'input', type: 'time', value: slot.end || '22:00', style: { maxWidth: '110px' } });
        var del = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '删除' });
        del.addEventListener('click', function () {
          if (rows.children.length <= 1) { UI.toast('至少保留一行', 'info'); return; }
          row.remove();
        });
        row.appendChild(U.el('div', {}, [U.el('div', { class: 'small muted', text: '日期' }), dInput]));
        row.appendChild(U.el('div', {}, [U.el('div', { class: 'small muted', text: '开始' }), sInput]));
        row.appendChild(U.el('div', {}, [U.el('div', { class: 'small muted', text: '结束' }), eInput]));
        row.appendChild(del);
        row._read = function () { return { date: dInput.value, start: sInput.value, end: eInput.value }; };
        rows.appendChild(row);
      }

      if (from && from.slots && from.slots.length) from.slots.forEach(addRow);
      else addRow();

      form.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '+ 添加时段',
        onclick: function () { addRow(); }
      }));
      form.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '补充说明' }),
        U.el('textarea', { class: 'textarea', name: 'note', maxlength: '100', placeholder: '选填，例如：周末可全天到店、可临时顶班' })
      ]));

      UI.openModal({
        title: from ? '修改排班并重新提交' : '申请排班',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '提交申请', class: 'btn-primary',
            onClick: function (btn, close) {
              var slots = [];
              var byDate = {};
              var errMsg = '';
              Array.prototype.forEach.call(rows.children, function (row) {
                if (errMsg) return;
                var s = row._read();
                if (!s.date) { errMsg = '请选择上班日期'; return; }
                if (!s.start || !s.end) { errMsg = '请填写开始与结束时间'; return; }
                if (s.end <= s.start) { errMsg = s.date.slice(5) + ' 的结束时间需晚于开始时间'; return; }
                (byDate[s.date] || (byDate[s.date] = [])).forEach(function (iv) {
                  if (s.start < iv.end && s.end > iv.start) errMsg = s.date.slice(5) + ' 的时段存在重叠';
                });
                byDate[s.date] = byDate[s.date] || [];
                byDate[s.date].push({ start: s.start, end: s.end });
                slots.push(s);
              });
              if (!errMsg && !slots.length) errMsg = '请至少填写一个时段';
              if (errMsg) { UI.toast(errMsg, 'error'); return false; }
              var fd = new FormData(form);
              UI.btnLoading(btn, true, '提交中…');
              api.applyShift({ slots: slots, note: fd.get('note') || '' }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('排班申请已提交，等待审批', 'success');
                loadShifts(state.month);
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
