/* P01 登录页 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['login'] = function (ctx) {
    var root = ctx.root;
    root.innerHTML = '';

    var page = U.el('div', { class: 'auth-page' });
    var card = U.el('div', { class: 'auth-card' });

    card.appendChild(U.el('div', { class: 'auth-brand' }, [
      U.el('div', { class: 'auth-mark', text: '塔' }),
      U.el('h1', { text: '门店人员管理系统' }),
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
        '<button type="button" class="btn-text" id="forgot">忘记密码？</button>' +
      '</div>' +
      '<button class="btn btn-primary btn-lg btn-block" type="submit">登录</button>';

    card.appendChild(form);

    card.appendChild(U.el('div', { class: 'auth-links' }, [
      U.el('a', { class: 'link', href: 'register.html', text: '我是新员工，去登记' })
    ]));
    card.appendChild(U.el('div', { class: 'auth-foot' }, [
      U.el('div', { text: '本系统仅限本店员工使用，账号问题请联系店长' }),
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

    form.querySelector('#forgot').addEventListener('click', function () {
      UI.openModal({
        title: '忘记密码',
        size: 'sm',
        body: U.el('div', { class: 'confirm-body' }, [
          U.el('p', { text: '本期暂不支持短信验证码找回密码，请联系店长在「系统设置 — 管理组账号」中重置密码。' }),
          U.el('p', { class: 'mt-8 muted', text: '员工账号由店长重置后，可用初始密码登录并及时修改。' })
        ]),
        footer: [{ text: '我知道了', class: 'btn-primary' }]
      });
    });

    phoneInput.addEventListener('blur', function () {
      var msg = V.phone(phoneInput.value);
      V.applyFieldError(form, 'phone', msg);
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
          var target = (res.role === 'staff' && (res.user.status === 'pending' || res.user.status === 'rejected'))
            ? 'pending.html' : 'profile.html';
          if (res.user.status === 'rejected') target = 'pending.html';
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
