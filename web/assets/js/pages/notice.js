/* notice.js — 公告独立公开页（免登录、只读、noindex） */
(function () {
  'use strict';
  var root = document.getElementById('app');
  var params = new URLSearchParams(location.search);
  var id = params.get('id') || '';
  var wrap = U.el('div', { class: 'public-page' });
  var card = U.el('div', { class: 'card', style: { margin: '16px', padding: '18px' } });
  wrap.appendChild(U.el('div', { class: 'public-brand', style: { padding: '16px 16px 0' } }, [
    U.el('div', { class: 'brand-mark', text: '塔' }),
    U.el('div', { class: 'brand-text' }, [
      U.el('strong', { text: '塔斯汀' }),
      U.el('span', { text: '门店公告' })
    ])
  ]));
  wrap.appendChild(card);
  root.appendChild(wrap);
  card.appendChild(UI.skeleton(3));

  function missing() {
    card.innerHTML = '';
    card.appendChild(U.el('div', { class: 'state-box' }, [
      U.el('div', { class: 'state-icon', html: UI.icon('info', 28) }),
      U.el('h3', { class: 'state-title', text: '公告不存在或已下线' }),
      U.el('p', { class: 'state-desc', text: '该公告可能尚未到发布时间、已被撤回或删除。' })
    ]));
  }

  if (!id) { missing(); return; }
  api.getPublicNotice(id).then(function (n) {
    card.innerHTML = '';
    var head = U.el('div', { class: 'notice-public-head' }, [
      U.el('div', { class: 'flex' }, [
        U.el('span', { class: 'badge badge-soft', text: n.category }),
        n.important ? U.el('span', { class: 'badge badge-danger', text: '重要' }) : null,
        n.pinned ? U.el('span', { class: 'badge badge-warn', text: '置顶' }) : null
      ]),
      U.el('h1', { class: 'notice-public-title', text: n.title }),
      U.el('p', { class: 'small muted', text: '发布人：' + (n.publisher || '门店管理组') + ' · ' + (n.publishedAt ? U.fmtTime(n.publishedAt, true) : '') })
    ]);
    card.appendChild(head);
    var body = U.el('div', { class: 'notice-public-body', style: { whiteSpace: 'pre-wrap', lineHeight: '1.8', marginTop: '14px', fontSize: '15px' } });
    body.textContent = n.body || '';
    card.appendChild(body);
    card.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '18px', borderTop: '1px solid var(--line)', paddingTop: '12px' }, text: '本页为门店公告只读页面，请勿转发外部人员。' }));
    document.title = n.title + ' · ' + (window.SiteTitle ? SiteTitle.get() : '门店公告');
  }).catch(missing);
})();
