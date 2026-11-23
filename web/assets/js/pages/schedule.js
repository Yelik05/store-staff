/* schedule.js — 员工端「我的日程」 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['schedule'] = function () {
    var me = Auth.current() || {};
    var myId = me.staffId || '';
    var state = { scope: 'mine', data: null };
    var main = Layout.staffShell({ title: '我的日程', active: 'profile' }, UI.skeleton(2));

    load();

    function load() {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(2));
      api.scheduleList({ scope: state.scope }).then(function (res) {
        state.data = res;
        if (!res.canViewAll) state.scope = 'mine';
        paint();
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paint() {
      main.innerHTML = '';
      var d = state.data || { list: [], canViewAll: false };
      var list = d.list || [];
      var readOnly = state.scope === 'all';

      main.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', { class: 'flex-between', style: { gap: '8px', flexWrap: 'wrap' } }, [
          U.el('p', { style: { margin: 0 }, text: readOnly ? '本店全员日程，仅供查看。' : '安排你的个人日程，到提醒时间会通过个人提醒推送。' }),
          readOnly ? null : U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button',
            html: UI.icon('plus', 15) + '<span>新建日程</span>',
            onclick: function () { openForm(null); }
          })
        ])
      ]));

      if (d.canViewAll) {
        var tabs = U.el('div', { class: 'tabs', style: { marginBottom: '12px' } });
        [['mine', '我的日程'], ['all', '全店日程（只读）']].forEach(function (t) {
          tabs.appendChild(U.el('button', {
            class: 'tab' + (state.scope === t[0] ? ' active' : ''), type: 'button', text: t[1],
            onclick: function () {
              if (state.scope === t[0]) return;
              state.scope = t[0];
              load();
            }
          }));
        });
        main.appendChild(tabs);
      }

      if (!list.length) {
        main.appendChild(U.el('div', { class: 'card' }, [
          UI.emptyState({
            icon: 'calendar', title: readOnly ? '暂无日程' : '还没有日程',
            desc: readOnly ? '本店员工暂未创建日程。' : '点击「新建日程」安排会议、培训或提醒自己。',
            actionText: readOnly ? '' : '新建日程',
            onAction: readOnly ? null : function () { openForm(null); }
          })
        ]));
        return;
      }

      var today = U.today();
      var todayList = [], future = [], past = [];
      list.forEach(function (s) {
        if (s.date < today) past.push(s);
        else if (s.date === today) todayList.push(s);
        else future.push(s);
      });

      if (todayList.length) {
        main.appendChild(groupCard('今天 · ' + dateLabel(today), todayList, readOnly));
      }
      if (future.length) {
        var byDate = {};
        future.forEach(function (s) { (byDate[s.date] = byDate[s.date] || []).push(s); });
        Object.keys(byDate).sort().forEach(function (dt) {
          main.appendChild(groupCard('未来 · ' + dateLabel(dt), byDate[dt], readOnly));
        });
      }
      if (past.length) {
        var pastCard = U.el('div', { class: 'card', style: { marginTop: '12px', opacity: '0.78' } });
        pastCard.appendChild(U.el('div', { class: 'card-head' }, [
          U.el('div', { class: 'card-title', text: '已过期' }),
          U.el('span', { class: 'small muted', text: past.length + ' 条' })
        ]));
        past.forEach(function (s) { pastCard.appendChild(itemRow(s, readOnly, true)); });
        main.appendChild(pastCard);
      }

      if (!readOnly) {
        main.appendChild(U.el('p', { class: 'text-center small muted', style: { marginTop: '10px' }, text: '日程仅你自己可见；店长与店助可查看本店全员日程（只读）。' }));
      }
    }

    function groupCard(title, rows, readOnly) {
      var card = U.el('div', { class: 'card', style: { marginBottom: '10px' } });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: title }),
        U.el('span', { class: 'small muted', text: rows.length + ' 条' })
      ]));
      rows.forEach(function (s) { card.appendChild(itemRow(s, readOnly, false)); });
      return card;
    }

    function itemRow(s, readOnly, isPast) {
      var row = U.el('div', { style: { display: 'flex', gap: '12px', padding: '12px 14px', borderTop: '1px solid var(--line)' } });
      row.appendChild(U.el('div', { style: { minWidth: '58px', textAlign: 'center', color: isPast ? 'var(--ink-3)' : 'var(--brand, #E10600)' } }, [
        U.el('div', { style: { fontWeight: '700', fontSize: '16px' }, text: s.startTime || '--:--' }),
        U.el('div', { class: 'small muted', text: s.endTime || '' })
      ]));
      var info = U.el('div', { style: { flex: '1', minWidth: '0' } });
      var titleLine = U.el('div', { class: 'strong' }, [document.createTextNode(s.title)]);
      if (s.isInvited) {
        titleLine.appendChild(U.el('span', {
          class: 'badge', style: { marginLeft: '6px', fontSize: '11px', background: 'var(--warn-tint)', color: 'var(--warn)' },
          text: '邀请'
        }));
      }
      info.appendChild(titleLine);
      var meta = [];
      if (s.location) meta.push('地点：' + s.location);
      if (state.scope === 'all' || s.isInvited) meta.push('创建人：' + (s.creatorName || s.staffName || ''));
      if (meta.length) info.appendChild(U.el('div', { class: 'small muted', text: meta.join(' · ') }));
      if (s.remark) info.appendChild(U.el('div', { class: 'small', style: { marginTop: '4px', whiteSpace: 'pre-wrap' }, text: s.remark }));
      var extras = ['提醒：' + remindLabel(s.remindMinutes)];
      if ((s.participants || []).length) {
        extras.push('关联人：' + s.participants.map(function (p) { return p.name; }).join('、'));
      }
      info.appendChild(U.el('div', { class: 'small muted', style: { marginTop: '4px' }, text: extras.join(' · ') }));
      row.appendChild(info);

      var isOwner = s.isOwner === undefined ? (s.staffId === myId) : !!s.isOwner;
      if (!readOnly && isOwner) {
        var ops = U.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } });
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '编辑',
          onclick: function () { openForm(s); }
        }));
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '取消',
          onclick: function () { cancel(s); }
        }));
        ops.appendChild(U.el('button', {
          class: 'btn-text danger', type: 'button', text: '删除',
          onclick: function () { remove(s); }
        }));
        row.appendChild(ops);
      }
      return row;
    }

    function remindLabel(m) {
      m = Number(m);
      if (m === -1) return '到点提醒';
      if (!m) return '不提醒';
      return '提前 ' + m + ' 分钟';
    }

    function dateLabel(date) {
      var week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      var d = new Date(date + 'T00:00:00');
      if (isNaN(d.getTime())) return date;
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + week[d.getDay()];
    }

    function openForm(s) {
      var editing = !!s;
      var today = U.today();
      api.staffContacts().then(function (res) {
        buildForm(s, editing, today, (res.list || []).filter(function (x) {
          return x.id !== myId && x.status !== 'resigned';
        }));
      }).catch(function (e) {
        UI.toast('加载员工列表失败：' + e.message, 'error');
      });
    }

    function buildForm(s, editing, today, candidates) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      var selected = (s && s.participantIds ? s.participantIds : []).slice();
      var partHtml = candidates.length
        ? candidates.map(function (c) {
          return '<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13px;">' +
            '<input type="checkbox" name="participants" value="' + U.esc(c.id) + '"' + (selected.indexOf(c.id) >= 0 ? ' checked' : '') + '>' +
            '<span>' + U.esc(displayNameOf(c)) + '</span>' +
            '<span class="small muted">' + U.esc(c.position || '') + '</span></label>';
        }).join('')
        : '<div class="small muted" style="padding:6px 2px;">暂无可选的在职员工</div>';
      form.innerHTML =
        '<div class="field"><label class="label">标题 <i class="req">*</i></label>' +
        '<input class="input" name="title" maxlength="60" placeholder="如：门店周会、盘点、面试" value="' + (s ? U.esc(s.title) : '') + '"></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">日期 <i class="req">*</i></label>' +
        '<input class="input" type="date" name="date" min="' + today + '" value="' + (s ? s.date : today) + '"></div>' +
        '<div class="field"><label class="label">开始时间 <i class="req">*</i></label>' +
        '<input class="input" type="time" name="startTime" value="' + (s ? s.startTime : '09:00') + '"></div>' +
        '</div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">结束时间</label>' +
        '<input class="input" type="time" name="endTime" value="' + (s && s.endTime ? s.endTime : '') + '"></div>' +
        '<div class="field"><label class="label">提醒</label>' +
        '<select class="select" name="remindMinutes">' +
        remindOptions(s ? s.remindMinutes : 15) + '</select></div>' +
        '</div>' +
        '<div class="field"><label class="label">地点</label>' +
        '<input class="input" name="location" maxlength="60" placeholder="选填，如：门店二楼办公室" value="' + (s ? U.esc(s.location || '') : '') + '"></div>' +
        '<div class="field"><label class="label">关联人</label>' +
        '<div class="small muted" style="margin-bottom:6px;">可选本店在职员工，被关联人可查看日程并收到提醒（最多 20 人）。</div>' +
        '<div style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px 10px;">' + partHtml + '</div></div>' +
        '<div class="field"><label class="label">备注</label>' +
        '<textarea class="textarea" name="remark" maxlength="120" placeholder="选填，如：准备本周排班与损耗数据">' + (s ? U.esc(s.remark || '') : '') + '</textarea></div>';

      UI.openModal({
        title: editing ? '编辑日程' : '新建日程',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: editing ? '保存修改' : '创建日程', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var participantIds = [];
              form.querySelectorAll('input[name="participants"]:checked').forEach(function (x) {
                participantIds.push(x.value);
              });
              var payload = {
                id: s ? s.id : '',
                title: String(fd.get('title') || '').trim(),
                date: String(fd.get('date') || ''),
                startTime: String(fd.get('startTime') || ''),
                endTime: String(fd.get('endTime') || ''),
                location: String(fd.get('location') || '').trim(),
                remark: String(fd.get('remark') || '').trim(),
                remindMinutes: Number(fd.get('remindMinutes')),
                participantIds: participantIds
              };
              if (!payload.title) { UI.toast('请填写日程标题', 'error'); return false; }
              if (!payload.date) { UI.toast('请选择日期', 'error'); return false; }
              if (!payload.startTime) { UI.toast('请填写开始时间', 'error'); return false; }
              if (payload.endTime && payload.endTime <= payload.startTime) { UI.toast('结束时间必须晚于开始时间', 'error'); return false; }
              UI.btnLoading(btn, true, '保存中…');
              api.scheduleSave(payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast(editing ? '已保存' : '日程已创建', 'success');
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

    function displayNameOf(c) {
      return c.nickname || c.name || c.id;
    }

    function remindOptions(cur) {
      return [[0, '不提醒'], [5, '提前 5 分钟'], [15, '提前 15 分钟'], [30, '提前 30 分钟'], [60, '提前 60 分钟'], [-1, '到点提醒']]
        .map(function (o) {
          return '<option value="' + o[0] + '"' + (Number(cur) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('');
    }

    function remove(s) {
      UI.confirm({
        title: '删除日程', message: '确认删除「' + s.title + '」？删除后不可恢复。', confirmText: '删除'
      }).then(function (yes) {
        if (!yes) return;
        api.scheduleRemove(s.id).then(function () {
          UI.toast('已删除', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function cancel(s) {
      UI.confirm({
        title: '取消日程', message: '确认取消「' + s.title + '」？取消后不再提醒，记录仍保留。', confirmText: '取消日程'
      }).then(function (yes) {
        if (!yes) return;
        api.scheduleCancel(s.id).then(function () {
          UI.toast('已取消', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }
  };
})();
