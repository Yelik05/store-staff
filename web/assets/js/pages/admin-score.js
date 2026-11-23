/* P11 管理端 — 量化分管理 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-score'] = function (ctx) {
    var state = {
      month: ctx.params.month || U.curMonth(),
      status: 'all',
      rows: [],
      dims: [],
      grades: [],
      data: {},
      timers: {},
      history: null,
      refs: {}
    };

    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '六个维度合计 100 分，加减分单次 ±1 至 ±5 且需填写事由；发布后员工端可见。' })
    ]);
    content.appendChild(head);
    var card = U.el('div', { class: 'card' });
    var toolbar = U.el('div', { class: 'toolbar' });
    var monthSel = U.el('select', { class: 'select' });
    U.monthRange(state.month, 8).reverse().forEach(function (m) {
      monthSel.appendChild(U.el('option', { value: m, text: U.monthLabel(m), selected: m === state.month }));
    });
    monthSel.addEventListener('change', function () { state.month = this.value; load(); });
    toolbar.appendChild(U.el('div', { class: 'toolbar-group' }, [U.el('span', { class: 'small muted', text: '月份' }), monthSel]));

    var statusSel = U.el('select', { class: 'select' });
    [['all', '全部状态'], ['draft', '草稿'], ['published', '已发布'], ['none', '未打分']].forEach(function (o) {
      statusSel.appendChild(U.el('option', { value: o[0], text: o[1] }));
    });
    statusSel.addEventListener('change', function () { state.status = this.value; paint(); });
    toolbar.appendChild(statusSel);
    toolbar.appendChild(U.el('span', { class: 'spacer' }));
    toolbar.appendChild(U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button',
      html: UI.icon('refresh', 15) + '<span>套用上月分数</span>',
      onclick: copyLast
    }));
    toolbar.appendChild(U.el('button', {
      class: 'btn btn-primary btn-sm', type: 'button',
      html: UI.icon('upload', 15) + '<span>全部发布</span>',
      onclick: publish
    }));
    if (Auth.isSuper()) {
      toolbar.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        html: UI.icon('download', 15) + '<span>导出</span>',
        onclick: exportCSV
      }));
    }
    toolbar.appendChild(U.el('button', {
      class: 'btn btn-ghost btn-sm', type: 'button', text: '撤回本月',
      onclick: withdraw
    }));
    card.appendChild(toolbar);
    var listBox = U.el('div');
    card.appendChild(listBox);
    content.appendChild(card);
    content.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '10px' }, text: '维度名称、满分与等级区间可在「系统设置 — 量化维度」中调整，页面按配置动态渲染。' }));

    Layout.adminShell({ title: '量化分管理', active: 'admin-score' }, content);

    function load() {
      listBox.innerHTML = '';
      listBox.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(3)]));
      Promise.all([api.listScores(state.month), api.getDimensions(), api.getSettings()]).then(function (res) {
        state.rows = res[0].list;
        state.dims = res[1];
        state.grades = res[2].grades;
        state.data = {};
        state.rows.forEach(function (r) {
          var s = r.score;
          var dims = {};
          state.dims.forEach(function (d) {
            var hit = s && (s.dims || []).filter(function (x) { return x.key === d.key; })[0];
            dims[d.key] = hit ? hit.score : '';
          });
          state.data[r.staff.id] = { dims: dims, adjust: s ? (s.adjust || []).slice() : [] };
        });
        paint();
      }).catch(function (e) {
        listBox.innerHTML = '';
        listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function calcTotal(staffId) {
      var d = state.data[staffId];
      var total = 0;
      state.dims.forEach(function (dim) { total += U.num(d.dims[dim.key]); });
      (d.adjust || []).forEach(function (a) { total += U.num(a.value); });
      return Math.max(0, Math.min(100, U.round2(total)));
    }
    function gradeOf(total) {
      var g = state.grades.slice().sort(function (a, b) { return b.min - a.min; });
      for (var i = 0; i < g.length; i++) if (total >= g[i].min) return g[i];
      return g[g.length - 1];
    }

    function paint() {
      listBox.innerHTML = '';
      state.refs = {};
      var rows = state.rows.filter(function (r) {
        if (state.status === 'all') return true;
        if (state.status === 'none') return !r.score;
        return r.score && r.score.status === state.status;
      });
      if (!rows.length) {
        listBox.appendChild(UI.emptyState({
          icon: 'star', title: '当前筛选下暂无记录',
          desc: '可切换状态筛选，或点击“套用上月分数”快速带入。'
        }));
        return;
      }
      var tableWrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table score-table', style: { minWidth: String(560 + state.dims.length * 92) + 'px' } });
      var thead = '<thead><tr><th class="col-sticky">姓名</th>' +
        state.dims.map(function (d) { return '<th class="num">' + d.name + '<div class="th-sub">满分 ' + d.full + '</div></th>'; }).join('') +
        '<th class="num">加减分</th><th class="num">总分</th><th>等级</th><th>操作</th></tr></thead>';
      table.innerHTML = thead;
      var tbody = U.el('tbody');
      rows.forEach(function (r) {
        var d = state.data[r.staff.id];
        var tr = U.el('tr');
        var tdName = U.el('td', { class: 'col-sticky' });
        tdName.appendChild(U.el('button', {
          class: 'btn-text strong', type: 'button', text: r.staff.name,
          onclick: function () { showDetail(r); }
        }));
        tdName.appendChild(U.el('div', { class: 'cell-user-sub', text: r.staff.position }));
        tr.appendChild(tdName);

        state.dims.forEach(function (dim) {
          var td = U.el('td', { class: 'num' });
          var input = U.el('input', {
            class: 'score-input', type: 'number', min: '0', max: String(dim.full), step: '0.1',
            value: d.dims[dim.key] === '' ? '' : String(d.dims[dim.key]),
            dataset: { staff: r.staff.id, dim: dim.key }
          });
          input.addEventListener('input', function () {
            d.dims[dim.key] = this.value;
            updateRow(r.staff.id);
            scheduleSave(r.staff.id);
          });
          input.addEventListener('blur', function () {
            var msg = V.dimScore(this.value, dim.full);
            if (msg) {
              UI.toast('“' + dim.name + '”' + msg, 'error');
              var fixed = Math.max(0, Math.min(dim.full, U.num(this.value)));
              this.value = fixed;
              d.dims[dim.key] = fixed;
              updateRow(r.staff.id);
              scheduleSave(r.staff.id);
            }
          });
          td.appendChild(input);
          tr.appendChild(td);
        });
        var tdAdj = U.el('td', { class: 'num' });
        var adjBtn = U.el('button', { class: 'btn-text', type: 'button', text: adjText(r.staff.id) });
        adjBtn.dataset.adj = r.staff.id;
        adjBtn.addEventListener('click', function () { openAdjust(r.staff.id, r.staff.name); });
        tdAdj.appendChild(adjBtn);
        tr.appendChild(tdAdj);
        var tdTotal = U.el('td', { class: 'num' });
        var totalSpan = U.el('span', { class: 'score-cell' });
        tdTotal.appendChild(totalSpan);
        tr.appendChild(tdTotal);
        var tdGrade = U.el('td');
        var gradeSpan = U.el('span');
        tdGrade.appendChild(gradeSpan);
        tr.appendChild(tdGrade);
        state.refs[r.staff.id] = { total: totalSpan, grade: gradeSpan, adj: adjBtn };
        var tdOps = U.el('td');
        var ops = U.el('div', { class: 'table-actions' });
        ops.appendChild(U.el('button', {
          class: 'btn-text', type: 'button', text: '详情',
          onclick: function () { showDetail(r); }
        }));
        if (r.score && r.score.status === 'published') {
          ops.appendChild(U.el('span', { class: 'badge badge-info', text: '已发布' }));
        }
        tdOps.appendChild(ops);
        tr.appendChild(tdOps);
        tbody.appendChild(tr);
        updateRow(r.staff.id);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      listBox.appendChild(tableWrap);
      listBox.appendChild(U.el('p', { class: 'small muted', style: { padding: '0 16px 14px' }, text: '输入后自动保存为草稿；超出维度满分时失焦自动修正。' }));
    }

    function adjText(staffId) {
      var sum = (state.data[staffId].adjust || []).reduce(function (a, b) { return a + U.num(b.value); }, 0);
      var n = (state.data[staffId].adjust || []).length;
      if (!n) return '± 添加';
      return (sum >= 0 ? '+' : '') + sum + '（' + n + ' 条）';
    }

    function isBlank(staffId) {
      var d = state.data[staffId];
      return state.dims.every(function (dim) { return d.dims[dim.key] === ''; }) && !(d.adjust || []).length;
    }

    function updateRow(staffId) {
      var blank = isBlank(staffId);
      var total = calcTotal(staffId);
      var g = gradeOf(total);
      var ref = state.refs[staffId];
      if (ref) {
        ref.total.textContent = blank ? '—' : String(total);
        ref.grade.className = blank ? '' : 'grade-badge grade-' + g.key;
        ref.grade.textContent = blank ? '' : g.key;
        ref.adj.textContent = adjText(staffId);
        return;
      }
      var tEl = document.querySelector('[data-total="' + staffId + '"]');
      var gEl = document.querySelector('[data-grade="' + staffId + '"]');
      var aEl = document.querySelector('[data-adj="' + staffId + '"]');
      if (tEl) tEl.textContent = blank ? '—' : String(total);
      if (gEl) {
        gEl.className = blank ? '' : 'grade-badge grade-' + g.key;
        gEl.textContent = blank ? '' : g.key;
      }
      if (aEl) aEl.textContent = adjText(staffId);
    }

    function scheduleSave(staffId) {
      clearTimeout(state.timers[staffId]);
      state.timers[staffId] = setTimeout(function () { saveRow(staffId); }, 600);
    }

    function saveRow(staffId) {
      var d = state.data[staffId];
      var dims = state.dims.map(function (cfg) {
        return { key: cfg.key, name: cfg.name, full: cfg.full, score: U.num(d.dims[cfg.key]) };
      });
      var allEmpty = state.dims.every(function (cfg) { return d.dims[cfg.key] === ''; });
      if (allEmpty && !d.adjust.length) return Promise.resolve();
      return api.saveScore({
        staffId: staffId, month: state.month, dims: dims, adjust: d.adjust
      }).then(function () {
        var row = state.rows.filter(function (r) { return r.staff.id === staffId; })[0];
        if (row) {
          if (!row.score) row.score = { status: 'draft' };
          row.score.total = calcTotal(staffId);
          row.score.grade = gradeOf(calcTotal(staffId)).key;
        }
      }).catch(function (e) {
        UI.toast(e.message, 'error');
      });
    }

    function flushAll() {
      return Promise.all(Object.keys(state.data).map(function (id) {
        clearTimeout(state.timers[id]);
        return saveRow(id);
      }));
    }

    function openAdjust(staffId, name) {
      var list = U.el('div');
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">分值</label><input class="input" type="number" name="value" value="1" min="-5" max="5" step="1"><div class="hint">范围 ±1 至 ±5。</div></div>' +
        '<div class="field"><label class="label">事由 <i class="req">*</i></label><input class="input" name="reason" maxlength="50" placeholder="必填，如：顾客表扬"></div>' +
        '</div>';
      var addBtn = U.el('button', { class: 'btn btn-primary btn-sm', type: 'submit', text: '添加' });
      form.appendChild(addBtn);

      function paintList() {
        list.innerHTML = '';
        var arr = state.data[staffId].adjust || [];
        if (!arr.length) {
          list.appendChild(U.el('p', { class: 'small muted', style: { marginBottom: '10px' }, text: '暂无加减分记录。' }));
          return;
        }
        arr.forEach(function (a, i) {
          list.appendChild(U.el('div', { class: 'adjust-item', style: { padding: '8px 0', borderBottom: '1px solid var(--line-2)' } }, [
            U.el('div', {}, [
              U.el('div', { text: a.reason }),
              U.el('div', { class: 'small muted', text: (a.date || '') + ' · ' + (a.by || '') })
            ]),
            U.el('div', { class: 'flex gap-8' }, [
              U.el('span', { class: 'adjust-value ' + (U.num(a.value) >= 0 ? 'plus' : 'minus'), text: (U.num(a.value) >= 0 ? '+' : '') + a.value }),
              U.el('button', {
                class: 'btn-text', type: 'button', text: '删除',
                onclick: function () {
                  state.data[staffId].adjust.splice(i, 1);
                  paintList();
                  updateRow(staffId);
                  scheduleSave(staffId);
                }
              })
            ])
          ]));
        });
      }
      paintList();

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var v = U.num(fd.get('value'));
        var reason = String(fd.get('reason') || '').trim();
        if (!v || v < -5 || v > 5) { UI.toast('加减分单次范围为 ±1 至 ±5', 'error'); return; }
        if (!reason) { UI.toast('加减分需填写事由', 'error'); return; }
        state.data[staffId].adjust.push({ value: v, reason: reason, date: U.today(), by: (Auth.current() || {}).name });
        form.elements.reason.value = '';
        form.elements.value.value = String(v > 0 ? 1 : -1);
        paintList();
        updateRow(staffId);
        saveRow(staffId);
      });

      UI.openModal({
        title: '加减分 · ' + name,
        subtitle: U.monthLabel(state.month) + ' · 总分上限 100、下限 0',
        body: U.el('div', {}, [list, U.el('div', { class: 'divider', style: { margin: '12px 0' } }), form]),
        footer: [{ text: '完成', class: 'btn-primary' }]
      });
    }

    function showDetail(r) {
      var d = state.data[r.staff.id];
      var total = calcTotal(r.staff.id);
      var g = gradeOf(total);
      var body = U.el('div');
      body.appendChild(U.el('div', { class: 'score-hero', style: { paddingTop: '4px' } }, [
        U.el('div', { class: 'score-total' }, [U.el('span', { text: String(total) }), U.el('span', { text: ' /100' })]),
        U.el('div', {}, [U.el('span', { class: 'grade-badge grade-' + g.key, text: g.key + ' 级 · ' + g.desc })])
      ]));
      state.dims.forEach(function (dim) {
        var score = U.num(d.dims[dim.key]);
        var pct = Math.max(0, Math.min(100, score / dim.full * 100));
        body.appendChild(U.el('div', { class: 'dim-row' }, [
          U.el('div', { class: 'dim-top' }, [
            U.el('span', { class: 'dim-name', text: dim.name }),
            U.el('span', { class: 'dim-score' }, [U.el('b', { text: String(score) }), U.el('span', { text: ' / ' + dim.full })])
          ]),
          U.el('div', { class: 'dim-bar' }, [U.el('span', { style: { width: pct + '%' } })]),
          U.el('div', { class: 'dim-desc', text: dim.desc || '' })
        ]));
      });
      if ((d.adjust || []).length) {
        body.appendChild(U.el('div', { class: 'card-body tight', style: { paddingTop: '10px' } }, [
          U.el('div', { class: 'strong', style: { marginBottom: '6px' }, text: '加减分明细' })
        ].concat(d.adjust.map(function (a) {
          return U.el('div', { class: 'adjust-item' }, [
            U.el('span', { text: a.reason }),
            U.el('span', { class: 'adjust-value ' + (U.num(a.value) >= 0 ? 'plus' : 'minus'), text: (U.num(a.value) >= 0 ? '+' : '') + a.value })
          ]);
        }))));
      }
      body.appendChild(U.el('p', { class: 'small muted mt-12', text: '打分记录：' + (r.score ? (r.score.updatedBy || '—') + ' · ' + U.fmtTime(r.score.updatedAt) : '尚未保存') }));

      UI.drawer({
        title: r.staff.name + ' · 当月打分详情',
        subtitle: r.staff.position + ' · ' + U.monthLabel(state.month),
        body: body,
        footer: [{ text: '关闭', class: 'btn-ghost', close: true }]
      });
    }

    function copyLast() {
      UI.confirm({
        title: '套用上月分数',
        message: '将 ' + U.monthLabel(U.prevMonth(state.month)) + ' 的分数套用到本月尚未打分的员工（生成草稿），是否继续？',
        confirmText: '套用'
      }).then(function (yes) {
        if (!yes) return;
        api.copyLastMonthScore(state.month).then(function (res) {
          UI.toast(res.count ? '已套用 ' + res.count + ' 人的上月分数' : '没有可套用的数据', res.count ? 'success' : 'info');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function publish() {
      flushAll().then(function () {
        return api.listScores(state.month);
      }).then(function (res) {
        var missing = res.list.filter(function (r) { return !r.score; }).map(function (r) { return r.staff.name; });
        if (missing.length) {
          UI.openModal({
            title: '暂不能发布',
            subtitle: '还有 ' + missing.length + ' 人未完成打分',
            body: U.el('div', {}, [
              U.el('p', { class: 'small muted', text: '完成打分并保存后方可整月发布。以下员工需处理：' }),
              U.el('div', { class: 'chip-list', style: { marginTop: '10px' } }, missing.map(function (n) {
                return U.el('span', { class: 'badge badge-danger', text: n });
              }))
            ]),
            footer: [{ text: '知道了', class: 'btn-primary' }]
          });
          return;
        }
        UI.confirm({
          title: '发布量化分',
          message: '确认发布 ' + U.monthLabel(state.month) + ' 共 ' + res.list.length + ' 人的量化分？发布后员工端立即可见，当天可撤回。',
          confirmText: '确认发布'
        }).then(function (yes) {
          if (!yes) return;
          api.publishScore(state.month).then(function (r2) {
            UI.toast('已发布 ' + r2.count + ' 人，员工端可见', 'success');
            load();
          }).catch(function (e) { UI.toast(e.message, 'error'); });
        });
      });
    }

    function withdraw() {
      UI.confirm({
        title: '撤回量化分',
        message: '确认撤回 ' + U.monthLabel(state.month) + ' 已发布的量化分？撤回后状态回到草稿（仅发布当天可撤回）。',
        danger: true, confirmText: '撤回'
      }).then(function (yes) {
        if (!yes) return;
        api.withdrawScore(state.month).then(function (r) {
          UI.toast('已撤回 ' + r.count + ' 人', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function exportCSV() {
      flushAll().then(function () { return api.listScores(state.month); }).then(function (res) {
        var headers = ['姓名', '飞书工号', '岗位'].concat(state.dims.map(function (d) { return d.name + '(' + d.full + ')'; }))
          .concat(['加减分', '总分', '等级', '状态']);
        var rows = res.list.map(function (r) {
          var s = r.score || {};
          var dims = state.dims.map(function (d) {
            var hit = (s.dims || []).filter(function (x) { return x.key === d.key; })[0];
            return hit ? hit.score : '';
          });
          var adj = (s.adjust || []).reduce(function (a, b) { return a + U.num(b.value); }, 0);
          return [r.staff.name, U.empNoOf(r.staff) || '—', r.staff.position].concat(dims)
            .concat([adj, s.total || '', s.grade || '', s.status === 'published' ? '已发布' : '草稿']);
        });
        U.download('量化分_' + api.storeInfo().code + '_' + state.month + '.csv', U.toCSV(headers, rows), 'text/csv;charset=utf-8');
        Store.log('导出量化分', U.monthLabel(state.month), '导出 ' + rows.length + ' 人');
        UI.toast('已导出当月量化分', 'success');
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    load();
  };
})();
