/* P03 待审核 / 已驳回提示页 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['pending'] = function (ctx) {
    var staff = ctx.staff || {};
    var rejected = staff.status === 'rejected';

    var wrap = U.el('div');

    var card = U.el('div', { class: 'card' });
    var body = U.el('div', { class: 'card-body' });

    if (rejected) {
      body.appendChild(U.el('div', { class: 'state-box' }, [
        U.el('div', { class: 'state-icon danger', html: UI.icon('alert', 30) }),
        U.el('h3', { class: 'state-title', text: '资料需要修改' }),
        U.el('p', { class: 'state-desc', text: '驳回原因：' + (staff.rejectReason || '—') }),
        U.el('p', { class: 'state-desc small', text: '驳回人：' + (staff.reviewedBy || '—') + ' · ' + U.fmtTime(staff.reviewedAt) })
      ]));
      body.appendChild(U.el('div', { class: 'alert alert-warn' }, [
        U.el('span', { class: 'alert-icon', html: UI.icon('info', 17) }),
        U.el('div', { text: '修改后重新提交即可，店长将在一个工作日内重新审核。' })
      ]));
      body.appendChild(U.el('button', {
        class: 'btn btn-primary btn-block btn-lg', type: 'button', text: '修改资料并重新提交',
        onclick: function () { location.href = 'register.html'; }
      }));
      body.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-block mt-12', type: 'button', text: '联系店长',
        onclick: function () { contact(); }
      }));
    } else {
      body.appendChild(U.el('div', { class: 'state-box' }, [
        U.el('div', { class: 'state-icon', html: UI.icon('clock', 30) }),
        U.el('h3', { class: 'state-title', text: '资料已提交，等待店长审核' }),
        U.el('p', { class: 'state-desc', text: '提交时间：' + U.fmtTime(staff.submittedAt || staff.createdAt) }),
        U.el('p', { class: 'state-desc', text: '审核通过后即可查看薪资与量化分。店长通常在 1 个工作日内完成审核。' })
      ]));
      body.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-block', type: 'button', text: '查看已提交资料',
        onclick: function () { location.href = 'profile.html'; }
      }));
      body.appendChild(U.el('div', { class: 'alert alert-info mt-16' }, [
        U.el('span', { class: 'alert-icon', html: UI.icon('shield', 17) }),
        U.el('div', {}, [
          U.el('div', { class: 'alert-title', text: '审核期间可做什么' }),
          U.el('div', { text: '可查看已提交的资料；薪资与量化分入口将在审核通过后开放。如资料有误，请联系店长驳回后修改。' })
        ])
      ]));
    }
    card.appendChild(body);
    wrap.appendChild(card);

    wrap.appendChild(U.el('p', { class: 'text-center small muted', style: { marginTop: '8px' }, text: '以上信息仅你本人与门店管理组可见' }));

    function contact() {
      var s = ctx.staff || {};
      UI.openModal({
        title: '联系店长',
        size: 'sm',
        body: U.el('div', { class: 'confirm-body' }, [
          U.el('p', { text: '如需修改已提交的资料，请联系店长核对后进行驳回，驳回后可在本页修改并重新提交。' }),
          U.el('div', { class: 'confirm-detail' }, [
            U.el('div', { text: '门店：' + api.storeInfo().shortName }),
            U.el('div', { text: '店长：陈晓岚 · 13800000001' }),
            U.el('div', { text: '你的账号：' + (s.phone || '—') })
          ])
        ]),
        footer: [{ text: '我知道了', class: 'btn-primary' }]
      });
    }

    Layout.staffShell({ title: '资料审核', hideNav: true, back: 'login.html' }, wrap);
  };
})();
