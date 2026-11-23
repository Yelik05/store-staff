/* 管理端登录（超管便捷入口，所有账号均可登录并按角色进入对应页面） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-login'] = function (ctx) {
    var root = ctx.root;
    root.innerHTML = '';

    var page = U.el('div', { class: 'auth-page' });
    var card = U.el('div', { class: 'auth-card' });

    card.appendChild(U.el('div', { class: 'auth-brand' }, [
      U.el('div', { class: 'auth-mark', text: '塔' }),
      U.el('h1', { text: '管理端登录' }),
      U.el('p', { text: '塔斯汀 福州市农大金山校区店（TA0051）' })
    ]));

    var form = U.el('form', { class: 'form-stack', novalidate: true });
    form.innerHTML =
      '<div class="field" data-field="phone">' +
        '<label class="label" for="phone">手机号</label>' +
        '<input class="input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="username" placeholder="请输入 11 位手机号" maxlength="11">' +
        '<div class="error-text"></div>' +
      '</div>' +
      '<div class="field" data-field="password">' +
        '<label class="label" for="password">密码</label>' +
        '<input class="input" id="password" name="password" type="password" autocomplete="current-password" placeholder="请输入密码">' +
        '<div class="error-text"></div>' +
      '</div>' +
      '<div class="auth-extra">' +
        '<label class="checkbox"><input type="checkbox" name="remember" checked><span>记住我</span></label>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" type="submit">登录</button>';

    card.appendChild(form);
    card.appendChild(U.el('div', { class: 'auth-links' }, [
      U.el('span', { class: 'muted small', text: '员工或其他账号请使用 ' }),
      U.el('a', { class: 'link', href: 'login.html', text: '默认登录地址' })
    ]));
    card.appendChild(U.el('div', { class: 'auth-foot' }, [
      U.el('div', { text: '店长账号可从本地址进入管理端，也可从默认登录地址进入' }),
      U.el('div', { text: '登录即表示同意仅将本系统用于门店人事管理' })
    ]));

    page.appendChild(card);
    root.appendChild(page);

    var phoneInput = form.querySelector('#phone');
    var pwdInput = form.querySelector('#password');
    var btn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      doLogin(phoneInput.value.trim(), pwdInput.value);
    });

    phoneInput.addEventListener('blur', function () {
      V.applyFieldError(form, 'phone', V.phone(phoneInput.value));
    });
    phoneInput.addEventListener('input', function () {
      if (/^\d+$/.test(phoneInput.value)) return;
      phoneInput.value = phoneInput.value.replace(/\D/g, '');
    });

    function doLogin(phone, password) {
      V.clearErrors(form);
      var pMsg = V.phone(phone);
      if (pMsg) { V.applyFieldError(form, 'phone', pMsg); return; }
      if (!password) { V.applyFieldError(form, 'password', '请输入密码'); return; }
      UI.btnLoading(btn, true, '登录中…');
      api.login({ phone: phone, password: password, remember: form.querySelector('[name="remember"]').checked })
        .then(function (res) {
          UI.btnLoading(btn, false);
          Auth.setPortal(res.role);
          UI.toast('登录成功，欢迎 ' + res.user.name, 'success');
          if (res.role !== 'superadmin') {
            UI.toast('当前账号非店长，将进入对应页面', 'info');
          }
          var target = (res.role === 'staff' && (res.user.status === 'pending' || res.user.status === 'rejected'))
            ? 'pending.html' : 'profile.html';
          setTimeout(function () { location.replace(target); }, 260);
        })
        .catch(function (err) {
          UI.btnLoading(btn, false);
          V.applyFieldError(form, 'password', err.message);
          UI.toast(err.message, 'error');
        });
    }
  };
})();
