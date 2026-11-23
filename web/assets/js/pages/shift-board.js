/* 排班表 — 拖动式时间轴（排班唯一入口）
   数据仍写入 daily_shifts：每名员工每天最多两段 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  var HOUR_W = 64;
  var DAY_MIN = 1440;
  var DAY_W = HOUR_W * 24;
  var PX_PER_MIN = HOUR_W / 60;
  var LEFT_W = 148;
  var SNAP = 30;
  var MIN_DUR = 30;

  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function minText(m) {
    m = Math.max(0, Math.min(DAY_MIN, Math.round(m)));
    if (m === DAY_MIN) return '24:00';
    return p2(Math.floor(m / 60)) + ':' + p2(m % 60);
  }
  function textMin(t) {
    var a = String(t || '').split(':');
    return (Number(a[0]) || 0) * 60 + (Number(a[1]) || 0);
  }
  function snapMin(m) { return Math.round(m / SNAP) * SNAP; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hoursText(mins) {
    var h = mins / 60;
    return (Math.round(h * 10) / 10).toFixed(1) + 'h';
  }
  function byStart(a, b) { return a.startMin - b.startMin; }
  function overlaps(a, b) { return a.startMin < b.endMin && b.startMin < a.endMin; }
  function sameRecs(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].startMin !== b[i].startMin || a[i].endMin !== b[i].endMin ||
        a[i].stationId !== b[i].stationId || String(a[i].task || '') !== String(b[i].task || '')) return false;
    }
    return true;
  }
  function totalMin(row) {
    return row.recs.reduce(function (n, r) { return n + Math.max(0, r.endMin - r.startMin); }, 0);
  }

  window.Pages['shift-board'] = function () {
    var main = Layout.staffShell({ title: '排班表', back: 'profile.html', hideNav: true, active: 'profile' }, UI.skeleton(2));
    (function () {
      var slot = document.querySelector('.birthday-slot');
      if (slot && slot.parentNode) slot.parentNode.removeChild(slot);
    })();
    var S = { date: U.today(), stations: [], taskDict: [], rows: [], dirty: {}, saving: false, scrollLeft: 0 };
    var ui = { save: null, dirty: null, scroller: null };

    load(S.date);

    function load(date) {
      S.date = date || S.date;
      main.innerHTML = '';
      main.appendChild(UI.skeleton(2));
      return api.getShiftBoard(S.date).then(function (data) {
        S.stations = data.stations || [];
        S.taskDict = data.tasks || [];
        S.rows = (data.staff || []).map(function (st) {
          var recs = (st.records || []).slice(0, 2).map(function (r) {
            return {
              startMin: textMin(r.startTime), endMin: textMin(r.endTime),
              stationId: r.stationId, stationName: r.stationName || '', task: r.task || ''
            };
          }).sort(byStart);
          return { id: st.id, name: st.name, avatar: st.avatar, position: st.position, empNo: st.empNo, recs: recs, el: null };
        });
        S.dirty = {};
        if (!S.scrollLeft) S.scrollLeft = 8 * HOUR_W;
        renderAll();
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { load(S.date); } }));
      });
    }

    function renderAll() {
      main.innerHTML = '';
      var page = U.el('div', { class: 'sb-page' });

      var dateBtn = U.el('button', { class: 'sb-date', type: 'button', 'aria-label': '选择日期' }, [
        U.el('span', { class: 'sb-date-val', text: S.date }),
        U.el('span', { class: 'sb-date-icon', html: UI.icon('calendar', 14) })
      ]);
      var dateIn = U.el('input', { class: 'sb-date-native', type: 'date', value: S.date, tabindex: '-1', 'aria-hidden': 'true' });
      dateBtn.addEventListener('click', function () {
        dateIn.value = S.date;
        if (typeof dateIn.showPicker === 'function') { try { dateIn.showPicker(); return; } catch (e) {} }
        dateIn.focus();
        dateIn.click();
      });
      dateIn.addEventListener('change', function () { changeDate(this.value, null); });
      var copyBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '复制上一天' });
      copyBtn.addEventListener('click', copyPrev);
      var saveBtn = U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '保存' });
      saveBtn.addEventListener('click', saveAll);
      var dirtyEl = U.el('span', { class: 'sb-dirty small muted' });

      page.appendChild(U.el('div', { class: 'sb-toolbar' }, [
        U.el('div', { class: 'sb-date-wrap' }, [dateBtn, dateIn]),
        U.el('div', { class: 'sb-actions' }, [dirtyEl, copyBtn, saveBtn])
      ]));
      page.appendChild(U.el('p', {
        class: 'sb-hint',
        text: '拖动班段整体移动，拖两端调整起止；点空白处快速新增。每人最多两段，重叠会在保存前拦截。'
      }));

      var scroller = U.el('div', { class: 'sb-scroll' });
      var board = U.el('div', { class: 'sb-board', style: { width: (LEFT_W + DAY_W) + 'px' } });

      var head = U.el('div', { class: 'sb-row sb-head' });
      head.appendChild(U.el('div', { class: 'sb-staff sb-staff-head', text: '员工 / 工时' }));
      var axis = U.el('div', { class: 'sb-axis', style: { width: DAY_W + 'px' } });
      for (var h = 0; h <= 24; h++) {
        var tick = U.el('span', {
          class: 'sb-tick' + (h === 0 ? ' first' : '') + (h === 24 ? ' last' : ''),
          text: p2(h),
          style: { left: (h === 24 ? DAY_W - 2 : h * HOUR_W) + 'px' }
        });
        axis.appendChild(tick);
      }
      head.appendChild(axis);
      board.appendChild(head);

      S.rows.forEach(function (row) { board.appendChild(renderRow(row)); });
      scroller.appendChild(board);
      scroller.addEventListener('scroll', function () { S.scrollLeft = scroller.scrollLeft; });
      page.appendChild(scroller);
      if (!S.rows.length) page.appendChild(U.el('p', { class: 'small muted', text: '暂无在职员工' }));

      main.appendChild(page);
      ui.save = saveBtn;
      ui.dirty = dirtyEl;
      ui.scroller = scroller;
      scroller.scrollLeft = S.scrollLeft || 0;
      refreshDirty();
    }

    function renderRow(row) {
      var wrap = U.el('div', { class: 'sb-row', 'data-staff': row.id });
      row.el = wrap;

      var staff = U.el('div', { class: 'sb-staff' });
      var who = U.el('div', { class: 'sb-staff-main' });
      who.appendChild(UI.userAvatar(row.name, row.avatar, 'avatar-xs'));
      who.appendChild(U.el('div', { class: 'sb-staff-text' }, [
        U.el('strong', { text: row.name }),
        U.el('span', { class: 'sb-staff-sub' }, [
          document.createTextNode((row.empNo || '—') + ' · '),
          U.el('b', { class: 'sb-total', text: hoursText(totalMin(row)) })
        ])
      ]));
      staff.appendChild(who);

      var track = U.el('div', { class: 'sb-track', style: { width: DAY_W + 'px' } });
      bindTrackTap(track, row);
      row.recs.forEach(function (rec, i) { track.appendChild(renderSeg(row, rec, i)); });

      wrap.appendChild(staff);
      wrap.appendChild(track);
      return wrap;
    }

    function renderSeg(row, rec, i) {
      var el = U.el('div', { class: 'sb-seg ' + (i % 2 === 0 ? 'sb-seg-a' : 'sb-seg-b') });
      var lh = U.el('span', { class: 'sb-seg-handle l' });
      var rh = U.el('span', { class: 'sb-seg-handle r' });
      var label = U.el('span', { class: 'sb-seg-label' });
      var station = U.el('span', { class: 'sb-seg-station' });
      el.appendChild(lh);
      el.appendChild(label);
      el.appendChild(station);
      el.appendChild(rh);
      el._rec = rec;
      el._label = label;
      el._station = station;
      paintSeg(el, rec);
      bindSegDrag(el, row, rec, 'move');
      bindSegDrag(lh, row, rec, 'start');
      bindSegDrag(rh, row, rec, 'end');
      return el;
    }

    function paintSeg(el, rec) {
      var w = Math.max(MIN_DUR * PX_PER_MIN, (rec.endMin - rec.startMin) * PX_PER_MIN);
      el.style.left = (rec.startMin * PX_PER_MIN) + 'px';
      el.style.width = w + 'px';
      el._label.textContent = minText(rec.startMin) + '–' + minText(rec.endMin);
      el._station.textContent = rec.stationName || '';
      el.classList.toggle('narrow', w < 96);
      el.classList.toggle('tiny', w < 54);
    }

    function bindSegDrag(node, row, rec, mode) {
      node.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var el = node.closest ? node.closest('.sb-seg') : node.parentNode;
        markSelected(el);
        var startX = e.clientX;
        var s0 = rec.startMin;
        var e0 = rec.endMin;
        var moved = false;
        var other = row.recs.filter(function (r) { return r !== rec; })[0];

        function onMove(ev) {
          var dx = ev.clientX - startX;
          if (!moved && Math.abs(dx) < 3) return;
          moved = true;
          var dm = snapMin(dx / PX_PER_MIN);
          if (mode === 'move') {
            var dur = e0 - s0;
            var ns = clamp(s0 + dm, 0, DAY_MIN - dur);
            if (other && ns < other.endMin && ns + dur > other.startMin) {
              ns = dm > 0 ? other.startMin - dur : other.endMin;
            }
            rec.startMin = clamp(ns, 0, DAY_MIN - dur);
            rec.endMin = rec.startMin + dur;
          } else if (mode === 'start') {
            var ns2 = clamp(s0 + dm, 0, e0 - MIN_DUR);
            if (other && ns2 < other.endMin && e0 > other.startMin) ns2 = Math.max(ns2, other.endMin);
            rec.startMin = ns2;
          } else {
            var ne = clamp(e0 + dm, s0 + MIN_DUR, DAY_MIN);
            if (other && ne > other.startMin && s0 < other.endMin) ne = Math.min(ne, other.startMin);
            rec.endMin = ne;
          }
          paintSeg(el, rec);
          updateTotal(row);
          markDirty(row);
        }

        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          if (!moved && mode === 'move') openEditor(row, rec, el);
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });
    }

    function bindTrackTap(track, row) {
      var x0 = 0, y0 = 0, moved = false;
      track.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        x0 = e.clientX; y0 = e.clientY; moved = false;
      });
      track.addEventListener('pointermove', function (e) {
        if (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8) moved = true;
      });
      track.addEventListener('pointerup', function (e) {
        if (moved) return;
        if (e.target && e.target.closest && e.target.closest('.sb-seg')) return;
        if (row.recs.length >= 2) { UI.toast('每人最多两段，请先调整或删除', 'info'); return; }
        var rect = track.getBoundingClientRect();
        addAt(row, snapMin((e.clientX - rect.left) / PX_PER_MIN));
      });
    }

    function freeStart(row, desired, dur) {
      var tryAt = function (m) {
        var cand = { startMin: m, endMin: m + dur };
        for (var i = 0; i < row.recs.length; i++) { if (overlaps(cand, row.recs[i])) return false; }
        return true;
      };
      var m = clamp(snapMin(desired), 0, DAY_MIN - dur);
      if (tryAt(m)) return m;
      for (var k = 1; k * SNAP <= DAY_MIN; k++) {
        var later = m + k * SNAP;
        if (later <= DAY_MIN - dur && tryAt(later)) return later;
        var earlier = m - k * SNAP;
        if (earlier >= 0 && tryAt(earlier)) return earlier;
      }
      return -1;
    }

    function addAt(row, atMin) {
      var dur = 300;
      var start = freeStart(row, atMin, dur);
      if (start < 0) { dur = 120; start = freeStart(row, atMin, dur); }
      if (start < 0) { UI.toast('该时段已排满，请先调整现有班段', 'info'); return; }
      var st = S.stations[0] || {};
      var rec = { startMin: start, endMin: start + dur, stationId: st.id || '', stationName: st.name || '', task: '' };
      row.recs.push(rec);
      row.recs.sort(byStart);
      markDirty(row);
      rerenderBoard();
      setTimeout(function () { openEditor(row, rec, null); }, 80);
    }

    function openEditor(row, rec, segEl) {
      var idx = row.recs.indexOf(rec);
      if (idx < 0) return;

      var stationSel = U.el('select', { class: 'select' });
      S.stations.forEach(function (st) {
        stationSel.appendChild(U.el('option', { value: st.id, text: st.name }));
      });
      if (rec.stationId) stationSel.value = rec.stationId;

      var listId = 'sb-task-dict';
      var taskIn = U.el('input', {
        class: 'input', type: 'text', maxlength: '100',
        placeholder: '如：补货、清洁；可留空', value: rec.task || ''
      });
      taskIn.setAttribute('list', listId);
      var dl = U.el('datalist', { id: listId });
      S.taskDict.forEach(function (t) { dl.appendChild(U.el('option', { value: t })); });

      var liveEl = segEl || (row.el ? row.el.querySelectorAll('.sb-seg')[idx] : null);

      function apply() {
        rec.stationId = stationSel.value;
        var st = S.stations.filter(function (s) { return s.id === stationSel.value; })[0];
        rec.stationName = st ? st.name : '';
        rec.task = String(taskIn.value || '').trim();
        if (liveEl && liveEl._station) liveEl._station.textContent = rec.stationName;
        markDirty(row);
      }
      stationSel.addEventListener('change', apply);
      taskIn.addEventListener('input', apply);

      var deleteBtn = U.el('button', { class: 'btn btn-danger-ghost btn-sm', type: 'button', text: '删除本段' });
      deleteBtn.addEventListener('click', function () {
        var k = row.recs.indexOf(rec);
        if (k >= 0) row.recs.splice(k, 1);
        markDirty(row);
        layer.close();
        rerenderBoard();
      });
      var clearBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '清空此人当天' });
      clearBtn.addEventListener('click', function () {
        UI.confirm({
          title: '清空排班',
          message: '确定清空 ' + row.name + ' 在 ' + S.date + ' 的全部班段吗？',
          confirmText: '清空', danger: true
        }).then(function (ok) {
          if (!ok) return;
          row.recs = [];
          markDirty(row);
          layer.close();
          rerenderBoard();
        });
      });

      var body = U.el('div', {}, [
        U.el('div', { class: 'sb-editor-head' }, [
          U.el('strong', { text: row.name }),
          U.el('span', { class: 'sb-editor-time', text: minText(rec.startMin) + ' – ' + minText(rec.endMin) })
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: '岗位' }), stationSel
        ]),
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: '低峰任务' }), taskIn, dl,
          U.el('div', { class: 'hint', text: '沿用现有低峰任务，可直接选择或输入；留空表示不安排。' })
        ]),
        U.el('div', { class: 'sb-editor-extra' }, [deleteBtn, clearBtn])
      ]);

      var layer = UI.drawer({
        title: '班段设置', body: body,
        footer: [{
          text: '完成', class: 'btn-primary', close: true,
          onClick: function () { rerenderBoard(); }
        }]
      });
    }

    function markSelected(el) {
      if (!el) return;
      var all = main.querySelectorAll('.sb-seg.selected');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
      el.classList.add('selected');
    }

    function updateTotal(row) {
      if (!row.el) return;
      var b = row.el.querySelector('.sb-total');
      if (b) b.textContent = hoursText(totalMin(row));
    }

    function markDirty(row) {
      S.dirty[row.id] = true;
      refreshDirty();
    }

    function refreshDirty() {
      var n = Object.keys(S.dirty).length;
      if (ui.dirty) ui.dirty.textContent = n ? (n + ' 人待保存') : '已是最新';
      if (ui.dirty) ui.dirty.style.color = n ? 'var(--red)' : '';
      if (ui.save) {
        ui.save.disabled = !n || S.saving;
        ui.save.textContent = S.saving ? '保存中…' : '保存';
      }
    }

    function rerenderBoard() {
      S.scrollLeft = ui.scroller ? ui.scroller.scrollLeft : S.scrollLeft;
      renderAll();
    }

    function validateRow(row) {
      if (row.recs.length > 2) return '每人最多两段';
      for (var i = 0; i < row.recs.length; i++) {
        var r = row.recs[i];
        if (!(r.endMin > r.startMin)) return '下班时间需晚于上班时间';
        if (!r.stationId) return '请选择岗位';
      }
      if (row.recs.length === 2 && overlaps(row.recs[0], row.recs[1])) return '两段时间重叠';
      return '';
    }

    function saveAll() {
      if (S.saving) return;
      var keys = Object.keys(S.dirty);
      if (!keys.length) { UI.toast('没有需要保存的修改', 'info'); return; }
      for (var i = 0; i < S.rows.length; i++) {
        var row = S.rows[i];
        if (!S.dirty[row.id]) continue;
        var errMsg = validateRow(row);
        if (errMsg) { UI.toast(row.name + '：' + errMsg, 'error'); return; }
      }
      S.saving = true;
      refreshDirty();
      var jobs = [];
      S.rows.forEach(function (row) {
        if (!S.dirty[row.id]) return;
        if (!row.recs.length) {
          jobs.push(api.clearDailyShift({ staffId: row.id, date: S.date }));
          return;
        }
        jobs.push(api.saveDailyShift({
          staffId: row.id, date: S.date,
          segments: row.recs.map(function (r) {
            return { startTime: minText(r.startMin), endTime: minText(r.endMin), stationId: r.stationId, task: r.task };
          })
        }));
      });
      Promise.all(jobs).then(function () {
        S.saving = false;
        S.dirty = {};
        UI.toast('已保存 ' + S.date + ' 的排班', 'success');
        return load(S.date);
      }).catch(function (e) {
        S.saving = false;
        refreshDirty();
        UI.toast(e.message || '保存失败', 'error');
      });
    }

    function copyPrev() {
      var prev = U.addDays(S.date, -1);
      UI.confirm({
        title: '复制上一天',
        message: '将用 ' + prev + ' 的排班覆盖当前 ' + S.date + ' 的排班，是否继续？',
        confirmText: '复制'
      }).then(function (ok) {
        if (!ok) return;
        api.getShiftBoard(prev).then(function (data) {
          var map = {};
          (data.staff || []).forEach(function (st) { map[st.id] = st.records || []; });
          var any = false;
          var plan = S.rows.map(function (row) {
            var recs = (map[row.id] || []).slice(0, 2).map(function (r) {
              return {
                startMin: textMin(r.startTime), endMin: textMin(r.endTime),
                stationId: r.stationId, stationName: r.stationName || '', task: r.task || ''
              };
            }).sort(byStart);
            if (recs.length) any = true;
            return { row: row, recs: recs };
          });
          if (!any) { UI.toast(prev + ' 没有排班，未做修改', 'info'); return; }
          plan.forEach(function (p) {
            if (!sameRecs(p.recs, p.row.recs)) {
              p.row.recs = p.recs;
              markDirty(p.row);
            }
          });
          rerenderBoard();
          UI.toast('已带入 ' + prev + ' 的排班，请确认后保存', 'success');
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function changeDate(v, input) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v === S.date) {
        if (input) input.value = S.date;
        return;
      }
      function go() {
        S.dirty = {};
        S.scrollLeft = 0;
        load(v);
      }
      if (Object.keys(S.dirty).length) {
        UI.confirm({ message: '切换日期将丢失未保存的修改，继续？', confirmText: '继续' }).then(function (ok) {
          if (ok) go(); else if (input) input.value = S.date;
        });
      } else {
        go();
      }
    }
  };
})();
