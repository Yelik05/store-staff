/* P02 入职注册页（四步分步表单 + 草稿暂存 + 附件上传） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  var DRAFT_KEY = 'ts_reg_draft_v1';
  var FILE_CFG = [
    { key: 'idFront', name: '身份证正面（人像面）', req: 'JPG / PNG / WEBP / GIF，不超过 20MB' },
    { key: 'idBack', name: '身份证反面（国徽面）', req: 'JPG / PNG / WEBP / GIF，不超过 20MB' },
    { key: 'photo', name: '白底一寸照', req: 'JPG / PNG / WEBP / GIF，不超过 10MB' },
    { key: 'healthCert', name: '健康证', req: 'PDF，不超过 10MB，A4 版式，多页合并为 1 个文件' }
  ];

  window.Pages['register'] = function (ctx) {
    var root = ctx.root;
    var editMode = !!(ctx.staff && ctx.staff.status === 'rejected');
    var state = {
      step: 1,
      form: {
        phone: '', password: '', confirmPassword: '',
        name: '', gender: '男', idCard: '', birth: '', address: '',
        position: '', employmentType: '全职', hireDate: U.today(),
        emergencyName: '', emergencyPhone: '',
        idCardExpiry: '', healthCertExpiry: ''
      },
      files: {},
      agreed1: false,
      agreed4: false
    };

    if (editMode) {
      var s = ctx.staff;
      state.form = {
        phone: s.phone, password: '', confirmPassword: '',
        name: s.name, gender: s.gender || '男', idCard: s.idCard, birth: s.birth,
        address: s.address, position: s.position, employmentType: s.employmentType,
        hireDate: s.hireDate, emergencyName: (s.emergency || '').split(' ')[0] || '',
        emergencyPhone: (s.emergency || '').split(' ')[1] || '',
        idCardExpiry: s.idCardExpiry || '', healthCertExpiry: s.healthCertExpiry || ''
      };
      Object.keys(s.files || {}).forEach(function (k) {
        if (s.files[k]) state.files[k] = { key: s.files[k], name: '已上传文件', size: 0, type: k === 'healthCert' ? 'application/pdf' : 'image/jpeg' };
      });
      state.agreed1 = true;
      state.agreed4 = true;
      state.step = 2;
    }

    var dirty = false;
    var saveTimer = null;
    var submitted = false;

    function setDirty() {
      dirty = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveDraft, 500);
    }

    function saveDraft() {
      if (editMode || submitted) return;
      try {
        var files = {};
        Object.keys(state.files).forEach(function (k) {
          var f = state.files[k];
          files[k] = { key: f.key, name: f.name, size: f.size, type: f.type };
        });
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
          step: state.step, form: state.form, files: files,
          agreed1: state.agreed1, agreed4: state.agreed4, updatedAt: U.now()
        }));
      } catch (e) { /* 存储已满时忽略 */ }
    }

    function clearDraft() {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    }

    var draft = null;
    if (!editMode) {
      try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
    }

    if (draft && (draft.form && (draft.form.name || draft.form.phone) || Object.keys(draft.files || {}).length)) {
      UI.confirm({
        title: '检测到未完成的登记',
        message: '上次填写于 ' + U.fmtTime(draft.updatedAt) + '，是否继续填写？',
        confirmText: '继续填写',
        cancelText: '重新填写'
      }).then(function (yes) {
        if (yes) {
          state.step = draft.step || 1;
          state.form = Object.assign(state.form, draft.form || {});
          state.files = draft.files || {};
          state.agreed1 = !!draft.agreed1;
          state.agreed4 = !!draft.agreed4;
        } else {
          clearDraft();
        }
        render();
      });
    }

    window.addEventListener('beforeunload', function (e) {
      saveDraft();
      if (dirty) {
        e.preventDefault();
        e.returnValue = '登记内容尚未提交，确定离开吗？';
        return e.returnValue;
      }
    });

    var saveInterval = setInterval(function () { if (dirty) saveDraft(); }, 30000);
    window.addEventListener('hashchange', function () { clearInterval(saveInterval); });

    function goStep(n) {
      state.step = n;
      saveDraft();
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function render() {
      root.innerHTML = '';
      var app = U.el('div', { class: 'staff-app', style: { paddingBottom: '0' } });
      app.appendChild(U.el('header', { class: 'topbar' }, [
        U.el('div', { class: 'topbar-left' }, [
          editMode ? U.el('button', {
            class: 'icon-btn', type: 'button', 'aria-label': '返回', html: UI.icon('arrowLeft', 20),
            onclick: function () { location.href = 'pending.html'; }
          }) : null,
          U.el('div', {}, [
            U.el('h1', { class: 'topbar-title', text: editMode ? '修改资料' : '新员工入职登记' }),
            U.el('p', { class: 'topbar-sub', text: '塔斯汀 农大金山校区店 · TA0051' })
          ])
        ]),
        editMode ? null : U.el('a', { class: 'link small', href: 'login.html', text: '已有账号，去登录' })
      ]));

      var main = U.el('main', { class: 'staff-main' });
      main.appendChild(stepper());
      if (!editMode) {
        main.appendChild(U.el('div', { class: 'alert alert-info' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('info', 17) }),
          U.el('div', { text: '本页信息仅用于门店人事管理与薪资发放，仅你本人与门店管理组可见，不会对外提供。' })
        ]));
      }
      if (editMode) {
        main.appendChild(U.el('div', { class: 'alert alert-warn' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('alert', 17) }),
          U.el('div', {}, [
            U.el('div', { class: 'alert-title', text: '资料需要修改' }),
            U.el('div', { text: '驳回原因：' + ctx.staff.rejectReason })
          ])
        ]));
      }
      main.appendChild(stepContent());
      app.appendChild(main);

      var footer = U.el('div', { class: 'step-footer' });
      if (state.step > 1) {
        footer.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-secondary', type: 'button', text: '上一步',
          onclick: function () { goStep(state.step - 1); }
        }));
      }
      if (!editMode) {
        footer.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-secondary', type: 'button', text: '暂存',
          onclick: function () { saveDraft(); UI.toast('已暂存，下次打开可继续填写', 'success'); }
        }));
      }
      footer.appendChild(U.el('button', {
        class: 'btn btn-primary', type: 'button', text: state.step === 4 ? '提交审核' : '下一步',
        onclick: function () { onNext(this); }
      }));
      main.appendChild(footer);
      root.appendChild(app);
    }

    function stepper() {
      var steps = ['账号设置', '基本信息', '证件上传', '确认提交'];
      var box = U.el('div', { class: 'stepper' });
      steps.forEach(function (label, i) {
        var n = i + 1;
        var cls = 'step' + (state.step === n ? ' active' : '') + (state.step > n ? ' done' : '');
        var el = U.el('div', { class: cls }, [
          U.el('div', { class: 'step-index', html: state.step > n ? UI.icon('check', 14) : String(n) }),
          U.el('div', { class: 'step-label', text: label })
        ]);
        if (state.step > n && !(editMode && n === 1)) el.addEventListener('click', function () { goStep(n); });
        box.appendChild(el);
      });
      return box;
    }

    function stepContent() {
      if (state.step === 1) return step1();
      if (state.step === 2) return step2();
      if (state.step === 3) return step3();
      return step4();
    }

    function bindInput(form, name, onChange) {
      var el = form.elements[name];
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!state.form[name] || name === 'agreed1';
      } else {
        el.value = state.form[name] !== undefined ? state.form[name] : '';
      }
      el.addEventListener('input', function () {
        if (el.type === 'checkbox') state.form[name] = el.checked;
        else state.form[name] = el.value;
        setDirty();
        if (onChange) onChange(el);
      });
    }

    function step1() {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '第 1 步 · 账号设置' })]));
      var body = U.el('div', { class: 'card-body' });
      body.innerHTML =
        '<div class="field" data-field="phone"><label class="label">手机号 <i class="req">*</i></label>' +
        '<input class="input" name="phone" type="tel" inputmode="numeric" maxlength="11" placeholder="将作为登录账号">' +
        '<div class="hint">11 位手机号，全店唯一，注册后不可自行修改。</div><div class="error-text"></div></div>' +
        '<div class="field" data-field="password"><label class="label">密码 <i class="req">*</i></label>' +
        '<input class="input" name="password" type="password" placeholder="6—20 位，至少包含字母与数字各一位" autocomplete="new-password">' +
        '<div class="hint">密码需 6—20 位，且包含字母和数字。</div><div class="error-text"></div></div>' +
        '<div class="field" data-field="confirmPassword"><label class="label">确认密码 <i class="req">*</i></label>' +
        '<input class="input" name="confirmPassword" type="password" placeholder="再次输入密码" autocomplete="new-password">' +
        '<div class="error-text"></div></div>' +
        '<div class="field" data-field="agreed1"><label class="checkbox"><input type="checkbox" name="agreed1">' +
        '<span>我已阅读并同意<a class="link" id="notice-link" href="javascript:void(0)">《个人信息处理告知》</a>，知悉信息用途、保存期限与可见范围。</span></label>' +
        '<div class="error-text"></div></div>';
      card.appendChild(body);

      var form = body.querySelector('form') || body;
      var phoneEl = body.querySelector('[name="phone"]');
      phoneEl.value = state.form.phone;
      phoneEl.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        state.form.phone = this.value;
        setDirty();
      });
      phoneEl.addEventListener('blur', function () {
        var msg = V.phone(this.value);
        if (msg) { V.applyFieldError(body, 'phone', msg); return; }
        api.checkUnique({ phone: this.value.trim() }).then(function (r) {
          if (r.phone === false) V.applyFieldError(body, 'phone', r.message);
        });
      });

      ['password', 'confirmPassword'].forEach(function (n) {
        var input = body.querySelector('[name="' + n + '"]');
        input.value = state.form[n] || '';
        input.addEventListener('input', function () {
          state.form[n] = this.value;
          setDirty();
          if (n === 'password' && this.value) {
            var m = V.password(this.value);
            if (m) V.applyFieldError(body, 'password', m);
            else V.applyFieldError(body, 'password', '');
          }
          if (state.form.confirmPassword) {
            V.applyFieldError(body, 'confirmPassword', state.form.password === state.form.confirmPassword ? '' : '两次输入的密码不一致');
          }
        });
      });

      var agree = body.querySelector('[name="agreed1"]');
      agree.checked = state.agreed1;
      agree.addEventListener('change', function () {
        state.agreed1 = this.checked;
        state.form.agreed1 = this.checked;
        setDirty();
      });
      body.querySelector('#notice-link').addEventListener('click', showNotice);
      return card;
    }

    function showNotice() {
      var text = api.settings().noticeText;
      UI.openModal({
        title: '个人信息处理告知',
        body: U.el('div', { class: 'notice-box' }, [U.el('div', { class: 'notice-text open', text: text })]),
        footer: [{ text: '我已阅读', class: 'btn-primary' }]
      });
    }

    function step2() {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [U.el('div', { class: 'card-title', text: '第 2 步 · 基本信息' })]));
      var body = U.el('div', { class: 'card-body' });
      var positions = V.POSITIONS.map(function (p) { return '<option value="' + p + '">' + p + '</option>'; }).join('');
      var types = V.EMPLOYMENT_TYPES.map(function (t) {
        return '<label class="radio-chip"><input type="radio" name="employmentType" value="' + t + '"><span>' + t + '</span></label>';
      }).join('');
      body.innerHTML =
        '<div class="field" data-field="name"><label class="label">姓名 <i class="req">*</i></label>' +
        '<input class="input" name="name" maxlength="20" placeholder="须与身份证姓名一致"><div class="error-text"></div></div>' +
        '<div class="field" data-field="gender"><label class="label">性别 <i class="req">*</i></label>' +
        '<div class="radio-group">' +
        '<label class="radio-chip"><input type="radio" name="gender" value="男"><span>男</span></label>' +
        '<label class="radio-chip"><input type="radio" name="gender" value="女"><span>女</span></label></div>' +
        '<div class="hint">由身份证第 17 位自动推导，可手工修改。</div><div class="error-text"></div></div>' +
        '<div class="field" data-field="idCard"><label class="label">身份证号 <i class="req">*</i></label>' +
        '<input class="input" name="idCard" maxlength="18" placeholder="18 位身份证号" autocomplete="off">' +
        '<div class="hint" id="id-hint">输入后将自动校验并回填出生日期与性别。</div><div class="error-text"></div></div>' +
        '<div class="field" data-field="birth"><label class="label">出生日期</label>' +
        '<div class="readonly-value" id="birth-value">由身份证号自动生成</div></div>' +
        '<div class="field" data-field="address"><label class="label">现居住地址 <i class="req">*</i></label>' +
        '<textarea class="textarea" name="address" maxlength="80" placeholder="请填写到区/镇与具体门牌，不少于 5 个字"></textarea>' +
        '<div class="error-text"></div></div>' +
        '<div class="form-grid two">' +
        '<div class="field" data-field="position"><label class="label">应聘岗位 <i class="req">*</i></label>' +
        '<select class="select" name="position"><option value="">请选择</option>' + positions + '</select><div class="error-text"></div></div>' +
        '<div class="field" data-field="hireDate"><label class="label">入职日期 <i class="req">*</i></label>' +
        '<input class="input" type="date" name="hireDate" max="' + U.addDays(U.today(), 30) + '" min="2010-01-01"><div class="error-text"></div></div>' +
        '</div>' +
        '<div class="field" data-field="employmentType"><label class="label">用工性质 <i class="req">*</i></label>' +
        '<div class="radio-group">' + types + '</div></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">紧急联系人姓名</label><input class="input" name="emergencyName" maxlength="10" placeholder="选填，2—10 字"></div>' +
        '<div class="field"><label class="label">紧急联系人手机号</label><input class="input" name="emergencyPhone" maxlength="11" inputmode="numeric" placeholder="选填"></div>' +
        '</div>';
      card.appendChild(body);

      var nameEl = body.querySelector('[name="name"]');
      nameEl.value = state.form.name;
      nameEl.addEventListener('input', function () { state.form.name = this.value; setDirty(); });

      var idEl = body.querySelector('[name="idCard"]');
      idEl.value = state.form.idCard;
      idEl.addEventListener('input', function () {
        this.value = this.value.toUpperCase().replace(/[^0-9X]/g, '');
        state.form.idCard = this.value;
        setDirty();
        var hint = body.querySelector('#id-hint');
        if (this.value.length === 18) {
          if (!V.checkIdCard(this.value)) {
            V.applyFieldError(body, 'idCard', '该身份证号校验未通过，请检查是否输入正确');
          } else {
            V.applyFieldError(body, 'idCard', '');
            var meta = V.idMeta(this.value);
            state.form.birth = meta.birth;
            state.form.gender = meta.gender;
            body.querySelector('#birth-value').textContent = meta.birth;
            syncGender();
            hint.textContent = '已根据身份证号回填出生日期与性别。';
            api.checkUnique({ idCard: this.value }).then(function (r) {
              if (r.idCard === false) V.applyFieldError(body, 'idCard', r.message);
            });
          }
        } else {
          V.applyFieldError(body, 'idCard', this.value.length > 0 && this.value.length < 18 ? '身份证号应为 18 位，请核对后重新输入' : '');
        }
      });
      body.querySelector('#birth-value').textContent = state.form.birth || '由身份证号自动生成';

      function syncGender() {
        U.$$('[name="gender"]', body).forEach(function (r) {
          r.checked = r.value === state.form.gender;
          r.closest('.radio-chip').classList.toggle('checked', r.checked);
        });
      }
      U.$$('[name="gender"]', body).forEach(function (r) {
        r.addEventListener('change', function () {
          state.form.gender = this.value;
          syncGender();
          setDirty();
        });
      });
      syncGender();

      var addr = body.querySelector('[name="address"]');
      addr.value = state.form.address;
      addr.addEventListener('input', function () { state.form.address = this.value; setDirty(); });

      var pos = body.querySelector('[name="position"]');
      pos.value = state.form.position;
      pos.addEventListener('change', function () { state.form.position = this.value; setDirty(); });

      var hire = body.querySelector('[name="hireDate"]');
      hire.value = state.form.hireDate;
      hire.addEventListener('change', function () { state.form.hireDate = this.value; setDirty(); });

      U.$$('[name="employmentType"]', body).forEach(function (r) {
        r.checked = r.value === state.form.employmentType;
        r.closest('.radio-chip').classList.toggle('checked', r.checked);
        r.addEventListener('change', function () {
          state.form.employmentType = this.value;
          U.$$('[name="employmentType"]', body).forEach(function (x) {
            x.closest('.radio-chip').classList.toggle('checked', x.checked);
          });
          setDirty();
        });
      });

      var en = body.querySelector('[name="emergencyName"]');
      var ep = body.querySelector('[name="emergencyPhone"]');
      en.value = state.form.emergencyName;
      ep.value = state.form.emergencyPhone;
      en.addEventListener('input', function () { state.form.emergencyName = this.value; setDirty(); });
      ep.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        state.form.emergencyPhone = this.value;
        setDirty();
      });
      return card;
    }

    function step3() {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'card-title', text: '第 3 步 · 证件上传' }),
          U.el('div', { class: 'card-sub', text: '四类附件均为必传，上传成功后可预览与重新上传' })
        ])
      ]));
      var body = U.el('div', { class: 'card-body' });

      var grid = U.el('div', { class: 'upload-grid' });
      FILE_CFG.forEach(function (cfg) {
        grid.appendChild(uploadCard(cfg));
      });
      body.appendChild(grid);

      var dates = U.el('div', { class: 'form-grid two', style: { marginTop: '16px' } });
      dates.innerHTML =
        '<div class="field" data-field="idCardExpiry"><label class="label">身份证有效期至</label>' +
        '<input class="input" type="date" name="idCardExpiry"><div class="hint">选填；早于今天将提示更换。</div><div class="error-text"></div></div>' +
        '<div class="field" data-field="healthCertExpiry"><label class="label">健康证有效期至 <i class="req">*</i></label>' +
        '<input class="input" type="date" name="healthCertExpiry"><div class="hint">必填，须晚于今天，到期前 30 天提醒。</div><div class="error-text"></div></div>';
      body.appendChild(dates);
      var ide = dates.querySelector('[name="idCardExpiry"]');
      ide.value = state.form.idCardExpiry;
      ide.addEventListener('change', function () {
        state.form.idCardExpiry = this.value;
        V.applyFieldError(dates, 'idCardExpiry', this.value ? V.idCardExpiry(this.value) : '');
        setDirty();
      });
      var hce = dates.querySelector('[name="healthCertExpiry"]');
      hce.value = state.form.healthCertExpiry;
      hce.addEventListener('change', function () {
        state.form.healthCertExpiry = this.value;
        var msg = this.value ? V.healthExpiry(this.value) : '健康证已过期或未填写有效期，请补充';
        if (this.value && U.diffDays(this.value) < 0) msg = '健康证已过期，请上传在有效期内的证件';
        V.applyFieldError(dates, 'healthCertExpiry', msg);
        setDirty();
      });
      card.appendChild(body);
      return card;
    }

    function uploadCard(cfg) {
      var file = state.files[cfg.key];
      var card = U.el('div', { class: 'upload-card' + (file ? '' : ''), dataset: { upload: cfg.key } });
      card.appendChild(U.el('div', { class: 'upload-head' }, [
        U.el('div', { class: 'upload-name' }, [
          U.el('span', {}, [U.el('span', { text: cfg.name }), U.el('span', { class: 'req', text: ' *' })]),
          file ? UI.badge('已上传', 'success') : UI.badge('待上传', 'muted')
        ]),
        U.el('div', { class: 'upload-req', text: cfg.req })
      ]));

      if (file) {
        var thumb = U.el('div', { class: 'upload-thumb' });
        if (cfg.key === 'healthCert') {
          thumb.appendChild(U.el('div', { class: 'pdf-icon', text: 'PDF' }));
        } else {
          var img = U.el('img', { alt: cfg.name });
          thumb.appendChild(img);
          api.getFileUrl(file.key).then(function (url) { if (url) img.src = url; });
        }
        var meta = U.el('div', { class: 'upload-meta' }, [
          U.el('strong', { text: file.name || '已上传文件' }),
          U.el('div', { text: file.size ? (file.size / 1024 / 1024).toFixed(2) + ' MB' : '已保存' })
        ]);
        var actions = U.el('div', { class: 'upload-actions' }, [
          U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '预览',
            onclick: function () {
              api.getFileUrl(file.key).then(function (url) {
                if (!url) { UI.toast('文件已失效，请重新上传', 'error'); return; }
                if (cfg.key === 'healthCert') UI.pdfViewer({ url: url, title: '健康证 · ' + state.form.name });
                else {
                  UI.imageViewer({ url: url, title: cfg.name });
                  Store.log('查看本人证件', state.form.name || '本人', cfg.name);
                }
              });
            }
          }),
          U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '重新上传',
            onclick: function () { pickFile(cfg, card); }
          }),
          U.el('button', {
            class: 'btn btn-danger-ghost btn-sm', type: 'button', text: '删除',
            onclick: function () {
              UI.confirm({ title: '删除附件', message: '确认删除已上传的' + cfg.name + '？删除后需重新上传。', danger: true, confirmText: '删除' })
                .then(function (yes) {
                  if (!yes) return;
                  delete state.files[cfg.key];
                  setDirty();
                  render();
                });
            }
          })
        ]);
        meta.appendChild(actions);
        thumb.appendChild(meta);
        card.appendChild(thumb);
        card.appendChild(U.el('input', { type: 'file', class: 'hidden', dataset: { input: cfg.key } }));
        bindFileInput(cfg, card);
      } else {
        var drop = U.el('div', { class: 'upload-drop' }, [
          U.el('span', { html: UI.icon('upload', 24) }),
          U.el('div', { text: '点击选择或拖拽文件到此处' }),
          U.el('div', { class: 'small', text: cfg.req })
        ]);
        drop.addEventListener('click', function () { pickFile(cfg, card); });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('drag'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('drag'); });
        drop.addEventListener('drop', function (e) {
          e.preventDefault();
          drop.classList.remove('drag');
          if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(cfg, card, e.dataTransfer.files[0]);
        });
        card.appendChild(drop);
        card.appendChild(U.el('input', { type: 'file', class: 'hidden', dataset: { input: cfg.key } }));
        bindFileInput(cfg, card);
      }
      return card;
    }

    function bindFileInput(cfg, card) {
      var input = card.querySelector('[data-input="' + cfg.key + '"]');
      input.accept = cfg.key === 'healthCert' ? 'application/pdf,.pdf' : 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';
      input.addEventListener('change', function () {
        if (this.files && this.files[0]) handleFile(cfg, card, this.files[0]);
        this.value = '';
      });
    }

    function pickFile(cfg, card) {
      var input = card.querySelector('[data-input="' + cfg.key + '"]');
      if (input) input.click();
    }

    function handleFile(cfg, card, file) {
      var err = null;
      if (cfg.key === 'healthCert') {
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') err = '健康证需为 PDF 文件且不超过 10MB';
        else if (file.size > 10 * 1024 * 1024) err = '健康证需为 PDF 文件且不超过 10MB';
      } else {
        if (!/\.(jpe?g|png|webp|gif)$/i.test(file.name)) err = '图片格式不符合要求，请上传 JPG、PNG、WEBP 或 GIF';
        else if (file.size > (cfg.key === 'photo' ? 10 * 1024 * 1024 : 20 * 1024 * 1024)) {
          err = '图片大小超过限制，' + (cfg.key === 'photo' ? '照片不超过 10MB' : '证件不超过 20MB');
        }
      }
      if (err) { UI.toast(err, 'error'); return; }

      startUpload(cfg, card, file);
    }

    function startUpload(cfg, card, file) {
      var drop = card.querySelector('.upload-drop') || card.querySelector('.upload-thumb');
      var bar = U.el('div', { class: 'upload-progress' }, [U.el('span', { style: { width: '6%' } })]);
      card.appendChild(bar);
      var pct = 6;
      var timer = setInterval(function () {
        pct = Math.min(92, pct + 12);
        bar.firstChild.style.width = pct + '%';
      }, 90);
      api.uploadFile(file, cfg.key).then(function (res) {
        clearInterval(timer);
        bar.firstChild.style.width = '100%';
        state.files[cfg.key] = { key: res.key, name: res.name, size: res.size, type: res.type, url: res.url };
        setDirty();
        setTimeout(function () { render(); UI.toast(cfg.name + ' 上传成功', 'success'); }, 220);
      }).catch(function (e) {
        clearInterval(timer);
        bar.remove();
        UI.toast(e.message || '上传失败，点击重试', 'error');
      });
    }

    function step4() {
      var wrap = U.el('div');
      var blocks = [
        { key: 'basic', title: '基本信息', step: 2, rows: [
          ['姓名', state.form.name], ['性别', state.form.gender], ['身份证号', U.maskId(state.form.idCard)],
          ['出生日期', state.form.birth], ['现居住地址', state.form.address], ['应聘岗位', state.form.position],
          ['用工性质', state.form.employmentType], ['入职日期', state.form.hireDate],
          ['紧急联系人', (state.form.emergencyName || '—') + (state.form.emergencyPhone ? ' ' + state.form.emergencyPhone : '')]
        ] },
        { key: 'files', title: '证件附件', step: 3, rows: [
          ['身份证有效期', state.form.idCardExpiry || '未填写'], ['健康证有效期', state.form.healthCertExpiry || '未填写']
        ] },
        { key: 'account', title: '账号信息', step: 1, rows: [
          ['手机号', state.form.phone], ['登录密码', '••••••（已设置）']
        ] }
      ];
      blocks.forEach(function (b) {
        var card = U.el('div', { class: 'card' });
        card.appendChild(U.el('div', { class: 'card-head' }, [
          U.el('div', { class: 'card-title', text: b.title }),
          U.el('button', {
            class: 'btn-text', type: 'button', text: '修改',
            onclick: function () { goStep(b.step); }
          })
        ]));
        var body = U.el('div', { class: 'card-body tight' });
        b.rows.forEach(function (r) {
          body.appendChild(U.el('div', { class: 'info-row' }, [
            U.el('span', { class: 'info-label', text: r[0] }),
            U.el('span', { class: 'info-value', text: r[1] || '—' })
          ]));
        });
        if (b.key === 'files') {
          var grid = U.el('div', { class: 'cert-grid', style: { marginTop: '10px' } });
          FILE_CFG.forEach(function (cfg) {
            var f = state.files[cfg.key];
            var item = U.el('button', { class: 'cert-item', type: 'button' });
            var inner;
            if (f && cfg.key !== 'healthCert') {
              var img = U.el('img', { alt: cfg.name });
              api.getFileUrl(f.key).then(function (u) { if (u) img.src = u; });
              inner = [img, U.el('span', { text: cfg.name })];
            } else {
              item.classList.add('pdf');
              inner = [
                U.el('div', { class: 'pdf-badge', text: f ? 'PDF' : '未上传' }),
                U.el('span', { text: cfg.name })
              ];
            }
            inner.forEach(function (n) { item.appendChild(n); });
            item.addEventListener('click', function () {
              if (!f) { goStep(3); return; }
              api.getFileUrl(f.key).then(function (url) {
                if (!url) { UI.toast('文件已失效，请重新上传', 'error'); return; }
                if (cfg.key === 'healthCert') UI.pdfViewer({ url: url, title: '健康证' });
                else UI.imageViewer({ url: url, title: cfg.name });
              });
            });
            grid.appendChild(item);
          });
          body.appendChild(grid);
        }
        card.appendChild(body);
        wrap.appendChild(card);
      });

      var notice = U.el('div', { class: 'card' });
      var nbody = U.el('div', { class: 'card-body' });
      var text = api.settings().noticeText;
      var textBox = U.el('div', { class: 'notice-text', text: text });
      nbody.appendChild(U.el('div', { class: 'flex-between', style: { marginBottom: '8px' } }, [
        U.el('div', { class: 'strong', text: '个人信息处理告知' }),
        U.el('button', {
          class: 'btn-text', type: 'button', text: '展开全文',
          onclick: function () {
            textBox.classList.toggle('open');
            this.textContent = textBox.classList.contains('open') ? '收起' : '展开全文';
          }
        })
      ]));
      nbody.appendChild(textBox);
      var agree = U.el('label', { class: 'checkbox', style: { marginTop: '12px' } }, [
        U.el('input', { type: 'checkbox' }),
        U.el('span', { text: '我确认以上信息真实有效，并同意门店将其用于人事管理、排班与薪资发放。' })
      ]);
      agree.querySelector('input').checked = state.agreed4;
      agree.querySelector('input').addEventListener('change', function () {
        state.agreed4 = this.checked;
        state.form.agreed4 = this.checked;
        setDirty();
      });
      nbody.appendChild(agree);
      notice.appendChild(nbody);
      wrap.appendChild(notice);
      return wrap;
    }

    /* ---------- 步骤流转与提交 ---------- */
    function validateStep(step, button) {
      var body = U.$('.card-body');
      var form = body;
      V.clearErrors(form);
      if (step === 1) {
        if (editMode) return Promise.resolve(true);
        var m1 = V.phone(state.form.phone);
        if (m1) { V.applyFieldError(form, 'phone', m1); return Promise.resolve(false); }
        var m2 = V.password(state.form.password);
        if (m2) { V.applyFieldError(form, 'password', m2); return Promise.resolve(false); }
        if (state.form.password !== state.form.confirmPassword) {
          V.applyFieldError(form, 'confirmPassword', '两次输入的密码不一致'); return Promise.resolve(false);
        }
        if (!state.agreed1) { V.applyFieldError(form, 'agreed1', '请先阅读并同意个人信息处理告知'); return Promise.resolve(false); }
        return api.checkUnique({ phone: state.form.phone }).then(function (r) {
          if (r.phone === false) { V.applyFieldError(form, 'phone', r.message); return false; }
          return true;
        });
      }
      if (step === 2) {
        var ok = true;
        var mn = V.name(state.form.name);
        if (mn) { V.applyFieldError(form, 'name', mn); ok = false; }
        if (!state.form.gender) { V.applyFieldError(form, 'gender', '请选择性别'); ok = false; }
        if (!state.form.idCard) { V.applyFieldError(form, 'idCard', '请输入身份证号'); ok = false; }
        else if (!/^[1-9]\d{16}[\dXx]$/.test(state.form.idCard)) { V.applyFieldError(form, 'idCard', '身份证号应为 18 位，请核对后重新输入'); ok = false; }
        else if (!V.checkIdCard(state.form.idCard)) { V.applyFieldError(form, 'idCard', '该身份证号校验未通过，请检查是否输入正确'); ok = false; }
        var ma = V.address(state.form.address);
        if (ma) { V.applyFieldError(form, 'address', ma); ok = false; }
        if (!state.form.position) { V.applyFieldError(form, 'position', '请选择应聘岗位'); ok = false; }
        var mh = V.hireDate(state.form.hireDate);
        if (mh) { V.applyFieldError(form, 'hireDate', mh); ok = false; }
        if (state.form.emergencyPhone && V.phone(state.form.emergencyPhone)) {
          UI.toast('紧急联系人手机号格式不正确', 'error'); ok = false;
        }
        if (!ok) return Promise.resolve(false);
        return api.checkUnique({ idCard: state.form.idCard }).then(function (r) {
          if (r.idCard === false) { V.applyFieldError(form, 'idCard', r.message); return false; }
          return true;
        });
      }
      if (step === 3) {
        var missing = FILE_CFG.filter(function (c) { return !state.files[c.key]; });
        if (missing.length) {
          UI.toast('还有 ' + missing.length + ' 项附件未上传：' + missing.map(function (m) { return m.name; }).join('、'), 'error');
          return Promise.resolve(false);
        }
        var me = state.form.idCardExpiry ? V.idCardExpiry(state.form.idCardExpiry) : '';
        if (me) { V.applyFieldError(form, 'idCardExpiry', me); return Promise.resolve(false); }
        var mh2 = V.healthExpiry(state.form.healthCertExpiry);
        if (mh2) {
          V.applyFieldError(form, 'healthCertExpiry', U.diffDays(state.form.healthCertExpiry) < 0 ? '健康证已过期，请上传在有效期内的证件' : mh2);
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      }
      if (!state.agreed4) {
        UI.toast('请勾选确认条款后再提交', 'error');
        return Promise.resolve(false);
      }
      if (!state.files.idFront || !state.files.idBack || !state.files.photo || !state.files.healthCert) {
        UI.toast('还有附件未上传，请返回第 3 步补充', 'error');
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    }

    function onNext(btn) {
      var step = state.step;
      UI.btnLoading(btn, true, '校验中…');
      validateStep(step, btn).then(function (ok) {
        UI.btnLoading(btn, false);
        if (!ok) return;
        if (step < 4) { goStep(step + 1); return; }
        submit(btn);
      });
    }

    function submit(btn) {
      var payload = {
        phone: state.form.phone, password: state.form.password,
        name: state.form.name, gender: state.form.gender, idCard: state.form.idCard,
        birth: state.form.birth, address: state.form.address, position: state.form.position,
        employmentType: state.form.employmentType, hireDate: state.form.hireDate,
        idCardExpiry: state.form.idCardExpiry, healthCertExpiry: state.form.healthCertExpiry,
        emergency: (state.form.emergencyName || '') + (state.form.emergencyPhone ? ' ' + state.form.emergencyPhone : ''),
        files: Object.keys(state.files).reduce(function (a, k) { a[k] = state.files[k].key; return a; }, {})
      };
      UI.btnLoading(btn, true, '提交中…');
      var task = editMode ? api.resubmitRegistration(payload) : api.register(payload);
      task.then(function (res) {
        submitted = true;
        dirty = false;
        clearTimeout(saveTimer);
        clearDraft();
        if (editMode) {
          UI.btnLoading(btn, false);
          UI.toast('资料已重新提交，等待店长审核', 'success');
          setTimeout(function () { location.replace('pending.html'); }, 500);
          return;
        }
        UI.toast('资料已提交，等待店长审核', 'success');
        api.login({ phone: payload.phone, password: payload.password, remember: false }).then(function () {
          setTimeout(function () { location.replace('pending.html'); }, 400);
        }).catch(function () {
          setTimeout(function () { location.replace('login.html'); }, 600);
        });
      }).catch(function (e) {
        UI.btnLoading(btn, false);
        UI.toast(e.message || '提交失败，请重试', 'error');
      });
    }

    render();
  };
})();
