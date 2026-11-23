/* P18 员工端 — 信息通知（系统/任务单条消息 + 私信会话） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['messages'] = function () {
    var state = {
      list: [], threads: [], unread: 0, filter: 'all',
      notices: { list: [], counts: {}, unreadTotal: 0 },
      noticePage: 1, noticeTotal: 0, noticeTotalPages: 1,
      msgPage: 1, msgTotal: 0, msgTotalPages: 1,
      msgUnread: { all: 0, system: 0, task: 0 },
      mode: 'notice',
      noticeCat: '',
      view: 'list', peer: null, messages: []
    };
    var NOTICE_CATS = ['总部通知', '餐厅通知', '门店通知'];
    /* 顶部轮播点击通知后直达详情：messages.html?notice=xxx */
    var pendingNoticeId = (function () {
      var m = location.search.match(/[?&]notice=([^&]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    })();
    /* 匿名反馈通知直达：messages.html?feedback=xxx */
    var pendingFeedbackId = (function () {
      var m = location.search.match(/[?&]feedback=([^&]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    })();
    /* notices.html?view=notices 等旧入口：显式指定信箱内的视图，不因参数跳过通知数据加载 */
    var initialView = (function () {
      var m = location.search.match(/[?&]view=([^&]*)/);
      return m ? decodeURIComponent(m[1]) : '';
    })();
    var FILTERS = [
      { key: 'all', label: '全部' },
      { key: 'system', label: '系统通知' },
      { key: 'task', label: '任务通知' },
      { key: 'private', label: '私信' }
    ];
    var main = Layout.staffShell({ title: '信箱', active: 'profile', back: 'profile.html' }, UI.skeleton(2));
    var appEl = document.querySelector('.staff-app');
    var topbarEl = document.querySelector('.topbar');
    var topbarLeft = document.querySelector('.topbar-left');
    var titleEl = document.querySelector('.topbar-title');
    var subEl = document.querySelector('.topbar-sub');
    var pageTitle = titleEl ? titleEl.textContent : '信息通知';
    var pageSub = subEl ? subEl.textContent : '';
    var viewportBound = false;

    /* 顶栏返回：Layout 用 addEventListener 绑定，会话态在捕获阶段拦下，避免同时触发跳转 */
    if (topbarEl) {
      topbarEl.addEventListener('click', function (e) {
        if (!appEl || !appEl.classList.contains('chat-mode')) return;
        var t = e.target;
        var btn = t && t.closest ? t.closest('.topbar-left .icon-btn') : null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        load();
      }, true);
    }

    load();

    /* 停留页面时：轮询发现未读增加后自动刷新列表（布局层每 30 秒轮询 + 切回页面立即拉取） */
    Layout.onMessageRefresh(function (n, prev) {
      if (n > prev) {
        UI.toast('收到 ' + (n - prev) + ' 条新消息', 'info');
        if (state.view === 'list') load();
      }
    });

    /* ---------- 会话页外壳：顶栏换成对方信息，仅消息区滚动 ---------- */
    function applyThreadChrome(peer) {
      if (!appEl) return;
      appEl.classList.add('chat-mode');
      document.body.classList.add('no-scroll');
      var name = (peer && (peer.peerNickname || peer.peerName)) || '私信';
      if (titleEl) titleEl.textContent = name;
      if (subEl) subEl.textContent = '私信会话';
      if (topbarLeft) {
        var old = topbarLeft.querySelector('[data-chat-peer-avatar]');
        if (old) old.remove();
        var av = UI.userAvatar((peer && peer.peerName) || name, (peer && peer.peerAvatar) || '', 'avatar-sm');
        av.setAttribute('data-chat-peer-avatar', '');
        var wrap = titleEl ? titleEl.parentNode : null;
        if (wrap && wrap.parentNode === topbarLeft) topbarLeft.insertBefore(av, wrap);
        else topbarLeft.appendChild(av);
      }
      bindViewport();
      requestAnimationFrame(updateChatDock);
    }

    function restorePageChrome() {
      if (appEl) {
        appEl.classList.remove('chat-mode');
        appEl.classList.remove('kb-open');
        appEl.style.top = '';
        appEl.style.height = '';
        appEl.style.removeProperty('--chat-nav-pad');
      }
      document.body.classList.remove('no-scroll');
      if (titleEl) titleEl.textContent = pageTitle;
      if (subEl) subEl.textContent = pageSub;
      if (topbarLeft) {
        var av = topbarLeft.querySelector('[data-chat-peer-avatar]');
        if (av) av.remove();
      }
      var composer = document.querySelector('.chat-composer');
      if (composer && composer.parentNode) composer.parentNode.removeChild(composer);
    }

    function updateChatDock() {
      if (!appEl || !appEl.classList.contains('chat-mode')) return;
      var vv = window.visualViewport;
      var vh = vv ? vv.height : window.innerHeight;
      var top = vv ? vv.offsetTop : 0;
      var kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      /* 固定壳层贴合可视区域：键盘弹出时壳层收缩，底部输入框跟随上移且不被遮挡 */
      appEl.style.top = top + 'px';
      appEl.style.height = vh + 'px';
      /* 会话态不显示底栏；键盘弹出时去掉 Home 指示条安全区补偿，输入框贴在键盘上方 */
      if (kb > 20) appEl.classList.add('kb-open');
      else appEl.classList.remove('kb-open');
    }

    function bindViewport() {
      if (viewportBound) return;
      viewportBound = true;
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateChatDock);
        window.visualViewport.addEventListener('scroll', updateChatDock);
      }
      window.addEventListener('resize', updateChatDock);
      window.addEventListener('orientationchange', function () { setTimeout(updateChatDock, 150); });
    }

    function load() {
      state.view = 'list';
      restorePageChrome();
      main.innerHTML = '';
      main.appendChild(UI.skeleton(2));
      Promise.all([api.messageList({ scope: 'all', page: 1 }), api.messageThreads(), api.noticeList('', 1)]).then(function (r) {
        var msgRes = r[0] || {};
        state.list = msgRes.list || [];
        state.msgPage = msgRes.page || 1;
        state.msgTotal = msgRes.total || 0;
        state.msgTotalPages = msgRes.totalPages || 1;
        state.msgUnread = msgRes.unread || { all: 0, system: 0, task: 0 };
        state.threads = (r[1] && r[1].list) || [];
        state.notices = r[2] || { list: [], counts: {}, unreadTotal: 0 };
        state.noticePage = state.notices.page || 1;
        state.noticeTotal = state.notices.total || (state.notices.list || []).length;
        state.noticeTotalPages = state.notices.totalPages || 1;
        state.unread = countUnread().all;
        Layout.setNoticeUnread(state.notices.unreadTotal || 0);
        /* 用本页已拿到的通知数据回灌顶部轮播，确保信箱页与其它页面的屏数口径一致 */
        Layout.refreshBanner(state.notices.list || []);
        if (initialView === 'messages' || initialView === 'msg') state.mode = 'msg';
        else if (initialView === 'notices' || initialView === 'notice') state.mode = 'notice';
        if (pendingNoticeId) state.mode = 'notice';
        paintMailbox();
        if (pendingNoticeId) {
          var pid = pendingNoticeId;
          pendingNoticeId = '';
          openNoticeDetail(pid);
        } else if (pendingFeedbackId) {
          var fid = pendingFeedbackId;
          pendingFeedbackId = '';
          state.mode = 'msg';
          state.filter = 'system';
          api.messageList({ scope: 'system', page: 1 }).then(function (res) {
            state.list = res.list || [];
            state.msgTotal = res.total || 0;
            state.msgTotalPages = res.totalPages || 1;
            state.msgUnread = res.unread || state.msgUnread;
            paintMailbox();
            openFeedback(fid);
          }).catch(function () { paintMailbox(); openFeedback(fid); });
        }
      }).catch(function (e) {
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function countUnread() {
      var c = {
        all: 0,
        system: (state.msgUnread && state.msgUnread.system) || 0,
        task: (state.msgUnread && state.msgUnread.task) || 0,
        private: 0
      };
      state.threads.forEach(function (t) { c.private += (t.unread || 0); });
      c.all = c.system + c.task + c.private;
      return c;
    }

    /* 底部分页条：显示当前页 / 总页数 */
    function pager(page, totalPages, total, onGo) {
      var wrap = U.el('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 0 2px' }
      });
      wrap.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '上一页', disabled: page <= 1,
        onclick: function () { if (page > 1) onGo(page - 1); }
      }));
      wrap.appendChild(U.el('span', {
        class: 'small muted',
        text: '第 ' + page + ' / ' + totalPages + ' 页 · 共 ' + total + ' 条'
      }));
      wrap.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '下一页', disabled: page >= totalPages,
        onclick: function () { if (page < totalPages) onGo(page + 1); }
      }));
      return wrap;
    }

    /* 通知按分类 + 页码重新取数（接口分页，每页 5 条） */
    function loadNotices(cat, page) {
      return api.noticeList(cat, page).then(function (res) {
        state.notices = res || state.notices;
        state.noticePage = res.page || 1;
        state.noticeTotal = res.total || 0;
        state.noticeTotalPages = res.totalPages || 1;
        paintMailbox();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* 消息按筛选 + 页码重新取数 */
    function loadMessages() {
      if (state.filter === 'private') {
        paintMailbox();
        return;
      }
      api.messageList({ scope: state.filter, page: state.msgPage }).then(function (res) {
        state.list = res.list || [];
        state.msgTotal = res.total || 0;
        state.msgTotalPages = res.totalPages || 1;
        state.msgUnread = res.unread || state.msgUnread;
        paintMailbox();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* ---------- 信箱：通知 / 消息 ---------- */
    function paintMailbox() {
      main.innerHTML = '';
      var counts = countUnread();
      var seg = U.el('div', { class: 'mail-seg' });
      [
        { key: 'notice', label: '通知', unread: (state.notices && state.notices.unreadTotal) || 0 },
        { key: 'msg', label: '消息', unread: counts.all }
      ].forEach(function (t) {
        seg.appendChild(U.el('button', {
          class: 'mail-seg-btn' + (state.mode === t.key ? ' active' : ''), type: 'button',
          onclick: function () {
            if (state.mode === t.key) return;
            state.mode = t.key;
            paintMailbox();
          }
        }, [
          U.el('span', { text: t.label }),
          t.unread ? U.el('span', { class: 'badge badge-danger', style: { marginLeft: '4px' }, text: String(t.unread) }) : null
        ]));
      });
      main.appendChild(seg);
      if (state.mode === 'notice') paintNotices();
      else paintMessages();
    }

    /* ---------- 通知视图（总部 / 餐厅 / 门店） ---------- */
    function paintNotices() {
      var d = state.notices || { list: [], counts: {}, unreadTotal: 0 };
      var intro = U.el('p', {
        class: 'small muted',
        style: { margin: '2px 0 4px' },
        text: '总部与门店通知集中在这里，点击查看详情并确认了解。'
      });
      main.appendChild(intro);

      var tabs = U.el('div', { class: 'tabs' });
      [{ key: '', label: '全部' }].concat(NOTICE_CATS.map(function (c) { return { key: c, label: c }; })).forEach(function (t) {
        var c = (d.counts && d.counts[t.key]) || { unread: 0 };
        var unread = t.key === '' ? (d.unreadTotal || 0) : c.unread;
        tabs.appendChild(U.el('button', {
          class: 'tab' + (state.noticeCat === t.key ? ' active' : ''), type: 'button',
          onclick: function () {
            if (state.noticeCat === t.key) return;
            state.noticeCat = t.key;
            state.noticePage = 1;
            loadNotices(t.key, 1);
          }
        }, [
          U.el('span', { text: t.label }),
          unread ? U.el('span', { class: 'badge badge-danger', style: { marginLeft: '4px' }, text: String(unread) }) : null
        ]));
      });
      main.appendChild(tabs);

      /* 接口已按分类分页（每页 5 条），直接渲染当前页 */
      var list = d.list || [];
      if (!list.length) {
        main.appendChild(UI.emptyState({
          icon: 'bell', title: '暂无通知',
          desc: '该分类下还没有已发布的通知，稍后再来看看。'
        }));
        return;
      }
      list.forEach(function (n) {
        var card = U.el('div', { class: 'card notice-card', style: { marginBottom: '10px', cursor: 'pointer' } });
        card.appendChild(U.el('div', { class: 'card-body' }, [
          U.el('div', { class: 'flex-between', style: { gap: '8px', alignItems: 'flex-start' } }, [
            U.el('div', { style: { minWidth: '0' } }, [
              U.el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' } }, [
                n.pinned ? UI.badge('置顶', 'warn') : null,
                n.important ? UI.badge('重要', 'danger') : null,
                UI.badge(n.category, 'info')
              ]),
              U.el('div', { class: 'strong', style: { fontSize: '15px' }, text: n.title }),
              U.el('div', { class: 'small muted', style: { marginTop: '4px' }, text: n.publisher + ' · ' + U.fmtTime(n.publishedAt || n.createdAt) })
            ]),
            n.read
              ? UI.badge('已了解', 'success')
              : U.el('span', { class: 'badge badge-danger', style: { flex: 'none' }, text: '未了解' })
          ])
        ]));
        card.addEventListener('click', function () { openNoticeDetail(n.id); });
        main.appendChild(card);
      });
      main.appendChild(pager(state.noticePage, state.noticeTotalPages, state.noticeTotal, function (p) {
        state.noticePage = p;
        loadNotices(state.noticeCat, p);
      }));
    }

    function openNoticeDetail(id) {
      api.noticeGet(id).then(function (n) {
        var body = U.el('div');
        body.appendChild(U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, [
          n.pinned ? UI.badge('置顶', 'warn') : null,
          n.important ? UI.badge('重要', 'danger') : null,
          UI.badge(n.category, 'info')
        ]));
        body.appendChild(U.el('h3', { style: { margin: '0 0 6px' }, text: n.title }));
        body.appendChild(U.el('div', { class: 'small muted', style: { marginBottom: '12px' }, text: n.publisher + ' · ' + U.fmtTime(n.publishedAt || n.createdAt) }));
        body.appendChild(U.el('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.8', fontSize: '14px' }, text: n.body }));

        var footer = [
          { text: '关闭', class: 'btn-ghost' },
          {
            text: '打开公告页', class: 'btn-ghost',
            onClick: function () {
              window.open('notice.html?id=' + encodeURIComponent(n.id), '_blank');
              return false;
            }
          }
        ];
        if (n.read) {
          footer.push({ text: '已了解 · ' + U.fmtTime(n.readAt), class: 'btn-ghost' });
        } else {
          footer.push({
            text: '我已了解', class: 'btn-primary',
            onClick: function (btn, close) {
              UI.btnLoading(btn, true, '提交中…');
              api.markNoticeRead(n.id).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已记录了解时间', 'success');
                load();
              }).catch(function (e) {
                UI.btnLoading(btn, false);
                UI.toast(e.message, 'error');
              });
              return false;
            }
          });
        }
        UI.openModal({ title: '通知详情', body: body, footer: footer });
        /* 详情读取会记录已读：同步角标与轮播（未读通知屏可能因此移除） */
        Layout.refreshNoticeUnread();
        Layout.refreshBanner();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* ---------- 消息视图（系统 / 任务 / 私信） ---------- */
    function paintMessages() {
      var unread = countUnread();
      main.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('div', { class: 'flex-between' }, [
          U.el('p', { style: { margin: 0 }, text: unread.all ? '有 ' + unread.all + ' 条未读消息' : '暂无未读消息' }),
          unread.all ? U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '全部已读',
            onclick: function () {
              api.messageReadAll().then(function () {
                UI.toast('已全部标记为已读', 'success');
                Layout.refreshMessageUnread();
                load();
              }).catch(function (e) { UI.toast(e.message, 'error'); });
            }
          }) : null
        ])
      ]));

      var tabs = U.el('div', { class: 'tabs' });
      FILTERS.forEach(function (f) {
        tabs.appendChild(U.el('button', {
          class: 'tab' + (state.filter === f.key ? ' active' : ''), type: 'button',
          onclick: function () {
            if (state.filter === f.key) return;
            state.filter = f.key;
            state.msgPage = 1;
            loadMessages();
          }
        }, [
          U.el('span', { text: f.label }),
          unread[f.key] ? U.el('span', { class: 'badge badge-danger', style: { marginLeft: '4px' }, text: String(unread[f.key]) }) : null
        ]));
      });
      main.appendChild(tabs);

      /* 私信会话数量通常较少：不逐页拉取，直接展示全部会话 */
      if (state.filter === 'private') {
        var threads = state.threads.slice().sort(function (a, b) { return String(b.lastAt).localeCompare(String(a.lastAt)); });
        if (!threads.length) {
          main.appendChild(UI.emptyState({
            icon: 'bell', title: '暂无消息', desc: '暂无私信会话。可在门店通讯录中给同事发消息。'
          }));
          return;
        }
        threads.forEach(function (t) { main.appendChild(threadCard(t)); });
        main.appendChild(U.el('p', {
          class: 'small muted text-center', style: { marginTop: '8px' },
          text: '私信会话共 ' + threads.length + ' 个，数量较少不分页。'
        }));
        return;
      }

      /* 全部 / 系统通知 / 任务通知：接口按筛选分页，每页 5 条 */
      var items = state.list || [];
      if (!items.length) {
        var emptyDesc = {
          all: '系统通知与任务通知都会出现在这里。',
          system: '暂无系统通知。排休/排班审批结果、报销进度等消息会出现在这里。',
          task: '暂无任务通知。收到新的个人任务或任务改派时会出现在这里。'
        };
        main.appendChild(UI.emptyState({
          icon: 'bell', title: '暂无消息', desc: emptyDesc[state.filter] || emptyDesc.all
        }));
        return;
      }

      items.forEach(function (m) { main.appendChild(messageCard(m)); });
      main.appendChild(pager(state.msgPage, state.msgTotalPages, state.msgTotal, function (p) {
        state.msgPage = p;
        loadMessages();
      }));
    }

    function threadCard(t) {
      var card = U.el('div', { class: 'card', style: { marginBottom: '10px', cursor: 'pointer' } });
      card.appendChild(U.el('div', { class: 'card-body', style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
        UI.userAvatar(t.peerName, t.peerAvatar, 'avatar-sm'),
        U.el('div', { style: { flex: '1', minWidth: '0' } }, [
          U.el('div', { class: 'flex-between', style: { gap: '8px' } }, [
            U.el('span', { class: 'strong', text: t.peerName }),
            U.el('span', { class: 'small muted', style: { flex: 'none' }, text: U.fmtTime(t.lastAt) })
          ]),
          U.el('div', {
            class: 'small muted',
            style: { marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            text: (t.lastIsMine ? '我：' : '') + (t.lastText || '')
          })
        ]),
        t.unread ? U.el('span', { class: 'badge badge-danger', style: { flex: 'none' }, text: String(t.unread) }) : null
      ]));
      card.addEventListener('click', function () { openThread(t); });
      return card;
    }

    function messageCard(m) {
      var card = U.el('div', { class: 'card', style: { marginBottom: '10px', cursor: 'pointer' } });
      card.appendChild(U.el('div', { class: 'card-body' }, [
        U.el('div', { class: 'flex-between', style: { gap: '8px', alignItems: 'flex-start' } }, [
          U.el('div', { style: { minWidth: '0' } }, [
            U.el('div', { class: 'strong', style: { fontSize: '14.5px' } }, [
              m.read ? null : U.el('span', { style: { display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--danger)', marginRight: '6px', verticalAlign: 'middle' } }),
              U.el('span', { text: m.title })
            ]),
            m.body ? U.el('div', { class: 'small muted', style: { marginTop: '4px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }, text: m.body }) : null,
            U.el('div', { class: 'small muted', style: { marginTop: '6px' }, text: U.fmtTime(m.createdAt) })
          ]),
          sourceBadge(m)
        ])
      ]));
      card.addEventListener('click', function () { openMessage(m); });
      return card;
    }

    function sourceBadge(m) {
      var labels = { task: '任务', leave: '排休', shift: '排班', reimburse: '报销', feedback: '匿名反馈' };
      return UI.badge(labels[m.type] || '系统', m.read ? 'muted' : 'danger');
    }

    function openMessage(m) {
      var go = function () {
        if (m.type === 'feedback' && m.refId) { openFeedback(m.refId); return; }
        if (m.link) location.href = m.link;
        else load();
      };
      if (m.read) { go(); return; }
      api.messageRead(m.id).then(function () {
        Layout.refreshMessageUnread();
        go();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* 匿名反馈往来：超管与提交人都可查看并继续回复；界面不显示任何人员身份 */
    function openFeedback(id) {
      api.feedbackThread(id).then(function (d) {
        Layout.refreshMessageUnread();
        var listBox = U.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
        var input = U.el('textarea', {
          class: 'input', rows: 3, maxlength: 500,
          placeholder: '输入回复内容…',
          style: { resize: 'vertical', minHeight: '70px' }
        });
        var sendBtn = U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '回复' });

        function paint() {
          listBox.innerHTML = '';
          listBox.appendChild(U.el('div', {
            style: { background: 'var(--bg)', borderRadius: '14px', padding: '10px 12px' }
          }, [
            U.el('div', { class: 'small muted', text: '匿名反馈 · ' + U.fmtTime(d.createdAt) }),
            U.el('div', { style: { marginTop: '4px', whiteSpace: 'pre-wrap', lineHeight: '1.65' }, text: d.content })
          ]));
          (d.replies || []).forEach(function (r) {
            var isSuper = r.role === 'super';
            listBox.appendChild(U.el('div', {
              style: {
                alignSelf: isSuper ? 'flex-start' : 'center',
                maxWidth: '88%', borderRadius: '14px', padding: '8px 11px',
                background: isSuper ? 'var(--red-tint)' : 'var(--bg)'
              }
            }, [
              U.el('div', { class: 'small muted', text: (isSuper ? '店长' : '反馈人') + ' · ' + U.fmtTime(r.createdAt) }),
              U.el('div', { style: { marginTop: '2px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }, text: r.content })
            ]));
          });
        }
        paint();

        var body = U.el('div', {}, [
          listBox,
          U.el('div', { class: 'small muted', style: { margin: '12px 0 6px' }, text: '继续回复（匿名，双方均不显示姓名与工号）' }),
          input,
          U.el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '8px' } }, [sendBtn])
        ]);
        UI.openModal({ title: '匿名反馈', subtitle: '仅展示反馈内容与时间', body: body, footer: [{ text: '关闭' }], size: 'md' });

        sendBtn.addEventListener('click', function () {
          var text = String(input.value || '').trim();
          if (!text) { UI.toast('请输入回复内容', 'error'); return; }
          if (text.length > 500) { UI.toast('回复内容不能超过 500 字', 'error'); return; }
          sendBtn.disabled = true;
          api.replyFeedback({ id: id, content: text }).then(function () {
            sendBtn.disabled = false;
            input.value = '';
            return api.feedbackThread(id);
          }).then(function (res) {
            d = res;
            paint();
            Layout.refreshMessageUnread();
            UI.toast('已回复');
          }).catch(function (e) {
            sendBtn.disabled = false;
            UI.toast(e.message, 'error');
          });
        });
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* ---------- 会话视图 ---------- */
    function openThread(t) {
      state.view = 'thread';
      state.peer = t;
      state.messages = [];
      main.innerHTML = '';
      main.appendChild(UI.skeleton(2));
      api.messageThread({ threadId: t.id, peerId: t.peerId }).then(function (res) {
        state.peer = res.thread || t;
        state.messages = res.messages || [];
        paintThread();
        Layout.refreshMessageUnread();
        api.messageThreads().then(function (r) {
          state.threads = r.list || [];
          state.unread = countUnread().all;
        }).catch(function () {});
      }).catch(function (e) {
        restorePageChrome();
        main.innerHTML = '';
        main.appendChild(UI.errorState({ message: e.message, onRetry: function () { openThread(t); } }));
      });
    }

    function paintThread() {
      main.innerHTML = '';
      var peer = state.peer || {};
      /* 会话页直接复用站内顶栏：标题=对方昵称（无昵称用姓名）+头像，不再嵌套一层会话头 */
      applyThreadChrome(peer);

      var body = U.el('div', { class: 'chat-body' });
      main.appendChild(body);
      if (!state.messages.length) {
        body.appendChild(U.el('p', { class: 'small muted text-center', style: { padding: '20px 0' }, text: '还没有消息，发送第一条吧。' }));
      }
      var ses = Auth.current() || {};
      var self = Store.getStaff ? (Store.getStaff(ses.staffId) || {}) : {};
      var selfInfo = { name: self.name || ses.name || '我', avatar: self.avatar || '' };
      var prev = null;
      state.messages.forEach(function (m) {
        body.appendChild(chatItem(m, prev, selfInfo));
        prev = m;
      });

      var input = U.el('textarea', {
        class: 'chat-input', rows: 1, maxlength: 500,
        placeholder: '输入消息，Enter 发送、Shift+Enter 换行…'
      });
      var sendBtn = U.el('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: '发送',
        onclick: send
      });
      /* 多行输入自适应高度（44~120px），超出后输入框内部滚动，不裁切文字 */
      function autoGrow() {
        input.style.height = 'auto';
        input.style.height = Math.min(120, Math.max(44, input.scrollHeight)) + 'px';
      }
      input.addEventListener('input', autoGrow);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
      main.appendChild(U.el('div', { class: 'chat-composer' }, [input, sendBtn]));

      function send() {
        var text = String(input.value || '').trim();
        if (!text) { UI.toast('请输入消息内容', 'error'); return; }
        if (text.length > 500) { UI.toast('消息内容不能超过 500 字', 'error'); return; }
        input.value = '';
        autoGrow();
        sendBtn.disabled = true;
        var myId = (Auth.current() || {}).staffId;
        var optimistic = {
          id: 'tmp-' + Date.now(), body: text, isMine: true,
          fromStaffId: myId, fromName: selfInfo.name, createdAt: U.now()
        };
        var prev = state.messages.length ? state.messages[state.messages.length - 1] : null;
        state.messages.push(optimistic);
        body.appendChild(chatItem(optimistic, prev, selfInfo));
        body.scrollTop = body.scrollHeight;
        api.sendMessage({ toStaffId: peer.peerId, body: text }).then(function () {
          sendBtn.disabled = false;
          api.messageThreads().then(function (r) {
            state.threads = r.list || [];
            state.unread = countUnread().all;
          }).catch(function () {});
        }).catch(function (e) {
          sendBtn.disabled = false;
          var idx = state.messages.indexOf(optimistic);
          if (idx >= 0) state.messages.splice(idx, 1);
          paintThread();
          UI.toast(e.message, 'error');
        });
      }

      body.scrollTop = body.scrollHeight;
      requestAnimationFrame(function () {
        updateChatDock();
        body.scrollTop = body.scrollHeight;
      });
    }

    function chatItem(m, prev, selfInfo) {
      var myId = (Auth.current() || {}).staffId;
      var mine = m.fromStaffId
        ? String(m.fromStaffId) === String(myId)
        : !!(m.isMine === true || m.isSent === true);
      var peer = state.peer || {};
      var name = mine
        ? (m.fromName || (selfInfo && selfInfo.name) || '我')
        : (m.fromName || peer.peerName || '同事');
      var avatar = mine
        ? ((selfInfo && selfInfo.avatar) || '')
        : (peer.peerAvatar || '');
      var prevMine = prev
        ? (prev.fromStaffId ? String(prev.fromStaffId) === String(myId) : !!(prev.isMine === true || prev.isSent === true))
        : mine;
      var showName = !prev || String(prev.fromStaffId || '') !== String(m.fromStaffId || '') || prevMine !== mine;
      var item = U.el('div', { class: 'chat-item' + (mine ? ' mine' : '') }, [
        U.el('div', { class: 'chat-avatar' }, [UI.userAvatar(name, avatar, 'avatar-sm')]),
        U.el('div', { class: 'chat-main' }, [
          showName ? U.el('div', { class: 'chat-name', text: mine ? name + '（我）' : name }) : null,
          U.el('div', { class: 'chat-bubble' + (mine ? ' mine' : ''), text: m.body || '' }),
          U.el('div', { class: 'chat-time', text: U.fmtTime(m.createdAt) })
        ])
      ]);
      return item;
    }
  };
})();
