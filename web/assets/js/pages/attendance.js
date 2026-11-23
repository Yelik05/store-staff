/* P05A 员工端 — 我的考勤（日打卡明细，仅本人） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  window.Pages['attendance'] = function () {
    var state = { month: U.curMonth(), data: null };
    var main = Layout.staffShell({ title: '我的考勤', active: 'profile' }, UI.skeleton(3));
    load();

    function load() {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.myAttendance(state.month).then(function (res) {
        state.data = res;
        paint();
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function paint() {
      main.innerHTML = '';
      main.appendChild(monthBar());

      var res = state.data || { summary: { workDays: 0, totalHours: 0, abnormalCount: 0 }, days: [] };
      var sum = res.summary || {};

      var summary = U.el('div', { class: 'stat-grid', style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, [
        statCard('出勤天数', String(sum.workDays || 0)),
        statCard('总工时', U.round2(sum.totalHours || 0)),
        statCard('异常次数', String(sum.abnormalCount || 0))
      ]);
      main.appendChild(summary);

      if (!res.days || !res.days.length) {
        main.appendChild(U.el('div', { class: 'card', style: { marginTop: '10px' } }, [
          UI.emptyState({
            icon: 'clock', title: '本月暂无考勤记录',
            desc: '考勤日报导入后，这里会显示你的打卡与工时明细。'
          })
        ]));
        main.appendChild(U.el('p', { class: 'small muted text-center', style: { marginTop: '10px' }, text: '考勤以门店导入的考勤日报为准，如有疑问请联系店长核对。' }));
        return;
      }

      res.days.forEach(function (day) {
        main.appendChild(dayCard(day));
      });

      main.appendChild(U.el('p', {
        class: 'small muted text-center', style: { marginTop: '10px' },
        text: '仅展示打卡与工时字段；本门店考勤日报不含迟到/早退判定，异常以工时差异与确认状态标注。'
      }));
    }

    function statCard(label, value) {
      return U.el('div', { class: 'stat-card', style: { cursor: 'default' } }, [
        U.el('div', { class: 'stat-label', text: label }),
        U.el('div', { class: 'stat-value', text: String(value) })
      ]);
    }

    function monthBar() {
      var bar = U.el('div', { class: 'month-bar' });
      bar.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '上月',
        onclick: function () { state.month = U.prevMonth(state.month); load(); }
      }));
      bar.appendChild(U.el('div', { class: 'month-select' }, [
        U.el('strong', { text: U.monthLabel(state.month) })
      ]));
      var atCurrent = state.month >= U.curMonth();
      bar.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '下月',
        disabled: atCurrent,
        style: atCurrent ? { opacity: '.45', cursor: 'not-allowed' } : {},
        onclick: function () {
          if (state.month >= U.curMonth()) return;
          state.month = U.nextMonth(state.month);
          load();
        }
      }));
      return bar;
    }

    function dayCard(day) {
      var card = U.el('div', { class: 'card', style: { marginTop: '10px' } });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'card-title', text: dateLabel(day.date) + ' ' + weekdayOf(day.date) }),
          U.el('div', { class: 'small muted', text: '当日合计 ' + U.round2(day.totalHours || 0) + ' 小时' })
        ]),
        day.abnormal ? UI.badge('有异常', 'warn') : null
      ]));
      var segs = day.segments || [];
      segs.forEach(function (seg, i) {
        card.appendChild(segmentBody(seg, i, segs.length));
      });
      return card;
    }

    function segmentBody(seg, index, total) {
      var box = U.el('div', {
        class: 'card-body tight',
        style: index ? { borderTop: '1px solid var(--line-2)' } : {}
      });
      if (total > 1) {
        box.appendChild(U.el('div', { class: 'small muted', style: { marginBottom: '2px' }, text: '班段 ' + seg.segmentNo }));
      }
      box.appendChild(infoRow('上班打卡', seg.clockIn || '—'));
      box.appendChild(infoRow('下班打卡', seg.clockOut || '—'));
      if (seg.plannedIn || seg.plannedOut) {
        box.appendChild(infoRow('排班时间', (seg.plannedIn || '—') + ' — ' + (seg.plannedOut || '—')));
      }
      box.appendChild(infoRow('工时', U.round2(seg.actualHours || 0) + ' 小时'));
      var tags = seg.tags || [];
      if (tags.length) {
        var row = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } });
        tags.forEach(function (t) { row.appendChild(UI.badge(t.text, t.cls)); });
        box.appendChild(row);
      }
      return box;
    }

    function infoRow(label, value) {
      return U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: label }),
        U.el('span', { class: 'info-value', text: value })
      ]);
    }

    function dateLabel(date) {
      var p = String(date || '').split('-');
      if (p.length !== 3) return date || '';
      return Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日';
    }

    function weekdayOf(date) {
      var d = U.parseDate(date);
      return d ? WEEK[d.getDay()] : '';
    }
  };
})();
