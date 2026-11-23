/* P17 管理端 — 通知管理 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-notices'] = function () {
    var CATS = ['总部通知', '餐厅通知', '门店通知'];
    var state = { category: '', status: 'all', rows: [] };
    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '发布总部/餐厅/门店通知，查看员工了解情况；总部通知仅店长可发布。' }),
      U.el('div', { class: 'page-actions' }, [])
    ]);
    var newBtn = U.el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      html: UI.icon('plus', 15) + '<span>新建通知</span>',
      onclick: function () { openForm(null); }
    });
    head.querySelector('.page-actions').appendChild(newBtn);
    content.appendChild(head);

    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var catSel = U.el('select', { class: 'select' });
    catSel.appendChild(U.el('option', { value: '', text: '全部分类' }));
    CATS.forEach(function (c) { catSel.appendChild(U.el('option', { value: c, text: c })); });
    catSel.addEventListener('change', function () { state.category = this.value; load(); });
    toolbar.appendChild(catSel);

    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部状态'], ['published', '已发布'], ['scheduled', '定时发布'], ['draft', '草稿'], ['withdrawn', '已撤回']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    statusSel.addEventListener('change', function () { state.status = this.value; load(); });
    toolbar.appendChild(statusSel);
    toolbar.appendChild(U.el('span', { class: 'spacer' }));
    card.appendChild(toolbar);
    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);
    Layout.adminShell({ title: '通知管理', active: 'admin-notices' }, content);

    load();

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      api.adminNoticeList({ category: state.category, status: state.status }).then(function (res) {
        state.rows = res.list || [];
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
          icon: 'bell', title: '暂无通知',
          desc: '点击右上角「新建通知」发布第一条消息。'
        }));
        return;
      }
      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '900px' } });
      table.innerHTML = '<thead><tr><th>分类</th><th>标题</th><th>状态</th><th>发布人</th><th>发布时间</th>' +
        '<th>已读 / 未读</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      state.rows.forEach(function (n) {
        var tr = U.el('tr');
        tr.appendChild(U.el('td', {}, [UI.badge(n.category, 'info')]));
        tr.appendChild(U.el('td', {}, [
          U.el('div', { class: 'strong' }, [
            n.pinned ? U.el('span', { class: 'badge badge-warn', style: { marginRight: '4px' }, text: '置顶' }) : null,
            n.important ? U.el('span', { class: 'badge badge-danger', style: { marginRight: '4px' }, text: '重要' }) : null,
            U.el('span', { text: n.title })
          ])
        ]));
        var statusMap = {
          published: ['已发布', 'success'],
          scheduled: ['定时发布', 'warn'],
          draft: ['草稿', 'muted'],
          withdrawn: ['已撤回', 'muted']
        };
        var stMeta = statusMap[n.status] || ['未知', 'muted'];
        tr.appendChild(U.el('td', {}, [UI.badge(stMeta[0], stMeta[1])]));
        tr.appendChild(U.el('td', { text: n.publisher || '—' }));
        tr.appendChild(U.el('td', {
          class: 'small',
          text: n.status === 'scheduled'
            ? ('定时 ' + U.fmtTime(n.publishAt))
            : (n.publishedAt ? U.fmtTime(n.publishedAt) : '—')
        }));
        tr.appendChild(U.el('td', { text: n.status === 'published' ? (n.readCount + ' / ' + n.unreadCount) : '—' }));
        var ops = U.el('div', { class: 'table-actions' });
        if (n.status === 'published') {
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '了解明细',
            onclick: function () { openReaders(n); }
          }));
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '复制链接',
            onclick: function () { copyLink(n); }
          }));
        }
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '编辑',
          onclick: function () { openForm(n); }
        }));
        if (n.status === 'published') {
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '撤回',
            onclick: function () { withdraw(n); }
          }));
        }
        if (Auth.isSuper()) {
          ops.appendChild(U.el('button', {
            class: 'btn-text danger', type: 'button', text: '删除',
            onclick: function () { remove(n); }
          }));
        }
        var td = U.el('td');
        td.appendChild(ops);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      listBox.appendChild(wrap);
    }

    function openForm(n) {
      var editing = !!n;
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      var catOptions = CATS.map(function (c) {
        if (c === '总部通知' && !Auth.isSuper()) return '';
        return '<option value="' + c + '"' + (n && n.category === c ? ' selected' : '') + '>' + c + '</option>';
      }).join('');
      form.innerHTML =
        '<div class="field"><label class="label">分类 <i class="req">*</i></label><select class="select" name="category">' + catOptions + '</select>' +
        (Auth.isSuper() ? '' : '<div class="hint">总部通知仅店长（超级管理员）可发布。</div>') + '</div>' +
        '<div class="field"><label class="label">标题 <i class="req">*</i></label><input class="input" name="title" maxlength="60" value="' + (n ? escapeAttr(n.title) : '') + '"></div>' +
        '<div class="field"><label class="label">发布人</label><input class="input" name="publisher" maxlength="40" placeholder="留空则使用当前登录账号姓名" value="' + (n ? escapeAttr(n.publisher || '') : '') + '">' +
        '<div class="hint">自定义发布人会显示在员工端通知详情、公告页与飞书推送中。</div></div>' +
        '<div class="field"><label class="label">正文 <i class="req">*</i></label><textarea class="textarea" name="body" rows="7" maxlength="3000">' + (n ? escapeHtml(n.body) : '') + '</textarea></div>' +
        '<div class="field"><label class="label">发布方式</label><select class="select" name="status" data-status>' +
        '<option value="published"' + (!n || n.status === 'published' ? ' selected' : '') + '>立即发布</option>' +
        '<option value="scheduled"' + (n && n.status === 'scheduled' ? ' selected' : '') + '>定时发布</option>' +
        '<option value="draft"' + (n && n.status === 'draft' ? ' selected' : '') + '>保存草稿</option></select>' +
        '<div class="hint">定时发布无需 cron：到点后由员工端/管理端接口自动转为已发布。</div></div>' +
        '<div class="field" data-publish-wrap style="display:none"><label class="label">定时发布时间 <i class="req">*</i></label>' +
        '<input class="input" type="datetime-local" name="publishAt" value="' + noticeTimeInput(n && n.publishAt) + '"></div>' +
        '<div class="field"><label class="label" style="display:flex;gap:16px;align-items:center;">' +
        '<label style="font-weight:400;"><input type="checkbox" name="pinned"' + (n && n.pinned ? ' checked' : '') + '> 置顶</label>' +
        '<label style="font-weight:400;"><input type="checkbox" name="important"' + (n && n.important ? ' checked' : '') + '> 标记重要</label></label></div>';

      var statusField = form.querySelector('[data-status]');
      var publishWrap = form.querySelector('[data-publish-wrap]');
      function syncPublishField() {
        publishWrap.style.display = statusField.value === 'scheduled' ? '' : 'none';
      }
      statusField.addEventListener('change', syncPublishField);
      syncPublishField();

      UI.openModal({
        title: editing ? '编辑通知' : '新建通知',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var payload = {
                id: n ? n.id : '',
                category: fd.get('category'),
                title: String(fd.get('title') || '').trim(),
                body: String(fd.get('body') || '').trim(),
                publisher: String(fd.get('publisher') || '').trim(),
                status: fd.get('status'),
                publishAt: fd.get('publishAt') || '',
                pinned: !!fd.get('pinned'),
                important: !!fd.get('important')
              };
              if (payload.title.length < 2) { UI.toast('标题至少 2 个字', 'error'); return false; }
              if (payload.body.length < 5) { UI.toast('正文至少 5 个字', 'error'); return false; }
              if (payload.status === 'scheduled' && !payload.publishAt) { UI.toast('请选择定时发布时间', 'error'); return false; }
              UI.btnLoading(btn, true, '保存中…');
              api.saveNotice(payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast(payload.status === 'scheduled' ? '已设置定时发布' : (editing ? '已保存' : '已发布'), 'success');
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

    function openReaders(n) {
      var body = U.el('div');
      body.appendChild(U.el('div', { class: 'small muted', style: { marginBottom: '10px' }, text: n.title + ' · 已读 ' + n.readCount + ' 人 / 未读 ' + n.unreadCount + ' 人' }));
      var tabs = U.el('div', { class: 'tabs' });
      var panel = U.el('div');
      body.appendChild(tabs);
      body.appendChild(panel);

      function paintTab(which) {
        Array.prototype.forEach.call(tabs.children, function (b) {
          b.className = 'tab' + (b.getAttribute('data-tab') === which ? ' active' : '');
        });
        panel.innerHTML = '';
        panel.appendChild(UI.skeleton(2));
        api.noticeReaders(n.id).then(function (res) {
          panel.innerHTML = '';
          var rows = which === 'read' ? res.readers : res.unread;
          if (!rows.length) {
            panel.appendChild(U.el('p', { class: 'small muted', text: which === 'read' ? '还没有员工点击「我已了解」。' : '所有在职员工都已了解。' }));
            return;
          }
          var list = U.el('div');
          rows.forEach(function (p) {
            list.appendChild(U.el('div', { class: 'info-row' }, [
              U.el('span', { class: 'info-label', text: p.name + ' · ' + p.position }),
              U.el('span', { class: 'info-value', text: which === 'read' ? U.fmtTime(p.readAt) : '未了解' })
            ]));
          });
          panel.appendChild(list);
        }).catch(function (e) {
          panel.innerHTML = '';
          panel.appendChild(U.el('p', { class: 'small muted', text: e.message }));
        });
      }

      [['read', '已读明细'], ['unread', '未读人员']].forEach(function (x) {
        var b = U.el('button', { class: 'tab', type: 'button', dataset: { tab: x[0] }, text: x[1] });
        b.addEventListener('click', function () { paintTab(x[0]); });
        tabs.appendChild(b);
      });
      paintTab('read');
      UI.openModal({ title: '了解情况', body: body, footer: [{ text: '关闭', class: 'btn-ghost' }] });
    }

    function withdraw(n) {
      UI.confirm({ title: '撤回通知', message: '撤回后员工端将不再展示「' + n.title + '」，已读记录保留。', confirmText: '撤回' })
        .then(function (yes) {
          if (!yes) return;
          api.withdrawNotice(n.id).then(function () {
            UI.toast('已撤回', 'success');
            load();
          }).catch(function (e) { UI.toast(e.message, 'error'); });
        });
    }

    function remove(n) {
      UI.confirm({ title: '删除通知', message: '删除后通知与已读记录将同时移除，且不可恢复。', confirmText: '删除' })
        .then(function (yes) {
          if (!yes) return;
          api.deleteNotice(n.id).then(function () {
            UI.toast('已删除', 'success');
            load();
          }).catch(function (e) { UI.toast(e.message, 'error'); });
        });
    }

    function copyLink(n) {
      api.getPublicNotice(n.id).then(function (r) {
        var url = (r && r.shareUrl) || ('notice.html?id=' + encodeURIComponent(n.id));
        if (!/^https?:\/\//i.test(url)) {
          url = location.href.replace(/[^/]*$/, '') + url.replace(/^\.?\//, '');
        }
        copyText(url);
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function copyText(text) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); UI.toast('链接已复制', 'success'); }
        catch (e) { UI.toast('复制失败，请手动复制：' + text, 'error'); }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          UI.toast('链接已复制', 'success');
        }).catch(fallback);
      } else {
        fallback();
      }
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

    /* 兼容 web（本地时间字符串）与静态版（ISO UTC）两种发布时间的表单回填 */
    function noticeTimeInput(v) {
      if (!v) return '';
      if (/Z$|[+-]\d\d:\d\d$/.test(String(v))) {
        var d = new Date(v);
        if (isNaN(d.getTime())) return '';
        function p(n) { return n < 10 ? '0' + n : String(n); }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
      }
      return String(v).replace(' ', 'T').slice(0, 16);
    }
  };
})();
