/* layout.js — 路由守卫、员工端外壳（底部导航）、管理端外壳（左侧导航） */
(function (global) {
  'use strict';

  var PAGES = {
    'login': { title: '登录', role: 'guest', shell: 'none' },
    'admin-login': { title: '管理端登录', role: 'guest', shell: 'none' },
    'register': { title: '入职登记', role: 'guest', shell: 'none' },
    'pending': { title: '资料审核', role: 'staff', shell: 'staff', hideNav: true },
    'profile': { title: '主页', role: 'staff', shell: 'staff', active: 'profile' },
    'salary': { title: '我的薪资', role: 'staff', shell: 'staff', active: 'profile' },
    'attendance': { title: '我的考勤', role: 'staff', shell: 'staff', active: 'profile' },
    'score': { title: '我的量化分', role: 'staff', shell: 'staff', active: 'profile' },
    'leave': { title: '排休申请', role: 'staff', shell: 'staff', active: 'leave' },
    'expiry': { title: '效期检查', role: 'staff', shell: 'staff', active: 'expiry' },
    'schedule': { title: '我的日程', role: 'staff', shell: 'staff', active: 'profile' },
    'overdue-tasks': { title: '逾期任务', role: 'staff', shell: 'staff', active: 'tasks' },
    'notices': { title: '通知', role: 'staff', shell: 'staff', active: 'notices' },
    'messages': { title: '信息通知', role: 'staff', shell: 'staff', active: 'profile' },
    'reimburse': { title: '我的报销', role: 'staff', shell: 'staff', active: 'profile' },
    'account': { title: '信息修改', role: 'staff', shell: 'staff', active: 'profile' },
    'contacts': { title: '门店通讯录', role: 'staff', shell: 'staff', active: 'profile' },
    'user-profile': { title: '用户主页', role: 'staff', shell: 'staff', active: 'profile' },
    'tasks': { title: '我的任务', role: 'staff', shell: 'staff', active: 'tasks' },
    'shift-board': { title: '排班表', role: 'super', shell: 'staff', hideNav: true },
    'completed-tasks': { title: '已完成任务', role: 'staff', shell: 'staff', active: 'tasks' },
    'admin-dashboard': { title: '工作台', role: 'admin', shell: 'admin', active: 'admin-dashboard' },
    'admin-staff': { title: '员工档案', role: 'admin', shell: 'admin', active: 'admin-staff' },
    'admin-health-verify': { title: '健康证核验', role: 'super', shell: 'admin', active: 'admin-health-verify' },
    'admin-staff-detail': { title: '档案详情', role: 'admin', shell: 'admin', active: 'admin-staff' },
    'admin-salary': { title: '薪资管理', role: 'admin', shell: 'admin', active: 'admin-salary' },
    'admin-score': { title: '量化分管理', role: 'admin', shell: 'admin', active: 'admin-score' },
    'admin-leave': { title: '排休审批', role: 'admin', shell: 'admin', active: 'admin-leave' },
    'admin-attendance': { title: '考勤与月休台账', role: 'admin', shell: 'admin', active: 'admin-attendance' },
    'admin-tasks': { title: '任务管理', role: 'admin', shell: 'admin', active: 'admin-tasks' },
    'admin-reimburse': { title: '报销管理', role: 'super', shell: 'admin', active: 'admin-reimburse' },
    'admin-settings': { title: '系统设置', role: 'super', shell: 'admin', active: 'admin-settings' },
    'admin-expiry': { title: '效期配置', role: 'super', shell: 'admin', active: 'admin-expiry' }
  };

  /* 一级页：保留底栏、不显示返回；其余员工端页面统一为二级页 */
  var PRIMARY_PAGES = { 'profile': true, 'tasks': true, 'leave': true, 'expiry': true };

  var Layout = {};

  Layout.meta = function (page) { return PAGES[page] || { title: '页面', role: 'staff', shell: 'staff' }; };

  Layout.isPrimaryPage = function (page) { return !!PRIMARY_PAGES[page]; };

  /* 二级页兜底返回：按所属一级页归位 */
  Layout.fallbackFor = function (page) {
    var meta = PAGES[page];
    if (!meta) return 'profile.html';
    if (meta.parent) return meta.parent;
    if (meta.active === 'tasks') return 'tasks.html';
    if (meta.active === 'leave') return 'leave.html';
    return 'profile.html';
  };

  /* 优先回退历史；无同源历史（直接打开/刷新/来自登录页）时回到所属一级页 */
  Layout.goBack = function (fallback) {
    var fb = fallback || 'profile.html';
    var ref = document.referrer || '';
    var sameOrigin = false;
    var refPath = '';
    try {
      if (ref) {
        var u = new URL(ref, location.href);
        sameOrigin = u.origin === location.origin;
        refPath = u.pathname.split('/').pop() || '';
      }
    } catch (e) { sameOrigin = false; }
    var fromAuth = /^(login|admin-login|register|pending)\.html$/.test(refPath);
    if (sameOrigin && !fromAuth && window.history.length > 1) {
      window.history.back();
      return;
    }
    location.replace(fb);
  };

  Layout.guard = function (page) {
    var meta = Layout.meta(page);
    var ses = Auth.current();

    if (meta.role === 'guest') {
      if ((page === 'login' || page === 'admin-login') && ses && location.search.indexOf('stay=1') < 0) {
        location.replace(Auth.home());
        return { ok: false, redirected: true };
      }
      return { ok: true, session: ses, meta: meta };
    }
    if (!ses) {
      location.replace(Auth.loginPage() + '?next=' + encodeURIComponent(page));
      return { ok: false, redirected: true };
    }
    var staff = Store.getStaff(ses.staffId);
    if ((meta.role === 'admin' || meta.role === 'super') && ses.role !== 'admin' && ses.role !== 'superadmin') {
      return { ok: false, denied: 'role', session: ses, meta: meta };
    }
    if (meta.role === 'super' && ses.role !== 'superadmin') {
      return { ok: false, denied: 'super', session: ses, meta: meta };
    }
    if (meta.role === 'staff' && ses.role === 'staff') {
      if (staff && (staff.status === 'resigned' || staff.status === 'disabled')) {
        return { ok: false, denied: 'disabled', session: ses, meta: meta, staff: staff };
      }
      if (staff && staff.status === 'pending' && ['profile', 'pending'].indexOf(page) < 0) {
        location.replace('pending.html');
        return { ok: false, redirected: true };
      }
    }
    return { ok: true, session: ses, meta: meta, staff: staff };
  };

  function navTo(page) { location.href = page + '.html'; }

  Layout.renderDenied = function (root, type, staff) {
    root.innerHTML = '';
    var wrap = U.el('div', { class: 'center-page' });
    var box = U.el('div', { class: 'state-box' }, [
      U.el('div', { class: 'state-icon danger', html: UI.icon('shield', 30) }),
      U.el('h3', { class: 'state-title', text: type === 'disabled' ? '账号已停用' : '无访问权限' }),
      U.el('p', {
        class: 'state-desc',
        text: type === 'super' ? '该页面仅店长（超级管理员）可访问。'
          : type === 'disabled' ? '账号已停用，如需查询历史薪资请联系店长。'
            : '该页面仅店长与门店管理组可访问。'
      })
    ]);
    if (staff && type === 'disabled') {
      box.appendChild(U.el('button', {
        class: 'btn btn-ghost', type: 'button', text: '退出登录',
        onclick: function () { var to = Auth.loginPage(); api.logout().then(function () { location.replace(to); }); }
      }));
    } else {
      box.appendChild(U.el('button', {
        class: 'btn btn-primary', type: 'button', text: '返回工作台',
        onclick: function () { location.href = Auth.isAdmin() ? 'admin-dashboard.html' : Auth.home(); }
      }));
    }
    wrap.appendChild(box);
    root.appendChild(wrap);
  };

  function storeBrand(compact) {
    return U.el('div', { class: 'brand' + (compact ? ' compact' : '') }, [
      U.el('div', { class: 'brand-mark', text: '塔' }),
      compact ? null : U.el('div', { class: 'brand-text' }, [
        U.el('strong', { text: '塔斯汀' }),
        U.el('span', { text: '门店人员管理系统' })
      ])
    ]);
  }

  Layout.staffShell = function (opts, content) {
    var root = document.getElementById('app');
    root.innerHTML = '';
    var ses = Auth.current();
    var staff = Store.getStaff(ses.staffId) || {};
    var page = document.body.getAttribute('data-page') || '';
    /* 一级页保留底栏且不显示返回；pending 属公开流程页，维持原样 */
    var isSecondary = !!(page && !PRIMARY_PAGES[page] && page !== 'pending');
    var hideNav = !!opts.hideNav || isSecondary;
    var showBack = !!opts.back || isSecondary;
    var backTarget = opts.back || Layout.fallbackFor(page);
    var app = U.el('div', { class: 'staff-app' + (hideNav ? ' no-bottom-nav' : '') });

    var head = U.el('header', { class: 'topbar' }, [
      U.el('div', { class: 'topbar-left' }, [
        showBack ? U.el('button', {
          class: 'icon-btn', type: 'button', 'aria-label': '返回',
          html: UI.icon('arrowLeft', 20),
          onclick: function () {
            if (page === 'pending') { location.href = backTarget; return; }
            Layout.goBack(backTarget);
          }
        }) : null,
        U.el('div', {}, [
          U.el('h1', { class: 'topbar-title', text: opts.title || '' }),
          U.el('p', { class: 'topbar-sub', text: (api.storeInfo().shortName || '') + ' · ' + (U.empNoOf(staff) || '待审核') })
        ])
      ]),
      (function () {
        var msgDot = U.el('span', { class: 'msg-dot', style: { display: 'none' } });
        msgDot.setAttribute('data-msg-dot', '');
        var msgBtn = U.el('button', {
          class: 'icon-btn msg-icon-btn', type: 'button', 'aria-label': '信箱',
          onclick: function () { location.href = 'messages.html'; }
        }, [U.el('span', { html: UI.icon('mail', 20) }), msgDot]);
        var themeBtn = U.el('button', {
          class: 'icon-btn theme-toggle-btn', type: 'button',
          'data-theme-toggle': '', 'aria-label': '外观：跟随系统',
          title: '外观：跟随系统 (点击切换)',
          onclick: function () { if (global.Theme) global.Theme.cycle(); }
        }, [U.el('span', { 'data-theme-glyph': '', html: global.Theme ? global.Theme.icon() : '' })]);
        var avatarBtn = U.el('button', {
          class: 'avatar-btn', type: 'button', 'aria-label': '账号',
          onclick: function () { openAccountSheet(staff); }
        }, [UI.userAvatar(staff.name || ses.name, staff.avatar, 'avatar-sm')]);
        return U.el('div', { class: 'topbar-actions' }, [msgBtn, themeBtn, avatarBtn]);
      })()
    ]);
    app.appendChild(head);
    if (global.Theme) global.Theme.sync();
    Layout.startMessageWatch();

    var bannerSlot = U.el('div', { class: 'birthday-slot' });
    app.appendChild(bannerSlot);
    renderBannerCarousel(bannerSlot);

    var main = U.el('main', { class: 'staff-main' + (hideNav ? ' no-nav' : '') });
    if (content) main.appendChild(content);
    app.appendChild(main);

    /* 底栏只保留在一级页；二级页与待审核账号不显示 */
    if (!hideNav && staff.status !== 'pending') {
      app.appendChild(buildBottomNav(opts.active));
    }
    root.appendChild(app);
    return main;
  };

  /*
   * 顶部轮播：仅承载未读公告通知，每条未读通知各占一屏，按时间倒序。
   * 生日关怀横幅只在主页「导航卡片」上方展示，不再进入全站轮播。
   * 轮播按“数据 -> 屏数”重算：任一数据源稍后返回或发生变化都会重建
   * 轨道、圆点与定时器，不会在数据未就绪时把“单屏隐藏圆点”的判断固化下来。
   */
  var MAX_NOTICE_SLIDES = 5; /* 未读过多时最多逐条展示 5 条，其余收进“查看全部”屏，避免无限增屏 */
  var banner = {
    slot: null,
    notices: null,
    sig: '',
    destroy: null,
    seq: 0,
    noticeSeq: 0,
    retries: 0,
    retryTimer: null,
    idx: 0
  };

  function renderBannerCarousel(slot) {
    banner.slot = slot;
    banner.notices = null;
    banner.sig = '';
    banner.idx = 0;
    banner.seq += 1;
    banner.retries = 0;
    if (banner.destroy) { banner.destroy(); banner.destroy = null; }
    slot.innerHTML = '';
    loadBannerData();
  }

  function clearBannerRetry() {
    if (banner.retryTimer) { clearTimeout(banner.retryTimer); banner.retryTimer = null; }
  }

  function loadBannerData() {
    var slot = banner.slot;
    if (!slot) return;
    clearBannerRetry();
    var seq = ++banner.seq;
    var nseq = banner.noticeSeq;
    api.noticeList('').then(function (r) {
      if (!banner.slot || banner.slot !== slot || seq !== banner.seq || nseq !== banner.noticeSeq) return;
      banner.notices = (r && r.list) || [];
      paintBanner();
      banner.retries = 0;
    }).catch(function () {
      if (!banner.slot || banner.slot !== slot || seq !== banner.seq) return;
      /* 接口未就绪（如登录态/网络抖动）时最多重试 3 次，避免一直停留在空白 */
      if (banner.retries < 3) {
        banner.retries += 1;
        clearBannerRetry();
        banner.retryTimer = setTimeout(function () {
          banner.retryTimer = null;
          if (banner.slot) loadBannerData();
        }, 1500);
      }
    });
  }

  function pickUnreadNotices(list) {
    return (list || []).filter(function (n) { return !n.read; })
      .sort(function (a, b) {
        return String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt));
      });
  }

  function paintBanner() {
    var slot = banner.slot;
    if (!slot) return;

    var slides = [];
    var unread = pickUnreadNotices(banner.notices);
    var shown = unread.slice(0, MAX_NOTICE_SLIDES);
    shown.forEach(function (n) {
      slides.push({ sig: 'n:' + n.id, el: noticeSlide(n) });
    });
    var overflow = unread.length - shown.length;
    if (overflow > 0) {
      slides.push({ sig: 'm:' + overflow, el: moreSlide(overflow) });
    }

    var sig = slides.map(function (s) { return s.sig; }).join('|');
    /* 屏数/内容没变时保留现有轮播与定时器，避免每次刷新都重置 5 秒计时 */
    if (sig === banner.sig) return;
    banner.sig = sig;

    if (banner.destroy) { banner.destroy(); banner.destroy = null; }
    slot.innerHTML = '';
    if (!slides.length) {
      banner.idx = 0;
      return;
    }

    /* 正在浏览的屏被移除时钳制到新的最后一屏，避免停在空白位置 */
    var startIdx = Math.min(banner.idx, slides.length - 1);
    var built = buildBannerCarousel(slides.map(function (s) { return s.el; }), startIdx, function (i) {
      banner.idx = i;
    });
    banner.idx = startIdx;
    banner.destroy = built.destroy;
    slot.appendChild(built.el);
  }

  /* 页面拿到自己的通知数据后可回灌轮播（信箱页用同一份数据，避免重复请求导致的口径不一致） */
  Layout.refreshBanner = function (notices) {
    if (!banner.slot) return;
    if (notices && typeof notices.length === 'number') {
      /* 页面数据优先：作废更早发起、尚未返回的通知请求，避免旧数据覆盖新口径 */
      banner.noticeSeq += 1;
      banner.notices = notices;
      paintBanner();
      return;
    }
    loadBannerData();
  };

  /* 生日关怀横幅：仅在主页「导航卡片」上方挂载，无生日时不占位 */
  function birthdayBanner(list) {
    var multi = list.length > 1;
    var chips = U.el('div', { class: 'bb-chips' });
    list.forEach(function (x) {
      chips.appendChild(U.el('span', { class: 'bb-chip' }, [
        U.el('span', { class: 'bb-chip-name', text: x.displayName || x.name }),
        U.el('span', { class: 'bb-chip-date', text: String(x.birthday).slice(5).replace('-', '/') })
      ]));
    });
    var main = U.el('div', { class: 'bb-main' });
    if (multi) {
      main.appendChild(chips);
    } else {
      var only = list[0];
      main.appendChild(U.el('div', { class: 'bb-name-row' }, [
        U.el('span', { class: 'bb-name', text: only.displayName || only.name }),
        U.el('span', { class: 'bb-date', text: String(only.birthday).slice(5).replace('-', '/') })
      ]));
    }
    main.appendChild(U.el('div', { class: 'bb-title', text: '愿今天和往后的每一天，都有好心情' }));
    main.appendChild(U.el('div', { class: 'bb-text', text: '谢谢你把认真和温柔带进店里，生日快乐。' }));
    return U.el('div', { class: 'birthday-banner ' + (multi ? 'multi' : 'single') }, [
      U.el('div', { class: 'bb-stamp-wrap' }, [
        U.el('span', { class: 'bb-stamp', html: UI.icon('cake', 20) }),
        U.el('span', { class: 'bb-perf' })
      ]),
      main,
      U.el('span', { class: 'bb-mark' })
    ]);
  }

  Layout.mountBirthdayBanner = function (slot) {
    if (!slot) return;
    slot.innerHTML = '';
    api.birthdayList().then(function (r) {
      var list = (r && r.list) || [];
      if (!list.length) return;
      slot.appendChild(birthdayBanner(list));
    }).catch(function () {});
  };

  function noticeSlide(n) {
    var summary = String(n.body || '').replace(/\s+/g, ' ').trim();
    if (summary.length > 48) summary = summary.slice(0, 48) + '…';
    return U.el('div', { class: 'banner-slide' }, [
      U.el('div', {
        class: 'banner-notice', role: 'button', tabindex: '0',
        onclick: function () { openNoticeFromBanner(n.id); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNoticeFromBanner(n.id); }
        }
      }, [
        U.el('div', { class: 'bn-icon', html: UI.icon('bell', 18) }),
        U.el('div', { class: 'bn-body' }, [
          U.el('div', { class: 'bn-head' }, [
            U.el('div', { class: 'bn-title', text: n.title }),
            U.el('span', { class: 'bn-time', text: U.fmtTime(n.publishedAt || n.createdAt) })
          ]),
          U.el('div', { class: 'bn-text', text: summary })
        ])
      ])
    ]);
  }

  /* 未读超过逐条展示上限时的收口屏：进入信箱查看全部 */
  function moreSlide(count) {
    var goAll = function () { location.href = 'messages.html?view=notices'; };
    return U.el('div', { class: 'banner-slide' }, [
      U.el('div', {
        class: 'banner-notice', role: 'button', tabindex: '0',
        onclick: goAll,
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goAll(); }
        }
      }, [
        U.el('div', { class: 'bn-icon', html: UI.icon('bell', 18) }),
        U.el('div', { class: 'bn-body' }, [
          U.el('div', { class: 'bn-head' }, [
            U.el('div', { class: 'bn-title', text: '还有 ' + count + ' 条未读通知' })
          ]),
          U.el('div', { class: 'bn-text', text: '进入信箱查看全部通知' })
        ])
      ])
    ]);
  }

  function openNoticeFromBanner(id) {
    var go = function () { location.href = 'messages.html?notice=' + encodeURIComponent(id); };
    api.markNoticeRead(id).then(function () {
      Layout.refreshNoticeUnread();
      go();
    }).catch(go);
  }

  function buildBannerCarousel(slides, startIdx, onIndex) {
    var track = U.el('div', { class: 'banner-track' });
    slides.forEach(function (s) { track.appendChild(s); });
    var wrap = U.el('div', { class: 'banner-carousel', 'aria-label': '顶部推荐' }, [track]);
    var idx = startIdx || 0;
    var timer = null;
    var paused = false;
    var startX = 0;
    var deltaX = 0;
    var swiping = false;
    var suppressClick = false;
    var dots = null;

    function go(i) {
      idx = (i + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + (idx * 100) + '%)';
      if (dots) {
        [].slice.call(dots.children).forEach(function (d, j) {
          d.classList.toggle('active', j === idx);
        });
      }
      if (onIndex) onIndex(idx);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      stop();
      if (slides.length < 2) return;
      timer = setInterval(function () {
        if (!paused && !document.hidden) go(idx + 1);
      }, 5000);
    }

    /* 圆点容器始终保留：单屏与多屏切换时高度不变，避免轮播跳动 */
    dots = U.el('div', { class: 'banner-dots' });
    if (slides.length > 1) {
      slides.forEach(function (_, i) {
        dots.appendChild(U.el('button', {
          class: 'banner-dot' + (i === idx ? ' active' : ''), type: 'button',
          'aria-label': '第 ' + (i + 1) + ' 屏',
          onclick: function () { go(i); start(); }
        }));
      });
    }
    wrap.appendChild(dots);
    go(idx);

    if (slides.length > 1) {
      wrap.addEventListener('mouseenter', function () { paused = true; });
      wrap.addEventListener('mouseleave', function () { paused = false; start(); });
      track.style.touchAction = 'pan-y';
      track.addEventListener('touchstart', function (e) {
        paused = true;
        swiping = true;
        suppressClick = false;
        startX = e.touches[0].clientX;
        deltaX = 0;
      }, { passive: true });
      track.addEventListener('touchmove', function (e) {
        if (!swiping) return;
        deltaX = e.touches[0].clientX - startX;
      }, { passive: true });
      track.addEventListener('touchend', function () {
        if (!swiping) return;
        swiping = false;
        paused = false;
        if (Math.abs(deltaX) > 40) {
          suppressClick = true;
          if (deltaX > 40) go(idx - 1); else go(idx + 1);
          setTimeout(function () { suppressClick = false; }, 300);
        }
        start();
      });
      wrap.addEventListener('click', function (e) {
        if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
      }, true);
      start();
    }
    return {
      el: wrap,
      destroy: function () {
        stop();
      }
    };
  }

  /* 兼职/小时工走排班，全职走排休 */
  function leaveNavLabel() {
    var ses = Auth.current && Auth.current();
    if (ses && ses.role === 'superadmin') return '排班审批';
    var s = (ses && ses.staffId && Store.getStaff) ? Store.getStaff(ses.staffId) : null;
    return (s && s.employmentType && s.employmentType !== '全职') ? '排班' : '排休';
  }

  var noticeUnread = 0;

  /* 通知未读并入右上角信箱角标（底栏不再承载通知入口） */
  Layout.setNoticeUnread = function (n) {
    var prev = noticeUnread;
    noticeUnread = Math.max(0, parseInt(n, 10) || 0);
    syncMailboxBadge();

    /*
     * 未读数变化（读完某条、收到新通知）时重算轮播屏数：
     * 已读的那屏消失、新增未读补屏，并保持当前浏览位置不落在空白处。
     */
    if (banner.slot && prev !== noticeUnread && banner.notices !== null) {
      loadBannerData();
    }
  };

  var unreadPromise = null;
  Layout.refreshNoticeUnread = function (cb) {
    if (!unreadPromise) {
      unreadPromise = api.noticeUnread().then(function (r) {
        Layout.setNoticeUnread(r ? r.unreadTotal : 0);
        return r || { unreadTotal: 0 };
      }).catch(function () { return { unreadTotal: 0 }; }).then(function (r) {
        unreadPromise = null;
        return r;
      });
    }
    if (cb) unreadPromise.then(cb);
  };

  /* ---------- 站内消息提醒 ---------- */
  var messageUnread = 0;
  var messageListeners = [];
  var messagePromise = null;
  var messageWatchStarted = false;
  var messageEntered = false;

  function syncMailboxBadge() {
    var total = noticeUnread + messageUnread;
    U.$$('[data-msg-dot]').forEach(function (el) {
      el.style.display = total > 0 ? '' : 'none';
      el.setAttribute('aria-label', total > 0 ? '有未读消息' : '');
    });
    /* 入口角标统一只表达“有/无”；标题统一由 site-title.js 管理，这里不再改写，避免覆盖站点标题配置 */
  }

  /* 信箱角标 = 通知未读 + 消息未读；消息订阅仍只针对站内消息 */
  Layout.setMessageUnread = function (n) {
    var prev = messageUnread;
    messageUnread = Math.max(0, parseInt(n, 10) || 0);
    syncMailboxBadge();
    if (prev !== messageUnread) {
      messageListeners.forEach(function (fn) {
        try { fn(messageUnread, prev); } catch (e) { /* ignore */ }
      });
    }
  };

  Layout.messageUnread = function () { return messageUnread; };

  /* 页面内订阅未读数变化（信息通知页用于即时刷新列表） */
  Layout.onMessageRefresh = function (fn) {
    if (typeof fn === 'function' && messageListeners.indexOf(fn) < 0) messageListeners.push(fn);
  };

  Layout.refreshMessageUnread = function (cb) {
    if (!messagePromise) {
      messagePromise = api.messageUnread().then(function (r) {
        Layout.setMessageUnread(r ? r.unreadCount : 0);
        return messageUnread;
      }).catch(function () { return messageUnread; }).then(function (n) {
        messagePromise = null;
        return n;
      });
    }
    if (cb) messagePromise.then(cb);
  };

  /*
   * 刷新策略：进入页面先拉一次；停留期间每 30 秒轮询（页面隐藏时跳过）；
   * 切回页面（visibilitychange）或窗口重新聚焦（focus）时立即拉取。
   */
  Layout.startMessageWatch = function () {
    var page = document.body.getAttribute('data-page') || '';
    Layout.refreshNoticeUnread();
    Layout.refreshMessageUnread(function (n) {
      if (messageEntered) return;
      messageEntered = true;
      if (n > 0 && page !== 'messages') {
        setTimeout(function () {
          UI.toast('你有 ' + n + ' 条未读消息，点击右上角信箱查看', 'info', 3200);
        }, 500);
      }
    });
    if (messageWatchStarted) return;
    messageWatchStarted = true;
    setInterval(function () {
      if (document.hidden) return;
      Layout.refreshNoticeUnread();
      Layout.refreshMessageUnread();
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        Layout.refreshNoticeUnread();
        Layout.refreshMessageUnread();
      }
    });
    window.addEventListener('focus', function () {
      Layout.refreshNoticeUnread();
      Layout.refreshMessageUnread();
    });
  };

  var taskPending = 0;
  var taskOverdue = false;

  /* 任务角标与逾期合并为一个红点：只表达“有/无”，不显示数量 */
  function syncTaskDot() {
    var show = taskPending > 0 || taskOverdue;
    U.$$('[data-task-badge]').forEach(function (el) {
      el.style.display = show ? '' : 'none';
      el.setAttribute('aria-label', '有待办任务');
    });
  }

  /* 任务待办角标：今日待完成 + 已驳回 */
  Layout.setTaskPending = function (n) {
    taskPending = Math.max(0, parseInt(n, 10) || 0);
    syncTaskDot();
  };

  var taskPromise = null;
  Layout.setTaskOverdue = function (has) {
    taskOverdue = !!has;
    syncTaskDot();
  };
  Layout.refreshTaskPending = function (cb) {
    if (!taskPromise) {
      taskPromise = api.taskMyList().then(function (r) {
        /* 角标只统计当天未完成（待完成 + 已驳回），逾期不计入 */
        var todo = r.todayPending || 0;
        Layout.setTaskPending(todo);
        Layout.setTaskOverdue((r.overdueCount || 0) > 0);
        return todo;
      }).catch(function () { return 0; });
    }
    if (cb) taskPromise.then(cb);
  };

  function buildBottomNav(active) {
    var ses = Auth.current();
    var staff = (ses && Store.getStaff(ses.staffId)) || {};
    /* 兼职不展示「任务」入口（页面本身不做拦截，直接访问仍按原身份规则处理） */
    var isPartTime = String(staff.employmentType || '').trim() === '兼职';
    var tabs = [
      { key: 'profile', label: '主页', icon: 'user', href: 'profile.html' },
      { key: 'tasks', label: '任务', icon: 'clipboard', href: 'tasks.html', badge: 'task' },
      { key: 'leave', label: leaveNavLabel(), icon: 'calendar', href: 'leave.html' },
      { key: 'expiry', label: '效期', icon: 'clock', href: 'expiry.html' }
    ];
    if (isPartTime) {
      tabs = tabs.filter(function (t) { return t.key !== 'tasks'; });
    }
    var nav = U.el('nav', { class: 'bottom-nav' }, tabs.map(function (t) {
      var iconWrap = U.el('span', { class: 'nav-icon', html: UI.icon(t.icon, 22) });
      if (t.badge === 'task') {
        var tdot = U.el('span', { class: 'nav-dot', style: { display: 'none' } });
        tdot.setAttribute('data-task-badge', '');
        tdot.setAttribute('aria-label', '有待办任务');
        iconWrap.appendChild(tdot);
      }
      return U.el('a', {
        class: 'nav-tab' + (active === t.key ? ' active' : ''), href: t.href
      }, [
        iconWrap,
        U.el('span', { class: 'nav-label', text: t.label })
      ]);
    }));
    /* 列数与实际入口数一致，2 列时仍等分居中，避免隐藏后左侧留空导致整体偏移 */
    nav.style.gridTemplateColumns = 'repeat(' + tabs.length + ', minmax(0, 1fr))';
    if (!isPartTime) Layout.refreshTaskPending();
    return nav;
  }

  var ADMIN_NAV = [
    { key: 'admin-dashboard', label: '工作台', icon: 'grid', href: 'admin-dashboard.html' },
    { key: 'admin-staff', label: '员工档案', icon: 'users', href: 'admin-staff.html' },
    { key: 'admin-health-verify', label: '健康证核验', icon: 'shield', href: 'admin-health-verify.html', superOnly: true },
    { key: 'admin-salary', label: '薪资管理', icon: 'money', href: 'admin-salary.html' },
    { key: 'admin-score', label: '量化分管理', icon: 'star', href: 'admin-score.html' },
    { key: 'admin-leave', label: '考勤与排休', icon: 'calendar', href: 'admin-leave.html', related: ['admin-leave', 'admin-attendance'] },
    { key: 'admin-tasks', label: '任务管理', icon: 'clipboard', href: 'admin-tasks.html' },
    { key: 'admin-expiry', label: '效期配置', icon: 'clock', href: 'admin-expiry.html', superOnly: true },
    { key: 'admin-reimburse', label: '报销管理', icon: 'money', href: 'admin-reimburse.html', superOnly: true },
    { key: 'admin-notices', label: '通知管理', icon: 'bell', href: 'admin-notices.html' },
    { key: 'admin-settings', label: '系统设置', icon: 'settings', href: 'admin-settings.html', superOnly: true }
  ];

  Layout.adminShell = function (opts, content) {
    var root = document.getElementById('app');
    root.innerHTML = '';
    var ses = Auth.current();
    var staff = Store.getStaff(ses.staffId) || {};
    var info = api.storeInfo();
    var app = U.el('div', { class: 'admin-app' });

    var nav = U.el('nav', { class: 'side-nav' });
    nav.appendChild(U.el('div', { class: 'side-brand' }, [
      U.el('div', { class: 'brand-mark', text: '塔' }),
      U.el('div', { class: 'side-brand-text' }, [
        U.el('strong', { text: '塔斯汀' }),
        U.el('span', { text: '门店人员管理系统' })
      ])
    ]));
    nav.appendChild(U.el('div', { class: 'side-store' }, [
      U.el('div', { class: 'side-store-name', text: info.shortName }),
      U.el('div', { class: 'side-store-code', text: '门店代号 ' + info.code })
    ]));
    var navList = U.el('div', { class: 'side-list' });
    ADMIN_NAV.forEach(function (item) {
      if (item.superOnly && ses.role !== 'superadmin') return;
      var active = opts.active === item.key || (item.related && item.related.indexOf(opts.active) >= 0);
      navList.appendChild(U.el('a', {
        class: 'side-item' + (active ? ' active' : ''), href: item.href
      }, [
        U.el('span', { class: 'side-item-icon', html: UI.icon(item.icon, 19) }),
        U.el('span', { class: 'side-item-label', text: item.label })
      ]));
    });
    nav.appendChild(navList);

    nav.appendChild(U.el('div', { class: 'side-user' }, [
      UI.userAvatar(staff.name || ses.name, staff.avatar, 'avatar-sm'),
      U.el('div', { class: 'side-user-text' }, [
        U.el('strong', { text: UI.displayName(staff.name || ses.name, staff.nickname) }),
        U.el('span', { text: api.roleLabel(ses.role) })
      ]),
      U.el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': '退出登录', html: UI.icon('logout', 18),
        onclick: function () {
          UI.confirm({ title: '退出登录', message: '确认退出当前账号？', confirmText: '退出' }).then(function (yes) {
            if (!yes) return;
            var to = Auth.loginPage();
            api.logout().then(function () { location.replace(to); });
          });
        }
      })
    ]));

    var overlay = U.el('div', { class: 'side-overlay', onclick: function () { app.classList.remove('nav-open'); } });

    /* 后台页面统一左上角返回：工作台回员工主页，其余页面回工作台；有历史时优先回退 */
    var adminPage = document.body.getAttribute('data-page') || '';
    var adminFallback = adminPage === 'admin-dashboard' ? 'profile.html' : 'admin-dashboard.html';

    var top = U.el('header', { class: 'admin-topbar' }, [
      U.el('button', {
        class: 'icon-btn admin-back-btn', type: 'button', 'aria-label': '返回',
        html: UI.icon('arrowLeft', 20),
        onclick: function () { Layout.goBack(adminFallback); }
      }),
      U.el('button', {
        class: 'icon-btn menu-btn', type: 'button', 'aria-label': '菜单', html: UI.icon('menu', 22),
        onclick: function () { app.classList.toggle('nav-open'); }
      }),
      U.el('div', { class: 'admin-topbar-title' }, [
        U.el('h1', { text: opts.title || '' }),
        U.el('span', { class: 'admin-topbar-date', text: U.today() + ' · ' + info.shortName })
      ]),
      U.el('div', { class: 'admin-topbar-right' }, [
        U.el('button', {
          class: 'icon-btn theme-toggle-btn', type: 'button',
          'data-theme-toggle': '', 'aria-label': '外观：跟随系统',
          title: '外观：跟随系统 (点击切换)',
          onclick: function () { if (global.Theme) global.Theme.cycle(); }
        }, [U.el('span', { 'data-theme-glyph': '', html: global.Theme ? global.Theme.icon() : '' })]),
        U.el('a', { class: 'top-link', href: 'profile.html', text: '主页' }),
        U.el('button', {
          class: 'top-user', type: 'button',
          onclick: function () { openAccountSheet(staff); }
        }, [
          UI.userAvatar(staff.name || ses.name, staff.avatar, 'avatar-xs'),
          U.el('span', { text: UI.displayName(staff.name || ses.name, staff.nickname) })
        ])
      ])
    ]);

    var main = U.el('main', { class: 'admin-main' });
    var contentWrap = U.el('div', { class: 'admin-content' });
    if (content) contentWrap.appendChild(content);
    main.appendChild(contentWrap);

    app.appendChild(nav);
    app.appendChild(overlay);
    app.appendChild(U.el('div', { class: 'admin-body' }, [top, main]));
    root.appendChild(app);
    if (global.Theme) global.Theme.sync();
    return contentWrap;
  };

  function openAccountSheet(staff) {
    var ses = Auth.current();
    var body = U.el('div', { class: 'account-sheet' }, [
      U.el('div', { class: 'account-head' }, [
        UI.userAvatar(staff.name || ses.name, staff.avatar, 'avatar-lg'),
        U.el('div', {}, [
          U.el('strong', { text: UI.displayName(staff.name || ses.name, staff.nickname) }),
          U.el('div', { class: 'muted', text: api.roleLabel(ses.role) + ' · ' + (staff.position || '') })
        ])
      ]),
      U.el('div', { class: 'info-list' }, [
        U.el('div', { class: 'info-row' }, [U.el('span', { class: 'info-label', text: '手机号' }), U.el('span', { class: 'info-value', text: ses.phone })]),
        U.el('div', { class: 'info-row' }, [U.el('span', { class: 'info-label', text: '飞书工号' }), U.el('span', { class: 'info-value', text: U.empNoOf(staff) || '待审核' })]),
        U.el('div', { class: 'info-row' }, [U.el('span', { class: 'info-label', text: '本次登录' }), U.el('span', { class: 'info-value', text: U.fmtTime(ses.loginAt) })])
      ])
    ]);
    UI.openModal({
      title: '账号信息',
      body: body,
      size: 'sm',
      footer: [
        { text: '修改密码', class: 'btn-ghost sheet-action', onClick: function (btn, close) { close(); setTimeout(openPasswordModal, 120); } },
        { text: '信息修改', class: 'btn-ghost sheet-action', onClick: function () { location.href = 'account.html'; } },
        {
          text: '退出登录', class: 'btn-danger sheet-action',
          onClick: function () {
            var to = Auth.loginPage();
            api.logout().then(function () { location.replace(to); });
          }
        }
      ]
    });
  }

  function openPasswordModal() {
    var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
    form.innerHTML =
      '<div class="field"><label class="label">原密码 <i class="req">*</i></label><input class="input" type="password" name="oldPassword" placeholder="请输入当前密码"></div>' +
      '<div class="field"><label class="label">新密码 <i class="req">*</i></label><input class="input" type="password" name="newPassword" placeholder="6—20 位，需包含字母和数字"><div class="hint">密码需 6—20 位，且包含字母和数字。</div></div>' +
      '<div class="field"><label class="label">确认新密码 <i class="req">*</i></label><input class="input" type="password" name="confirmPassword" placeholder="再次输入新密码"></div>';
    UI.openModal({
      title: '修改密码',
      body: form,
      size: 'sm',
      footer: [
        { text: '取消', class: 'btn-ghost' },
        {
          text: '保存', class: 'btn-primary',
          onClick: function (btn, close) {
            var fd = new FormData(form);
            var payload = {
              oldPassword: fd.get('oldPassword'), newPassword: fd.get('newPassword'),
              confirmPassword: fd.get('confirmPassword')
            };
            UI.btnLoading(btn, true, '保存中…');
            api.changePassword(payload).then(function () {
              UI.btnLoading(btn, false);
              UI.toast('密码已更新', 'success');
              close();
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

  Layout.openAccountSheet = openAccountSheet;
  Layout.openPasswordModal = openPasswordModal;
  global.Layout = Layout;
})(window);
