/* P19 员工端 — 门店通讯录 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['contacts'] = function () {
    var state = { list: [], keyword: '', store: null };
    var main = Layout.staffShell({ title: '门店通讯录', active: 'profile', back: 'profile.html' }, UI.skeleton(2));

    api.staffContacts().then(function (res) {
      state.list = res.list || [];
      state.store = res.store || null;
      render();
    }).catch(function (e) {
      main.innerHTML = '';
      main.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function render() {
      main.innerHTML = '';
      var head = U.el('div', { class: 'page-head' }, [
        U.el('p', { text: (state.store && state.store.name ? state.store.name : '本门店') + ' · 共 ' + state.list.length + ' 位在职同事' })
      ]);
      var search = U.el('div', { class: 'search-box', style: { marginBottom: '12px' } }, [
        U.el('span', { html: UI.icon('search', 17) }),
        U.el('input', { class: 'input', type: 'search', placeholder: '搜索姓名 / 岗位 / 手机号 / 飞书工号' })
      ]);
      head.appendChild(search);
      main.appendChild(head);

      var listBox = U.el('div');
      main.appendChild(listBox);

      search.querySelector('input').addEventListener('input', U.debounce(function () {
        state.keyword = this.value.trim();
        paint();
      }, 200));

      function paint() {
        listBox.innerHTML = '';
        var kw = state.keyword;
        var list = state.list.filter(function (s) {
          if (!kw) return true;
          return (s.displayName || s.name).indexOf(kw) >= 0 || (s.position || '').indexOf(kw) >= 0 || (s.phone || '').indexOf(kw) >= 0 || U.empNoOf(s).indexOf(kw) >= 0;
        });
        if (!list.length) {
          listBox.appendChild(UI.emptyState({ icon: 'users', title: '没有匹配的同事', desc: '换个姓名、岗位或手机号试试。' }));
          return;
        }
        var card = U.el('div', { class: 'card' });
        var myId = (Auth.current() || {}).staffId || '';
        list.forEach(function (s) {
          var actions = U.el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' } }, [
            U.el('a', { class: 'btn btn-ghost btn-sm', href: 'tel:' + s.phone, text: '拨号' }),
            s.id === myId ? null : U.el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', text: '发消息',
              onclick: function () { openCompose(s); }
            })
          ]);
          var profileHref = 'user-profile.html?id=' + encodeURIComponent(s.id);
          var row = U.el('div', { class: 'contact-row' }, [
            U.el('a', { href: profileHref, 'aria-label': '查看' + (s.displayName || s.name) + '的主页' }, [
              UI.userAvatar(s.name, s.avatar, 'avatar-sm')
            ]),
            U.el('div', { class: 'contact-main', style: { cursor: 'pointer' } }, [
              U.el('div', { class: 'flex-between', style: { gap: '8px' } }, [
                U.el('strong', { style: { fontSize: '14.5px' }, text: s.displayName || s.name }),
                s.position ? UI.badge(s.position, s.position === '店长' ? 'brand' : (s.position === '店助' ? 'info' : 'muted')) : null
              ]),
              U.el('div', { class: 'small muted', style: { marginTop: '3px' }, text: (U.empNoOf(s) ? U.empNoOf(s) + ' · ' : '') + (s.employmentType || '') })
            ]),
            actions
          ]);
          row.querySelector('.contact-main').addEventListener('click', function () {
            location.href = profileHref;
          });
          card.appendChild(row);
        });
        listBox.appendChild(card);
        listBox.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '10px', textAlign: 'center' }, text: '通讯录仅限门店内部使用，请勿外传。' }));
      }
      paint();
    }

    /* 给同事发私信：进入对方「信息通知」列表，与系统消息同处展示 */
    function openCompose(s) {
      var name = s.displayName || s.name;
      var input = U.el('textarea', {
        class: 'input', rows: 4, maxlength: 500,
        placeholder: '输入消息内容（500 字以内）…',
        style: { minHeight: '104px', resize: 'vertical', lineHeight: '1.6' }
      });
      var counter = U.el('div', { class: 'hint', text: '0 / 500' });
      input.addEventListener('input', function () {
        counter.textContent = input.value.length + ' / 500';
      });
      var body = U.el('div');
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '发送给 ' + name }),
        input,
        counter
      ]));
      body.appendChild(U.el('p', { class: 'hint', text: '消息会进入对方的「信息通知」，对方可直接回复。' }));
      UI.openModal({
        title: '发消息给 ' + name,
        body: body,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '发送', class: 'btn-primary',
            onClick: function (btn, close) {
              var text = String(input.value || '').trim();
              if (!text) { UI.toast('请输入消息内容', 'error'); return false; }
              UI.btnLoading(btn, true, '发送中…');
              api.sendMessage({ toStaffId: s.id, body: text }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已发送给 ' + name, 'success');
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
