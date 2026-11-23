/* P19 管理端 — 任务管理 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-tasks'] = function (ctx) {
    var focusTask = (ctx && ctx.params && ctx.params.task) || '';
    var state = {
      tab: focusTask ? 'instances' : 'templates',
      templates: [],
      cycle: '',
      kindId: '',
      kinds: [],
      isSuper: false,
      collapsed: {},
      pendingReview: 0,
      date: '',
      status: focusTask ? 'all' : 'submitted',
      rows: [],
      counts: {},
      staffOptions: [],
      store: api.storeInfo() || { code: '', shortName: '' }
    };

    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '按一次性/日/周/月循环下发门店任务，店员上传返图后在此审核；管理组与店长均可创建与审核。' }),
      U.el('div', { class: 'page-actions' })
    ]);
    var newBtn = U.el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      html: UI.icon('plus', 15) + '<span>新建任务</span>',
      onclick: function () { openForm(null); }
    });
    head.querySelector('.page-actions').appendChild(newBtn);
    content.appendChild(head);

    var tabs = U.el('div', { class: 'tabs' });
    var tabTpl = U.el('button', { class: 'tab' + (focusTask ? '' : ' active'), type: 'button', 'data-tab': 'templates', text: '任务模板' });
    var tabRun = U.el('button', { class: 'tab' + (focusTask ? ' active' : ''), type: 'button', 'data-tab': 'instances' });
    tabRun.appendChild(U.el('span', { text: '执行与审核' }));
    var tabBadge = U.el('span', { class: 'badge badge-danger', style: { marginLeft: '4px', display: 'none' }, text: '0' });
    tabRun.appendChild(tabBadge);
    var tabKind = U.el('button', { class: 'tab', type: 'button', 'data-tab': 'kinds', text: '任务类型' });
    tabKind.style.display = 'none';
    tabTpl.addEventListener('click', function () { switchTab('templates'); });
    tabRun.addEventListener('click', function () { switchTab('instances'); });
    tabKind.addEventListener('click', function () { switchTab('kinds'); });
    tabs.appendChild(tabTpl);
    tabs.appendChild(tabRun);
    tabs.appendChild(tabKind);
    content.appendChild(tabs);

    var panel = U.el('div');
    content.appendChild(panel);

    Layout.adminShell({ title: '任务管理', active: 'admin-tasks' }, content);

    if (focusTask) loadInstances(); else loadTemplates();

    /* 个人任务指派对象：在职员工 */
    api.listStaff({ status: 'active', includeResigned: false, page: 1, pageSize: 999 }).then(function (res) {
      state.staffOptions = res.list || [];
    }).catch(function () {});
    api.getMe().then(function (me) { state.me = me; }).catch(function () {});
    /* 类型页签仅超管可见：直接落到「执行与审核」时也要先取一次权限 */
    api.taskKinds().then(function (res) {
      state.kinds = res.list || [];
      state.isSuper = !!res.isSuper;
      tabKind.style.display = state.isSuper ? '' : 'none';
    }).catch(function () {});

    function switchTab(tab) {
      if (state.tab === tab) return;
      state.tab = tab;
      Array.prototype.forEach.call(tabs.children, function (b) {
        b.className = 'tab' + (b.getAttribute('data-tab') === tab ? ' active' : '');
      });
      if (tab === 'templates') loadTemplates();
      else if (tab === 'kinds') loadKinds();
      else loadInstances();
    }

    function loadTemplates() {
      panel.innerHTML = '';
      panel.appendChild(UI.skeleton(3));
      api.adminTaskTemplates().then(function (res) {
        state.templates = res.list || [];
        state.pendingReview = res.pendingReview || 0;
        state.store = res.store || state.store;
        state.kinds = res.kinds || [];
        state.isSuper = !!res.isSuper;
        tabKind.style.display = state.isSuper ? '' : 'none';
        paintPending(state.pendingReview);
        paintTemplates(res);
      }).catch(function (e) {
        panel.innerHTML = '';
        panel.appendChild(UI.errorState({ message: e.message, onRetry: loadTemplates }));
      });
    }

    function paintPending(n) {
      if (n > 0) {
        tabBadge.textContent = n > 99 ? '99+' : String(n);
        tabBadge.style.display = '';
      } else {
        tabBadge.style.display = 'none';
      }
    }

    function paintTemplates(res) {
      panel.innerHTML = '';
      var card = U.el('div', { class: 'card' });
      /* 循环类型筛选：按母任务 cycle 过滤，整组（含子任务）一起显示 */
      var filtered = state.templates.filter(function (t) {
        if (state.kindId && (t.kindId || 'sys') !== state.kindId) return false;
        return !state.cycle || t.cycle === state.cycle;
      });
      var childTotal = 0;
      filtered.forEach(function (t) { childTotal += (t.children || []).length; });
      var kindSel = U.el('select', { class: 'select', style: { maxWidth: '150px' } });
      var kindOpts = [{ id: '', name: '全部类型' }].concat(state.kinds.map(function (k) {
        return { id: k.id, name: k.name + (k.enabled === false ? '（已停用）' : '') };
      }));
      kindOpts.forEach(function (o) {
        kindSel.appendChild(U.el('option', { value: o.id, text: o.name }));
      });
      kindSel.value = state.kindId || '';
      kindSel.addEventListener('change', function () {
        state.kindId = this.value;
        paintTemplates();
      });
      var cycleSel = U.el('select', { class: 'select', style: { maxWidth: '150px' } });
      [['', '全部循环'], ['daily', '日任务'], ['weekly', '周任务'], ['monthly', '月任务'], ['once', '次任务']].forEach(function (o) {
        cycleSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
      });
      cycleSel.value = state.cycle || '';
      cycleSel.addEventListener('change', function () {
        state.cycle = this.value;
        paintTemplates();
      });
      var toolbar = U.el('div', { class: 'toolbar' }, [
        U.el('span', { class: 'small muted', text: '共 ' + (filtered.length + childTotal) + ' 个任务（含 ' + childTotal + ' 个子任务）· 近 30 天完成率按已通过期数计算' }),
        U.el('span', { class: 'spacer' }),
        kindSel,
        cycleSel,
        U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('refresh', 15),
          onclick: function () { loadTemplates(); }
        })
      ]);
      card.appendChild(toolbar);

      if (!state.templates.length) {
        card.appendChild(UI.emptyState({
          icon: 'clipboard', title: '还没有任务模板',
          desc: '点击右上角「新建任务」创建第一条循环任务。'
        }));
        panel.appendChild(card);
        return;
      }

      if (!filtered.length) {
        card.appendChild(UI.emptyState({
          icon: 'clipboard', title: '没有符合条件的任务',
          desc: '当前循环类型下没有任务模板，切换为「全部循环」或新建任务。'
        }));
        panel.appendChild(card);
        return;
      }

      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '980px' } });
      table.innerHTML = '<thead><tr><th>任务</th><th>循环规则</th><th>生效日期</th><th>适用门店</th><th>状态</th>' +
        '<th>近 30 天</th><th>本期</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');

      filtered.forEach(function (t) {
        tbody.appendChild(templateRow(t, false));
        if (t.isGroup && !state.collapsed[t.id]) {
          (t.children || []).forEach(function (c) { tbody.appendChild(templateRow(c, true)); });
        }
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      card.appendChild(wrap);
      panel.appendChild(card);
    }

    /* ---------- 任务类型字典（仅超管） ---------- */
    function loadKinds() {
      panel.innerHTML = '';
      panel.appendChild(UI.skeleton(3));
      api.taskKinds().then(function (res) {
        state.kinds = res.list || [];
        state.isSuper = !!res.isSuper;
        tabKind.style.display = state.isSuper ? '' : 'none';
        paintKinds();
      }).catch(function (e) {
        panel.innerHTML = '';
        panel.appendChild(UI.errorState({ message: e.message, onRetry: loadKinds }));
      });
    }

    function paintKinds() {
      panel.innerHTML = '';
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'toolbar' }, [
        U.el('span', {
          class: 'small muted',
          text: '共 ' + state.kinds.length + ' 个类型 · 内置「系统任务」不可删除、不可停用；被任务模板引用时只能停用。'
        }),
        U.el('span', { class: 'spacer' }),
        U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('refresh', 15),
          onclick: function () { loadKinds(); }
        })
      ]));

      var nameInput = U.el('input', {
        class: 'input', maxLength: 20, placeholder: '新类型名称（2–20 字）', style: { maxWidth: '220px' }
      });
      var sortInput = U.el('input', {
        class: 'input', type: 'number', min: 0, max: 999,
        value: state.kinds.reduce(function (m, k) { return Math.max(m, Number(k.sortOrder) || 0); }, 0) + 1,
        style: { maxWidth: '100px' }
      });
      var addBtn = U.el('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: '新增类型',
        onclick: function () {
          var name = String(nameInput.value || '').trim();
          if (name.length < 2 || name.length > 20) { UI.toast('类型名称需 2–20 个字', 'error'); return; }
          UI.btnLoading(addBtn, true, '保存中…');
          api.saveTaskKind({ name: name, sortOrder: parseInt(sortInput.value, 10) || 0 }).then(function () {
            UI.btnLoading(addBtn, false);
            UI.toast('类型已新增', 'success');
            loadKinds();
          }).catch(function (e) {
            UI.btnLoading(addBtn, false);
            UI.toast(e.message, 'error');
          });
        }
      });
      card.appendChild(U.el('div', {
        class: 'toolbar', style: { alignItems: 'flex-end', flexWrap: 'wrap' }
      }, [
        U.el('div', { class: 'field', style: { margin: '0' } }, [U.el('label', { class: 'label', text: '类型名称' }), nameInput]),
        U.el('div', { class: 'field', style: { margin: '0' } }, [U.el('label', { class: 'label', text: '排序' }), sortInput]),
        addBtn
      ]));

      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '640px' } });
      table.innerHTML = '<thead><tr><th>类型名称</th><th>排序</th><th>状态</th><th>引用模板</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      var sorted = state.kinds.slice().sort(function (a, b) {
        var sa = Number(a.sortOrder) || 0, sb = Number(b.sortOrder) || 0;
        if (sa !== sb) return sa - sb;
        return String(a.name).localeCompare(String(b.name));
      });

      sorted.forEach(function (k, idx) {
        var tr = U.el('tr');
        var nameCell = U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
          U.el('span', { class: 'strong', text: k.name })
        ]);
        if (k.builtin) nameCell.appendChild(UI.badge('内置', 'brand'));
        tr.appendChild(U.el('td', {}, [nameCell]));
        tr.appendChild(U.el('td', { class: 'small', text: String(k.sortOrder) }));
        tr.appendChild(U.el('td', {}, [
          UI.badge(k.enabled ? '启用' : '停用', k.enabled ? 'success' : 'muted')
        ]));
        tr.appendChild(U.el('td', {
          class: 'small',
          text: k.usage > 0 ? k.usage + ' 个模板' : '未被引用'
        }));

        var ops = U.el('div', { class: 'table-actions' });
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '上移',
          onclick: function () { moveKind(k, -1); }
        }));
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '下移',
          onclick: function () { moveKind(k, 1); }
        }));
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '改名',
          onclick: function () { renameKind(k); }
        }));
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: k.enabled ? '停用' : '启用',
          style: k.builtin ? { opacity: '.45', cursor: 'not-allowed' } : null,
          onclick: function () { toggleKind(k); }
        }));
        ops.appendChild(U.el('button', {
          class: 'btn-text danger', type: 'button', text: '删除',
          style: k.builtin ? { opacity: '.45', cursor: 'not-allowed' } : null,
          onclick: function () { removeKind(k); }
        }));
        tr.appendChild(U.el('td', {}, [ops]));
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      card.appendChild(wrap);
      panel.appendChild(card);
    }

    function moveKind(k, dir) {
      var sorted = state.kinds.slice().sort(function (a, b) {
        var sa = Number(a.sortOrder) || 0, sb = Number(b.sortOrder) || 0;
        if (sa !== sb) return sa - sb;
        return String(a.name).localeCompare(String(b.name));
      });
      var idx = sorted.map(function (x) { return x.id; }).indexOf(k.id);
      var other = sorted[idx + dir];
      if (!other) return;
      var a = Number(k.sortOrder) || 0;
      var b = Number(other.sortOrder) || 0;
      var bs = a === b ? (dir < 0 ? a - 1 : a + 1) : b;
      api.saveTaskKind({ id: k.id, name: k.name, sortOrder: bs, enabled: k.enabled }).then(function () {
        return api.saveTaskKind({ id: other.id, name: other.name, sortOrder: a, enabled: other.enabled });
      }).then(function () {
        loadKinds();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function renameKind(k) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML = '<div class="field"><label class="label">类型名称 <i class="req">*</i></label>' +
        '<input class="input" name="name" maxlength="20" value="' + esc(k.name) + '">' +
        '<div class="hint">2–20 个字，名称不可重复。</div></div>';
      UI.openModal({
        title: '修改类型名称',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var name = String(new FormData(form).get('name') || '').trim();
              if (name.length < 2 || name.length > 20) { UI.toast('类型名称需 2–20 个字', 'error'); return false; }
              UI.btnLoading(btn, true, '保存中…');
              api.saveTaskKind({ id: k.id, name: name, sortOrder: k.sortOrder, enabled: k.enabled }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已保存', 'success');
                loadKinds();
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

    function toggleKind(k) {
      if (k.builtin) { UI.toast('内置类型不可停用', 'error'); return; }
      var next = !k.enabled;
      UI.confirm({
        title: next ? '启用类型' : '停用类型',
        message: next
          ? '启用后新建任务时可在该类型下选择。'
          : '停用后新建任务时不可选择该类型，已有任务仍照常展示其类型名。',
        confirmText: next ? '启用' : '停用'
      }).then(function (yes) {
        if (!yes) return;
        api.saveTaskKind({ id: k.id, name: k.name, sortOrder: k.sortOrder, enabled: next }).then(function () {
          UI.toast(next ? '已启用' : '已停用', 'success');
          loadKinds();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function removeKind(k) {
      if (k.builtin) { UI.toast('内置类型不可删除', 'error'); return; }
      if (k.usage > 0) { UI.toast('该类型已被 ' + k.usage + ' 个任务模板引用，不能删除，请改为停用', 'error'); return; }
      UI.confirm({
        title: '删除类型',
        message: '确认删除类型「' + k.name + '」？删除后不可恢复。',
        confirmText: '删除'
      }).then(function (yes) {
        if (!yes) return;
        api.deleteTaskKind(k.id).then(function () {
          UI.toast('已删除', 'success');
          loadKinds();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    /* 单行模板：isChild 为子任务（缩进展示），母任务可折叠展开 */
    function templateRow(t, isChild) {
      var tr = U.el('tr');
      var titleBox = U.el('div', { style: isChild ? { paddingLeft: '22px', position: 'relative' } : null });
      if (isChild) {
        titleBox.appendChild(U.el('span', {
          class: 'small muted',
          style: { position: 'absolute', left: '4px', top: '0' },
          text: '└'
        }));
      }
      var titleLine = U.el('div', { class: 'strong', style: { display: 'flex', alignItems: 'center', gap: '6px' } });
      if (!isChild && t.isGroup) {
        var caret = U.el('button', {
          class: 'btn-text', type: 'button',
          style: { padding: '0 2px', fontSize: '12px', minWidth: '16px' },
          text: state.collapsed[t.id] ? '▸' : '▾'
        });
        caret.addEventListener('click', function () {
          state.collapsed[t.id] = !state.collapsed[t.id];
          paintTemplates();
        });
        titleLine.appendChild(caret);
      }
      titleLine.appendChild(U.el('span', { text: t.title }));
      if (t.kindId && t.kindId !== 'sys') titleLine.appendChild(UI.badge(t.kindName || '类型', 'info'));
      if (!isChild && t.isGroup) titleLine.appendChild(UI.badge('分组 ' + t.childCount, 'brand'));
      if (t.completionMode === 'confirm') titleLine.appendChild(UI.badge('仅需确认', 'info'));
      titleLine.appendChild(UI.badge(t.completionScope === 'all' ? '全员提交' : '任意一人', t.completionScope === 'all' ? 'warn' : 'muted'));
      if (t.assigneeName) {
        var assigneeLabel = (!isChild && t.isGroup)
          ? '组默认 · ' + t.assigneeName
          : (isChild
            ? (t.assigneeOverride ? '单独 · ' : '继承 · ') + t.assigneeName
            : '个人 · ' + t.assigneeName);
        titleLine.appendChild(UI.badge(assigneeLabel, 'warn'));
      }
      titleBox.appendChild(titleLine);
      titleBox.appendChild(U.el('div', {
        class: 'small muted',
        style: { maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
        text: t.content
      }));
      tr.appendChild(U.el('td', {}, [titleBox]));
      tr.appendChild(U.el('td', { class: 'small' }, [
        U.el('div', { text: t.cycleLabel }),
        U.el('div', { class: 'muted', style: { marginTop: '2px' }, text: '发布 ' + (t.publishTime || '00:00') + ' · 截止 ' + (t.deadlineTime || '23:59') })
      ]));
      tr.appendChild(U.el('td', { class: 'small', text: t.startDate + (t.endDate ? ' ~ ' + t.endDate : ' 起长期') }));
      tr.appendChild(U.el('td', { class: 'small', text: t.storeCodes ? t.storeCodes : '全部门店' }));
      tr.appendChild(U.el('td', {}, [
        UI.badge(t.status === 'enabled' ? '启用' : '停用', t.status === 'enabled' ? 'success' : 'muted')
      ]));

      var agg = t.stats || { total: 0, approved: 0 };
      if (!isChild && t.isGroup) {
        agg = { total: 0, approved: 0 };
        (t.children || []).forEach(function (c) {
          agg.total += (c.stats || {}).total || 0;
          agg.approved += (c.stats || {}).approved || 0;
        });
      }
      tr.appendChild(U.el('td', {
        class: 'small',
        text: agg.total ? (Math.round(agg.approved * 1000 / agg.total) / 10 + '%（' + agg.approved + '/' + agg.total + '）') : '—'
      }));
      tr.appendChild(U.el('td', {}, [isChild ? todayBadge(t) : groupTodayBadge(t)]));

      var ops = U.el('div', { class: 'table-actions' });
      if (!isChild && t.isGroup) {
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '新建子任务',
          onclick: function () { openForm(null, t.id); }
        }));
      } else {
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '完成率',
          onclick: function () { openStats(t); }
        }));
      }
      ops.appendChild(U.el('button', {
        class: 'btn-text', type: 'button', text: '编辑',
        onclick: function () { openForm(t); }
      }));
      ops.appendChild(U.el('button', {
        class: 'btn-text', type: 'button', text: t.status === 'enabled' ? '停用' : '启用',
        onclick: function () { toggle(t); }
      }));
      ops.appendChild(U.el('button', {
        class: 'btn-text danger', type: 'button', text: '删除',
        onclick: function () { remove(t); }
      }));
      var td = U.el('td');
      td.appendChild(ops);
      tr.appendChild(td);
      return tr;
    }

    /* 母任务本期进度：子任务当日已通过数 / 当日子任务实例总数 */
    function groupTodayBadge(t) {
      var g = t.groupToday || { total: 0, approved: 0, done: false, text: '—' };
      if (!g.total) return U.el('span', { class: 'small muted', text: '今日无任务' });
      return UI.badge(g.done ? ('已完成 ' + g.text) : ('进度 ' + g.text), g.done ? 'success' : 'info');
    }

    function todayBadge(t) {
      if (!t.todayStatus) return U.el('span', { class: 'small muted', text: '今日无任务' });
      var map = { pending: ['待完成', 'warn'], submitted: ['待审核', 'info'], approved: ['已通过', 'success'], rejected: ['已驳回', 'danger'], overdue: ['已逾期', 'danger'] };
      var m = map[t.todayStatus] || ['—', 'muted'];
      var box = U.el('div', {}, [UI.badge(m[0], m[1])]);
      if (t.todaySubmitter) box.appendChild(U.el('div', { class: 'small muted', style: { marginTop: '2px' }, text: t.todaySubmitter }));
      return box;
    }

    function loadInstances() {
      panel.innerHTML = '';
      panel.appendChild(UI.skeleton(3));
      api.adminTaskInstances({ date: state.date, status: state.status }).then(function (res) {
        state.rows = res.list || [];
        state.counts = res.counts || {};
        paintPending(res.pendingReview || 0);
        paintInstances(res);
      }).catch(function (e) {
        panel.innerHTML = '';
        panel.appendChild(UI.errorState({ message: e.message, onRetry: loadInstances }));
      });
    }

    function paintInstances(res) {
      panel.innerHTML = '';
      var card = U.el('div', { class: 'card' });
      var toolbar = U.el('div', { class: 'toolbar' });

      var dateInput = U.el('input', { class: 'input', type: 'date', value: state.date, style: { maxWidth: '170px' } });
      dateInput.addEventListener('change', function () {
        state.date = this.value;
        loadInstances();
      });
      toolbar.appendChild(U.el('span', { class: 'small muted', text: '期间日期' }));
      toolbar.appendChild(dateInput);
      toolbar.appendChild(U.el('button', {
        class: 'btn-text', type: 'button', text: '全部日期',
        onclick: function () { state.date = ''; loadInstances(); }
      }));

      var statusSel = U.el('select', { class: 'select', style: { maxWidth: '150px' } });
      [['submitted', '待审核'], ['all', '全部状态'], ['pending', '待完成'], ['overdue', '已逾期'], ['approved', '已通过'], ['rejected', '已驳回']].forEach(function (o) {
        statusSel.appendChild(U.el('option', { value: o[0], text: o[1], selected: state.status === o[0] }));
      });
      statusSel.addEventListener('change', function () {
        state.status = this.value;
        loadInstances();
      });
      toolbar.appendChild(statusSel);
      toolbar.appendChild(U.el('span', { class: 'spacer' }));
      toolbar.appendChild(U.el('span', {
        class: 'small muted',
        text: '待完成 ' + (state.counts.pending || 0) + ' · 逾期 ' + (state.counts.overdue || 0) +
          ' · 待审核 ' + (state.counts.submitted || 0) +
          ' · 已通过 ' + (state.counts.approved || 0) + ' · 已驳回 ' + (state.counts.rejected || 0)
      }));
      card.appendChild(toolbar);

      if (!state.rows.length) {
        card.appendChild(UI.emptyState({
          icon: 'check', title: '没有符合条件的任务',
          desc: '调整期间日期或状态筛选后再试。'
        }));
        panel.appendChild(card);
        return;
      }

      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table', style: { minWidth: '960px' } });
      table.innerHTML = '<thead><tr><th>任务</th><th>期间</th><th>状态</th><th>提交人</th><th>提交时间</th>' +
        '<th>返图</th><th>审核</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');

      state.rows.forEach(function (r) {
        var tr = U.el('tr');
        tr.setAttribute('data-task-id', r.id);
        if (focusTask && String(r.id) === String(focusTask)) {
          tr.style.background = 'rgba(225,6,0,0.06)';
          setTimeout(function () {
            if (tr.scrollIntoView) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 80);
        }
        tr.appendChild(U.el('td', {}, [
          U.el('div', { class: 'strong', text: r.title }),
          r.groupTitle ? U.el('div', { class: 'small muted', text: '分组：' + r.groupTitle }) : null,
          U.el('div', { class: 'small muted', text: r.cycleLabel })
        ]));
        tr.appendChild(U.el('td', { class: 'small', text: U.fmtDate(r.periodDate) }));
        tr.appendChild(U.el('td', {}, [UI.badge(r.statusLabel, statusCls(r.status))]));
        tr.appendChild(U.el('td', { class: 'small', text: r.submitterName || '—' }));
        tr.appendChild(U.el('td', { class: 'small', text: r.submittedAt ? U.fmtTime(r.submittedAt) : '—' }));
        tr.appendChild(U.el('td', {}, [thumbCell(r)]));
        tr.appendChild(U.el('td', {}, [
          r.reviewedBy
            ? U.el('div', {}, [
              U.el('div', { class: 'small', text: r.reviewedBy }),
              U.el('div', { class: 'small muted', text: U.fmtTime(r.reviewedAt) }),
              r.rejectReason ? U.el('div', { class: 'small', style: { color: 'var(--danger)' }, text: r.rejectReason }) : null
            ])
            : U.el('span', { class: 'small muted', text: '—' })
        ]));

        var ops = U.el('div', { class: 'table-actions' });
        if (r.status === 'submitted') {
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '通过',
            onclick: function () { review(r, 'approve'); }
          }));
          ops.appendChild(U.el('button', {
            class: 'btn-text danger', type: 'button', text: '驳回',
            onclick: function () { openReject(r); }
          }));
        }
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '详情',
          onclick: function () { openDetail(r); }
        }));
        var td = U.el('td');
        td.appendChild(ops);
        tr.appendChild(td);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      card.appendChild(wrap);
      panel.appendChild(card);
    }

    function statusCls(s) {
      return s === 'approved' ? 'success'
        : (s === 'rejected' || s === 'overdue' ? 'danger' : (s === 'submitted' ? 'info' : 'warn'));
    }

    function thumbCell(r) {
      if (!r.images || !r.images.length) return U.el('span', { class: 'small muted', text: '—' });
      var box = U.el('div', { style: { display: 'flex', gap: '4px' } });
      r.images.slice(0, 3).forEach(function (key, i) {
        var img = U.el('img', {
          alt: '返图',
          style: { width: '38px', height: '38px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--line)' }
        });
        api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
        img.addEventListener('click', function () {
          api.getFileUrl(key).then(function (url) {
            if (url) UI.imageViewer({ url: url, title: r.title + ' · 返图 ' + (i + 1) });
          });
        });
        box.appendChild(img);
      });
      if (r.images.length > 3) box.appendChild(U.el('span', { class: 'small muted', text: '+' + (r.images.length - 3) }));
      return box;
    }

    /* ---------- 模板表单 ---------- */
    function openForm(t, presetParentId) {
      var editing = !!t;
      var canBeChild = !(t && t.isGroup);
      var currentParent = t ? (t.parentId || '') : (presetParentId || '');
      var topLevel = state.templates.filter(function (x) { return !t || x.id !== t.id; });
      var parentField;
      if (canBeChild) {
        parentField =
          '<div class="field"><label class="label">任务归属</label>' +
          '<select class="select" name="parentId">' +
          '<option value=""' + (currentParent ? '' : ' selected') + '>独立任务（顶层）</option>' +
          topLevel.map(function (x) {
            return '<option value="' + esc(x.id) + '"' + (currentParent === x.id ? ' selected' : '') + '>作为子任务 · ' + esc(x.title) +
              (x.isGroup ? '（已有 ' + x.childCount + ' 个子任务）' : '') + '</option>';
          }).join('') +
          '</select>' +
          '<div class="hint" data-parent-hint>选择母任务后本任务不再生成独立实例，循环规则、生效日期、适用门店与启停状态全部继承母任务。</div></div>';
      } else {
        parentField = '<div class="field"><label class="label">任务归属</label>' +
          '<input type="hidden" name="parentId" value="">' +
          '<div class="hint">该任务已有子任务，只能作为母任务；新增子任务请在该行点击「新建子任务」。</div></div>';
      }
      var canAssign = !!(state.me && (state.me.position === '店长' || state.me.position === '店助'));
      var modeField =
        '<div class="field"><label class="label">完成方式</label>' +
        '<select class="select" name="completionMode">' +
        '<option value="upload"' + ((!t || t.completionMode !== 'confirm') ? ' selected' : '') + '>附件上传（需上传返图，管理员审核）</option>' +
        '<option value="confirm"' + (t && t.completionMode === 'confirm' ? ' selected' : '') + '>仅需确认（员工点击完成即可）</option>' +
        '</select>' +
        '<div class="hint">仅需确认适用于检查、签到等无需留档的任务。</div></div>';
      var currentIsChild = !!currentParent;
      var parentRow = currentIsChild ? state.templates.filter(function (x) { return x.id === currentParent; })[0] : null;
      var scopeVal = (t && t.completionScope) ? t.completionScope
        : (parentRow && parentRow.completionScope === 'all' ? 'all' : 'any');
      var scopeField =
        '<div class="field" data-own="scope"><label class="label">提交方式</label>' +
        '<select class="select" name="completionScope">' +
        '<option value="any"' + (scopeVal !== 'all' ? ' selected' : '') + '>任意一人提交即可（默认）</option>' +
        '<option value="all"' + (scopeVal === 'all' ? ' selected' : '') + '>全员提交才算完成</option>' +
        '</select>' +
        '<div class="hint">全员模式：每位执行人都需提交，全部完成后整条任务才完成；已提交的人不再看到该任务。子任务强制继承母任务。</div></div>';
      var inheritSelected = currentIsChild && (!t || !t.assigneeOverride);
      var assigneeField = canAssign
        ? '<div class="field" data-assignee-field><label class="label">指派给</label>' +
          '<select class="select" name="assigneeId">' +
          '<option value="inherit" data-role="inherit"' + (inheritSelected ? ' selected' : '') + '>继承母任务（默认：公共任务）</option>' +
          '<option value="" data-role="public"' + (!inheritSelected && !(t && t.assigneeId) ? ' selected' : '') + '>全店员工（公共任务）</option>' +
          state.staffOptions.map(function (s) {
            return '<option value="' + esc(s.id) + '"' + (!inheritSelected && t && t.assigneeId === s.id ? ' selected' : '') + '>' +
              esc(s.displayName || s.name) + ' · ' + esc(s.position) + '</option>';
          }).join('') +
          '</select>' +
          '<div class="hint" data-assignee-hint></div></div>'
        : '<input type="hidden" name="assigneeId" value="' + esc(inheritSelected ? '' : (t ? (t.assigneeId || '') : '')) + '">' +
          '<input type="hidden" name="assigneeMode" value="' + (inheritSelected ? 'inherit' : 'self') + '">';
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      var cycles = [['once', '一次性'], ['daily', '日循环'], ['weekly', '周循环'], ['monthly', '月循环']];
      var wd = [[1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'], [5, '周五'], [6, '周六'], [7, '周日']];
      var pickedWd = (t && t.cycle === 'weekly' && t.weekdays) ? t.weekdays : [];
      var currentKindId = t ? (t.kindId || 'sys') : 'sys';
      var kindSelectHtml = state.kinds.filter(function (k) {
        return k.enabled !== false || (t && (t.kindId || 'sys') === k.id);
      }).map(function (k) {
        return '<option value="' + esc(k.id) + '"' + (currentKindId === k.id ? ' selected' : '') + '>' +
          esc(k.name) + (k.enabled === false ? '（已停用）' : '') + '</option>';
      }).join('');
      if (!kindSelectHtml) kindSelectHtml = '<option value="sys">系统任务</option>';

      form.innerHTML =
        '<div class="field"><label class="label">任务标题 <i class="req">*</i></label>' +
        '<input class="input" name="title" maxlength="60" placeholder="如：晚班闭店清洁" value="' + esc(t ? t.title : '') + '"></div>' +
        '<div class="field"><label class="label">具体内容 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="content" rows="4" maxlength="2000" placeholder="写清完成标准与注意事项">' + esc(t ? t.content : '') + '</textarea></div>' +
        '<div class="field" data-own="kind"><label class="label">类型</label>' +
        '<select class="select" name="kindId">' + kindSelectHtml + '</select>' +
        '<div class="hint">类型由超管在「任务类型」页签维护；停用类型不出现在新建选项中，已有任务仍展示原类型名。</div></div>' +
        parentField +
        modeField +
        scopeField +
        '<div class="field" data-own="schedule"><label class="label">发布与截止时间 <i class="req">*</i></label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<input class="input" type="time" name="publishTime" value="' + esc(t ? (t.publishTime || '00:00') : '00:00') + '" style="max-width:130px">' +
        '<span class="small muted">发布</span>' +
        '<input class="input" type="time" name="deadlineTime" value="' + esc(t ? (t.deadlineTime || '23:59') : '23:59') + '" style="max-width:130px">' +
        '<span class="small muted">截止</span>' +
        '</div><div class="hint">按任务期次当天生效；截止必须晚于发布（同一天内）。到点后员工端才可见，超过截止未完成自动转逾期。</div></div>' +
        assigneeField +
        '<div class="field" data-own="cycle"><label class="label">循环规则 <i class="req">*</i></label>' +
        '<select class="select" name="cycle">' + cycles.map(function (c) {
          return '<option value="' + c[0] + '"' + ((t ? t.cycle === c[0] : c[0] === 'daily') ? ' selected' : '') + '>' + c[1] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field" data-weekly><label class="label">星期几（可多选） <i class="req">*</i></label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;">' + wd.map(function (w) {
          var checked = pickedWd.indexOf(w[0]) >= 0 ? ' checked' : '';
          return '<label style="font-weight:400;"><input type="checkbox" name="wd" value="' + w[0] + '"' + checked + '> ' + w[1] + '</label>';
        }).join('') + '</div>' +
        '<div class="hint">可多选，如同时勾选周一、周四，则每周生成两期任务。</div></div>' +
        '<div class="field" data-monthly><label class="label">每月几号 <i class="req">*</i></label>' +
        '<select class="select" name="monthDay">' + dayOptions(t ? t.monthDay : 1) + '</select>' +
        '<div class="hint">当月没有该日期时自动取当月最后一天（如 31 号在小月按 30 号）。</div></div>' +
        '<div class="field" data-own="dates"><label class="label">生效日期 <i class="req">*</i></label>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
        '<input class="input" type="date" name="startDate" value="' + esc(t ? t.startDate : U.today()) + '">' +
        '<span class="small muted">至</span>' +
        '<input class="input" type="date" name="endDate" value="' + esc(t ? t.endDate : '') + '">' +
        '</div><div class="hint">结束日期留空表示长期有效。</div></div>' +
        '<div class="field" data-own="store"><label class="label">适用门店</label>' +
        '<select class="select" name="storeCodes">' +
        '<option value=""' + ((!t || !t.storeCodes) ? ' selected' : '') + '>全部门店</option>' +
        '<option value="' + esc(state.store.code || '') + '"' + (t && t.storeCodes === state.store.code ? ' selected' : '') + '>' +
        esc((state.store.shortName || '本门店') + '（' + (state.store.code || '') + '）') + '</option>' +
        '</select></div>' +
        '<div class="field" data-own="status"><label class="label">状态</label>' +
        '<select class="select" name="status">' +
        '<option value="enabled"' + ((!t || t.status === 'enabled') ? ' selected' : '') + '>启用</option>' +
        '<option value="disabled"' + (t && t.status === 'disabled' ? ' selected' : '') + '>停用</option>' +
        '</select></div>';

      /* 拍摄示例图：供员工参考，最多 3 张；不参与完成 / 逾期判定 */
      var sampleKeys = (t && t.sampleImages) ? t.sampleImages.slice(0, 3) : [];
      var sampleField = U.el('div', { class: 'field' });
      sampleField.appendChild(U.el('label', { class: 'label', text: '拍摄示例图' }));
      sampleField.appendChild(U.el('div', {
        class: 'hint',
        text: '供员工拍摄时参考，不参与完成 / 逾期判定；支持 JPG / PNG / WEBP，单张不超过 10MB，最多 3 张（建议 1 张）。'
      }));
      var sampleRow = U.el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } });
      var sampleInput = U.el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, style: { display: 'none' } });
      var sampleAdd = U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('upload', 15) + '<span>添加示例图</span>'
      });
      sampleAdd.addEventListener('click', function () { sampleInput.click(); });
      sampleField.appendChild(sampleAdd);
      sampleField.appendChild(sampleInput);
      sampleField.appendChild(sampleRow);

      function paintSamples() {
        sampleRow.innerHTML = '';
        sampleKeys.forEach(function (key, i) {
          var cell = U.el('div', { style: { position: 'relative', width: '62px' } });
          var img = U.el('img', {
            alt: '示例图',
            style: { width: '62px', height: '62px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--line)', background: '#F4F5F6', cursor: 'pointer' }
          });
          api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
          img.addEventListener('click', function () {
            api.getFileUrl(key).then(function (url) {
              if (url) UI.imageViewer({ url: url, title: '拍摄示例图 ' + (i + 1) });
            });
          });
          var del = U.el('button', {
            type: 'button', text: '×', title: '移除',
            style: {
              position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', padding: '0',
              borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', color: 'var(--danger)',
              fontSize: '13px', lineHeight: '18px', cursor: 'pointer'
            }
          });
          del.addEventListener('click', function () {
            sampleKeys.splice(i, 1);
            paintSamples();
          });
          cell.appendChild(img);
          cell.appendChild(del);
          sampleRow.appendChild(cell);
        });
        sampleAdd.disabled = sampleKeys.length >= 3;
      }
      paintSamples();

      sampleInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(sampleInput.files || []);
        sampleInput.value = '';
        if (!files.length) return;
        sampleAdd.disabled = true;
        var chain = Promise.resolve();
        files.forEach(function (file) {
          chain = chain.then(function () {
            if (sampleKeys.length >= 3) return null;
            var ext = String(file.name || '').split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) < 0) {
              UI.toast('示例图仅支持 JPG / PNG / WEBP', 'error');
              return null;
            }
            if (file.size > 10 * 1024 * 1024) {
              UI.toast('示例图单张不能超过 10MB', 'error');
              return null;
            }
            return api.uploadFile(file, 'photo').then(function (res) {
              if (!res || !res.key) return null;
              if (sampleKeys.indexOf(res.key) < 0) sampleKeys.push(res.key);
              paintSamples();
              return null;
            }).catch(function (e) { UI.toast(e.message, 'error'); });
          });
        });
        chain.then(function () { paintSamples(); });
      });

      var modeEl = form.querySelector('[name=completionMode]');
      var modeWrap = modeEl ? modeEl.closest('.field') : null;
      if (modeWrap && modeWrap.parentNode) modeWrap.parentNode.insertBefore(sampleField, modeWrap.nextSibling);
      else form.appendChild(sampleField);

      var cycleSel = form.querySelector('[name=cycle]');
      var weeklyBox = form.querySelector('[data-weekly]');
      var monthlyBox = form.querySelector('[data-monthly]');
      function syncCycle() {
        weeklyBox.style.display = cycleSel.value === 'weekly' ? '' : 'none';
        monthlyBox.style.display = cycleSel.value === 'monthly' ? '' : 'none';
      }
      cycleSel.addEventListener('change', syncCycle);
      syncCycle();

      /* 选了母任务则隐藏自有循环/日期/门店/状态，展示继承说明 */
      var parentSel = form.querySelector('[name=parentId]');
      var parentHint = form.querySelector('[data-parent-hint]');
      var ownFields = ['kind', 'cycle', 'dates', 'store', 'status', 'schedule', 'scope'].map(function (k) {
        return form.querySelector('[data-own=' + k + ']');
      }).concat([weeklyBox, monthlyBox]);
      var assigneeSel = form.querySelector('[name=assigneeId]');
      var assigneeHint = form.querySelector('[data-assignee-hint]');
      function syncParent() {
        var has = !!(parentSel && parentSel.value);
        ownFields.forEach(function (el) { if (el) el.style.display = has ? 'none' : ''; });
        if (!has) syncCycle();
        if (assigneeSel && assigneeSel.tagName === 'SELECT') {
          var inheritOpt = assigneeSel.querySelector('[data-role=inherit]');
          var publicOpt = assigneeSel.querySelector('[data-role=public]');
          var parentRow = has ? state.templates.filter(function (x) { return x.id === parentSel.value; })[0] : null;
          var defName = parentRow && parentRow.assigneeName ? parentRow.assigneeName : '公共任务';
          if (inheritOpt) {
            inheritOpt.style.display = has ? '' : 'none';
            inheritOpt.textContent = '继承母任务（默认：' + defName + '）';
          }
          if (publicOpt) publicOpt.style.display = has ? 'none' : '';
          var val = assigneeSel.value;
          if (has && (val === '' || val === 'inherit')) assigneeSel.value = inheritOpt ? 'inherit' : '';
          if (!has && val === 'inherit') assigneeSel.value = '';
          if (assigneeHint) {
            assigneeHint.textContent = has
              ? '默认继承母任务指派人；单独选择员工后以本子任务为准，母任务调整时不再覆盖。留空继承母任务的公共/个人设置。'
              : (t && t.isGroup
                ? '作为组内未单独指定子任务的默认指派人；已单独指定的子任务不受影响。留空为公共分组。'
                : '个人任务仅被指派人可见并可完成；留空为全店公共任务。');
          }
        }
        if (parentHint) {
          var opt = parentSel && parentSel.options[parentSel.selectedIndex];
          parentHint.textContent = has
            ? '子任务将继承「' + String(opt.text).replace('作为子任务 · ', '').replace(/（已有 \d+ 个子任务）$/, '') +
              '」的循环规则、生效日期、适用门店与启停状态，保存后自动补齐当期实例。'
            : '选择母任务后本任务不再生成独立实例，循环规则、生效日期、适用门店与启停状态全部继承母任务。';
        }
      }
      if (parentSel) parentSel.addEventListener('change', syncParent);
      if (assigneeSel) assigneeSel.addEventListener('change', function () {
        if (assigneeSel.value === 'inherit' && assigneeHint) assigneeHint.textContent = '该子任务继承母任务默认指派人。';
      });
      syncParent();

      UI.openModal({
        title: editing ? '编辑任务' : '新建任务',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var cycle = fd.get('cycle');
              var parentId = String(fd.get('parentId') || '');
              var wdChecked = Array.prototype.slice.call(form.querySelectorAll('[name=wd]')).filter(function (x) { return x.checked; });
              var weekdays = wdChecked.map(function (x) { return parseInt(x.value, 10); });
              var assigneeRaw = String(fd.get('assigneeId') || '');
              var assigneeMode = parentId && (assigneeRaw === 'inherit' || String(fd.get('assigneeMode') || '') === 'inherit') ? 'inherit' : 'self';
              var kindId = String(fd.get('kindId') || 'sys');
              var payload = {
                id: t ? t.id : '',
                parentId: parentId,
                title: String(fd.get('title') || '').trim(),
                content: String(fd.get('content') || '').trim(),
                cycle: cycle,
                weekdays: weekdays,
                monthDay: parseInt(fd.get('monthDay'), 10) || 0,
                startDate: fd.get('startDate'),
                endDate: fd.get('endDate'),
                storeCodes: fd.get('storeCodes') || '',
                status: fd.get('status'),
                completionMode: fd.get('completionMode') || 'upload',
                completionScope: fd.get('completionScope') === 'all' ? 'all' : 'any',
                publishTime: fd.get('publishTime') || '00:00',
                deadlineTime: fd.get('deadlineTime') || '23:59',
                assigneeMode: assigneeMode,
                assigneeId: assigneeMode === 'inherit' ? '' : assigneeRaw,
                sampleImages: sampleKeys.slice(0, 3),
                kindId: kindId
              };
              if (payload.title.length < 2) { UI.toast('任务标题至少 2 个字', 'error'); return false; }
              if (payload.content.length < 2) { UI.toast('请填写任务具体内容', 'error'); return false; }
              if (!parentId) {
                if (!payload.startDate) { UI.toast('请选择生效开始日期', 'error'); return false; }
                if (!payload.publishTime || !payload.deadlineTime) { UI.toast('请设置发布时间与截止时间', 'error'); return false; }
                if (payload.deadlineTime <= payload.publishTime) { UI.toast('截止时间必须晚于发布时间（同一天内）', 'error'); return false; }
                if (cycle === 'weekly' && !weekdays.length) { UI.toast('周循环请至少选择一个星期', 'error'); return false; }
                if (cycle === 'monthly' && !payload.monthDay) { UI.toast('月循环请选择每月几号', 'error'); return false; }
              }
              UI.btnLoading(btn, true, '保存中…');
              api.saveTaskTemplate(payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast(editing ? '已保存' : '任务已创建', 'success');
                loadTemplates();
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

    function dayOptions(current) {
      var out = '';
      for (var i = 1; i <= 31; i++) {
        out += '<option value="' + i + '"' + (Number(current) === i ? ' selected' : '') + '>每月 ' + i + ' 号</option>';
      }
      return out;
    }

    /* ---------- 审核 ---------- */
    function review(r, action, reason) {
      api.reviewTask({ id: r.id, action: action, reason: reason || '' }).then(function () {
        UI.toast(action === 'approve' ? '已通过' : '已驳回', 'success');
        loadInstances();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function openReject(r) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML = '<div class="field"><label class="label">驳回原因 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="reason" rows="3" maxlength="200" placeholder="如：返图不清晰，请重新拍摄操作台"></textarea></div>';
      UI.openModal({
        title: '驳回任务',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认驳回', class: 'btn-danger',
            onClick: function (btn, close) {
              var reason = String(new FormData(form).get('reason') || '').trim();
              if (reason.length < 2) { UI.toast('驳回请填写原因（至少 2 个字）', 'error'); return false; }
              UI.btnLoading(btn, true, '提交中…');
              api.reviewTask({ id: r.id, action: 'reject', reason: reason }).then(function (res) {
                UI.btnLoading(btn, false);
                close();
                UI.toast(res && res.status === 'overdue' ? '已驳回；该期已过截止时间，转为逾期' : '已驳回，店员可重新提交', 'success');
                loadInstances();
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

    function openDetail(r) {
      api.taskDetail(r.id).then(function (res) {
        var ins = res.instance;
        var body = U.el('div');
        body.appendChild(U.el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' } }, [
          UI.badge(ins.cycleLabel, 'info'),
          UI.badge(ins.statusLabel, statusCls(ins.status)),
          UI.badge('期间 ' + U.fmtDate(ins.periodDate), 'muted'),
          UI.badge(ins.completionLabel, 'info'),
          ins.assigneeId ? UI.badge((ins.assigneeSourceLabel || '指派') + ' · ' + (ins.assigneeDisplayName || ins.assigneeName), 'warn') : null
        ]));
        body.appendChild(U.el('h3', { style: { margin: '0 0 6px' }, text: ins.title }));
        body.appendChild(U.el('div', { class: 'small', style: { whiteSpace: 'pre-wrap', lineHeight: '1.7', marginBottom: '10px' }, text: ins.content }));

        var s = res.stats || { total: 0, approved: 0, rate: 0 };
        body.appendChild(U.el('div', { class: 'info-list', style: { marginBottom: '10px' } }, [
          infoRow('历史完成率', (s.rate || 0) + '%（已通过 ' + s.approved + ' / 共 ' + s.total + ' 期）'),
          infoRow('发布 / 截止', (ins.publishText || '—') + ' 发布 · ' + (ins.deadlineText || '—') + ' 截止'),
          infoRow('提交人', ins.submitterName ? ins.submitterName + ' · ' + U.fmtTime(ins.submittedAt) : '尚未提交'),
          infoRow('审核', ins.reviewedBy ? ins.reviewedBy + ' · ' + U.fmtTime(ins.reviewedAt) + (ins.rejectReason ? ' · ' + ins.rejectReason : '') : '待审核')
        ]));

        if (ins.images && ins.images.length) {
          var grid = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } });
          ins.images.forEach(function (key, i) {
            var img = U.el('img', {
              alt: '返图',
              style: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--line)' }
            });
            api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
            img.addEventListener('click', function () {
              api.getFileUrl(key).then(function (url) {
                if (url) UI.imageViewer({ url: url, title: ins.title + ' · 返图 ' + (i + 1) });
              });
            });
            grid.appendChild(img);
          });
          body.appendChild(grid);
        }

        body.appendChild(U.el('div', { class: 'card-title', style: { margin: '6px 0' }, text: '近 12 期记录' }));
        var hist = U.el('div', { class: 'info-list' });
        (res.history || []).forEach(function (h) {
          hist.appendChild(U.el('div', { class: 'info-row' }, [
            U.el('span', { class: 'info-label', text: U.fmtDate(h.periodDate) }),
            U.el('span', { class: 'info-value' }, [
              UI.badge(h.statusLabel, statusCls(h.status)),
              h.submitterName ? U.el('span', { class: 'small muted', style: { marginLeft: '6px' }, text: h.submitterName }) : null
            ])
          ]));
        });
        body.appendChild(hist);

        var footer = [{ text: '关闭', class: 'btn-ghost' }];
        if (ins.status === 'submitted') {
          footer.push({
            text: '通过', class: 'btn-primary',
            onClick: function (btn, close) {
              UI.btnLoading(btn, true, '提交中…');
              api.reviewTask({ id: ins.id, action: 'approve' }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已通过', 'success');
                loadInstances();
              }).catch(function (e) {
                UI.btnLoading(btn, false);
                UI.toast(e.message, 'error');
              });
              return false;
            }
          });
        }
        UI.openModal({ title: '任务详情', body: body, size: 'lg', footer: footer });
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function infoRow(label, value) {
      return U.el('div', { class: 'info-row' }, [
        U.el('span', { class: 'info-label', text: label }),
        U.el('span', { class: 'info-value', text: value })
      ]);
    }

    function openStats(t) {
      var body = U.el('div');
      var s = t.stats || { total: 0, approved: 0, submitted: 0, rejected: 0, pending: 0, overdue: 0 };
      body.appendChild(U.el('div', { class: 'info-list', style: { marginBottom: '10px' } }, [
        infoRow('任务', t.title),
        infoRow('循环规则', t.cycleLabel),
        infoRow('发布 / 截止', (t.publishTime || '00:00') + ' 发布 · ' + (t.deadlineTime || '23:59') + ' 截止（随期次日期生效）'),
        infoRow('完成方式', t.completionLabel),
        infoRow('提交方式', t.completionScopeLabel || (t.completionScope === 'all' ? '全员提交' : '任意一人提交')),
        infoRow('指派对象', t.assigneeName
          ? ((!t.parentId && t.isGroup) ? '组默认：' : (t.parentId ? (t.assigneeOverride ? '单独指定：' : '继承母任务：') : '个人：')) + t.assigneeName
          : (t.isGroup ? '公共分组' : '全店员工（公共任务）')),
        infoRow('近 30 天', '共 ' + s.total + ' 期 · 已通过 ' + s.approved + ' · 待审核 ' + s.submitted + ' · 已逾期 ' + (s.overdue || 0) + ' · 已驳回 ' + s.rejected + ' · 待完成 ' + s.pending),
        infoRow('完成率', t.rate + '%')
      ]));
      body.appendChild(U.el('p', { class: 'small muted', text: '完成率 = 近 30 天已通过期数 ÷ 应完成期数。查看某一期的返图请在「执行与审核」中打开详情。' }));
      UI.openModal({ title: '完成情况', body: body, size: 'sm', footer: [{ text: '关闭', class: 'btn-ghost' }] });
    }

    function toggle(t) {
      UI.confirm({
        title: t.status === 'enabled' ? '停用任务' : '启用任务',
        message: t.status === 'enabled'
          ? '停用后将不再生成新的任务实例' + (t.isGroup ? '（母任务下的子任务会一并停用）' : '') + '，已有实例仍可在「执行与审核」中审核。'
          : '启用后将立即补齐当期任务实例' + (t.isGroup ? '，母任务下的子任务会一并启用。' : '。'),
        confirmText: t.status === 'enabled' ? '停用' : '启用'
      }).then(function (yes) {
        if (!yes) return;
        api.toggleTaskTemplate(t.id).then(function (r) {
          UI.toast(r.status === 'enabled' ? '已启用' : '已停用', 'success');
          loadTemplates();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function remove(t) {
      UI.confirm({
        title: '删除任务',
        message: '删除「' + t.title + '」将同时删除' + (t.isGroup ? '其下 ' + t.childCount + ' 个子任务、' : '') + '该模板的全部任务实例与返图记录，且不可恢复。',
        confirmText: '删除'
      }).then(function (yes) {
        if (!yes) return;
        api.deleteTaskTemplate(t.id).then(function () {
          UI.toast('已删除', 'success');
          loadTemplates();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };
})();
