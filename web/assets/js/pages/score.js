/* P06 员工端 — 我的量化分 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['score'] = function (ctx) {
    var main = Layout.staffShell({ title: '我的量化分', active: 'profile' }, UI.skeleton(3));
    var all = [];
    var dimsCfg = [];
    var selected = '';

    Promise.all([api.getMyScores(), api.getDimensions()]).then(function (res) {
      all = res[0] || [];
      dimsCfg = res[1] || [];
      if (!all.length) { renderEmpty(); return; }
      var cur = U.curMonth();
      selected = all.some(function (x) { return x.month === cur; }) ? cur : all[all.length - 1].month;
      load(selected);
    }).catch(function (e) {
      main.innerHTML = '';
      main.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function load(month) {
      selected = month;
      main.innerHTML = '';
      main.appendChild(UI.skeleton(3));
      api.getScore(month).then(function (score) {
        main.innerHTML = '';
        main.appendChild(render(score, month));
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { load(month); } }));
      });
    }

    function monthOptions(month) {
      var months = all.map(function (x) { return x.month; }).reverse();
      var bar = U.el('div', { class: 'month-bar' });
      var sel = U.el('select', { class: 'select', style: { minWidth: '150px', minHeight: '38px' } });
      months.forEach(function (m) {
        sel.appendChild(U.el('option', { value: m, text: U.monthLabel(m), selected: m === month }));
      });
      sel.addEventListener('change', function () { load(this.value); });
      bar.appendChild(U.el('div', { class: 'month-select' }, [sel]));
      bar.appendChild(U.el('span', { class: 'small muted', text: '六个维度合计 100 分' }));
      return bar;
    }

    function gradeDesc(key) {
      var g = (api.settings().grades || []).filter(function (x) { return x.key === key; })[0];
      return g ? g.desc : '';
    }

    function render(score, month) {
      var wrap = U.el('div');
      wrap.appendChild(monthOptions(month));

      if (!score) {
        wrap.appendChild(U.el('div', { class: 'card' }, [
          UI.emptyState({
            icon: 'star', title: '该月量化分尚未发布',
            desc: '店长完成打分并发布后，可在此查看各维度得分与加减分明细。'
          })
        ]));
        return wrap;
      }

      var heroCard = U.el('div', { class: 'card' });
      var hero = U.el('div', { class: 'score-hero' }, [
        U.el('div', { class: 'score-total' }, [
          U.el('span', { text: String(score.total) }),
          U.el('span', { text: ' /100' })
        ]),
        U.el('div', {}, [
          U.el('span', { class: 'grade-badge grade-' + score.grade, text: score.grade + ' 级 · ' + gradeDesc(score.grade) })
        ]),
        U.el('p', { class: 'small muted', style: { marginTop: '8px' }, text: U.monthLabel(month) + ' · 发布于 ' + U.fmtTime(score.publishAt || score.updatedAt) })
      ]);
      heroCard.appendChild(hero);
      wrap.appendChild(heroCard);

      var dimCard = U.el('div', { class: 'card' });
      dimCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '维度得分' }),
        U.el('span', { class: 'small muted', text: '合计 ' + U.round2(score.dims.reduce(function (a, b) { return a + b.score; }, 0)) + ' 分' })
      ]));
      score.dims.forEach(function (d) {
        var cfg = dimsCfg.filter(function (x) { return x.key === d.key; })[0];
        var pct = d.full ? Math.max(0, Math.min(100, d.score / d.full * 100)) : 0;
        dimCard.appendChild(U.el('div', { class: 'dim-row' }, [
          U.el('div', { class: 'dim-top' }, [
            U.el('span', { class: 'dim-name', text: d.name }),
            U.el('span', { class: 'dim-score' }, [U.el('b', { text: String(d.score) }), U.el('span', { text: ' / ' + d.full })]),
          ]),
          U.el('div', { class: 'dim-bar' }, [U.el('span', { style: { width: pct + '%' } })]),
          cfg && cfg.desc ? U.el('div', { class: 'dim-desc', text: cfg.desc }) : null
        ]));
      });
      wrap.appendChild(dimCard);

      var adjCard = U.el('div', { class: 'card' });
      adjCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '加减分明细' }),
        U.el('span', { class: 'small muted', text: '单次 ±1 至 ±5 分' })
      ]));
      if (!score.adjust || !score.adjust.length) {
        adjCard.appendChild(U.el('div', { class: 'card-body' }, [U.el('p', { class: 'small muted', text: '本月无加减分记录。' })]));
      } else {
        score.adjust.forEach(function (a) {
          adjCard.appendChild(U.el('div', { class: 'adjust-item' }, [
            U.el('div', {}, [
              U.el('div', { text: a.reason }),
              U.el('div', { class: 'small muted', text: U.fmtDate(a.date) + ' · ' + (a.by || '管理组') })
            ]),
            U.el('span', { class: 'adjust-value ' + (Number(a.value) >= 0 ? 'plus' : 'minus'), text: (Number(a.value) >= 0 ? '+' : '') + a.value })
          ]));
        });
      }
      wrap.appendChild(adjCard);

      /* 趋势 */
      var trend = U.el('div', { class: 'card' });
      trend.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '近 6 个月总分趋势' }),
        U.el('span', { class: 'small muted', text: '满分 100' })
      ]));
      var chartBox = U.el('div', { class: 'chart-box' });
      var canvas = U.el('canvas');
      chartBox.appendChild(canvas);
      trend.appendChild(chartBox);
      wrap.appendChild(trend);

      var data = all.slice(-6).map(function (x) {
        return { label: Number(x.month.slice(5)) + '月', value: x.total };
      });
      requestAnimationFrame(function () {
        UI.barChart(canvas, data, { height: 180, min: 50, max: 100 });
      });

      wrap.appendChild(U.el('p', { class: 'text-center small muted', text: '如对分数有疑问，请当面联系店长核对；本页不提供线上申诉。' }));
      return wrap;
    }

    function renderEmpty() {
      main.innerHTML = '';
      main.appendChild(U.el('div', { class: 'card' }, [
        UI.emptyState({
          icon: 'star', title: '暂无量化的记录',
          desc: '店长完成当月打分并发布后，可在此查看各维度得分与近 6 个月趋势。'
        })
      ]));
    }
  };
})();
