/* P18 员工端 — 我的任务（今天 / 逾期 两个 TAB；已完成独立页面） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['tasks'] = function () {
    /* 一级分类 TAB：全部任务不做过滤，其余按循环类型过滤；运营通提醒/个人任务走快捷入口 */
    var CATS = [
      { key: 'all', label: '全部任务' },
      { key: 'daily', label: '日任务' },
      { key: 'weekly', label: '周任务' },
      { key: 'monthly', label: '月任务' },
      { key: 'once', label: '次任务' }
    ];
    /* 快捷入口：逾期 / 已完成跳转独立页；个人任务在本页切换筛选；类型改为下拉字典 */
    var QUICK = [
      { key: 'mine', label: '个人任务' }
    ];
    var CAT_LABELS = {
      all: '全部任务', mine: '个人任务',
      daily: '日任务', weekly: '周任务', monthly: '月任务', once: '次任务'
    };
    var state = { cat: 'all', kind: '', open: {}, data: null };
    var main = Layout.staffShell({ title: '我的任务', active: 'tasks' }, UI.skeleton(3));
    load();

    function load() {
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.taskMyList().then(function (res) {
        state.data = res;
        /* 角标按后端口径刷新：今天待完成数字 + 逾期红点 */
        Layout.setTaskPending(res.todayPending || 0);
        Layout.setTaskOverdue((res.overdueCount || 0) > 0);
        main.innerHTML = '';
        main.appendChild(render(res));
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    /* 分类过滤：类型下拉与循环 TAB、个人任务叠加；全部分类不过滤 */
    function matchCat(t, myId, cat) {
      cat = cat || state.cat;
      if (state.kind && (t.kindId || 'sys') !== state.kind) return false;
      if (cat === 'all') return true;
      if (cat === 'mine') return !!t.assigneeId && t.assigneeId === myId;
      return (t.cycle || 'once') === cat;
    }

    function overdueHref() {
      var qs = [];
      if (state.kind) qs.push('kind=' + encodeURIComponent(state.kind));
      if (state.cat === 'mine') qs.push('mine=1');
      else if (state.cat !== 'all') qs.push('cycle=' + encodeURIComponent(state.cat));
      return 'overdue-tasks.html' + (qs.length ? '?' + qs.join('&') : '');
    }

    function kindLabel(id) {
      var list = (state.data && state.data.taskKinds) || [];
      var hit = list.filter(function (k) { return k.id === id; })[0];
      return hit ? hit.name : '全部类型';
    }

    function catLabel(key) {
      return CAT_LABELS[key] || '全部任务';
    }

    function derive(d) {
      var list = d.list || [];
      var today = d.today;
      var myId = d.myStaffId || '';
      var out = { todaySingles: [], todayGroups: [], overdueCount: 0 };
      var groupMap = {};
      var serverGroups = Array.isArray(d.groups) ? d.groups : [];

      list.forEach(function (t) {
        var isMine = !t.assigneeId || t.assigneeId === myId;
        /* 逾期入口数字与逾期页同口径：本人可见的逾期实例，再叠加当前分类 */
        if (t.status === 'overdue' && isMine) out.overdueCount++;
        if (t.periodDate !== today || t.status === 'overdue') return;
        if (t.parentId) {
          /* 服务端已按全部子项汇总分组时，直接用 groups；此处只做旧接口兜底 */
          if (!serverGroups.length) {
            var key = t.parentId + '|' + t.periodDate;
            if (!groupMap[key]) {
              groupMap[key] = {
                parentId: t.parentId, title: t.groupTitle || '任务分组', cycle: t.cycle,
                kindId: t.kindId || 'sys', kindName: t.kindName || '',
                periodDate: t.periodDate, total: 0, approved: 0, submitted: 0, children: [], done: false
              };
            }
            groupMap[key].total++;
            if (t.status === 'approved') groupMap[key].approved++;
            if (t.status === 'submitted') groupMap[key].submitted++;
            groupMap[key].children.push(t);
          }
          return;
        }
        if (matchCat(t, myId) && t.status !== 'approved') out.todaySingles.push(t);
      });

      if (serverGroups.length) {
        serverGroups.forEach(function (g) {
          if (g.periodDate !== today) return;
          if (state.kind && (g.kindId || 'sys') !== state.kind) return;
          if (state.cat === 'mine') {
            var mine = (g.children || []).some(function (c) { return c.assigneeId === myId; });
            if (!mine) return;
          } else if (state.cat !== 'all' && (g.cycle || 'once') !== state.cat) {
            return;
          }
          var item = Object.assign({}, g);
          item.kindId = g.kindId || 'sys';
          item.kindName = g.kindName || kindLabel(item.kindId);
          item.submitted = g.submitted || 0;
          item.children = (g.children || []).slice();
          item.done = !!g.done;
          item.progressText = g.progressText || (((g.approved || 0) + (g.submitted || 0)) + '/' + (g.total || 0));
          if (!item.done) out.todayGroups.push(item);
        });
      } else {
        Object.keys(groupMap).forEach(function (key) {
          var g = groupMap[key];
          g.done = g.total > 0 && g.approved === g.total;
          g.progressText = (g.approved + (g.submitted || 0)) + '/' + g.total;
          /* 首页只显示未完成的组；整组已通过则视为今天无待办 */
          if (!g.done) out.todayGroups.push(g);
        });
      }
      out.todayGroups.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
      return out;
    }

    function render(d) {
      var wrap = U.el('div');
      var v = derive(d);

      var overdueLink = U.el('a', {
        class: 'btn btn-ghost btn-sm',
        href: overdueHref(),
        html: '<span>逾期' + ((d.overdueCount || 0) > 0 ? ' ' + d.overdueCount : '') + '</span>',
        style: (d.overdueCount || 0) > 0 ? { color: 'var(--danger)', fontWeight: '700' } : {}
      });
      var completedLink = U.el('a', {
        class: 'btn btn-ghost btn-sm', href: 'completed-tasks.html',
        html: UI.icon('check', 15) + '<span>已完成</span>'
      });
      var head = U.el('div', { class: 'page-head' }, [
        U.el('p', {
          text: d.canManage
            ? '你当前为管理岗，可查看全店任务；公共任务可指派，个人任务/子任务可改派，分组可改派整组。'
            : '只显示已发布的任务；未到发布时间不显示，超过截止时间未完成的进入「逾期」。'
        })
      ]);
      /* 超管入口：任务审批 + 快捷添加任务，弹层提交后立即出现在列表 */
      if (d.isSuper) {
        head.appendChild(U.el('div', { class: 'page-actions' }, [
          U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            html: UI.icon('check', 15) + '<span>任务审批</span>',
            onclick: openApprovals
          }),
          U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button',
            html: UI.icon('plus', 15) + '<span>添加任务</span>',
            onclick: openQuickCreate
          })
        ]));
      }
      wrap.appendChild(head);

      /* 快捷入口：逾期 / 已完成 / 类型下拉 / 个人任务保持同一排、同一按钮样式 */
      var quickBar = U.el('div', { class: 'task-quick' });
      var quickBtns = {};
      quickBar.appendChild(overdueLink);
      quickBar.appendChild(completedLink);

      /* 类型下拉：菜单挂到 body + fixed 定位，避免被快捷条的横向滚动裁切 */
      var kinds = Array.isArray(d.taskKinds) ? d.taskKinds : [];
      var typeWrap = U.el('div', { style: { position: 'relative', flex: '0 0 auto' } });
      var typeBtn = U.el('button', { class: 'btn btn-ghost btn-sm task-quick-btn', type: 'button' });
      typeWrap.appendChild(typeBtn);
      var oldMenu = document.querySelector('.task-kind-menu');
      if (oldMenu && oldMenu.parentNode) oldMenu.parentNode.removeChild(oldMenu);
      var kindMenu = U.el('div', {
        class: 'task-kind-menu',
        style: {
          display: 'none', position: 'fixed', zIndex: '60', width: '220px',
          maxWidth: 'calc(100vw - 32px)', maxHeight: '60vh', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line-hair)', borderRadius: '14px',
          boxShadow: 'var(--shadow-pop)', padding: '4px'
        }
      });
      document.body.appendChild(kindMenu);
      quickBar.appendChild(typeWrap);

      function paintTypeBtn() {
        typeBtn.textContent = state.kind ? '类型：' + kindLabel(state.kind) : '类型';
        typeBtn.classList.toggle('active', !!state.kind);
      }

      function buildKindMenu() {
        kindMenu.innerHTML = '';
        [{ id: '', name: '全部类型' }].concat(kinds).forEach(function (k) {
          var active = state.kind === k.id;
          var item = U.el('button', {
            type: 'button',
            style: {
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              padding: '8px 10px', border: '0', borderRadius: '8px', cursor: 'pointer',
              background: active ? 'var(--brand-soft)' : 'transparent',
              color: active ? 'var(--brand-dark)' : 'var(--ink-2)',
              fontSize: '13px', fontWeight: active ? '700' : '500',
              textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            },
            text: (active ? '✓ ' : '') + k.name
          });
          item.addEventListener('click', function (ev) {
            ev.stopPropagation();
            state.kind = k.id;
            state.open = {};
            kindMenu.style.display = 'none';
            paintTypeBtn();
            v = derive(d);
            refreshTabs();
            paint();
          });
          kindMenu.appendChild(item);
        });
      }

      typeBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        buildKindMenu();
        var rect = typeBtn.getBoundingClientRect();
        var w = Math.min(220, window.innerWidth - 32);
        kindMenu.style.width = w + 'px';
        kindMenu.style.left = Math.max(16, Math.min(rect.right - w, window.innerWidth - w - 16)) + 'px';
        kindMenu.style.top = (rect.bottom + 6) + 'px';
        kindMenu.style.display = '';
      });
      if (render._outside) document.removeEventListener('click', render._outside);
      render._outside = function () { kindMenu.style.display = 'none'; };
      document.addEventListener('click', render._outside);
      paintTypeBtn();

      QUICK.forEach(function (item) {
        var btn = U.el('button', { class: 'btn btn-ghost btn-sm task-quick-btn', type: 'button' });
        btn.appendChild(U.el('span', { text: item.label }));
        btn.addEventListener('click', function () {
          if (state.cat === item.key) return;
          state.cat = item.key;
          state.open = {};
          v = derive(d);
          refreshTabs();
          paint();
        });
        quickBtns[item.key] = btn;
        quickBar.appendChild(btn);
      });
      wrap.appendChild(quickBar);

      var tabBar = U.el('div', {
        class: 'card',
        style: { display: 'flex', gap: '2px', padding: '3px', marginBottom: '12px', overflowX: 'auto' }
      });
      var content = U.el('div');
      var btns = {};

      CATS.forEach(function (cat) {
        var btn = U.el('button', { class: 'btn cat-tab', type: 'button', style: tabStyle(false) });
        btn.appendChild(U.el('span', { text: cat.label }));
        btn.addEventListener('click', function () {
          if (state.cat === cat.key) return;
          state.cat = cat.key;
          state.open = {};
          v = derive(d);
          refreshTabs();
          paint();
        });
        btns[cat.key] = btn;
        tabBar.appendChild(btn);
      });

      wrap.appendChild(tabBar);
      wrap.appendChild(content);

      function tabStyle(active) {
        return {
          flex: '0 0 auto', minWidth: '0', padding: '8px 8px', border: '0', borderRadius: '8px',
          background: active ? 'var(--brand-soft)' : 'transparent',
          color: active ? 'var(--brand-dark)' : 'var(--ink-3)',
          boxShadow: active ? 'inset 0 0 0 1px var(--red-line)' : 'none',
          fontWeight: active ? '700' : '600', fontSize: '12px', whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        };
      }

      function refreshTabs() {
        CATS.forEach(function (cat) {
          var btn = btns[cat.key];
          btn.style.cssText = '';
          var st = tabStyle(state.cat === cat.key);
          Object.keys(st).forEach(function (k) { btn.style[k] = st[k]; });
          btn.classList.toggle('active', state.cat === cat.key);
        });
        QUICK.forEach(function (item) {
          var qb = quickBtns[item.key];
          var on = state.cat === item.key;
          qb.classList.toggle('active', on);
          qb.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        overdueLink.setAttribute('href', overdueHref());
      }

      function paint() {
        content.innerHTML = '';
        paintToday();
      }

      function goOverdue() {
        location.href = overdueHref();
      }

      function paintToday() {
        if (v.overdueCount > 0) {
          content.appendChild(U.el('div', {
            class: 'card',
            style: { marginBottom: '12px', backgroundImage: 'linear-gradient(90deg, var(--bad-tint), transparent 48%)', cursor: 'pointer' },
            onclick: goOverdue
          }, [
            U.el('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }
            }, [
              U.el('div', {}, [
                U.el('div', { style: { fontWeight: '700', color: 'var(--danger)' }, text: '逾期任务 ' + v.overdueCount + ' 项' }),
                U.el('div', { class: 'small muted', style: { marginTop: '2px' }, text: '已过截止时间，可进入逾期页补交返图' })
              ]),
              U.el('span', { class: 'small', style: { color: 'var(--danger)', fontWeight: '600' }, text: '去处理 ›' })
            ])
          ]));
        }
        if (!v.todaySingles.length && !v.todayGroups.length) {
          var cat = catLabel(state.cat);
          var kindName = state.kind ? kindLabel(state.kind) : '';
          var emptyTitle = kindName
            ? '「' + kindName + '」今天没有待完成任务'
            : (state.cat === 'all'
              ? '今天没有待完成任务'
              : (state.cat === 'mine' ? '当前没有指派给你的个人任务' : '「' + cat + '」今天没有待完成任务'));
          var emptyDesc = kindName
            ? '可切换其他类型或「全部类型」查看；停用类型不在下拉中，已有任务仍展示原类型名。'
            : (state.cat === 'mine'
              ? '个人任务仅指单独指派给你的任务（含被单独指派的分组子任务），公共任务不在本分类中。'
              : (state.cat === 'all'
                ? '今天的任务都已完成，或今天没有安排任务。'
                : '可切换其他分类查看，或今天没有该类型的任务。'));
          content.appendChild(UI.emptyState({
            icon: 'check',
            title: emptyTitle,
            desc: emptyDesc
          }));
          return;
        }
        if (v.todayGroups.length) {
          v.todayGroups.forEach(function (g) { content.appendChild(groupCard(g)); });
        }
        v.todaySingles.forEach(function (t) { content.appendChild(taskCard(t)); });
        content.appendChild(U.el('p', { class: 'text-center small muted', style: { marginTop: '10px' }, text: '任意一人提交：任一人提交后整条完成；全员提交：需全部执行人提交后完成，已提交的人不再看到该任务。' }));
      }

      refreshTabs();
      paint();
      return wrap;
    }

    /* 母任务分组：一张卡片，摘要三行；展开后按紧凑列表展示子任务 */
    function groupCard(g) {
      var children = g.children || [];
      return taskShell({
        key: 'g:' + g.parentId + '|' + g.periodDate,
        title: g.title,
        status: UI.badge('进度 ' + (g.progressText || '0/0'), 'info'),
        deadline: deadlineText(g),
        completer: g.defaultAssigneeDisplayName || '组内成员',
        subtasks: children.map(function (c) { return c.title; }),
        detail: function () { return groupDetail(g); }
      });
    }

    /* 单条任务：一张卡片，摘要固定三行；展开显示要求、示例图与操作 */
    function taskCard(t) {
      return taskShell({
        key: taskKey(t),
        title: t.title,
        status: statusBadge(t),
        deadline: deadlineText(t),
        completer: completerValue(t),
        subtasks: null,
        detail: function () { return singleDetail(t); }
      });
    }

    /* 卡片外壳：标题 / 截止 / 完成人三行，点击整卡展开；展开状态写入 state.open */
    function taskShell(o) {
      var open = !!state.open[o.key];
      var card = U.el('div', { class: 'card task-card' + (open ? ' is-open' : ''), style: { marginBottom: '10px' } });
      var head = U.el('div', {
        class: 'task-card-head', role: 'button', tabindex: '0',
        'aria-expanded': open ? 'true' : 'false'
      });
      head.appendChild(U.el('div', { class: 'task-card-title-row' }, [
        U.el('div', { class: 'task-card-title', text: o.title }),
        U.el('div', { class: 'task-card-status' }, [o.status])
      ]));
      head.appendChild(U.el('div', { class: 'task-card-meta' }, [
        U.el('span', { class: 'task-card-k', text: '截止' }),
        U.el('span', { class: 'task-card-v', text: o.deadline })
      ]));
      head.appendChild(U.el('div', { class: 'task-card-meta' }, [
        U.el('span', { class: 'task-card-k', text: '完成人' }),
        U.el('span', { class: 'task-card-v', text: o.completer })
      ]));
      if (o.subtasks && o.subtasks.length) {
        head.appendChild(U.el('div', {
          class: 'task-card-meta task-card-subtasks',
          title: o.subtasks.join('、')
        }, [
          U.el('span', { class: 'task-card-k', text: '子任务' }),
          U.el('span', { class: 'task-card-v', text: o.subtasks.join('、') })
        ]));
      }
      head.appendChild(U.el('span', { class: 'task-card-caret', 'aria-hidden': 'true', text: '▾' }));
      card.appendChild(head);

      var detail = U.el('div', { class: 'task-card-detail', style: { display: open ? '' : 'none' } });
      var built = false;
      function ensureDetail() {
        if (built) return;
        detail.appendChild(o.detail());
        built = true;
      }
      if (open) ensureDetail();
      card.appendChild(detail);

      function toggle() {
        open = !open;
        state.open[o.key] = open;
        if (open) ensureDetail();
        detail.style.display = open ? '' : 'none';
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        card.classList.toggle('is-open', open);
      }
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
      return card;
    }

    function taskKey(t) {
      return 't:' + (t.id || (String(t.templateId || '') + '|' + String(t.periodDate || '') + '|' + String(t.assigneeId || '')));
    }

    function deadlineText(t) {
      var raw = t.deadlineText || t.deadlineAt || '';
      if (!raw) return '—';
      var s = String(raw).replace(/^截止\s*/, '');
      var m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(s);
      if (!m) return s;
      return ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) + ' ' + ('0' + m[4]).slice(-2) + ':' + m[5];
    }

    function completerValue(t) {
      if (!t.assigneeId) return '公共任务';
      var who = t.assigneeDisplayName || t.assigneeName || '同事';
      if (t.assigneeSource === 'self') return who + '（单独指派）';
      if (t.assigneeSource === 'inherit') return who + '（继承）';
      return who;
    }

    /* 单任务展开区：要求、示例图、返图、改派与完成操作 */
    function singleDetail(t) {
      var box = U.el('div');
      if (t.content) box.appendChild(U.el('div', { class: 'task-card-content', text: t.content }));
      if (t.sampleImages && t.sampleImages.length) box.appendChild(sampleThumbs(t.sampleImages, t.title));

      var tags = [];
      if (t.kindId && t.kindId !== 'sys') tags.push(UI.badge(t.kindName || kindLabel(t.kindId), 'info'));
      if (t.completionMode === 'confirm') tags.push(UI.badge('仅需确认', 'info'));
      if (t.completionScope === 'all') tags.push(UI.badge((t.progressText || '0/0') + ' 已完成', 'warn'));
      if (t.periodDate) tags.push(U.el('span', { class: 'task-card-note', text: '执行日 ' + U.fmtDate(t.periodDate) }));
      if (t.groupTitle) tags.push(U.el('span', { class: 'task-card-note', text: '分组：' + t.groupTitle }));
      if (tags.length) box.appendChild(U.el('div', { class: 'task-card-tags' }, tags));

      if (t.completionScope === 'all' && t.missingNames && t.missingNames.length) {
        var miss = t.missingNames.slice(0, 4).join('、');
        if (t.missingNames.length > 4) miss += ' 等 ' + t.missingNames.length + ' 人';
        box.appendChild(U.el('div', { class: 'task-card-note', style: { marginTop: '8px' }, text: '未完成：' + miss }));
      }
      if (t.status === 'rejected') {
        box.appendChild(U.el('div', { class: 'task-card-note', style: { marginTop: '8px', color: 'var(--danger)' }, text: '驳回原因：' + (t.rejectReason || '未填写') }));
      }
      if (t.images && t.images.length) box.appendChild(thumbs(t.images, t.title));
      box.appendChild(actionWrap(t, false));
      return box;
    }

    /* 分组展开区：子任务按紧凑列表排列，不再铺成格子 */
    function groupDetail(g) {
      var box = U.el('div');
      var children = g.children || [];
      var groupBusy = children.some(function (c) {
        return c.status === 'pending' || c.status === 'rejected' || c.status === 'overdue';
      });
      if (state.data && state.data.canManage && groupBusy) {
        box.appendChild(U.el('div', { class: 'task-card-actions', style: { justifyContent: 'flex-start', marginTop: '0', marginBottom: '4px' } }, [
          U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '改派整组',
            onclick: function () { openReassignGroup(g); }
          })
        ]));
      }
      if (!children.length) {
        box.appendChild(U.el('div', { class: 'task-card-note', text: '该分组暂无可执行子任务。' }));
        return box;
      }
      children.forEach(function (c) {
        var row = U.el('div', { class: 'task-sub-row' });
        row.appendChild(U.el('div', { class: 'task-sub-head' }, [
          U.el('div', { class: 'task-sub-title', text: c.title }),
          statusBadge(c)
        ]));
        row.appendChild(U.el('div', { class: 'task-sub-meta', text: '截止 ' + deadlineText(c) + ' · 完成人 ' + completerValue(c) }));
        if (c.content) row.appendChild(U.el('div', { class: 'task-sub-content', text: c.content }));
        if (c.sampleImages && c.sampleImages.length) row.appendChild(sampleThumbs(c.sampleImages, c.title));
        row.appendChild(actionWrap(c, true));
        box.appendChild(row);
      });
      return box;
    }

    /* 操作区：改派 / 上传返图 / 标记完成；管理岗可代完成 */
    function actionWrap(t, compact) {
      var wrap = U.el('div', { class: compact ? 'task-sub-actions' : 'task-card-actions' });
      var myId = (state.data && state.data.myStaffId) || '';
      var isMine = !t.assigneeId || t.assigneeId === myId;
      var canReassign = !!(state.data && state.data.canManage) &&
        (t.status === 'pending' || t.status === 'rejected' || t.status === 'overdue');
      if (canReassign) {
        wrap.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button',
          text: t.assigneeId ? '改派' : '指派',
          onclick: function () { openReassign(t); }
        }));
      }
      if (t.status === 'pending' || t.status === 'rejected' || t.status === 'overdue') {
        if (isMine) {
          var confirmMode = t.completionMode === 'confirm';
          wrap.appendChild(U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button',
            text: confirmMode ? '标记完成' : (t.status === 'overdue' ? '补交返图' : (t.status === 'rejected' ? '重新提交' : '上传返图')),
            onclick: function () { confirmMode ? finishConfirm(t) : openSubmit(t); }
          }));
        } else if (state.data && state.data.canManage) {
          wrap.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '标记完成',
            onclick: function () { manageComplete(t); }
          }));
          wrap.appendChild(U.el('span', { class: 'task-card-note', text: '已指派给 ' + (t.assigneeDisplayName || t.assigneeName || '其他同事') }));
        } else {
          wrap.appendChild(U.el('span', { class: 'task-card-note', text: '已指派给 ' + (t.assigneeDisplayName || t.assigneeName || '其他同事') }));
        }
      } else if (t.status === 'submitted') {
        wrap.appendChild(U.el('span', { class: 'task-card-note', text: '已由 ' + (t.submitterName || '同事') + ' 提交，待审核' }));
      } else {
        wrap.appendChild(U.el('span', { class: 'task-card-note', style: { color: 'var(--success)' }, text: '已完成' }));
      }
      return wrap;
    }

    function statusBadge(t) {
      var cls = t.status === 'approved' ? 'success'
        : (t.status === 'rejected' || t.status === 'overdue' ? 'danger' : (t.status === 'submitted' ? 'info' : 'warn'));
      var label = t.statusLabel;
      if (t.status === 'rejected') label = '已驳回 · 未重提';
      return UI.badge(label, cls);
    }

    function thumbs(images, title) {
      var box = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } });
      images.forEach(function (key, i) {
        var img = U.el('img', {
          alt: '返图',
          style: { width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--line)', cursor: 'pointer' }
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

    /* 拍摄示例图：横向排列，点击可放大；仅参考，不影响任务状态 */
    function sampleThumbs(images, title) {
      var box = U.el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', overflowX: 'auto', paddingBottom: '2px' }
      });
      box.appendChild(U.el('span', { class: 'small muted', style: { flex: '0 0 auto' }, text: '拍摄示例' }));
      images.forEach(function (key, i) {
        var img = U.el('img', {
          alt: '拍摄示例',
          style: {
            width: '48px', height: '48px', flex: '0 0 auto', objectFit: 'cover',
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

    /* 仅需确认的任务：点击后直接完成，无需上传附件 */
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

    /* 管理岗代完成：店长 / 店助对已改派给他人且未完成的任务直接置为已完成 */
    function manageComplete(t) {
      var who = t.assigneeDisplayName || t.assigneeName || '执行人';
      UI.confirm({
        title: '确认代完成',
        message: '确认代执行人「' + who + '」将任务「' + t.title + '」标记为完成？操作后不可撤销，并记录操作人。',
        confirmText: '标记完成'
      }).then(function (ok) {
        if (!ok) return;
        api.manageCompleteTask({ id: t.id }).then(function () {
          UI.toast('已代完成，并记录操作人', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    /* 超管任务审批：全屏弹层，按提交时间倒序分批加载；通过 / 驳回复用后台审核流转 */
    function openApprovals() {
      var pageSize = 8;
      var page = 0;
      var total = 0;
      var loading = false;
      var done = false;
      var seen = {};
      var listBox = U.el('div');
      var emptyBox = U.el('div', { style: { display: 'none' } });
      var summary = U.el('p', { class: 'small muted', style: { margin: '0 0 10px' }, text: '加载中…' });
      var moreBtn = U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        style: { width: '100%', marginTop: '2px' }, text: '加载更多'
      });
      moreBtn.addEventListener('click', loadMore);
      var body = U.el('div');
      body.appendChild(summary);
      body.appendChild(listBox);
      body.appendChild(emptyBox);
      body.appendChild(moreBtn);
      moreBtn.style.display = 'none';
      UI.openModal({
        title: '任务审批',
        subtitle: '待审核的任务提交，按提交时间倒序；通过或驳回后即时移出列表',
        body: body,
        size: 'lg',
        footer: [{ text: '关闭', class: 'btn-ghost' }]
      });
      loadMore();

      function displayed() {
        return listBox.children.length;
      }

      function paint() {
        var left = Math.max(0, total - displayed());
        summary.textContent = total === 0
          ? '暂无待审核任务'
          : '共 ' + total + ' 条待审核 · 已显示 ' + displayed() + ' 条' + (left > 0 ? '，还有 ' + left + ' 条' : '');
        moreBtn.style.display = (left > 0 && !done) ? '' : 'none';
        emptyBox.style.display = total === 0 ? '' : 'none';
        if (total === 0 && !emptyBox.firstChild) {
          emptyBox.appendChild(UI.emptyState({
            icon: 'check', title: '已全部审核完成', desc: '店员新提交的任务返图会出现在这里。'
          }));
        }
      }

      function loadMore() {
        if (loading || done) return;
        loading = true;
        moreBtn.disabled = true;
        moreBtn.textContent = '加载中…';
        fetchPage(page + 1);
      }

      function fetchPage(p) {
        api.adminTaskApprovals({ page: p, pageSize: pageSize }).then(function (res) {
          page = res.page || p;
          total = Number(res.total) || 0;
          var list = res.list || [];
          var fresh = 0;
          list.forEach(function (r) {
            if (seen[r.id]) return;
            seen[r.id] = true;
            fresh++;
            listBox.appendChild(reviewCard(r));
          });
          var pages = Number(res.totalPages) || 1;
          var reachedEnd = page >= pages || !list.length || displayed() >= total;
          /* 审核后偏移分页会前移，前面几页可能全是已显示项，继续向后取 */
          if (!fresh && !reachedEnd && page < pages) { fetchPage(page + 1); return; }
          done = reachedEnd;
          loading = false;
          moreBtn.disabled = false;
          moreBtn.textContent = '加载更多';
          paint();
        }).catch(function (e) {
          loading = false;
          done = false;
          moreBtn.disabled = false;
          moreBtn.textContent = '重试加载';
          moreBtn.style.display = '';
          summary.textContent = '加载失败：' + e.message;
          UI.toast(e.message, 'error');
        });
      }

      function removeCard(card) {
        if (card && card.parentNode) card.parentNode.removeChild(card);
        total = Math.max(0, total - 1);
        page = 0;
        done = false;
        paint();
        /* 当前批次清空但仍有待审核时，从头补一页，避免偏移分页漏项 */
        if (total > 0 && displayed() === 0) loadMore();
      }

      function reviewCard(r) {
        var card = U.el('div', { class: 'card', style: { marginBottom: '10px' } });
        var body = U.el('div', { class: 'card-body' });
        var info = U.el('div', { style: { minWidth: '0' } });
        info.appendChild(U.el('div', {
          style: { fontSize: '15px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          text: r.title
        }));
        var tags = [r.kindName || '系统任务'];
        if (r.cycleLabel) tags.push(r.cycleLabel);
        if (r.groupTitle) tags.push('分组：' + r.groupTitle);
        tags.push('期间 ' + U.fmtDate(r.periodDate));
        info.appendChild(U.el('div', {
          class: 'small muted',
          style: { marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          text: tags.join(' · ')
        }));
        info.appendChild(U.el('div', {
          class: 'small muted', style: { marginTop: '3px' },
          text: '提交人 ' + (r.submitterName || '—') + ' · ' + (r.submittedAt ? U.fmtTime(r.submittedAt) : '—')
        }));
        body.appendChild(info);
        if (r.content) {
          body.appendChild(U.el('div', {
            class: 'small muted',
            style: {
              marginTop: '6px', overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', lineHeight: '1.45'
            },
            text: r.content
          }));
        }
        if (r.images && r.images.length) body.appendChild(reviewThumbs(r));
        var ops = U.el('div', {
          style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }
        });
        var rejectBtn = U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '驳回', style: { minWidth: '72px' }
        });
        rejectBtn.addEventListener('click', function () { openReject(r, card); });
        var approveBtn = U.el('button', {
          class: 'btn btn-primary btn-sm', type: 'button', text: '通过', style: { minWidth: '72px' }
        });
        approveBtn.addEventListener('click', function () { approve(r, card, approveBtn); });
        ops.appendChild(rejectBtn);
        ops.appendChild(approveBtn);
        body.appendChild(ops);
        card.appendChild(body);
        return card;
      }

      function reviewThumbs(r) {
        var box = U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } });
        r.images.forEach(function (key, i) {
          var img = U.el('img', {
            alt: '返图',
            style: {
              width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px',
              border: '1px solid var(--line)', cursor: 'pointer'
            }
          });
          api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
          img.addEventListener('click', function () {
            api.getFileUrl(key).then(function (url) {
              if (url) UI.imageViewer({ url: url, title: r.title + ' · 返图 ' + (i + 1) });
            });
          });
          box.appendChild(img);
        });
        return box;
      }

      function approve(r, card, btn) {
        UI.btnLoading(btn, true, '提交中…');
        api.reviewTaskApproval({ id: r.id, action: 'approve' }).then(function () {
          UI.btnLoading(btn, false);
          removeCard(card);
          UI.toast('已通过，已移出待审列表', 'success');
        }).catch(function (e) {
          UI.btnLoading(btn, false);
          UI.toast(e.message, 'error');
        });
      }

      function openReject(r, card) {
        var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
        form.innerHTML = '<div class="field"><label class="label">驳回原因 <i class="req">*</i></label>' +
          '<textarea class="textarea" name="reason" rows="3" maxlength="200" placeholder="如：返图不清晰，请重新拍摄操作台"></textarea></div>';
        UI.openModal({
          title: '驳回任务',
          subtitle: r.title,
          body: form,
          footer: [
            { text: '取消', class: 'btn-ghost' },
            {
              text: '确认驳回', class: 'btn-danger',
              onClick: function (btn, close) {
                var reason = String(new FormData(form).get('reason') || '').trim();
                if (reason.length < 2) { UI.toast('驳回请填写原因（至少 2 个字）', 'error'); return false; }
                UI.btnLoading(btn, true, '提交中…');
                api.reviewTaskApproval({ id: r.id, action: 'reject', reason: reason }).then(function (res) {
                  UI.btnLoading(btn, false);
                  close();
                  removeCard(card);
                  UI.toast(res && res.status === 'overdue' ? '已驳回；该期已过截止时间，转为逾期' : '已驳回，已移出待审列表', 'success');
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
    }

    /* 超管快捷添加任务：核心字段弹层，提交后写库并立即出现在列表 */
    function openQuickCreate() {
      api.staffContacts().then(function (res) {
        var staff = (res.list || []).filter(function (s) { return s.id; });
        var kinds = ((state.data && state.data.taskKinds) || []).filter(function (k) { return k.enabled !== false; });
        var escHtml = function (v) {
          return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };
        var kindOpts = kinds.map(function (k) {
          return '<option value="' + escHtml(k.id) + '"' + (k.id === 'sys' ? ' selected' : '') + '>' + escHtml(k.name) + '</option>';
        }).join('');
        if (!kindOpts) kindOpts = '<option value="sys">系统任务</option>';
        var staffOpts = staff.map(function (s) {
          return '<option value="' + escHtml(s.id) + '">' + escHtml(s.displayName || s.name) +
            (s.position ? ' · ' + escHtml(s.position) : '') + '</option>';
        }).join('');
        var wd = [[1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'], [5, '周五'], [6, '周六'], [7, '周日']];
        var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
        form.innerHTML =
          '<div class="field"><label class="label">任务标题 <i class="req">*</i></label>' +
          '<input class="input" name="title" maxlength="60" placeholder="如：晚班闭店清洁"></div>' +
          '<div class="field"><label class="label">具体内容 <i class="req">*</i></label>' +
          '<textarea class="textarea" name="content" rows="3" maxlength="2000" placeholder="写清完成标准与注意事项"></textarea></div>' +
          '<div class="field"><label class="label">类型</label>' +
          '<select class="select" name="kindId">' + kindOpts + '</select></div>' +
          '<div class="field"><label class="label">循环方式 <i class="req">*</i></label>' +
          '<select class="select" name="cycle">' +
          '<option value="once">一次性</option><option value="daily" selected>日循环</option>' +
          '<option value="weekly">周循环</option><option value="monthly">月循环</option></select></div>' +
          '<div class="field" data-weekly style="display:none"><label class="label">星期几（可多选） <i class="req">*</i></label>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px 12px;">' + wd.map(function (w) {
            return '<label style="font-weight:400;"><input type="checkbox" name="wd" value="' + w[0] + '"> ' + w[1] + '</label>';
          }).join('') + '</div></div>' +
          '<div class="field" data-monthly style="display:none"><label class="label">每月几号 <i class="req">*</i></label>' +
          '<select class="select" name="monthDay">' + (function () {
            var out = '';
            for (var i = 1; i <= 31; i++) out += '<option value="' + i + '">' + i + ' 号</option>';
            return out;
          })() + '</select></div>' +
          '<div class="field"><label class="label">生效日期 <i class="req">*</i></label>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
          '<input class="input" type="date" name="startDate" value="' + U.today() + '">' +
          '<span class="small muted">至</span>' +
          '<input class="input" type="date" name="endDate"></div>' +
          '<div class="hint">结束日期留空表示长期有效。</div></div>' +
          '<div class="field"><label class="label">发布与截止时间 <i class="req">*</i></label>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<input class="input" type="time" name="publishTime" value="00:00" style="max-width:120px">' +
          '<span class="small muted">发布</span>' +
          '<input class="input" type="time" name="deadlineTime" value="23:59" style="max-width:120px">' +
          '<span class="small muted">截止</span></div></div>' +
          '<div class="field"><label class="label">执行人</label>' +
          '<select class="select" name="assigneeId"><option value="">公共任务（全店可见）</option>' + staffOpts + '</select></div>' +
          '<div class="field"><label class="label">完成方式</label>' +
          '<select class="select" name="completionMode">' +
          '<option value="upload">附件上传（需上传返图）</option>' +
          '<option value="confirm">仅需确认（点击完成即可）</option></select></div>';

        /* 示例图：最多 3 张，仅参考 */
        var sampleKeys = [];
        var sampleField = U.el('div', { class: 'field' });
        sampleField.appendChild(U.el('label', { class: 'label', text: '拍摄示例图' }));
        sampleField.appendChild(U.el('div', { class: 'hint', text: '供员工参考，不参与完成判定；支持 JPG / PNG / WEBP，最多 3 张。' }));
        var sampleRow = U.el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } });
        var sampleInput = U.el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, style: { display: 'none' } });
        var sampleAdd = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: UI.icon('upload', 15) + '<span>添加示例图</span>' });
        sampleAdd.addEventListener('click', function () { sampleInput.click(); });
        sampleField.appendChild(sampleAdd);
        sampleField.appendChild(sampleInput);
        sampleField.appendChild(sampleRow);
        function paintSamples() {
          sampleRow.innerHTML = '';
          sampleKeys.forEach(function (key, i) {
            var cell = U.el('div', { style: { position: 'relative', width: '54px' } });
            var img = U.el('img', { alt: '示例图', style: { width: '54px', height: '54px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--line)' } });
            api.getFileUrl(key).then(function (url) { if (url) img.src = url; });
            var del = U.el('button', {
              type: 'button', text: '×',
              style: { position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', padding: '0', borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', color: 'var(--danger)', fontSize: '12px', lineHeight: '16px', cursor: 'pointer' }
            });
            del.addEventListener('click', function () { sampleKeys.splice(i, 1); paintSamples(); });
            cell.appendChild(img);
            cell.appendChild(del);
            sampleRow.appendChild(cell);
          });
          sampleAdd.disabled = sampleKeys.length >= 3;
        }
        sampleInput.addEventListener('change', function () {
          var files = Array.prototype.slice.call(sampleInput.files || []);
          sampleInput.value = '';
          var chain = Promise.resolve();
          files.forEach(function (file) {
            chain = chain.then(function () {
              if (sampleKeys.length >= 3) return null;
              var ext = String(file.name || '').split('.').pop().toLowerCase();
              if (['jpg', 'jpeg', 'png', 'webp'].indexOf(ext) < 0) { UI.toast('示例图仅支持 JPG / PNG / WEBP', 'error'); return null; }
              if (file.size > 10 * 1024 * 1024) { UI.toast('示例图单张不能超过 10MB', 'error'); return null; }
              return api.uploadFile(file, 'photo').then(function (r) {
                if (r && r.key && sampleKeys.indexOf(r.key) < 0) sampleKeys.push(r.key);
                paintSamples();
              }).catch(function (e) { UI.toast(e.message, 'error'); });
            });
          });
          chain.then(paintSamples);
        });
        paintSamples();
        form.appendChild(sampleField);
        form.appendChild(U.el('p', {
          class: 'hint',
          text: '已支持：标题、内容、类型、循环与生效日期、发布/截止时间、执行人或公共任务、完成方式、示例图。分组母/子任务、门店范围、启停状态请到后台「任务管理」设置。'
        }));

        var cycleSel = form.querySelector('[name=cycle]');
        var weeklyBox = form.querySelector('[data-weekly]');
        var monthlyBox = form.querySelector('[data-monthly]');
        function syncCycle() {
          weeklyBox.style.display = cycleSel.value === 'weekly' ? '' : 'none';
          monthlyBox.style.display = cycleSel.value === 'monthly' ? '' : 'none';
        }
        cycleSel.addEventListener('change', syncCycle);
        syncCycle();

        UI.openModal({
          title: '添加任务',
          body: form,
          footer: [
            { text: '取消', class: 'btn-ghost' },
            {
              text: '创建任务', class: 'btn-primary',
              onClick: function (btn, close) {
                var fd = new FormData(form);
                var cycle = fd.get('cycle');
                var weekdays = Array.prototype.slice.call(form.querySelectorAll('[name=wd]'))
                  .filter(function (x) { return x.checked; })
                  .map(function (x) { return parseInt(x.value, 10); });
                var payload = {
                  title: String(fd.get('title') || '').trim(),
                  content: String(fd.get('content') || '').trim(),
                  kindId: String(fd.get('kindId') || 'sys'),
                  cycle: cycle,
                  weekdays: weekdays,
                  monthDay: parseInt(fd.get('monthDay'), 10) || 0,
                  startDate: fd.get('startDate'),
                  endDate: fd.get('endDate') || '',
                  publishTime: fd.get('publishTime') || '00:00',
                  deadlineTime: fd.get('deadlineTime') || '23:59',
                  assigneeId: String(fd.get('assigneeId') || ''),
                  completionMode: fd.get('completionMode') || 'upload',
                  sampleImages: sampleKeys.slice(0, 3)
                };
                if (payload.title.length < 2) { UI.toast('任务标题至少 2 个字', 'error'); return false; }
                if (payload.content.length < 2) { UI.toast('请填写任务具体内容', 'error'); return false; }
                if (!payload.startDate) { UI.toast('请选择生效开始日期', 'error'); return false; }
                if (payload.deadlineTime <= payload.publishTime) { UI.toast('截止时间必须晚于发布时间（同一天内）', 'error'); return false; }
                if (cycle === 'weekly' && !weekdays.length) { UI.toast('周循环请至少选择一个星期', 'error'); return false; }
                if (cycle === 'monthly' && !payload.monthDay) { UI.toast('月循环请选择每月几号', 'error'); return false; }
                UI.btnLoading(btn, true, '创建中…');
                api.quickCreateTask(payload).then(function () {
                  UI.btnLoading(btn, false);
                  close();
                  UI.toast('任务已创建', 'success');
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
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* 店长 / 店助：公共任务可指派，个人任务/子任务可改派（仅未提交的期次） */
    function openReassign(t) {
      openAssigneeDialog({
        title: t.assigneeId ? '改派任务' : '指派任务',
        subject: '任务：' + t.title + ' · ' + U.fmtDate(t.periodDate) + ' · 当前指派：' + (t.assigneeDisplayName || t.assigneeName || '未指派（公共任务）'),
        currentId: t.assigneeId || '',
        hint: t.parentId
          ? '单独指派后，该子任务不再跟随母任务默认指派人；只更新未提交的期次，已提交待审核或已完成不受影响。'
          : '指派后该任务的全部未完成期次归新指派人，其他员工不再看到；已提交待审核或已完成的任务不受影响。',
        actionText: t.assigneeId ? '确认改派' : '确认指派',
        params: { id: t.id }
      });
    }

    /* 分组整组改派：只同步未单独指定过的子任务 */
    function openReassignGroup(g) {
      openAssigneeDialog({
        title: '改派整组',
        subject: '分组：' + g.title + ' · 期间 ' + U.fmtDate(g.periodDate) + ' · 组默认：' + (g.defaultAssigneeDisplayName || '公共分组'),
        currentId: g.defaultAssigneeId || '',
        hint: '只同步未单独指定的子任务；单独指定过的子任务保持不变。已提交待审核或已完成的期次不受影响。',
        actionText: '确认改派整组',
        params: { groupId: g.parentId }
      });
    }

    function openAssigneeDialog(o) {
      api.staffContacts().then(function (res) {
        var candidates = (res.list || []).filter(function (s) { return s.id !== o.currentId; });
        if (!candidates.length) {
          UI.toast('没有可指派的其他在职员工', 'error');
          return;
        }
        var select = U.el('select', { class: 'input' });
        select.appendChild(U.el('option', { value: '', text: '请选择指派人' }));
        candidates.forEach(function (s) {
          select.appendChild(U.el('option', {
            value: s.id,
            text: (s.displayName || s.name) + (s.position ? ' · ' + s.position : '')
          }));
        });
        var body = U.el('div');
        body.appendChild(U.el('p', {
          class: 'small muted', style: { margin: '0 0 10px' },
          text: o.subject
        }));
        body.appendChild(U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: '指派给' }),
          select
        ]));
        body.appendChild(U.el('p', { class: 'hint', text: o.hint }));
        UI.openModal({
          title: o.title,
          body: body,
          footer: [
            { text: '取消', class: 'btn-ghost' },
            {
              text: o.actionText, class: 'btn-primary',
              onClick: function (btn, close) {
                if (!select.value) { UI.toast('请选择指派人', 'error'); return false; }
                var target = candidates.filter(function (s) { return s.id === select.value; })[0];
                var payload = { assigneeId: select.value };
                Object.keys(o.params).forEach(function (k) { payload[k] = o.params[k]; });
                UI.btnLoading(btn, true, '提交中…');
                api.reassignTask(payload).then(function () {
                  UI.btnLoading(btn, false);
                  close();
                  UI.toast('已指派给 ' + ((target && (target.displayName || target.name)) || '新指派人'), 'success');
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
      }).catch(function (e) { UI.toast(e.message, 'error'); });
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
              var img = U.el('img', { src: res.url, alt: '返图', style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px' } });
              preview.appendChild(img);
              refresh();
              return null;
            }).catch(function (e) {
              UI.toast(e.message, 'error');
            });
          });
        });
        chain.then(function () { pick.disabled = false; });
      });

      UI.openModal({
        title: '提交任务返图',
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
  };
})();
