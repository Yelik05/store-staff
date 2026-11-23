/* 员工端 — 逾期任务独立页：日期筛选、按期展示、可补交返图 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['overdue-tasks'] = function () {
    var q = new URLSearchParams(location.search);
    var initCycle = q.get('cycle') || '';
    var initMine = q.get('mine') === '1';
    var initKind = q.get('kind') || '';
    var state = { date: '', cycle: initCycle, mine: initMine, kind: initKind, kindName: '', today: '', rows: [], counts: {} };
    var main = Layout.staffShell({ title: '逾期任务', active: 'tasks' }, UI.skeleton(3));
    load();

    function load() {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.taskOverdue({ date: state.date, cycle: state.cycle, mine: state.mine, kind: state.kind }).then(function (res) {
        state.date = res.date || '';
        state.cycle = res.cycle || '';
        state.mine = !!res.mine;
        state.kind = res.kind || '';
        state.kindName = res.kindName || '';
        state.today = res.today;
        state.rows = res.list || [];
        state.counts = res.counts || {};
        if (!state.date && !state.cycle && !state.mine && !state.kind) Layout.setTaskOverdue((state.counts.all || 0) > 0);
        main.innerHTML = '';
        main.appendChild(render());
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function cycleLabel(key) {
      var map = { daily: '日任务', weekly: '周任务', monthly: '月任务', once: '次任务', mine: '个人任务' };
      return map[key] || '全部任务';
    }

    function filterLabel() {
      if (state.kind) return state.kindName || '所选类型';
      return state.mine ? '个人任务' : cycleLabel(state.cycle);
    }

    function render() {
      var wrap = U.el('div');
      wrap.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('p', { text: '已过截止时间仍未完成的任务；可补交返图或标记完成，提交后会从本页移除。' }),
        U.el('div', { class: 'page-actions' }, [
          U.el('a', { class: 'btn btn-ghost btn-sm', href: 'tasks.html', text: '返回任务' })
        ])
      ]));

      var bar = U.el('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', marginBottom: '12px', flexWrap: 'wrap' } });
      bar.appendChild(U.el('span', { class: 'small muted', text: '日期' }));
      var dateInput = U.el('input', { class: 'input', type: 'date', value: state.date, style: { maxWidth: '170px' } });
      dateInput.addEventListener('change', function () {
        state.date = this.value;
        load();
      });
      bar.appendChild(dateInput);
      bar.appendChild(U.el('button', {
        class: 'btn-text', type: 'button', text: '全部日期',
        onclick: function () { state.date = ''; load(); }
      }));
      bar.appendChild(U.el('span', { class: 'spacer' }));
      bar.appendChild(U.el('span', {
        class: 'small muted',
        text: filterLabel() + ' · 共 ' + (state.counts.all || 0) + ' 项'
      }));
      wrap.appendChild(bar);

      if (!state.rows.length) {
        wrap.appendChild(UI.emptyState({
          icon: 'check',
          title: state.date ? '该日期没有逾期任务' : '没有逾期任务',
          desc: state.date ? '换一个日期看看，或点击「全部日期」查看所有逾期。' : '历史期次都已按时提交，保持得不错。'
        }));
        return wrap;
      }

      var byDate = {};
      state.rows.forEach(function (t) {
        (byDate[t.periodDate] = byDate[t.periodDate] || []).push(t);
      });
      Object.keys(byDate).sort().reverse().forEach(function (date) {
        wrap.appendChild(section(date, byDate[date]));
      });
      return wrap;
    }

    function section(date, list) {
      var card = U.el('div', { class: 'card', style: { marginBottom: '12px' } });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title' }, [
          U.el('span', { text: '期间 ' + U.fmtDate(date) }),
          UI.badge(String(list.length), 'danger')
        ]),
        U.el('span', { class: 'small muted', text: '已逾期，仍可补交' })
      ]));
      var body = U.el('div', { class: 'card-body' });
      list.forEach(function (t, i) { body.appendChild(item(t, i < list.length - 1)); });
      card.appendChild(body);
      return card;
    }

    function item(t, border) {
      var row = U.el('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px',
          paddingBottom: border ? '10px' : '0', marginBottom: border ? '10px' : '0',
          borderBottom: border ? '1px solid var(--line)' : '0'
        }
      });
      var left = U.el('div', { style: { flex: '1 1 auto', minWidth: '0' } });
      left.appendChild(U.el('div', {
        style: { fontSize: '15px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        text: t.title
      }));
      var meta = [];
      if (t.groupTitle) meta.push(U.el('span', { class: 'muted', text: '分组：' + t.groupTitle }));
      if (t.completionMode === 'confirm') meta.push(U.el('span', { class: 'muted', text: '仅需确认' }));
      if (t.deadlineText) meta.push(U.el('span', { class: 'muted', text: '截止 ' + String(t.deadlineText).slice(5) }));
      if (t.assigneeId) meta.push(U.el('span', { class: 'muted', text: '指派：' + (t.assigneeDisplayName || t.assigneeName || '同事') }));
      else meta.push(U.el('span', { class: 'muted', text: '公共任务' }));
      var statusLine = U.el('div', { style: { marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [
        UI.badge('已逾期', 'danger')
      ]);
      if (t.kindId && t.kindId !== 'sys') {
        statusLine.appendChild(UI.badge(t.kindName || '类型', 'info'));
      }
      meta.forEach(function (m) { statusLine.appendChild(m); });
      left.appendChild(statusLine);
      if (t.sampleImages && t.sampleImages.length) left.appendChild(sampleThumbs(t.sampleImages, t.title));
      if (t.images && t.images.length) left.appendChild(thumbs(t.images, t.title));
      row.appendChild(left);

      var right = U.el('div', { style: { flex: '0 0 auto' } });
      var confirmMode = t.completionMode === 'confirm';
      right.appendChild(U.el('button', {
        class: 'btn btn-primary btn-sm', type: 'button',
        text: confirmMode ? '标记完成' : '补交返图',
        onclick: function () { confirmMode ? finishConfirm(t) : openSubmit(t); }
      }));
      row.appendChild(right);
      return row;
    }

    function finishConfirm(t) {
      UI.confirm({
        title: '确认完成任务',
        message: '确认将任务「' + t.title + '」标记为完成？确认后立即提交，且不可撤销。',
        confirmText: '确认完成'
      }).then(function (ok) {
        if (!ok) return;
        api.submitTask({ id: t.id, images: [], confirm: true }).then(function () {
          UI.toast('任务已完成', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function openSubmit(t) {
      var keys = [];
      var preview = U.el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } });
      var input = U.el('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
      var pick = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('upload', 15) + '<span>选择图片</span>' });
      pick.addEventListener('click', function () { input.click(); });
      var counter = U.el('div', { class: 'hint', text: '支持 JPG / PNG / WEBP / GIF，单张不超过 10MB，最多 9 张。' });
      var body = U.el('div');
      body.appendChild(U.el('div', { class: 'small', style: { marginBottom: '8px', whiteSpace: 'pre-wrap' }, text: t.title + '\n' + t.content }));
      if (t.sampleImages && t.sampleImages.length) body.appendChild(sampleThumbs(t.sampleImages, t.title));
      body.appendChild(pick);
      body.appendChild(input);
      body.appendChild(counter);
      body.appendChild(preview);

      function refresh() {
        counter.textContent = '已选 ' + keys.length + ' 张（最多 9 张），支持 JPG / PNG / WEBP / GIF，单张不超过 10MB。';
      }

      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.value = '';
        if (!files.length) return;
        pick.disabled = true;
        var chain = Promise.resolve();
        files.forEach(function (file) {
          chain = chain.then(function () {
            if (keys.length >= 9) return null;
            return api.uploadFile(file, 'photo').then(function (res) {
              if (!res || !res.key) return null;
              keys.push(res.key);
              preview.appendChild(U.el('img', { src: res.url, alt: '返图', style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px' } }));
              refresh();
              return null;
            }).catch(function (e) { UI.toast(e.message, 'error'); });
          });
        });
        chain.then(function () { pick.disabled = false; });
      });

      UI.openModal({
        title: '补交任务返图',
        body: body,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '提交审核', class: 'btn-primary',
            onClick: function (btn, close) {
              if (!keys.length) { UI.toast('请至少上传 1 张返图', 'error'); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.submitTask({ id: t.id, images: keys }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已提交，等待审核', 'success');
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

    /* 拍摄示例图：横向排列，点击放大 */
    function sampleThumbs(images, title) {
      var box = U.el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', overflowX: 'auto', paddingBottom: '2px' }
      });
      box.appendChild(U.el('span', { class: 'small muted', style: { flex: '0 0 auto' }, text: '拍摄示例' }));
      images.forEach(function (key, i) {
        var img = U.el('img', {
          alt: '拍摄示例',
          style: {
            width: '46px', height: '46px', flex: '0 0 auto', objectFit: 'cover',
            borderRadius: '6px', border: '1px solid var(--line)', cursor: 'pointer'
          }
        });
        api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
        img.addEventListener('click', function () {
          api.getFileUrl(key).then(function (url) {
            if (url) UI.imageViewer({ url: url, title: title + ' · 拍摄示例 ' + (i + 1) });
          });
        });
        box.appendChild(img);
      });
      return box;
    }

    function thumbs(images, title) {
      var box = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } });
      images.forEach(function (key, i) {
        var img = U.el('img', {
          alt: '返图',
          style: { width: '46px', height: '46px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--line)', cursor: 'pointer' }
        });
        api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
        img.addEventListener('click', function () {
          api.getFileUrl(key).then(function (url) {
            if (url) UI.imageViewer({ url: url, title: title + ' · 返图 ' + (i + 1) });
          });
        });
        box.appendChild(img);
      });
      return box;
    }
  };
})();
