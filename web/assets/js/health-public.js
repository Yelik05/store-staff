/* 健康证公示页（免登录） — 数据来自 public.healthList */
(function () {
  'use strict';

  var app = document.getElementById('health-app');
  var state = { data: null, status: 'all', store: 'all' };

  var STATUS_TEXT = { valid: '有效', soon: '即将到期', expired: '已过期' };

  init();

  function init() {
    load();
  }

  function load() {
    renderLoading();
    var p;
    if (window.api && typeof api.publicHealthList === 'function') {
      p = api.publicHealthList();
    } else {
      p = fetch('api.php?action=public.healthList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }).then(function (r) {
        return r.json();
      }).then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || '加载失败');
        return j.data;
      });
    }
    p.then(function (d) {
      state.data = d;
      render();
    }).catch(function (e) {
      renderError(e && e.message ? e.message : '加载失败');
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function fmt(ts) {
    if (!ts) return '—';
    return String(ts).replace('T', ' ').replace('Z', '').slice(0, 16);
  }

  function clear() {
    app.innerHTML = '';
  }

  function renderLoading() {
    clear();
    var box = el('div', 'state-box');
    box.appendChild(el('div', 'spinner'));
    box.appendChild(el('p', 'muted', '正在加载公示信息…'));
    app.appendChild(box);
  }

  function renderError(msg) {
    clear();
    var box = el('div', 'state-box');
    box.appendChild(el('h2', 'state-title', '暂时无法加载'));
    box.appendChild(el('p', 'muted', msg || '请稍后重试'));
    var btn = el('button', 'btn', '重新加载');
    btn.type = 'button';
    btn.addEventListener('click', load);
    box.appendChild(btn);
    app.appendChild(box);
  }

  function render() {
    var d = state.data;
    if (!d) return;
    if (!d.enabled) {
      clear();
      var box = el('div', 'state-box');
      box.appendChild(el('div', 'state-icon', '🔒'));
      box.appendChild(el('h2', 'state-title', '公示已关闭'));
      box.appendChild(el('p', 'muted', '门店暂未开放健康证公示，如有需要请直接联系门店。'));
      app.appendChild(box);
      return;
    }
    clear();
    app.appendChild(renderHeader(d));
    app.appendChild(renderSummary(d));
    app.appendChild(renderFilters(d));
    app.appendChild(renderList(d));
    app.appendChild(renderFooter(d));
  }

  function renderHeader(d) {
    var head = el('header', 'page-head');
    head.appendChild(el('div', 'brand', '塔斯汀'));
    head.appendChild(el('h1', 'page-title', '健康证公示'));
    head.appendChild(el('p', 'page-sub', (d.stores[0] ? d.stores[0].name : '') + ' · 免登录公开查询'));
    return head;
  }

  function renderSummary(d) {
    var c = d.counts || {};
    var box = el('section', 'summary');
    [['有效', c.valid || 0, 'valid'], ['即将到期', c.soon || 0, 'soon'], ['已过期', c.expired || 0, 'expired']].forEach(function (x) {
      var cell = el('div', 'sum-cell ' + x[2]);
      cell.appendChild(el('strong', 'sum-num', String(x[1])));
      cell.appendChild(el('span', 'sum-label', x[0]));
      box.appendChild(cell);
    });
    return box;
  }

  function renderFilters(d) {
    var box = el('section', 'filters');
    var stores = d.stores || [];
    if (stores.length > 1) {
      var sel = el('select', 'select');
      sel.appendChild(new Option('全部门店', 'all'));
      stores.forEach(function (s) { sel.appendChild(new Option(s.shortName || s.name, s.code)); });
      sel.value = state.store;
      sel.addEventListener('change', function () { state.store = this.value; render(); });
      box.appendChild(sel);
    }

    var tabs = el('div', 'seg');
    [['all', '全部'], ['valid', '有效'], ['soon', '即将到期'], ['expired', '已过期']].forEach(function (t) {
      var b = el('button', 'seg-btn' + (state.status === t[0] ? ' on' : ''), t[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.status = t[0];
        render();
      });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    return box;
  }

  function renderList(d) {
    var wrap = el('section', 'stores');
    var stores = (d.stores || []).filter(function (s) {
      return state.store === 'all' || s.code === state.store;
    });
    stores.forEach(function (s) {
      var items = (s.items || []).filter(function (i) {
        return state.status === 'all' || i.state === state.status;
      });
      var group = el('div', 'store-group');
      group.appendChild(el('div', 'store-name', s.shortName || s.name));
      if (!items.length) {
        group.appendChild(el('div', 'empty', '该状态下暂无记录'));
      } else {
        var list = el('ul', 'list');
        items.forEach(function (i) {
          list.appendChild(renderItem(i, d));
        });
        group.appendChild(list);
      }
      wrap.appendChild(group);
    });
    return wrap;
  }

  function renderItem(i, d) {
    var li = el('li', 'item ' + i.state);

    /* 左侧文字区：姓名 + 状态、岗位 + 有效期、剩余天数 */
    var main = el('div', 'item-main');
    var top = el('div', 'item-top');
    top.appendChild(el('span', 'name', i.name || '—'));
    top.appendChild(el('span', 'chip ' + i.state, STATUS_TEXT[i.state] || i.state));
    main.appendChild(top);

    var meta = el('div', 'item-meta');
    meta.textContent = (i.position || '—') + ' · 有效期至 ' + (i.expiry || '—');
    main.appendChild(meta);

    var hint;
    if (typeof i.days === 'number') {
      if (i.days < 0) hint = '已过期 ' + Math.abs(i.days) + ' 天';
      else if (i.days <= (d.thresholdDays || 30)) hint = '剩余 ' + i.days + ' 天，请尽快办理';
      else hint = '剩余 ' + i.days + ' 天';
    } else {
      hint = '';
    }
    if (hint) main.appendChild(el('div', 'item-hint', hint));

    /* 核验口径：展示结论、日期与核验材料入口；不展示核验人姓名与备注 */
    var vmap = { pass: ['已核验', 'verified'], reject: ['核验不通过', 'rejected'], none: ['未核验', 'none'] };
    var vm = vmap[i.verifyStatus] || vmap.none;
    var vrow = el('div', 'item-verify');
    vrow.appendChild(el('span', 'vchip ' + vm[1], vm[0]));
    if (i.verifyDate) vrow.appendChild(el('span', null, '核验日期 ' + i.verifyDate));
    if (i.material) {
      if (i.material.kind === 'image') {
        var thumb = el('button', 'mat-thumb');
        thumb.type = 'button';
        thumb.title = '查看核验材料';
        thumb.setAttribute('aria-label', '查看核验材料');
        var img = el('img', 'mat-img');
        img.alt = '核验材料缩略图';
        thumb.appendChild(img);
        thumb.addEventListener('click', function () { openMaterial(i); });
        vrow.appendChild(thumb);
        fetchMaterial(i.staffId).then(function (res) {
          img.src = res.url;
        }).catch(function () {
          if (thumb.parentNode) thumb.parentNode.removeChild(thumb);
        });
      } else {
        var matBtn = el('button', 'mat-link', '核验材料');
        matBtn.type = 'button';
        matBtn.addEventListener('click', function () { openMaterial(i); });
        vrow.appendChild(matBtn);
      }
    }
    main.appendChild(vrow);
    li.appendChild(main);

    /* 右侧固定入口：有 PDF 可点，没有则灰色「未上传」不可点 */
    var side = el('div', 'item-side');
    if (i.hasFile) {
      var viewBtn = el('button', 'link-btn', '查看健康证');
      viewBtn.type = 'button';
      viewBtn.addEventListener('click', function () { openPdf(i); });
      side.appendChild(viewBtn);
    } else {
      var none = el('span', 'no-file', '未上传');
      none.setAttribute('aria-disabled', 'true');
      side.appendChild(none);
    }
    li.appendChild(side);
    return li;
  }

  function renderFooter(d) {
    var foot = el('footer', 'foot');
    foot.appendChild(el('p', null, '数据来源：' + (d.source || '门店人员档案') + '，更新于 ' + fmt(d.updatedAt) + '。'));
    foot.appendChild(el('p', null, '本页仅展示门店、姓名、岗位、健康证有效期，以及核验结论、核验日期与核验材料；不展示核验人姓名与核验备注。页面缓存 60 秒，非实时权威数据，如有疑问请联系门店。'));
    if (!d.fullName) foot.appendChild(el('p', 'mask-note', '为保护个人隐私，姓名已脱敏显示。'));
    foot.appendChild(el('p', 'mask-note', '健康证原件与核验材料可能含个人信息，请勿随意转发；公示状态可在系统设置关闭。'));
    return foot;
  }

  function fetchPdf(staffId) {
    if (window.api && typeof api.publicHealthFile === 'function') {
      return api.publicHealthFile(staffId);
    }
    return fetch('api.php?action=public.healthFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: staffId })
    }).then(function (r) {
      if (!r.ok) throw new Error('文件不可用');
      return r.blob();
    }).then(function (b) {
      return { url: URL.createObjectURL(b), name: 'health-certificate.pdf' };
    });
  }

  var materialCache = {};

  function fetchMaterial(staffId) {
    if (materialCache[staffId]) return Promise.resolve(materialCache[staffId]);
    var p;
    if (window.api && typeof api.publicHealthMaterial === 'function') {
      p = api.publicHealthMaterial(staffId);
    } else {
      p = fetch('api.php?action=public.healthMaterial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staffId })
      }).then(function (r) {
        if (!r.ok) throw new Error('文件不可用');
        return r.blob();
      }).then(function (b) {
        return { url: URL.createObjectURL(b), kind: '' };
      });
    }
    return p.then(function (res) {
      if (!res || !res.url) throw new Error('文件不可用');
      materialCache[staffId] = res;
      return res;
    });
  }

  /* 核验材料预览：图片直接放大，PDF 走 iframe + 新窗口兜底 */
  function openMaterial(item) {
    var kind = item.material.kind;
    var overlay = el('div', 'pdf-mask');
    var panel = el('div', 'pdf-panel');
    var head = el('div', 'pdf-head');
    head.appendChild(el('strong', null, '核验材料 · ' + (item.name || '')));
    var closeBtn = el('button', 'pdf-close', '关闭');
    closeBtn.type = 'button';
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var body = el('div', 'pdf-body');
    body.appendChild(el('div', 'pdf-loading', '正在加载…'));
    panel.appendChild(body);

    var foot = el('div', 'pdf-foot');
    var tip = el('span', 'pdf-tip', '核验材料可能含个人信息，请勿随意转发');
    foot.appendChild(tip);
    var openLink = el('a', 'pdf-link', '在新窗口打开');
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.href = '#';
    openLink.style.display = 'none';
    foot.appendChild(openLink);
    panel.appendChild(foot);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close() {
      if (overlay.parentNode) document.body.removeChild(overlay);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);

    fetchMaterial(item.staffId).then(function (res) {
      body.innerHTML = '';
      if (kind === 'pdf') {
        var frame = el('iframe', 'pdf-frame');
        frame.src = res.url;
        frame.title = '核验材料预览';
        body.appendChild(frame);
        tip.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent)
          ? '手机浏览器可能不支持内嵌预览，请点右侧链接'
          : '若无法预览，请点右侧「在新窗口打开」';
      } else {
        var img = el('img', 'mat-preview');
        img.alt = '核验材料';
        img.src = res.url;
        body.appendChild(img);
        tip.textContent = '材料可能含个人信息，请勿随意转发';
      }
      openLink.href = res.url;
      openLink.style.display = '';
    }).catch(function () {
      body.innerHTML = '';
      var errBox = el('div', 'pdf-error');
      errBox.appendChild(el('p', 'pdf-error-title', '文件不可用'));
      errBox.appendChild(el('p', 'muted', '公示可能已关闭，或该核验记录已失效。'));
      body.appendChild(errBox);
    });
  }

  var currentUrl = null;

  function openPdf(item) {
    var overlay = el('div', 'pdf-mask');
    var panel = el('div', 'pdf-panel');
    var head = el('div', 'pdf-head');
    head.appendChild(el('strong', null, '健康证 · ' + (item.name || '')));
    var closeBtn = el('button', 'pdf-close', '关闭');
    closeBtn.type = 'button';
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var body = el('div', 'pdf-body');
    body.appendChild(el('div', 'pdf-loading', '正在加载…'));
    panel.appendChild(body);

    var foot = el('div', 'pdf-foot');
    var tip = el('span', 'pdf-tip', '原件可能含个人信息，请勿转发');
    foot.appendChild(tip);
    var openLink = el('a', 'pdf-link', '在新窗口打开');
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.href = '#';
    openLink.style.display = 'none';
    foot.appendChild(openLink);
    panel.appendChild(foot);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close() {
      if (overlay.parentNode) document.body.removeChild(overlay);
      document.body.style.overflow = '';
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = null;
      }
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);

    fetchPdf(item.staffId).then(function (res) {
      currentUrl = res.url;
      body.innerHTML = '';
      var frame = el('iframe', 'pdf-frame');
      frame.src = res.url;
      frame.title = '健康证预览';
      body.appendChild(frame);
      openLink.href = res.url;
      openLink.style.display = '';
      tip.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent)
        ? '手机浏览器可能不支持内嵌预览，请点右侧链接'
        : '若无法预览，请点右侧「在新窗口打开」';
    }).catch(function () {
      body.innerHTML = '';
      var errBox = el('div', 'pdf-error');
      errBox.appendChild(el('p', 'pdf-error-title', '文件不可用'));
      errBox.appendChild(el('p', 'muted', '公示可能已关闭，或该员工未上传健康证。'));
      body.appendChild(errBox);
      tip.textContent = '原件可能含个人信息';
    });
  }
})();
