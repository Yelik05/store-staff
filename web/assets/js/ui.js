/* ui.js — 公共组件：弹窗、抽屉、Toast、状态标签、空态、分页、附件预览、图表 */
(function (global) {
  'use strict';

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 20c0-2.2-.7-3.9-2-5"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    star: '<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3 9.6l6.3-.9z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m4 12.5 5 5L20 6.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
    cake: '<path d="M4 21h16"/><path d="M5.5 21v-7a2.5 2.5 0 0 1 2.5-2.5h8a2.5 2.5 0 0 1 2.5 2.5v7"/><path d="M5.5 16.2c1.1.8 2.2.8 3.3 0s2.2-.8 3.3 0 2.2.8 3.3 0 2.2-.8 3.1-.2"/><path d="M12 11.5V9"/><path d="M12 6.6c.9-.8.9-1.9 0-2.6-.9.7-.9 1.8 0 2.6z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7.5 9 6 9-6"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 20V8"/><path d="m7 12 5-5 5 5"/><path d="M4 4h16"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8"/><path d="M6.1 7.6A17.6 17.6 0 0 0 2 12s3.5 6 10 6a9.9 9.9 0 0 0 4-.8"/>',
    edit: '<path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z"/><path d="m14 7 3 3"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };

  var UI = {};

  /* 姓名展示：设置昵称时为「昵称（名字）」 */
  UI.displayName = function (name, nickname) {
    var n = String(name || '');
    var nick = String(nickname || '').trim();
    return nick ? nick + '（' + n + '）' : n;
  };

  /* 头像：优先用户上传头像，未设置时回退姓名首字 */
  UI.userAvatar = function (name, avatarKey, cls) {
    var el = U.el('span', { class: 'avatar' + (cls ? ' ' + cls : ''), text: U.nameIndex(name || '') });
    if (avatarKey) {
      api.getFileUrl(avatarKey).then(function (url) {
        if (!url) return;
        el.style.background = 'none';
        el.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover" alt="">';
      });
    }
    return el;
  };

  UI.icon = function (name, size) {
    var p = ICONS[name] || ICONS.info;
    return '<svg class="icon" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  };

  /* ---------- Toast ---------- */
  UI.toast = function (msg, type, ms) {
    var wrap = U.$('.toast-wrap');
    if (!wrap) {
      wrap = U.el('div', { class: 'toast-wrap' });
      document.body.appendChild(wrap);
    }
    var node = U.el('div', { class: 'toast toast-' + (type || 'info') }, [
      U.el('span', { class: 'toast-icon', html: UI.icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info', 18) }),
      U.el('span', { class: 'toast-text', text: msg })
    ]);
    wrap.appendChild(node);
    setTimeout(function () { node.classList.add('out'); }, ms || 2800);
    setTimeout(function () { node.remove(); }, (ms || 2800) + 260);
  };

  UI.loading = function (text) {
    return U.el('div', { class: 'loading-inline' }, [
      U.el('span', { class: 'spinner' }),
      U.el('span', { text: text || '加载中…' })
    ]);
  };

  UI.btnLoading = function (btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.dataset._html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-light"></span>' + (text || '处理中…');
    } else {
      btn.disabled = false;
      if (btn.dataset._html) btn.innerHTML = btn.dataset._html;
    }
  };

  /* ---------- Modal ---------- */
  var openLayers = [];

  function onKeydown(e) {
    if (e.key === 'Escape' && openLayers.length) {
      var top = openLayers[openLayers.length - 1];
      if (top.dismissible) top.close();
    }
  }

  UI.openModal = function (opts) {
    opts = opts || {};
    var mask = U.el('div', { class: 'modal-mask' });
    var box = U.el('div', { class: 'modal modal-' + (opts.size || 'md') });
    var head = U.el('div', { class: 'modal-head' }, [
      U.el('div', {}, [
        U.el('h3', { class: 'modal-title', text: opts.title || '' }),
        opts.subtitle ? U.el('p', { class: 'modal-sub', text: opts.subtitle }) : null
      ]),
      U.el('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', html: UI.icon('x', 20), onclick: function () { close(); } })
    ]);
    var body = U.el('div', { class: 'modal-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    var footer = U.el('div', { class: 'modal-foot' });
    (opts.footer || []).forEach(function (b) {
      var btn = U.el('button', {
        class: 'btn ' + (b.class || (b.type ? 'btn-' + b.type : 'btn-ghost')),
        type: 'button',
        text: b.text,
        onclick: function () {
          if (b.onClick) {
            var r = b.onClick(btn, close);
            if (r === false) return;
          }
          if (b.close !== false) close();
        }
      });
      footer.appendChild(btn);
    });
    box.appendChild(head);
    box.appendChild(body);
    if ((opts.footer || []).length) box.appendChild(footer);
    mask.appendChild(box);
    document.body.appendChild(mask);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { mask.classList.add('show'); });

    var layer = { dismissible: opts.dismissible !== false };
    function close() {
      mask.classList.remove('show');
      openLayers = openLayers.filter(function (x) { return x !== layer; });
      if (typeof opts.onClose === 'function') { try { opts.onClose(); } catch (e) {} }
      setTimeout(function () {
        mask.remove();
        if (!openLayers.length) document.body.classList.remove('no-scroll');
      }, 180);
    }
    layer.close = close;
    openLayers.push(layer);
    if (layer.dismissible) {
      mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    }
    if (opts.onMount) opts.onMount(body, close);
    return { close: close, body: body, footer: footer };
  };

  UI.confirm = function (opts) {
    return new Promise(function (resolve) {
      var body = U.el('div', { class: 'confirm-body' });
      var p = U.el('p', { text: opts.message || '' });
      body.appendChild(p);
      if (opts.detail) body.appendChild(U.el('div', { class: 'confirm-detail', html: opts.detail }));
      var input = null;
      if (opts.requireText) {
        input = U.el('input', { class: 'input', type: 'text', placeholder: '请输入“' + opts.requireText + '”' });
        body.appendChild(U.el('div', { class: 'field', style: { marginTop: '12px' } }, [
          U.el('label', { class: 'label', text: '请输入“' + opts.requireText + '”确认' }), input
        ]));
      }
      UI.openModal({
        title: opts.title || '请确认',
        body: body,
        size: 'sm',
        footer: [
          { text: opts.cancelText || '取消', class: 'btn-ghost', onClick: function () { resolve(false); } },
          {
            text: opts.confirmText || '确认', class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
            onClick: function () {
              if (input && input.value.trim() !== opts.requireText) {
                UI.toast('请输入“' + opts.requireText + '”以确认', 'error');
                return false;
              }
              resolve(true);
            }
          }
        ]
      });
    });
  };

  UI.drawer = function (opts) {
    var mask = U.el('div', { class: 'drawer-mask' });
    var panel = U.el('aside', { class: 'drawer drawer-' + (opts.width || 'md') });
    var head = U.el('div', { class: 'drawer-head' }, [
      U.el('div', {}, [
        U.el('h3', { class: 'modal-title', text: opts.title || '' }),
        opts.subtitle ? U.el('p', { class: 'modal-sub', text: opts.subtitle }) : null
      ]),
      U.el('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', html: UI.icon('x', 20), onclick: function () { close(); } })
    ]);
    var body = U.el('div', { class: 'drawer-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    var foot = U.el('div', { class: 'drawer-foot' });
    (opts.footer || []).forEach(function (b) {
      foot.appendChild(U.el('button', {
        class: 'btn ' + (b.class || 'btn-ghost'), type: 'button', text: b.text,
        onclick: function () {
          var r = b.onClick ? b.onClick(this, close) : undefined;
          if (r === false) return;
          if (b.close) close();
        }
      }));
    });
    panel.appendChild(head);
    panel.appendChild(body);
    if ((opts.footer || []).length) panel.appendChild(foot);
    mask.appendChild(panel);
    document.body.appendChild(mask);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(function () { mask.classList.add('show'); });
    var layer = { dismissible: opts.dismissible !== false };
    function close() {
      mask.classList.remove('show');
      setTimeout(function () {
        mask.remove();
        document.body.classList.remove('no-scroll');
      }, 220);
    }
    layer.close = close;
    openLayers.push(layer);
    if (layer.dismissible) mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    if (opts.onMount) opts.onMount(body, close);
    return { close: close, body: body };
  };

  document.addEventListener('keydown', onKeydown);

  /* ---------- 状态标签 ---------- */
  var STAFF_STATUS = {
    draft: { text: '草稿', cls: 'muted' },
    pending: { text: '待审核', cls: 'warn' },
    rejected: { text: '已驳回', cls: 'danger' },
    active: { text: '在职', cls: 'success' },
    resigned: { text: '已离职', cls: 'muted' },
    disabled: { text: '已停用', cls: 'danger' }
  };
  UI.staffStatus = function (status) { return STAFF_STATUS[status] || { text: status, cls: 'muted' }; };
  UI.badge = function (text, cls) {
    return U.el('span', { class: 'badge badge-' + (cls || 'muted'), text: text });
  };
  UI.statusBadge = function (status) {
    var s = UI.staffStatus(status);
    return UI.badge(s.text, s.cls);
  };

  UI.salaryStatus = function (s) {
    return {
      draft: { text: '草稿', cls: 'muted' },
      published: { text: '已发布', cls: 'info' },
      paid: { text: '已发放', cls: 'success' }
    }[s] || { text: '未录入', cls: 'muted' };
  };
  UI.scoreStatus = UI.salaryStatus;

  UI.leaveStatus = function (l) {
    if (l.cancelRequested && l.status === 'approved') return { text: '取消待审批', cls: 'warn' };
    return {
      pending: { text: '待审批', cls: 'warn' },
      approved: { text: '已通过', cls: 'success' },
      rejected: { text: '已驳回', cls: 'danger' },
      withdrawn: { text: '已撤回', cls: 'muted' },
      cancelled: { text: '已取消', cls: 'muted' }
    }[l.status] || { text: l.status, cls: 'muted' };
  };

  UI.healthBadge = function (info) {
    if (!info) return UI.badge('未登记', 'muted');
    if (info.state === 'expired') return UI.badge('已过期 ' + Math.abs(info.days) + ' 天', 'danger');
    if (info.state === 'soon') return UI.badge('将到期 ' + info.days + ' 天', 'warn');
    if (info.state === 'none') return UI.badge('未登记', 'muted');
    return UI.badge('正常', 'success');
  };

  /* ---------- 状态占位 ---------- */
  UI.skeleton = function (rows) {
    var wrap = U.el('div', { class: 'skeleton-wrap' });
    for (var i = 0; i < (rows || 3); i++) {
      wrap.appendChild(U.el('div', { class: 'skeleton-card' }, [
        U.el('div', { class: 'sk-line sk-40' }),
        U.el('div', { class: 'sk-line sk-70' }),
        U.el('div', { class: 'sk-line sk-55' })
      ]));
    }
    return wrap;
  };

  UI.emptyState = function (opts) {
    opts = opts || {};
    var box = U.el('div', { class: 'state-box' }, [
      U.el('div', { class: 'state-icon', html: UI.icon(opts.icon || 'clipboard', 30) }),
      U.el('h3', { class: 'state-title', text: opts.title || '暂无数据' }),
      U.el('p', { class: 'state-desc', text: opts.desc || '' })
    ]);
    if (opts.actionText) {
      box.appendChild(U.el('button', {
        class: 'btn btn-primary', type: 'button', text: opts.actionText,
        onclick: opts.onAction || function () {}
      }));
    }
    return box;
  };

  UI.errorState = function (opts) {
    opts = opts || {};
    return U.el('div', { class: 'state-box' }, [
      U.el('div', { class: 'state-icon danger', html: UI.icon('alert', 30) }),
      U.el('h3', { class: 'state-title', text: '数据加载失败' }),
      U.el('p', { class: 'state-desc', text: opts.message || '网络异常，数据未能加载，请稍后重试。' }),
      U.el('button', {
        class: 'btn btn-ghost', type: 'button', text: '重试',
        onclick: function () { if (opts.onRetry) opts.onRetry(); }
      })
    ]);
  };

  UI.pagination = function (opts) {
    var total = opts.total, size = opts.pageSize || 20, page = opts.page || 1;
    var pages = Math.max(1, Math.ceil(total / size));
    var wrap = U.el('div', { class: 'pagination' }, [
      U.el('span', { class: 'page-info', text: '共 ' + total + ' 条，第 ' + page + '/' + pages + ' 页' })
    ]);
    var btns = U.el('div', { class: 'page-btns' });
    function mk(label, target, disabled) {
      return U.el('button', {
        class: 'page-btn' + (disabled ? ' disabled' : ''), type: 'button', text: label,
        disabled: disabled || false,
        onclick: function () { if (!disabled) opts.onChange(target); }
      });
    }
    btns.appendChild(mk('上一页', page - 1, page <= 1));
    var start = Math.max(1, page - 2), end = Math.min(pages, start + 4);
    start = Math.max(1, end - 4);
    for (var i = start; i <= end; i++) {
      (function (n) {
        var b = U.el('button', {
          class: 'page-btn' + (n === page ? ' active' : ''), type: 'button', text: String(n),
          onclick: function () { if (n !== page) opts.onChange(n); }
        });
        btns.appendChild(b);
      })(i);
    }
    btns.appendChild(mk('下一页', page + 1, page >= pages));
    wrap.appendChild(btns);
    return wrap;
  };

  /* ---------- 附件预览 ---------- */
  UI.imageViewer = function (opts) {
    var scale = 1, rotate = 0;
    var img = U.el('img', { class: 'viewer-img', src: opts.url, alt: opts.title || '证件' });
    var stage = U.el('div', { class: 'viewer-stage' }, [img]);
    var mark = U.el('div', { class: 'viewer-watermark', text: '仅限内部使用 · ' + ((Auth.current() || {}).name || '—') + ' · ' + U.fmtTime(U.now()) });
    var stageWrap = U.el('div', { class: 'viewer-wrap' }, [stage, mark]);
    var tools = U.el('div', { class: 'viewer-tools' }, [
      U.el('button', { class: 'viewer-btn', type: 'button', text: '放大', onclick: function () { scale = Math.min(3, scale + 0.25); apply(); } }),
      U.el('button', { class: 'viewer-btn', type: 'button', text: '缩小', onclick: function () { scale = Math.max(0.5, scale - 0.25); apply(); } }),
      U.el('button', { class: 'viewer-btn', type: 'button', text: '旋转', onclick: function () { rotate = (rotate + 90) % 360; apply(); } }),
      U.el('button', { class: 'viewer-btn', type: 'button', text: '还原', onclick: function () { scale = 1; rotate = 0; apply(); } })
    ]);
    function apply() {
      img.style.transform = 'scale(' + scale + ') rotate(' + rotate + 'deg)';
    }
    var mask = U.el('div', { class: 'viewer-mask' }, [
      U.el('div', { class: 'viewer-head' }, [
        U.el('span', { class: 'viewer-title', text: opts.title || '证件预览' }),
        U.el('button', { class: 'viewer-btn', type: 'button', text: '关闭', onclick: function () { mask.remove(); document.body.classList.remove('no-scroll'); } })
      ]),
      stageWrap,
      tools
    ]);
    document.body.appendChild(mask);
    document.body.classList.add('no-scroll');
    return mask;
  };

  UI.pdfViewer = function (opts) {
    var body = U.el('div', { class: 'pdf-viewer' });
    var iframe = U.el('iframe', { src: opts.url, title: opts.title || '健康证' });
    body.appendChild(iframe);
    body.appendChild(U.el('div', { class: 'pdf-foot' }, [
      U.el('span', { class: 'pdf-hint', text: '内嵌预览如无法显示，可点击右侧按钮用系统阅读器打开。' }),
      U.el('a', { class: 'btn btn-ghost btn-sm', href: opts.url, target: '_blank', rel: 'noopener', text: '新窗口打开' })
    ]));
    UI.openModal({
      title: opts.title || '健康证',
      subtitle: '仅限内部使用，查看行为已记录',
      body: body,
      size: 'lg'
    });
    Store.log('查看证件附件', opts.title || '健康证', 'PDF 内嵌预览');
  };

  /* ---------- 图表 ---------- */
  UI.barChart = function (canvas, data, opts) {
    opts = opts || {};
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 600, h = opts.height || 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!data.length) return;
    var padL = 34, padR = 12, padT = 18, padB = 28;
    var min = opts.min !== undefined ? opts.min : 60;
    var max = opts.max !== undefined ? opts.max : 100;
    var innerW = w - padL - padR, innerH = h - padT - padB;
    ctx.strokeStyle = '#ECEDF0';
    ctx.lineWidth = 1;
    ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#8A9099';
    for (var i = 0; i <= 2; i++) {
      var val = min + (max - min) * i / 2;
      var y = padT + innerH - innerH * i / 2;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(String(Math.round(val)), 6, y + 4);
    }
    var bw = Math.min(38, innerW / data.length * 0.55);
    var gap = innerW / data.length;
    var bestIdx = data.map(function (d) { return d.value; }).indexOf(Math.max.apply(null, data.map(function (d) { return d.value; })));
    data.forEach(function (d, i) {
      var ratio = Math.max(0, Math.min(1, (d.value - min) / (max - min)));
      var bh = Math.max(3, innerH * ratio);
      var x = padL + gap * i + (gap - bw) / 2;
      var y = padT + innerH - bh;
      ctx.fillStyle = i === bestIdx ? '#E10600' : '#F4C4C0';
      ctx.beginPath();
      var r = 4;
      ctx.moveTo(x, y + bh);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - r, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
      ctx.lineTo(x + bw, y + bh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5B6169';
      ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + bw / 2, h - 8);
      ctx.fillStyle = '#1F2328';
      ctx.font = '600 11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(String(d.value), x + bw / 2, y - 5);
      ctx.textAlign = 'left';
    });
  };

  UI.ring = function (percent, size, color) {
    var r = (size || 78) / 2 - 6;
    var c = 2 * Math.PI * r;
    var p = Math.max(0, Math.min(100, percent));
    var svg = '<svg width="' + (size || 78) + '" height="' + (size || 78) + '" viewBox="0 0 ' + (size || 78) + ' ' + (size || 78) + '">' +
      '<circle cx="' + (size || 78) / 2 + '" cy="' + (size || 78) / 2 + '" r="' + r + '" fill="none" stroke="#F0F1F3" stroke-width="8"/>' +
      '<circle cx="' + (size || 78) / 2 + '" cy="' + (size || 78) / 2 + '" r="' + r + '" fill="none" stroke="' + (color || '#E10600') + '" stroke-width="8" stroke-linecap="round" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + (c - c * p / 100) + '" transform="rotate(-90 ' + (size || 78) / 2 + ' ' + (size || 78) / 2 + ')"/>' +
      '</svg>';
    return svg;
  };

  /* ---------- 区块头 ---------- */
  UI.sectionHead = function (title, extra) {
    return U.el('div', { class: 'section-head' }, [
      U.el('h2', { class: 'section-title', text: title }),
      extra || null
    ]);
  };

  UI.row = function (label, value, opts) {
    opts = opts || {};
    return U.el('div', { class: 'info-row' + (opts.block ? ' block' : '') }, [
      U.el('span', { class: 'info-label', text: label }),
      U.el('span', { class: 'info-value' + (opts.mono ? ' mono' : ''), html: value instanceof Node ? '' : String(value) })
    ]);
  };

  UI.moneyCell = function (n, cls) {
    return U.el('span', { class: 'money ' + (cls || ''), text: U.money(n) });
  };

  global.UI = UI;
})(window);

/* 员工端 v6：TAB / 分段滑动指示 + 低端设备降级
   仅写 CSS 变量与轻量类名，不改变页面结构、字段与交互逻辑 */
;(function () {
  'use strict';
  if (!window.document || !window.MutationObserver) return;
  var doc = document;
  var root = doc.documentElement;
  var nav = window.navigator || {};
  var low = (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) ||
    (nav.deviceMemory && nav.deviceMemory <= 4);
  if (low) root.classList.add('ui-lite');

  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
  var pending = false;

  function isStaff() {
    return !!doc.querySelector('.staff-app') || doc.body.getAttribute('data-page') === 'login';
  }

  function mark(container, active) {
    if (!container || !active) return;
    var w = active.offsetWidth;
    if (!w) return;
    container.style.setProperty('--ind-x', active.offsetLeft + 'px');
    container.style.setProperty('--ind-w', w + 'px');
    container.style.setProperty('--ind-on', '1');
  }

  function update() {
    pending = false;
    if (!isStaff()) return;

    /* 任务分类：父级卡片动态获得指示器类名 */
    var cat = doc.querySelector('.staff-main .cat-tab');
    if (cat && cat.parentNode) {
      var bar = cat.parentNode;
      if (bar.classList) bar.classList.add('ui-tabbar');
      mark(bar, bar.querySelector('.cat-tab.active') || cat);
    }

    var groups = [
      ['.staff-main .tabs', '.tab.active'],
      ['.staff-main .mail-seg', '.mail-seg-btn.active'],
      ['.staff-main .scan-modes', '.scan-mode.active'],
      ['.staff-main .theme-choice', '.theme-choice-btn.active']
    ];
    groups.forEach(function (g) {
      var list = doc.querySelectorAll(g[0]);
      for (var i = 0; i < list.length; i++) {
        var box = list[i];
        var act = box.querySelector(g[1]);
        if (act) mark(box, act);
        else box.style.setProperty('--ind-on', '0');
      }
    });
  }

  function schedule() {
    if (pending) return;
    pending = true;
    raf(update);
  }

  doc.addEventListener('click', schedule, true);
  window.addEventListener('resize', schedule);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', schedule);
  else schedule();

  try {
    new MutationObserver(schedule).observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  } catch (e) {}

  /* 数据加载与筛选重绘后的兜底 */
  setTimeout(schedule, 280);
  setTimeout(schedule, 1200);
})();
