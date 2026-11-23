/* P18b 员工端 — 已完成任务（按日期查看已通过 / 待审核） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['completed-tasks'] = function () {
    var state = { date: '', today: '', rows: [], counts: {} };
    var main = Layout.staffShell({ title: '已完成任务', active: 'tasks' }, UI.skeleton(3));
    load('');

    function load(date) {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.taskCompleted({ date: date || '' }).then(function (res) {
        state.date = res.date;
        state.today = res.today;
        state.rows = res.list || [];
        state.counts = res.counts || {};
        main.innerHTML = '';
        main.appendChild(render(res));
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { load(state.date); } }));
      });
    }

    function render(res) {
      var wrap = U.el('div');
      var head = U.el('div', { class: 'page-head' }, [
        U.el('p', { text: '按任务期次日期查看已审核通过与待审核的任务；默认显示今天。' }),
        U.el('div', { class: 'page-actions' }, [
          U.el('a', { class: 'btn btn-ghost btn-sm', href: 'tasks.html', text: '返回任务' })
        ])
      ]);
      wrap.appendChild(head);

      var bar = U.el('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', marginBottom: '12px', flexWrap: 'wrap' } });
      bar.appendChild(U.el('span', { class: 'small muted', text: '日期' }));
      var dateInput = U.el('input', { class: 'input', type: 'date', value: state.date, style: { maxWidth: '170px' } });
      dateInput.addEventListener('change', function () { load(this.value); });
      bar.appendChild(dateInput);
      bar.appendChild(U.el('button', {
        class: 'btn-text', type: 'button', text: '今天',
        onclick: function () { load(state.today); }
      }));
      bar.appendChild(U.el('span', { class: 'spacer' }));
      bar.appendChild(U.el('span', {
        class: 'small muted',
        text: '已通过 ' + (state.counts.approved || 0) + ' · 待审核 ' + (state.counts.submitted || 0)
      }));
      wrap.appendChild(bar);

      var submitted = state.rows.filter(function (t) { return t.status === 'submitted'; });
      var approved = state.rows.filter(function (t) { return t.status === 'approved'; });

      if (!state.rows.length) {
        wrap.appendChild(UI.emptyState({
          icon: 'clipboard', title: '该日期没有已完成任务',
          desc: '换一个日期看看，或返回任务页处理今天与逾期的任务。'
        }));
        return wrap;
      }

      if (submitted.length) wrap.appendChild(section('待审核', submitted, 'info', '已提交，等待管理组审核（不计入已完成）'));
      if (approved.length) wrap.appendChild(section('已通过', approved, 'success', '审核通过的任务'));
      return wrap;
    }

    function section(title, list, tone, hint) {
      var card = U.el('div', { class: 'card', style: { marginBottom: '12px' } });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title' }, [
          U.el('span', { text: title }),
          UI.badge(String(list.length), tone)
        ]),
        U.el('span', { class: 'small muted', text: hint })
      ]));
      var body = U.el('div', { class: 'card-body' });
      list.forEach(function (t, i) {
        body.appendChild(item(t, i < list.length - 1));
      });
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
      var meta = [U.el('span', { class: 'muted', text: '期间 ' + U.fmtDate(t.periodDate) })];
      if (t.groupTitle) meta.push(U.el('span', { class: 'muted', text: '分组：' + t.groupTitle }));
      if (t.completionMode === 'confirm') meta.push(U.el('span', { class: 'muted', text: '仅需确认' }));
      if (t.deadlineText) meta.push(U.el('span', { class: 'muted', text: '截止 ' + String(t.deadlineText).slice(5) }));
      if (t.submitterName) meta.push(U.el('span', { class: 'muted', text: '提交：' + t.submitterName }));
      var statusLine = U.el('div', { style: { marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [
        UI.badge(t.statusLabel, t.status === 'approved' ? 'success' : 'info')
      ]);
      meta.forEach(function (m) { statusLine.appendChild(m); });
      left.appendChild(statusLine);
      if (t.status === 'approved' && t.reviewedAt) {
        left.appendChild(U.el('div', { class: 'small muted', style: { marginTop: '2px' }, text: '审核：' + (t.reviewedBy || '管理组') + ' · ' + U.fmtTime(t.reviewedAt) }));
      }
      if (t.sampleImages && t.sampleImages.length) left.appendChild(sampleThumbs(t.sampleImages, t.title));
      if (t.images && t.images.length) left.appendChild(thumbs(t.images, t.title));
      row.appendChild(left);

      var right = U.el('div', { style: { flex: '0 0 auto', textAlign: 'right' } });
      if (t.submittedAt) right.appendChild(U.el('div', { class: 'small muted', text: U.fmtTime(t.submittedAt) }));
      row.appendChild(right);
      return row;
    }

    /* 拍摄示例图：横向排列，点击放大（已完成期次同样可查看） */
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
