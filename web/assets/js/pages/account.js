/* P17 员工端 — 信息修改（昵称头像直接生效；手机号/住址/四证提交店长审核） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['account'] = function () {
    var state = {
      staff: null, avatarKey: '',
      files: {}, phone: '', address: ''
    };
    var CERT_FIELDS = [
      { key: 'idFront', label: '身份证正面', accept: 'image/*', type: 'idFront' },
      { key: 'idBack', label: '身份证反面', accept: 'image/*', type: 'idBack' },
      { key: 'photo', label: '白底一寸照', accept: 'image/*', type: 'photo' },
      { key: 'healthCert', label: '健康证（PDF）', accept: 'application/pdf,.pdf', type: 'healthCert' }
    ];
    var main = Layout.staffShell({ title: '信息修改', active: 'profile', back: 'profile.html' }, UI.skeleton(2));

    api.getMe().then(function (staff) {
      state.staff = staff;
      state.avatarKey = staff.avatar || '';
      state.files = Object.assign({}, staff.files || {});
      state.phone = staff.phone || '';
      state.address = staff.address || '';
      render();
    }).catch(function (e) {
      main.innerHTML = '';
      main.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function render() {
      var s = state.staff;
      main.innerHTML = '';

      main.appendChild(U.el('div', { class: 'page-head' }, [
        U.el('p', { text: '昵称与头像保存后立即生效；手机号、现居住地址与四证附件提交后需店长审核。' })
      ]));

      /* 昵称与头像 */
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '昵称与头像' })]));
      var body = U.el('div', { class: 'card-body' });

      var avatarBox = U.el('div', { class: 'flex gap-12', style: { alignItems: 'center', marginBottom: '14px' } });
      var preview = UI.userAvatar(s.name, state.avatarKey, '');
      preview.style.width = '64px';
      preview.style.height = '64px';
      preview.style.fontSize = '20px';
      avatarBox.appendChild(preview);

      var fileInput = U.el('input', { type: 'file', accept: 'image/*' });
      fileInput.style.display = 'none';
      var pick = U.el('label', { class: 'btn btn-ghost btn-sm', style: { cursor: 'pointer', margin: 0 } }, [
        U.el('span', { text: '上传头像' }), fileInput
      ]);
      var tip = U.el('div', { class: 'small muted', text: '支持 JPG、PNG、WEBP、GIF，建议正方形图片。' });
      avatarBox.appendChild(U.el('div', {}, [pick, tip]));
      body.appendChild(avatarBox);

      fileInput.addEventListener('change', function () {
        var f = this.files && this.files[0];
        if (!f) return;
        tip.textContent = '上传中…';
        api.uploadFile(f, 'photo').then(function (res) {
          state.avatarKey = res.key;
          refreshPreview();
          tip.textContent = '头像已上传，点击下方「保存昵称与头像」生效。';
        }).catch(function (e) {
          tip.textContent = '上传失败，请重试';
          UI.toast(e.message, 'error');
        });
      });

      function refreshPreview() {
        var next = UI.userAvatar(s.name, state.avatarKey, '');
        next.style.width = '64px';
        next.style.height = '64px';
        next.style.fontSize = '20px';
        avatarBox.replaceChild(next, preview);
        preview = next;
      }

      var nickField = U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '昵称' }),
        U.el('input', { class: 'input', type: 'text', maxlength: '20', placeholder: '如：小林，留空则只显示姓名' })
      ]);
      var nickInput = nickField.querySelector('input');
      nickInput.value = s.nickname || '';
      body.appendChild(nickField);

      var saveBtn = U.el('button', { class: 'btn btn-primary btn-block', type: 'button', text: '保存昵称与头像', style: { marginTop: '14px' } });
      saveBtn.addEventListener('click', function () {
        var payload = { nickname: nickInput.value.trim() };
        if (state.avatarKey) payload.avatar = state.avatarKey;
        UI.btnLoading(saveBtn, true, '保存中…');
        api.saveMyProfile(payload).then(function () {
          UI.btnLoading(saveBtn, false);
          UI.toast('已保存，姓名展示已更新', 'success');
        }).catch(function (e) {
          UI.btnLoading(saveBtn, false);
          UI.toast(e.message, 'error');
        });
      });
      body.appendChild(saveBtn);
      card.appendChild(body);
      main.appendChild(card);

      /* 外观：与顶栏主题按钮共用同一份状态（跟随系统 / 浅色 / 深色） */
      var appearanceCard = U.el('div', { class: 'card' });
      appearanceCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '外观' })
      ]));
      var ab = U.el('div', { class: 'card-body' });
      ab.appendChild(U.el('p', { class: 'small muted', style: { margin: '0 0 10px' }, text: '默认跟随系统；手动选择后会记住，下次打开仍使用该外观。顶栏信封右侧的按钮也可切换。' }));
      var choice = U.el('div', { class: 'theme-choice' });
      [
        { key: 'auto', label: '跟随系统' },
        { key: 'light', label: '浅色' },
        { key: 'dark', label: '深色' }
      ].forEach(function (opt) {
        var btn = U.el('button', {
          class: 'theme-choice-btn', type: 'button',
          'data-theme-set': opt.key, text: opt.label
        });
        btn.addEventListener('click', function () {
          if (!window.Theme) return;
          window.Theme.set(opt.key);
          UI.toast('外观已切换为「' + opt.label + '」', 'success');
        });
        choice.appendChild(btn);
      });
      ab.appendChild(choice);
      appearanceCard.appendChild(ab);
      main.appendChild(appearanceCard);
      if (window.Theme) window.Theme.sync();

      /* 实名资料（提交审核） */
      var reviewCard = U.el('div', { class: 'card' });
      reviewCard.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '实名资料' }),
        UI.badge('需店长审核', 'warn')
      ]));
      var rb = U.el('div', { class: 'card-body' });

      rb.appendChild(U.el('div', { class: 'alert alert-info', style: { marginBottom: '12px' } }, [
        U.el('div', { text: '以下内容提交后进入审核，店长采纳后生效；审核期间原资料继续有效。' })
      ]));

      var phoneField = U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '手机号' }),
        U.el('input', { class: 'input mono', type: 'tel', maxlength: '11', placeholder: '11 位手机号' })
      ]);
      var phoneInput = phoneField.querySelector('input');
      phoneInput.value = s.phone || '';
      rb.appendChild(phoneField);

      var addrField = U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '现居住地址' }),
        U.el('input', { class: 'input', type: 'text', maxlength: '120', placeholder: '请填写到具体门牌' })
      ]);
      var addrInput = addrField.querySelector('input');
      addrInput.value = s.address || '';
      rb.appendChild(addrField);

      rb.appendChild(U.el('div', { class: 'section-head', style: { margin: '14px 0 4px' } }, [
        U.el('div', { class: 'section-title', style: { fontSize: '14px' }, text: '证件附件' })
      ]));

      CERT_FIELDS.forEach(function (cfg) {
        rb.appendChild(certRow(cfg));
      });

      var submitBtn = U.el('button', { class: 'btn btn-primary btn-block', type: 'button', text: '提交审核', style: { marginTop: '14px' } });
      submitBtn.addEventListener('click', submitReview);
      rb.appendChild(submitBtn);
      reviewCard.appendChild(rb);
      main.appendChild(reviewCard);

      main.appendChild(U.el('div', { class: 'card' }, [
        U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '说明' })]),
        U.el('div', { class: 'card-body' }, [
          U.el('p', { class: 'small muted', style: { margin: 0 }, text: '姓名、身份证号、岗位、银行卡等实名信息如需修改，请联系店长线下办理。' })
        ])
      ]));

      function certRow(cfg) {
        var row = U.el('div', { class: 'cert-row' });
        var status = U.el('span', { class: 'small muted' });
        var viewBtn = U.el('button', { class: 'btn-text', type: 'button', text: '查看' });
        var uplInput = U.el('input', { type: 'file', accept: cfg.accept, style: { display: 'none' } });
        var uplBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '上传 / 更换' });

        function refresh() {
          var key = state.files[cfg.key] || '';
          var changed = key && key !== ((s.files || {})[cfg.key] || '');
          status.textContent = key ? (changed ? '已选择新文件，待提交审核' : '已上传') : '未上传';
          viewBtn.style.display = key ? '' : 'none';
        }
        viewBtn.addEventListener('click', function () {
          var key = state.files[cfg.key];
          if (!key) return;
          api.getFileUrl(key).then(function (url) {
            if (!url) { UI.toast('文件已失效，请重新上传', 'error'); return; }
            if (cfg.key === 'healthCert') UI.pdfViewer({ url: url, title: cfg.label });
            else UI.imageViewer({ url: url, title: cfg.label });
          });
        });
        uplBtn.addEventListener('click', function () { uplInput.click(); });
        uplInput.addEventListener('change', function () {
          var f = uplInput.files && uplInput.files[0];
          uplInput.value = '';
          if (!f) return;
          uplBtn.disabled = true;
          uplBtn.textContent = '上传中…';
          api.uploadFile(f, cfg.type).then(function (res) {
            state.files[cfg.key] = res.key;
            refresh();
          }).catch(function (e) {
            UI.toast(e.message, 'error');
          }).then(function () {
            uplBtn.disabled = false;
            uplBtn.textContent = '上传 / 更换';
          });
        });

        row.appendChild(U.el('div', { style: { minWidth: '0' } }, [
          U.el('div', { class: 'strong', style: { fontSize: '14px' }, text: cfg.label }),
          status
        ]));
        row.appendChild(U.el('div', { class: 'table-actions' }, [viewBtn, uplBtn, uplInput]));
        refresh();
        return row;
      }

      function submitReview() {
        var jobs = [];
        var phone = String(phoneInput.value || '').trim();
        var address = String(addrInput.value || '').trim();
        if (phone !== (s.phone || '')) {
          if (!/^1[3-9]\d{9}$/.test(phone)) { UI.toast('请输入正确的 11 位手机号', 'error'); return; }
          jobs.push({ field: 'phone', newValue: phone });
        }
        if (address !== (s.address || '')) {
          if (address.length < 5) { UI.toast('现居住地址请填写到具体门牌，不少于 5 个字', 'error'); return; }
          jobs.push({ field: 'address', newValue: address });
        }
        CERT_FIELDS.forEach(function (cfg) {
          var key = state.files[cfg.key] || '';
          if (key && key !== ((s.files || {})[cfg.key] || '')) jobs.push({ field: cfg.key, newValue: key });
        });
        if (!jobs.length) { UI.toast('没有需要提交的修改', 'info'); return; }

        UI.btnLoading(submitBtn, true, '提交中…');
        var chain = Promise.resolve();
        jobs.forEach(function (j) {
          chain = chain.then(function () { return api.updateMe({ field: j.field, newValue: j.newValue }); });
        });
        chain.then(function () {
          UI.btnLoading(submitBtn, false);
          UI.toast('已提交，等待店长审核后生效', 'success', 2600);
          setTimeout(function () { location.reload(); }, 800);
        }).catch(function (e) {
          UI.btnLoading(submitBtn, false);
          UI.toast(e.message, 'error');
        });
      }
    }
  };
})();
