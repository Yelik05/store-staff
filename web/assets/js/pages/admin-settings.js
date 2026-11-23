/* P12 管理端 — 系统设置（超级管理员） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-settings'] = function (ctx) {
    var state = { tab: 'dimensions', settings: null, accounts: [], logs: [] };
    var content = U.el('div');
    var head = U.el('div', { class: 'page-head' }, [
      U.el('p', { text: '仅店长（超级管理员）可访问：站点信息、量化维度、管理组账号、规则、操作日志与数据备份。' })
    ]);
    content.appendChild(head);

    var card = U.el('div', { class: 'card' });
    var tabs = U.el('div', { class: 'tabs', style: { padding: '0 12px', marginBottom: '0' } });
    var tabDefs = [
      { key: 'dimensions', label: '量化维度' },
      { key: 'site', label: '站点信息' },
      { key: 'accounts', label: '管理组账号' },
      { key: 'rules', label: '门店与规则' },
      { key: 'reimburse', label: '报销分类' },
      { key: 'webhook', label: '飞书推送' },
      { key: 'logs', label: '操作日志' },
      { key: 'backup', label: '数据备份' }
    ];
    tabDefs.forEach(function (t) {
      tabs.appendChild(U.el('button', {
        class: 'tab' + (state.tab === t.key ? ' active' : ''), type: 'button', text: t.label,
        dataset: { tab: t.key },
        onclick: function () {
          state.tab = t.key;
          U.$$('.tab', tabs).forEach(function (x) { x.classList.toggle('active', x.dataset.tab === t.key); });
          renderTab();
        }
      }));
    });
    card.appendChild(tabs);
    var tabBody = U.el('div');
    card.appendChild(tabBody);
    content.appendChild(card);

    Layout.adminShell({ title: '系统设置', active: 'admin-settings' }, content);

    api.getSettings().then(function (s) {
      state.settings = s;
      renderTab();
    }).catch(function (e) {
      tabBody.innerHTML = '';
      tabBody.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function renderTab() {
      tabBody.innerHTML = '';
      if (!state.settings) { tabBody.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(2)])); return; }
      if (state.tab === 'dimensions') tabDimensions();
      else if (state.tab === 'site') tabSite();
      else if (state.tab === 'accounts') tabAccounts();
      else if (state.tab === 'rules') tabRules();
      else if (state.tab === 'reimburse') tabReimburse();
      else if (state.tab === 'webhook') tabWebhook();
      else if (state.tab === 'logs') tabLogs();
      else tabBackup();
    }

    /* ---------------- 量化维度 ---------------- */
    function tabDimensions() {
      var dims = state.settings.dimensions.map(function (d) { return Object.assign({}, d); });
      var grades = state.settings.grades.map(function (g) { return Object.assign({}, g); });
      var body = U.el('div', { class: 'card-body' });

      body.appendChild(U.el('div', { class: 'flex-between', style: { marginBottom: '10px' } }, [
        U.el('div', {}, [
          U.el('div', { class: 'strong', text: '维度配置' }),
          U.el('div', { class: 'small muted', text: '所有维度满分合计必须为 100 分，保存后按新配置渲染打分页与员工端。' })
        ]),
        U.el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: '新增维度',
          onclick: function () {
            dims.push({ key: '', name: '新维度', full: 5, desc: '' });
            paintDims();
          }
        })
      ]));

      var dimBox = U.el('div');
      body.appendChild(dimBox);
      var sumEl = U.el('div', { class: 'formula-note', style: { marginTop: '10px' } });
      body.appendChild(sumEl);

      function paintDims() {
        dimBox.innerHTML = '';
        dims.forEach(function (d, i) {
          var row = U.el('div', { class: 'dim-edit-row', style: { marginBottom: '10px' } });
          var nameInput = U.el('input', { class: 'input', value: d.name, placeholder: '维度名称' });
          nameInput.addEventListener('input', function () { d.name = this.value; });
          var fullInput = U.el('input', { class: 'input', type: 'number', min: '1', max: '100', value: d.full });
          fullInput.addEventListener('input', function () { d.full = Number(this.value) || 0; paintSum(); });
          var descInput = U.el('input', { class: 'input dim-desc-input', value: d.desc || '', placeholder: '评分说明' });
          descInput.addEventListener('input', function () { d.desc = this.value; });
          row.appendChild(nameInput);
          row.appendChild(fullInput);
          row.appendChild(descInput);
          row.appendChild(U.el('button', {
            class: 'btn btn-danger-ghost btn-sm', type: 'button', text: '删除',
            onclick: function () {
              if (dims.length <= 1) { UI.toast('至少保留一个维度', 'error'); return; }
              dims.splice(i, 1);
              paintDims();
            }
          }));
          dimBox.appendChild(row);
        });
        paintSum();
      }

      function paintSum() {
        var total = dims.reduce(function (a, b) { return a + Number(b.full || 0); }, 0);
        sumEl.textContent = '当前维度满分合计：' + U.round2(total) + ' 分' + (Math.abs(total - 100) < 0.001 ? '（符合要求）' : '（须为 100 分）');
        sumEl.style.color = Math.abs(total - 100) < 0.001 ? 'var(--ink-3)' : 'var(--danger)';
      }
      paintDims();

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '等级与绩效系数' }));
      var gradeBox = U.el('div');
      grades.forEach(function (g) {
        var row = U.el('div', { class: 'inline-form', style: { marginBottom: '8px' } });
        row.appendChild(U.el('span', { class: 'badge badge-brand', text: g.key + ' 级' }));
        var minInput = U.el('input', { class: 'input', type: 'number', min: '0', max: '100', value: g.min, style: { width: '92px' } });
        minInput.addEventListener('input', function () { g.min = Number(this.value) || 0; });
        var coefInput = U.el('input', { class: 'input', type: 'number', min: '0', max: '3', step: '0.1', value: g.coef, style: { width: '92px' } });
        coefInput.addEventListener('input', function () { g.coef = Number(this.value) || 0; });
        var descInput = U.el('input', { class: 'input', value: g.desc || '', style: { maxWidth: '140px' } });
        descInput.addEventListener('input', function () { g.desc = this.value; });
        row.appendChild(U.el('span', { class: 'small muted', text: '最低分' }));
        row.appendChild(minInput);
        row.appendChild(U.el('span', { class: 'small muted', text: '绩效系数' }));
        row.appendChild(coefInput);
        row.appendChild(descInput);
        gradeBox.appendChild(row);
      });
      body.appendChild(gradeBox);
      body.appendChild(U.el('p', { class: 'small muted', style: { marginTop: '6px' }, text: '默认 A≥90（1.2）、B 80—89（1.0）、C 70—79（0.8）、D 70 分以下（0.5）。系数仅作参考，最终金额由管理组在薪资表中手工确认。' }));

      var foot = U.el('div', { class: 'card-foot text-right' }, [
        U.el('button', {
          class: 'btn btn-primary', type: 'button', text: '保存配置',
          onclick: function (e) {
            var btn = e.currentTarget;
            var total = dims.reduce(function (a, b) { return a + Number(b.full || 0); }, 0);
            if (Math.abs(total - 100) > 0.001) { UI.toast('维度满分合计须为 100 分，当前为 ' + U.round2(total) + ' 分', 'error'); return; }
            var sorted = grades.slice().sort(function (a, b) { return b.min - a.min; });
            if (sorted[0].min < sorted[sorted.length - 1].min) { UI.toast('等级区间配置不正确', 'error'); return; }
            UI.btnLoading(btn, true, '保存中…');
            api.saveDimensions(dims).then(function () {
              return api.saveSettings({ grades: grades });
            }).then(function () {
              UI.btnLoading(btn, false);
              UI.toast('量化维度与等级配置已保存', 'success');
              return api.getSettings();
            }).then(function (s) { state.settings = s; }).catch(function (err) {
              UI.btnLoading(btn, false);
              UI.toast(err.message, 'error');
            });
          }
        })
      ]);
      body.appendChild(foot);
      tabBody.appendChild(body);
    }

    /* ---------------- 管理组账号 ---------------- */
    function tabAccounts() {
      api.listAccounts().then(function (list) {
        state.accounts = list;
        var body = U.el('div', { class: 'card-body' });
        body.appendChild(U.el('div', { class: 'flex-between', style: { marginBottom: '12px' } }, [
          U.el('div', {}, [
            U.el('div', { class: 'strong', text: '管理组账号' }),
            U.el('div', { class: 'small muted', text: '管理组账号由店长创建，不能自助注册；店长本人账号不可停用。' })
          ]),
          U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '新增管理组',
            onclick: openAddAccount
          })
        ]));
        var tableWrap = U.el('div', { class: 'table-wrap' });
        var table = U.el('table', { class: 'data-table', style: { minWidth: '720px' } });
        table.innerHTML = '<thead><tr><th>姓名</th><th>手机号</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>';
        var tbody = U.el('tbody');
        list.forEach(function (a) {
          var tr = U.el('tr');
          tr.appendChild(U.el('td', {}, [
            U.el('div', { class: 'cell-user-name', text: a.name }),
            U.el('div', { class: 'cell-user-sub', text: a.position || '' })
          ]));
          tr.appendChild(U.el('td', { class: 'mono', text: a.phone }));
          tr.appendChild(U.el('td', { text: a.role === 'superadmin' ? '超级管理员（店长）' : '管理组' }));
          var tdSt = U.el('td');
          tdSt.appendChild(UI.badge(a.status === 'active' ? '启用' : '已停用', a.status === 'active' ? 'success' : 'muted'));
          tr.appendChild(tdSt);
          tr.appendChild(U.el('td', { class: 'small', text: a.lastLoginAt ? U.fmtTime(a.lastLoginAt) : '从未登录' }));
          var ops = U.el('td');
          var box = U.el('div', { class: 'table-actions' });
          box.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '重置密码',
            onclick: function () { openReset(a.name, { accountId: a.id }); }
          }));
          if (!a.isOwner) {
            box.appendChild(U.el('button', {
              class: 'btn-text', type: 'button', text: a.status === 'active' ? '停用' : '启用',
              onclick: function () {
                UI.confirm({
                  title: a.status === 'active' ? '停用账号' : '启用账号',
                  message: '确认' + (a.status === 'active' ? '停用 ' : '启用 ') + a.name + ' 的账号？',
                  danger: a.status === 'active',
                  confirmText: '确认'
                }).then(function (yes) {
                  if (!yes) return;
                  api.toggleAccount(a.id).then(function () {
                    UI.toast('账号状态已更新', 'success');
                    tabBody.innerHTML = '';
                    tabAccounts();
                  }).catch(function (e) { UI.toast(e.message, 'error'); });
                });
              }
            }));
          } else {
            box.appendChild(U.el('span', { class: 'small muted', text: '不可停用' }));
          }
          ops.appendChild(box);
          tr.appendChild(ops);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        body.appendChild(tableWrap);

        var staffCard = U.el('div', { style: { borderTop: '1px solid var(--line-2)', marginTop: '16px', paddingTop: '14px' } }, [
          U.el('div', { class: 'strong', text: '员工账号密码重置' }),
          U.el('p', { class: 'small muted', text: '员工忘记密码时，可由店长在此重置。本期不提供短信验证码找回。' })
        ]);
        staffCard.appendChild(U.el('button', {
          class: 'btn btn-ghost btn-sm mt-8', type: 'button', text: '重置员工密码',
          onclick: openResetStaff
        }));
        body.appendChild(staffCard);
        tabBody.appendChild(body);
      });
    }

    function openAddAccount() {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field" data-field="name"><label class="label">姓名 <i class="req">*</i></label><input class="input" name="name" maxlength="20" placeholder="2—20 个字"><div class="error-text"></div></div>' +
        '<div class="field" data-field="phone"><label class="label">手机号 <i class="req">*</i></label><input class="input" name="phone" maxlength="11" inputmode="numeric" placeholder="作为登录账号"><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">岗位</label><select class="select" name="position">' +
        V.POSITIONS.map(function (p) { return '<option value="' + p + '"' + (p === '店助' ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
        '</select><div class="hint">管理组可查看全店档案、录入并发布薪资与量化分。</div></div>' +
        '<div class="field" data-field="password"><label class="label">初始密码 <i class="req">*</i></label><input class="input" name="password" type="text" placeholder="6—20 位，含字母和数字"><div class="error-text"></div></div>' +
        '<div class="hint">首次登录后建议提醒其修改密码。</div>';
      UI.openModal({
        title: '新增管理组账号',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '创建账号', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              UI.btnLoading(btn, true, '创建中…');
              api.createAccount({
                name: fd.get('name'), phone: fd.get('phone'),
                position: fd.get('position'), password: fd.get('password')
              }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('管理组账号已创建', 'success');
                tabBody.innerHTML = '';
                tabAccounts();
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

    function openReset(title, params) {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field"><label class="label">新密码 <i class="req">*</i></label><input class="input" name="password" type="text" placeholder="6—20 位，含字母和数字"></div>' +
        '<div class="hint">重置后请通知本人及时登录并修改密码；该操作会写入操作日志。</div>';
      UI.openModal({
        title: '重置密码 · ' + title,
        size: 'sm',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认重置', class: 'btn-primary',
            onClick: function (btn, close) {
              var pw = form.querySelector('[name="password"]').value;
              UI.btnLoading(btn, true, '重置中…');
              api.resetPassword(Object.assign({ password: pw }, params)).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('密码已重置', 'success');
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

    function openResetStaff() {
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field" data-field="keyword"><label class="label">员工姓名或手机号 <i class="req">*</i></label><input class="input" name="keyword" placeholder="输入后精确匹配一名员工"><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">新密码 <i class="req">*</i></label><input class="input" name="password" type="text" placeholder="6—20 位，含字母和数字"></div>';
      UI.openModal({
        title: '重置员工密码',
        size: 'sm',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '确认重置', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var kw = String(fd.get('keyword') || '').trim();
              if (!kw) { V.applyFieldError(form, 'keyword', '请输入员工姓名或手机号'); return false; }
              UI.btnLoading(btn, true, '查找中…');
              api.listStaff({ keyword: kw, includeResigned: true, status: 'all', page: 1, pageSize: 50 }).then(function (res) {
                var exact = res.list.filter(function (s) { return s.phone === kw || s.name === kw; });
                if (exact.length !== 1) {
                  throw new Error(exact.length ? '匹配到多名员工，请输入完整手机号' : '未找到该员工');
                }
                return api.resetPassword({ staffId: exact[0].id, password: fd.get('password') });
              }).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('员工密码已重置', 'success');
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

    /* ---------------- 站点信息 ---------------- */
    function tabSite() {
      var body = U.el('div', { class: 'card-body' });
      body.appendChild(U.el('h4', { class: 'form-section-title', text: '站点信息' }));
      body.appendChild(U.el('p', {
        class: 'small muted',
        text: '网站标题会统一套用到全部页面的浏览器标签标题（含登录、注册、待审核、健康证公示、公告与后台页面）。'
      }));
      var def = (window.SiteTitle && SiteTitle.DEFAULT) || '塔斯汀门店人员管理系统';
      var input = U.el('input', {
        class: 'input', type: 'text', maxlength: '40',
        value: state.settings.siteTitle || '', placeholder: def
      });
      body.appendChild(U.el('div', { class: 'field', style: { maxWidth: '420px', marginTop: '10px' } }, [
        U.el('label', { class: 'label', text: '网站标题' }),
        input,
        U.el('div', { class: 'hint', text: '留空时使用默认标题「' + def + '」；最长 40 个字符。' })
      ]));
      var reminderIn = U.el('input', {
        class: 'input', type: 'text', maxlength: '200',
        value: state.settings.shiftReminder || '',
        placeholder: '高峰转低峰请随手清洁，并检查岗位物料归位与密封'
      });
      body.appendChild(U.el('div', { class: 'field', style: { maxWidth: '420px', marginTop: '12px' } }, [
        U.el('label', { class: 'label', text: '今日排班提醒文案' }),
        reminderIn,
        U.el('div', { class: 'hint', text: '显示在员工主页「今日排班」卡片底部；留空使用默认文案。最长 200 字。' })
      ]));
      var saveBtn = U.el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
      saveBtn.addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var title = String(input.value || '').replace(/\s+/g, ' ').trim();
        var reminder = String(reminderIn.value || '').replace(/\s+/g, ' ').trim();
        if (title.length > 40) { UI.toast('网站标题不能超过 40 个字符', 'error'); return; }
        if (reminder.length > 200) { UI.toast('今日排班提醒文案不能超过 200 字', 'error'); return; }
        UI.btnLoading(btn, true, '保存中…');
        api.saveSettings({ siteTitle: title, shiftReminder: reminder }).then(function () {
          state.settings.siteTitle = title;
          state.settings.shiftReminder = reminder;
          if (window.SiteTitle) SiteTitle.set(title);
          UI.btnLoading(btn, false);
          UI.toast('设置已保存', 'success');
        }).catch(function (err) {
          UI.btnLoading(btn, false);
          UI.toast(err.message, 'error');
        });
      });
      body.appendChild(U.el('div', { class: 'inline-form mt-8' }, [saveBtn]));
      tabBody.appendChild(body);
    }

    /* ---------------- 门店与规则 ---------------- */
    function tabRules() {
      var s = state.settings;
      var rules = Object.assign({}, s.restRules);
      var expiry = Object.assign({}, s.expiry);
      var notice = s.noticeText;
      var body = U.el('div', { class: 'card-body' });
      body.appendChild(U.el('div', { class: 'formula-note', style: { marginBottom: '14px' } }, [
        U.el('div', {}, [U.el('strong', { text: '门店：' }), U.el('span', { text: api.storeInfo().shortName + '（' + api.storeInfo().code + '）' })]),
        U.el('div', { class: 'mt-8', text: '门店名称与代号为系统内置，如需变更请联系管理员。品牌主色暂用 #E10600（CSS 变量，可在 theme.css 中替换）。' })
      ]));

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '月休规则' }));
      var grid = U.el('div', { class: 'form-grid two' });
      function numField(label, key, hint, obj) {
        var wrap = U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: label }),
          U.el('input', { class: 'input', type: 'number', min: '0', max: '31', value: obj[key] }),
          U.el('div', { class: 'hint', text: hint })
        ]);
        wrap.querySelector('input').addEventListener('input', function () { obj[key] = Number(this.value) || 0; });
        grid.appendChild(wrap);
      }
      numField('全职月休天数', 'fullTime', '默认 4 天/月，台账中可单独调整', rules);
      numField('兼职月休天数', 'partTime', '默认 2 天/月，可按出勤折算后手工调整', rules);
      numField('小时工月休天数', 'hourly', '默认 0 天', rules);
      numField('单岗位每日休息人数', 'maxPerPosition', '默认 1 人', rules);
      numField('全店每日休息人数', 'maxPerDay', '默认 3 人', rules);
      numField('连续休息上限', 'maxConsecutive', '超过需店长特批', rules);
      numField('审批时限（小时）', 'reviewHours', '超时在列表标红', rules);
      body.appendChild(grid);

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '证照到期提醒' }));
      var egrid = U.el('div', { class: 'form-grid two' });
      [['健康证提前提醒（天）', 'healthCert'], ['身份证提前提醒（天）', 'idCard']].forEach(function (x) {
        var w = U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: x[0] }),
          U.el('input', { class: 'input', type: 'number', min: '0', max: '365', value: expiry[x[1]] })
        ]);
        w.querySelector('input').addEventListener('input', function () { expiry[x[1]] = Number(this.value) || 0; });
        egrid.appendChild(w);
      });
      body.appendChild(egrid);

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '个人信息处理告知' }));
      var ta = U.el('textarea', { class: 'textarea', style: { minHeight: '150px' } });
      ta.value = notice;
      ta.addEventListener('input', function () { notice = this.value; });
      body.appendChild(ta);

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '健康证公示页' }));
      var hd = Object.assign({ enabled: false, fullName: false }, s.healthDisclosure || {});
      var hdGrid = U.el('div', { class: 'form-grid two' });
      var hdEnabled = U.el('select', { class: 'select' });
      hdEnabled.appendChild(U.el('option', { value: '1', text: '开启（免登录访问）', selected: !!hd.enabled }));
      hdEnabled.appendChild(U.el('option', { value: '0', text: '关闭（接口提示公示已关闭）', selected: !hd.enabled }));
      hdEnabled.addEventListener('change', function () { hd.enabled = this.value === '1'; });
      hdGrid.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '公示页开关' }), hdEnabled,
        U.el('div', { class: 'hint', text: '地址：health.html，无需登录；关闭后公开接口只返回提示。' })
      ]));
      var hdName = U.el('select', { class: 'select' });
      hdName.appendChild(U.el('option', { value: '0', text: '脱敏（张*）', selected: !hd.fullName }));
      hdName.appendChild(U.el('option', { value: '1', text: '完整姓名', selected: !!hd.fullName }));
      hdName.addEventListener('change', function () { hd.fullName = this.value === '1'; });
      hdGrid.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '姓名显示' }), hdName,
        U.el('div', { class: 'hint', text: '默认脱敏；只公开门店、姓名、岗位、健康证有效期与状态。' })
      ]));
      body.appendChild(hdGrid);
      body.appendChild(U.el('div', { class: 'hint', style: { marginBottom: '10px' } }, [
        U.el('a', { class: 'link', href: 'health.html', target: '_blank', rel: 'noopener', text: '打开健康证公示页预览 →' })
      ]));
      body.appendChild(U.el('div', { class: 'card-foot text-right', style: { margin: '14px -16px -16px' } }, [
        U.el('button', {
          class: 'btn btn-primary', type: 'button', text: '保存设置',
          onclick: function (e) {
            var btn = e.currentTarget;
            UI.btnLoading(btn, true, '保存中…');
            api.saveSettings({ restRules: rules, expiry: expiry, noticeText: notice, healthDisclosure: hd }).then(function () {
              UI.btnLoading(btn, false);
              UI.toast('设置已保存', 'success');
              return api.getSettings();
            }).then(function (s2) { state.settings = s2; }).catch(function (err) {
              UI.btnLoading(btn, false);
              UI.toast(err.message, 'error');
            });
          }
        })
      ]));
      tabBody.appendChild(body);
    }

    /* ---------------- 飞书推送 ---------------- */
    function tabWebhook() {
      function withTestTimeout(promise, ms) {
        return new Promise(function (resolve, reject) {
          var settled = false;
          var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            var e = new Error('请求超时：' + Math.round(ms / 1000) + ' 秒内未收到服务器响应');
            e.code = 'CLIENT_TIMEOUT';
            reject(e);
          }, ms);
          promise.then(function (v) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(v);
          }, function (e) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(e);
          });
        });
      }
      var TEST_TIMEOUT = 15000;
      var testErrorTypes = {
        timeout: '超时', dns: 'DNS 解析失败', connect: '连接失败', ssl: '证书/SSL 错误',
        http: '目标返回非 2xx', unsupported: '环境不支持', response: '未收到有效响应', exception: '发送异常'
      };

      function templateEditor(def) {
        var wrap = U.el('div', { class: 'field', style: { marginTop: '12px' } });
        wrap.appendChild(U.el('label', { class: 'label', text: def.label }));
        var ta = U.el('textarea', { class: 'input', rows: '4', maxlength: '1000', placeholder: '留空使用默认文案；支持换行，最长 1000 字。' });
        ta.value = def.templates[def.key] || '';
        ta.addEventListener('input', function () { def.templates[def.key] = this.value; });
        wrap.appendChild(ta);
        var actions = U.el('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } });
        var pv = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '预览' });
        var rs = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '恢复默认' });
        var out = U.el('pre', { class: 'formula-note', style: { display: 'none', whiteSpace: 'pre-wrap', marginTop: '8px' } });
        pv.addEventListener('click', function (e) {
          var b = e.currentTarget;
          out.style.display = 'block';
          out.textContent = '正在渲染…';
          UI.btnLoading(b, true, '预览中…');
          api.previewWebhookTemplate({ channel: def.channel, event: def.event, template: ta.value })
            .then(function (r) { out.textContent = (r && r.text) || '（空）'; })
            .catch(function (err) { out.textContent = '预览失败：' + err.message; })
            .then(function () { UI.btnLoading(b, false); });
        });
        rs.addEventListener('click', function () {
          ta.value = '';
          def.templates[def.key] = '';
          UI.toast('已恢复默认文案，保存后生效', 'success');
        });
        actions.appendChild(pv);
        actions.appendChild(rs);
        wrap.appendChild(actions);
        wrap.appendChild(U.el('div', { class: 'hint', text: '占位符：' + def.placeholders.map(function (p) { return '{' + p + '}'; }).join(' ') + '；未知占位符保留原样。' }));
        wrap.appendChild(out);
        return wrap;
      }
      var wh = Object.assign({
        enabled: false, url: '', advanceValue: 30, advanceUnit: 'minute', maxRetries: 3
      }, state.settings.feishuWebhook || {});
      wh.events = Object.assign({ taskDueSoon: true, noticePublished: true, reminderOverdue: true, expiryDue: true, expiryDaily: true }, wh.events || {});
      wh.templates = Object.assign({ taskDueSoon: '', noticePublished: '', reminderOverdue: '', expiryDue: '', expiryDaily: '' }, wh.templates || {});

      var body = U.el('div', { class: 'card-body' });
      body.appendChild(U.el('div', { style: { marginBottom: '12px' } }, [
        U.el('div', { class: 'strong', text: '飞书多维表格自动化' }),
        U.el('div', { class: 'small muted', text: '任务临近截止时，向飞书「收到 webhook」自动化推送一次；消息由飞书侧组装并提醒，本系统只负责投递。' })
      ]));

      var enableSel = U.el('select', { class: 'select' });
      enableSel.appendChild(U.el('option', { value: '1', text: '启用', selected: !!wh.enabled }));
      enableSel.appendChild(U.el('option', { value: '0', text: '关闭', selected: !wh.enabled }));
      enableSel.addEventListener('change', function () { wh.enabled = this.value === '1'; });

      var urlInput = U.el('input', { class: 'input', value: wh.url, placeholder: 'https://…（飞书多维表格自动化「收到 webhook」地址）' });
      urlInput.addEventListener('input', function () { wh.url = String(this.value || '').trim(); });

      var advInput = U.el('input', {
        class: 'input', type: 'number', min: '1', max: '10080', value: wh.advanceValue,
        style: { maxWidth: '110px' }
      });
      advInput.addEventListener('input', function () { wh.advanceValue = Number(this.value) || 0; });

      var unitSel = U.el('select', { class: 'select', style: { maxWidth: '96px' } });
      [['minute', '分钟'], ['hour', '小时']].forEach(function (x) {
        unitSel.appendChild(U.el('option', { value: x[0], text: x[1], selected: wh.advanceUnit === x[0] }));
      });
      unitSel.addEventListener('change', function () { wh.advanceUnit = this.value; });

      var grid = U.el('div', { class: 'form-grid two' });
      grid.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '启用开关' }),
        enableSel,
        U.el('div', { class: 'hint', text: '关闭后不再产生新的推送，历史记录保留。' })
      ]));
      grid.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '提前提醒时长' }),
        U.el('div', { style: { display: 'flex', gap: '6px' } }, [advInput, unitSel]),
        U.el('div', { class: 'hint', text: '到达「截止时间 − 提前量」时推送一次；分钟 1—10080，小时 1—168。' })
      ]));
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: 'webhook 地址' }),
        urlInput,
        U.el('div', { class: 'hint', text: '仅支持公网 http/https 地址；保存时会校验格式。地址可直接粘贴飞书自动化里的示例地址。' })
      ]));
      body.appendChild(grid);

      var eventTask = U.el('input', { type: 'checkbox' });
      eventTask.checked = !!wh.events.taskDueSoon;
      eventTask.addEventListener('change', function () { wh.events.taskDueSoon = this.checked; });
      var eventNotice = U.el('input', { type: 'checkbox' });
      eventNotice.checked = !!wh.events.noticePublished;
      eventNotice.addEventListener('change', function () { wh.events.noticePublished = this.checked; });
      var eventReminder = U.el('input', { type: 'checkbox' });
      eventReminder.checked = !!wh.events.reminderOverdue;
      eventReminder.addEventListener('change', function () { wh.events.reminderOverdue = this.checked; });
      var eventExpiry = U.el('input', { type: 'checkbox' });
      eventExpiry.checked = !!wh.events.expiryDue;
      eventExpiry.addEventListener('change', function () { wh.events.expiryDue = this.checked; });
      var eventDaily = U.el('input', { type: 'checkbox' });
      eventDaily.checked = !!wh.events.expiryDaily;
      eventDaily.addEventListener('change', function () { wh.events.expiryDaily = this.checked; });
      body.appendChild(U.el('h4', { class: 'form-section-title', text: '事件类型' }));
      body.appendChild(U.el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400' } }, [
        eventTask,
        U.el('span', { text: '任务即将到期（任务进入提前提醒窗口时推送）' })
      ]));
      body.appendChild(U.el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400', marginTop: '8px' } }, [
        eventNotice,
        U.el('span', { text: '通知发布（立即发布或定时到点真正发布时推送，撤回后再发布可再推一次）' })
      ]));
      body.appendChild(U.el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400', marginTop: '8px' } }, [
        eventReminder,
        U.el('span', { text: '任务提醒逾期（提醒超过截止时间进入逾期状态时推送，每个提醒每次执行日期只推一次）' })
      ]));
      body.appendChild(U.el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400', marginTop: '8px' } }, [
        eventExpiry,
        U.el('span', { text: '效期临期（前一天登记、次日到期前 30 分钟推送；同一记录同一到期时间只推一次，已处理/已报废不推）' })
      ]));
      body.appendChild(U.el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400', marginTop: '8px' } }, [
        eventDaily,
        U.el('span', { text: '效期日报（每日 09:00、15:00 各推一次；仅推前一天登记、当天到期且未处理/未报废的物料，无可用记录不推）' })
      ]));
      body.appendChild(U.el('div', { class: 'hint', text: '事件可单独开关，至少保留一个；后续事件在此继续扩展。' }));

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '文案模板' }));
      body.appendChild(U.el('div', { class: 'hint', text: '留空使用系统默认文案；支持 {占位符} 与换行，未知占位符保留原样。' }));
      body.appendChild(templateEditor({
        label: '任务即将到期 · text 模板', key: 'taskDueSoon', event: 'taskDueSoon',
        channel: 'public', templates: wh.templates,
        placeholders: ['storeName', 'storeCode', 'taskTitle', 'groupTitle', 'periodDate', 'deadlineAt', 'deadlineText', 'assignee', 'pendingCount', 'approvedCount', 'totalCount', 'progressText', 'remainMinutes', 'advanceMinutes', 'sentAt', 'link']
      }));
      body.appendChild(templateEditor({
        label: '通知发布 · text 模板', key: 'noticePublished', event: 'noticePublished',
        channel: 'public', templates: wh.templates,
        placeholders: ['storeName', 'storeCode', 'category', 'noticeTitle', 'summary', 'publisher', 'publishedAt', 'scheduledText', 'flags', 'noticeLink', 'sentAt', 'link']
      }));
      body.appendChild(templateEditor({
        label: '任务提醒逾期 · text 模板', key: 'reminderOverdue', event: 'reminderOverdue',
        channel: 'public', templates: wh.templates,
        placeholders: ['storeName', 'storeCode', 'taskTitle', 'groupTitle', 'periodDate', 'deadlineAt', 'deadlineText', 'assignee', 'reminderId', 'sentAt', 'link']
      }));
      body.appendChild(templateEditor({
        label: '效期临期 · text 模板', key: 'expiryDue', event: 'expiryDue',
        channel: 'public', templates: wh.templates,
        placeholders: ['storeName', 'storeCode', 'categoryName', 'materialName', 'checkDate', 'dueAt', 'dueText', 'remainMinutes', 'registeredBy', 'note', 'recordId', 'sentAt', 'link']
      }));
      body.appendChild(templateEditor({
        label: '效期日报 · text 模板', key: 'expiryDaily', event: 'expiryDaily',
        channel: 'public', templates: wh.templates,
        placeholders: ['storeName', 'storeCode', 'date', 'slot', 'slotKey', 'count', 'listText', 'sentAt', 'link']
      }));

      var retryInput = U.el('input', {
        class: 'input', type: 'number', min: '1', max: '5', value: wh.maxRetries,
        style: { maxWidth: '96px' }
      });
      retryInput.addEventListener('input', function () { wh.maxRetries = Number(this.value) || 1; });
      body.appendChild(U.el('div', { class: 'field', style: { marginTop: '12px', maxWidth: '320px' } }, [
        U.el('label', { class: 'label', text: '最多尝试次数（含首次）' }),
        retryInput,
        U.el('div', { class: 'hint', text: '失败后按 1、2、4… 分钟退避重试；达到次数标记失败，不影响任务提交流程。' })
      ]));

      var resultBox = U.el('div', { class: 'formula-note', style: { marginTop: '12px' } });
      resultBox.textContent = '「发送测试」会立即投递一条测试消息，用于确认地址可达；测试记录同时写入下方推送记录。';

      var saveBtn = U.el('button', { class: 'btn btn-primary', type: 'button', text: '保存配置' });
      var testBtn = U.el('button', { class: 'btn btn-ghost', type: 'button', text: '发送测试' });

      saveBtn.addEventListener('click', function (e) {
        var btn = e.currentTarget;
        if (wh.enabled && !String(wh.url || '').trim()) { UI.toast('启用推送前请填写 webhook 地址', 'error'); return; }
        if (!wh.events.taskDueSoon && !wh.events.noticePublished && !wh.events.reminderOverdue && !wh.events.expiryDue && !wh.events.expiryDaily) { UI.toast('请至少选择一个事件类型', 'error'); return; }
        if (String(wh.templates.taskDueSoon || '').trim().length > 1000 || String(wh.templates.noticePublished || '').trim().length > 1000 || String(wh.templates.reminderOverdue || '').trim().length > 1000 || String(wh.templates.expiryDue || '').trim().length > 1000 || String(wh.templates.expiryDaily || '').trim().length > 1000) {
          UI.toast('文案模板不能超过 1000 字', 'error'); return;
        }
        UI.btnLoading(btn, true, '保存中…');
        api.saveSettings({ feishuWebhook: wh }).then(function () {
          UI.btnLoading(btn, false);
          UI.toast('飞书推送配置已保存', 'success');
          return api.getSettings();
        }).then(function (s2) { state.settings = s2; }).catch(function (err) {
          UI.btnLoading(btn, false);
          UI.toast(err.message, 'error');
        });
      });

      testBtn.addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var url = String(wh.url || '').trim();
        if (!url) { UI.toast('请先填写 webhook 地址', 'error'); return; }
        if (typeof api.testWebhook !== 'function') {
          resultBox.textContent = '测试失败：当前页面资源版本过旧，请强制刷新页面后重试。';
          resultBox.style.color = 'var(--danger)';
          return;
        }
        UI.btnLoading(btn, true, '发送中…');
        resultBox.textContent = '正在发送测试，最长等待 15 秒…';
        resultBox.style.color = 'var(--ink-3)';
        var req;
        try {
          req = api.testWebhook({ url: url, advanceValue: wh.advanceValue, advanceUnit: wh.advanceUnit });
        } catch (err) { req = Promise.reject(err); }
        withTestTimeout(req, TEST_TIMEOUT).then(function (r) {
          UI.btnLoading(btn, false);
          if (r.simulated) {
            resultBox.textContent = '静态演示版：已记录模拟推送日志，未发起真实 HTTP 请求。';
            resultBox.style.color = 'var(--ink-3)';
          } else if (r.ok) {
            resultBox.textContent = '测试成功：HTTP ' + r.httpStatus + ' · 用时 ' + r.elapsedMs + 'ms'
              + (r.response ? ' · 返回：' + r.response : '');
            resultBox.style.color = 'var(--success)';
          } else {
            resultBox.textContent = '测试失败（' + (testErrorTypes[r.errorType] || '发送失败') + '）：'
              + (r.error || ('HTTP ' + r.httpStatus))
              + (r.response ? ' · 返回：' + r.response : '')
              + ' · 已写入推送记录';
            resultBox.style.color = 'var(--danger)';
          }
          loadLogs();
        }).catch(function (err) {
          UI.btnLoading(btn, false);
          if (err && err.code === 'CLIENT_TIMEOUT') {
            resultBox.textContent = '测试超时：15 秒内未收到服务器响应，按钮已复位。请检查服务器状态、网络或 webhook 地址。';
          } else {
            resultBox.textContent = '测试失败：' + ((err && err.message) || '未知错误');
          }
          resultBox.style.color = 'var(--danger)';
          loadLogs();
        });
      });

      body.appendChild(U.el('div', { class: 'inline-form', style: { marginTop: '4px' } }, [saveBtn, testBtn]));
      body.appendChild(resultBox);

      /* ---------------- 个人提醒通道（独立配置） ---------------- */
      var pw = Object.assign({ enabled: false, url: '', maxRetries: 3 }, state.settings.personalWebhook || {});
      pw.events = Object.assign({ system: true, task: true, private: true, schedule: true, birthday: true, shift: true }, pw.events || {});
      pw.templates = Object.assign({ system: '', task: '', private: '', test: '', schedule: '', birthday: '', shift: '' }, pw.templates || {});

      body.appendChild(U.el('div', { style: { borderTop: '1px solid var(--line)', margin: '18px 0 12px', paddingTop: '16px' } }, [
        U.el('div', { class: 'strong', text: '个人提醒通道' }),
        U.el('div', { class: 'small muted', text: '给单个员工产生的站内消息：审批结果、任务指派与审核、私信、日程提醒，以及管理员定向发送的系统通知。与公共通道独立配置、独立去重；群发通知与公共任务提醒不走这里。' })
      ]));

      var pEnable = U.el('select', { class: 'select' });
      pEnable.appendChild(U.el('option', { value: '1', text: '启用', selected: !!pw.enabled }));
      pEnable.appendChild(U.el('option', { value: '0', text: '关闭', selected: !pw.enabled }));
      pEnable.addEventListener('change', function () { pw.enabled = this.value === '1'; });

      var pUrl = U.el('input', { class: 'input', value: pw.url, placeholder: 'https://…（个人提醒专用 webhook 地址）' });
      pUrl.addEventListener('input', function () { pw.url = String(this.value || '').trim(); });

      var pRetry = U.el('input', {
        class: 'input', type: 'number', min: '1', max: '5', value: pw.maxRetries,
        style: { maxWidth: '96px' }
      });
      pRetry.addEventListener('input', function () { pw.maxRetries = Number(this.value) || 1; });

      var pEvents = {};
      var pEventDefs = [
        ['system', '系统通知 / 审批结果（排休、排班、报销等）'],
        ['task', '任务指派与审核结果'],
        ['private', '私信'],
        ['schedule', '日程提醒（到点前按日程提醒设置推送）'],
        ['birthday', '生日关怀（员工生日当天自动发送）'],
        ['shift', '今日排班（超管保存某人当日排班后推送本人）']
      ];
      var pEventBox = U.el('div');
      pEventDefs.forEach(function (d) {
        var chk = U.el('input', { type: 'checkbox' });
        chk.checked = !!pw.events[d[0]];
        chk.addEventListener('change', function () { pw.events[d[0]] = this.checked; });
        pEvents[d[0]] = chk;
        pEventBox.appendChild(U.el('label', { class: 'small', style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400', marginTop: '6px' } }, [
          chk, U.el('span', { text: d[1] })
        ]));
      });

      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '个人提醒 webhook 地址' }),
        pUrl,
        U.el('div', { class: 'hint', text: '与上方公共通道互不影响；仅支持公网 http/https 地址。' })
      ]));
      var pGrid = U.el('div', { class: 'form-grid two' });
      pGrid.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '启用开关' }), pEnable
      ]));
      pGrid.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '最多尝试次数（含首次）' }), pRetry
      ]));
      body.appendChild(pGrid);
      body.appendChild(U.el('h4', { class: 'form-section-title', text: '个人提醒事件' }));
      body.appendChild(pEventBox);
      body.appendChild(U.el('div', { class: 'hint', text: '推送只针对消息接收人，携带员工 ID、姓名、手机号、飞书工号与可选飞书 ID；至少保留一个事件。' }));
      body.appendChild(U.el('div', { class: 'hint', text: '飞书侧匹配优先级：飞书 ID → 飞书工号 → 手机号 → 姓名（飞书工号须在飞书侧唯一）。' }));

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '个人提醒文案模板' }));
      body.appendChild(U.el('div', { class: 'hint', text: '留空使用系统默认文案；五个事件各自独立，测试消息也使用「测试」模板。' }));
      var pTpls = [
        ['system', '系统通知 / 审批结果', 'system'],
        ['task', '任务指派与审核', 'task'],
        ['private', '私信', 'private'],
        ['test', '测试消息', 'test'],
        ['schedule', '日程提醒', 'schedule'],
        ['birthday', '生日关怀', 'birthday'],
        ['shift', '今日排班', 'shift']
      ];
      pTpls.forEach(function (t) {
        var ph = t[0] === 'schedule'
          ? ['storeName', 'storeCode', 'scheduleTitle', 'scheduleDate', 'scheduleStartTime', 'scheduleEndTime', 'scheduleLocation', 'scheduleRemark', 'remindText', 'sender', 'creatorName', 'summary', 'sentAt', 'link', 'recipientName', 'recipientPhone', 'recipientFeishuId', 'recipientFeishuStaffNo']
          : (t[0] === 'shift'
            ? ['storeName', 'storeCode', 'shiftDate', 'shiftSegmentsText', 'shiftStartTime', 'shiftEndTime', 'shiftStation', 'shiftTask', 'shiftReminder', 'title', 'messageTypeLabel', 'summary', 'sender', 'sentAt', 'link', 'recipientName', 'recipientPhone', 'recipientFeishuId', 'recipientFeishuStaffNo']
            : ['storeName', 'storeCode', 'title', 'messageTypeLabel', 'summary', 'sender', 'sentAt', 'link', 'page', 'recipientId', 'recipientName', 'recipientPhone', 'recipientFeishuId', 'recipientFeishuStaffNo']);
        body.appendChild(templateEditor({
          label: t[1] + ' · text 模板', key: t[0], event: t[2], channel: 'personal', templates: pw.templates,
          placeholders: ph
        }));
      });

      var pResult = U.el('div', { class: 'formula-note', style: { marginTop: '12px' } });
      pResult.textContent = '「发送测试」会以当前账号为接收人投递一条测试消息，记录写入下方推送记录（个人通道）。';
      var pSaveBtn = U.el('button', { class: 'btn btn-primary', type: 'button', text: '保存个人提醒配置' });
      var pTestBtn = U.el('button', { class: 'btn btn-ghost', type: 'button', text: '发送测试（个人）' });

      pSaveBtn.addEventListener('click', function (e) {
        var btn = e.currentTarget;
        if (pw.enabled && !String(pw.url || '').trim()) { UI.toast('启用个人提醒前请填写 webhook 地址', 'error'); return; }
        if (!pw.events.system && !pw.events.task && !pw.events.private && !pw.events.schedule && !pw.events.birthday && !pw.events.shift) { UI.toast('请至少选择一个个人提醒事件', 'error'); return; }
        var tplTooLong = ['system', 'task', 'private', 'test', 'schedule', 'birthday', 'shift'].some(function (k) {
          return String(pw.templates[k] || '').trim().length > 1000;
        });
        if (tplTooLong) { UI.toast('文案模板不能超过 1000 字', 'error'); return; }
        UI.btnLoading(btn, true, '保存中…');
        api.saveSettings({ personalWebhook: pw }).then(function () {
          UI.btnLoading(btn, false);
          UI.toast('个人提醒配置已保存', 'success');
          return api.getSettings();
        }).then(function (s2) { state.settings = s2; }).catch(function (err) {
          UI.btnLoading(btn, false);
          UI.toast(err.message, 'error');
        });
      });

      pTestBtn.addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var url = String(pw.url || '').trim();
        if (!url) { UI.toast('请先填写个人提醒 webhook 地址', 'error'); return; }
        if (typeof api.testPersonalWebhook !== 'function') {
          pResult.textContent = '测试失败：当前页面资源版本过旧，请强制刷新页面后重试。';
          pResult.style.color = 'var(--danger)';
          return;
        }
        UI.btnLoading(btn, true, '发送中…');
        pResult.textContent = '正在发送测试，最长等待 15 秒…';
        pResult.style.color = 'var(--ink-3)';
        var req;
        try { req = api.testPersonalWebhook({ url: url }); } catch (err) { req = Promise.reject(err); }
        withTestTimeout(req, TEST_TIMEOUT).then(function (r) {
          UI.btnLoading(btn, false);
          if (r.simulated) {
            pResult.textContent = '静态演示版：已记录模拟个人提醒日志（接收人：' + (r.recipientName || '当前账号') + '），未发起真实 HTTP 请求。';
            pResult.style.color = 'var(--ink-3)';
          } else if (r.ok) {
            pResult.textContent = '测试成功：接收人 ' + (r.recipientName || '当前账号') + ' · HTTP ' + r.httpStatus + ' · 用时 ' + r.elapsedMs + 'ms'
              + (r.response ? ' · 返回：' + r.response : '');
            pResult.style.color = 'var(--success)';
          } else {
            pResult.textContent = '测试失败（' + (testErrorTypes[r.errorType] || '发送失败') + '）：'
              + (r.error || ('HTTP ' + r.httpStatus))
              + (r.response ? ' · 返回：' + r.response : '')
              + ' · 已写入推送记录';
            pResult.style.color = 'var(--danger)';
          }
          loadLogs();
        }).catch(function (err) {
          UI.btnLoading(btn, false);
          if (err && err.code === 'CLIENT_TIMEOUT') {
            pResult.textContent = '测试超时：15 秒内未收到服务器响应，按钮已复位。请检查服务器状态、网络或 webhook 地址。';
          } else {
            pResult.textContent = '测试失败：' + ((err && err.message) || '未知错误');
          }
          pResult.style.color = 'var(--danger)';
          logPage = 1;
          loadLogs();
        });
      });

      body.appendChild(U.el('div', { class: 'inline-form', style: { marginTop: '4px' } }, [pSaveBtn, pTestBtn]));
      body.appendChild(pResult);

      /* 生日关怀：生日当天自动发站内通知 + 飞书个人提醒 */
      var bc = Object.assign({ enabled: true, template: '' }, state.settings.birthdayCare || {});
      body.appendChild(U.el('div', { style: { borderTop: '1px solid var(--line)', margin: '18px 0 12px', paddingTop: '16px' } }, [
        U.el('div', { class: 'strong', text: '生日关怀' }),
        U.el('div', { class: 'small muted', text: '员工生日当天自动发送站内通知，并按「生日关怀」个人事件推送飞书；同一位员工同一年只发一次。' })
      ]));
      var bcEnable = U.el('select', { class: 'select' });
      bcEnable.appendChild(U.el('option', { value: '1', text: '启用', selected: !!bc.enabled }));
      bcEnable.appendChild(U.el('option', { value: '0', text: '关闭', selected: !bc.enabled }));
      bcEnable.addEventListener('change', function () { bc.enabled = this.value === '1'; });
      var bcTpl = U.el('textarea', {
        class: 'textarea', rows: '3', maxlength: '1000', placeholder: '留空使用系统默认文案'
      });
      bcTpl.value = bc.template || '';
      bcTpl.addEventListener('input', function () { bc.template = String(this.value || ''); });
      body.appendChild(U.el('div', { class: 'form-grid two' }, [
        U.el('div', { class: 'field' }, [
          U.el('label', { class: 'label', text: '生日关怀开关' }), bcEnable
        ])
      ]));
      body.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'label', text: '站内通知文案模板' }), bcTpl,
        U.el('div', { class: 'hint', text: '占位符：{displayName} 姓名（含昵称）、{name} 真实姓名、{year} 年份、{storeName} 门店名。留空使用默认温暖文案。' })
      ]));
      var bcSave = U.el('button', { class: 'btn btn-primary', type: 'button', text: '保存生日关怀设置' });
      bcSave.addEventListener('click', function (e) {
        var btn = e.currentTarget;
        if (String(bc.template || '').trim().length > 1000) { UI.toast('文案模板不能超过 1000 字', 'error'); return; }
        UI.btnLoading(btn, true, '保存中…');
        api.saveSettings({ birthdayCare: bc }).then(function () {
          UI.btnLoading(btn, false);
          UI.toast('生日关怀设置已保存', 'success');
          return api.getSettings();
        }).then(function (s2) { state.settings = s2; }).catch(function (err) {
          UI.btnLoading(btn, false);
          UI.toast(err.message, 'error');
        });
      });
      body.appendChild(U.el('div', { class: 'inline-form', style: { marginTop: '4px' } }, [bcSave]));

      var channelSel = U.el('select', { class: 'select', style: { maxWidth: '120px' } });
      [['', '全部通道'], ['public', '公共'], ['personal', '个人']].forEach(function (c) {
        channelSel.appendChild(U.el('option', { value: c[0], text: c[1] }));
      });
      var logPage = 1;
      channelSel.addEventListener('change', function () { logPage = 1; loadLogs(); });

      var logHead = U.el('div', { class: 'flex-between', style: { marginTop: '18px', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' } }, [
        U.el('div', {}, [
          U.el('div', { class: 'strong', text: '最近推送记录' }),
          U.el('div', { class: 'small muted', text: '成功 / 失败、时间、HTTP 状态与失败原因；可按公共 / 个人通道筛选。' })
        ]),
        U.el('div', { class: 'flex gap-8', style: { alignItems: 'center' } }, [
          channelSel,
          U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '刷新', onclick: function () { logPage = 1; loadLogs(); } })
        ])
      ]);
      body.appendChild(logHead);
      var logBox = U.el('div');
      body.appendChild(logBox);
      tabBody.appendChild(body);
      loadLogs();

      function loadLogs() {
        logBox.innerHTML = '';
        logBox.appendChild(UI.skeleton(2));
        api.webhookLogs({ page: logPage, pageSize: 10, channel: channelSel.value }).then(function (res) {
          var list = (res && res.list) || [];
          var total = (res && res.total) || 0;
          var totalPages = (res && res.totalPages) || 1;
          logPage = (res && res.page) || 1;
          logBox.innerHTML = '';
          if (res && res.migrationRequired) {
            logBox.appendChild(U.el('p', { class: 'small muted' }, [
              U.el('span', { text: '推送记录表尚未创建：请在 phpMyAdmin 执行 ' }),
              U.el('code', { text: 'migrations/20261125_feishu_webhook.sql、migrations/20261126_personal_webhook.sql' }),
              U.el('span', { text: ' 后再查看。' })
            ]));
          }
          if (!list.length) {
            logBox.appendChild(UI.emptyState({
              icon: 'mail', title: '暂无推送记录',
              desc: '任务进入提前提醒窗口后会自动生成记录；也可先点「发送测试」。'
            }));
            return;
          }
          var wrap = U.el('div', { class: 'table-wrap' });
          var table = U.el('table', { class: 'data-table', style: { minWidth: '900px' } });
          table.innerHTML = '<thead><tr><th>时间</th><th>事件 / 内容</th><th>状态</th><th>尝试</th><th>HTTP</th><th>说明</th></tr></thead>';
          var tbody = U.el('tbody');
          list.forEach(function (l) {
            var tr = U.el('tr');
            tr.appendChild(U.el('td', { class: 'small mono', text: U.fmtTime(l.createdAt, true) }));
            var tdEvent = U.el('td', {});
            tdEvent.appendChild(U.el('div', { text: l.eventLabel }));
            tdEvent.appendChild(U.el('div', {
              class: 'cell-user-sub',
              text: (l.taskTitle || l.store || '—') + (l.recipientName ? ' · ' + l.recipientName : '')
            }));
            tr.appendChild(tdEvent);
            var tdStatus = U.el('td', {});
            var cls = l.status === 'success' ? 'success' : (l.status === 'failed' ? 'danger' : 'warn');
            tdStatus.appendChild(UI.badge(l.channel === 'personal' ? '个人' : '公共', 'muted'));
            tdStatus.appendChild(U.el('span', { style: { marginLeft: '6px' } }, [UI.badge(l.statusLabel, cls)]));
            if (l.simulated) tdStatus.appendChild(U.el('span', { style: { marginLeft: '6px' } }, [UI.badge('模拟', 'muted')]));
            tr.appendChild(tdStatus);
            tr.appendChild(U.el('td', { class: 'small', text: l.attempts + '/' + l.maxAttempts }));
            tr.appendChild(U.el('td', { class: 'small mono', text: l.httpStatus ? String(l.httpStatus) : '—' }));
            tr.appendChild(U.el('td', { class: 'small', text: l.error || l.response || '—' }));
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          wrap.appendChild(table);
          logBox.appendChild(wrap);

          /* 分页：前端只重绘记录区，不整页刷新 */
          var pager = U.el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 0 2px' } });
          pager.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '上一页', disabled: logPage <= 1,
            onclick: function () { if (logPage > 1) { logPage--; loadLogs(); } }
          }));
          pager.appendChild(U.el('span', { class: 'small muted', text: '第 ' + logPage + ' / ' + totalPages + ' 页 · 共 ' + total + ' 条' }));
          pager.appendChild(U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '下一页', disabled: logPage >= totalPages,
            onclick: function () { if (logPage < totalPages) { logPage++; loadLogs(); } }
          }));
          logBox.appendChild(pager);
        }).catch(function (e) {
          logBox.innerHTML = '';
          logBox.appendChild(UI.errorState({ message: e.message, onRetry: loadLogs }));
        });
      }
    }

    /* ---------------- 操作日志 ---------------- */
    function tabLogs() {
      var filter = { operator: '', from: '', to: '' };
      var body = U.el('div', { class: 'card-body' });
      var bar = U.el('div', { class: 'inline-form', style: { marginBottom: '12px' } });
      var opInput = U.el('input', { class: 'input', placeholder: '操作人', style: { maxWidth: '140px' } });
      var fromInput = U.el('input', { class: 'input', type: 'date', style: { maxWidth: '160px' } });
      var toInput = U.el('input', { class: 'input', type: 'date', style: { maxWidth: '160px' } });
      var searchBtn = U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '查询' });
      bar.appendChild(opInput);
      bar.appendChild(U.el('span', { class: 'small muted', text: '至' }));
      bar.appendChild(fromInput);
      bar.appendChild(toInput);
      bar.appendChild(searchBtn);
      bar.appendChild(U.el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: '导出日志',
        onclick: function () {
          var headers = ['时间', '操作人', '角色', '对象', '动作', '详情'];
          var rows = state.logs.map(function (l) {
            return [U.fmtTime(l.time), l.operator, api.roleLabel(l.role), l.target, l.action, l.detail];
          });
          U.download('操作日志_' + api.storeInfo().code + '_' + U.today() + '.csv', U.toCSV(headers, rows), 'text/csv;charset=utf-8');
          Store.log('导出操作日志', '系统设置', '导出 ' + rows.length + ' 条');
          UI.toast('已导出操作日志', 'success');
        }
      }));
      body.appendChild(bar);
      var logBox = U.el('div');
      body.appendChild(logBox);

      function run() {
        logBox.innerHTML = '';
        logBox.appendChild(UI.skeleton(2));
        api.listAuditLogs({ operator: filter.operator, from: filter.from, to: filter.to }).then(function (res) {
          state.logs = res.list;
          logBox.innerHTML = '';
          if (!res.list.length) {
            logBox.appendChild(UI.emptyState({ icon: 'clipboard', title: '暂无操作日志', desc: '查看证件、审核、修改薪资、导出等动作都会记录在这里。' }));
            return;
          }
          var tableWrap = U.el('div', { class: 'table-wrap' });
          var table = U.el('table', { class: 'data-table', style: { minWidth: '820px' } });
          table.innerHTML = '<thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>对象</th><th>详情</th></tr></thead>';
          var tbody = U.el('tbody');
          res.list.forEach(function (l) {
            var tr = U.el('tr');
            tr.appendChild(U.el('td', { class: 'small mono', text: U.fmtTime(l.time, true) }));
            tr.appendChild(U.el('td', {}, [
              U.el('div', { text: l.operator }),
              U.el('div', { class: 'cell-user-sub', text: api.roleLabel(l.role) })
            ]));
            tr.appendChild(U.el('td', { text: l.action }));
            tr.appendChild(U.el('td', { text: l.target }));
            tr.appendChild(U.el('td', { class: 'small', text: l.detail || '—' }));
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          tableWrap.appendChild(table);
          logBox.appendChild(tableWrap);
          logBox.appendChild(U.el('p', { class: 'small muted', style: { padding: '0 0 4px' }, text: '共 ' + res.total + ' 条，按时间倒序显示。' }));
        }).catch(function (e) {
          logBox.innerHTML = '';
          logBox.appendChild(UI.errorState({ message: e.message, onRetry: run }));
        });
      }
      searchBtn.addEventListener('click', function () {
        filter.operator = opInput.value.trim();
        filter.from = fromInput.value;
        filter.to = toInput.value;
        run();
      });
      run();
      tabBody.appendChild(body);
    }

    /* ---------------- 报销分类 ---------------- */
    function tabReimburse() {
      var body = U.el('div', { class: 'card-body' });
      var listBox = U.el('div');
      var addName = U.el('input', { class: 'input', placeholder: '新分类名称（2-20 字）', style: { maxWidth: '220px' } });
      body.appendChild(U.el('div', { class: 'flex-between', style: { marginBottom: '10px', flexWrap: 'wrap', gap: '8px' } }, [
        U.el('div', {}, [
          U.el('div', { class: 'strong', text: '报销分类' }),
          U.el('div', { class: 'small muted', text: '停用后不再出现在员工提交表单；历史报销单仍显示提交时的分类名。' })
        ]),
        U.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
          addName,
          U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '新增分类', onclick: add })
        ])
      ]));
      body.appendChild(listBox);
      tabBody.appendChild(body);
      load();

      function add() {
        var name = String(addName.value || '').trim();
        if (name.length < 2) { UI.toast('分类名称至少 2 个字', 'error'); return; }
        api.saveReimburseCategory({ id: '', name: name, enabled: true }).then(function () {
          UI.toast('已新增分类', 'success');
          addName.value = '';
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      }

      function load() {
        listBox.innerHTML = '';
        listBox.appendChild(UI.skeleton(3));
        api.reimburseCategories().then(function (r) {
          paint((r && r.list) || []);
        }).catch(function (e) {
          listBox.innerHTML = '';
          listBox.appendChild(UI.errorState({ message: e.message, onRetry: load }));
        });
      }

      function paint(list) {
        listBox.innerHTML = '';
        if (!list.length) {
          listBox.appendChild(U.el('p', { class: 'small muted', text: '暂无报销分类，请先新增。' }));
          return;
        }
        var wrap = U.el('div', { class: 'table-wrap' });
        var table = U.el('table', { class: 'data-table', style: { minWidth: '640px' } });
        table.innerHTML = '<thead><tr><th>分类名称</th><th>排序</th><th>启用</th><th>操作</th></tr></thead>';
        var tbody = U.el('tbody');
        list.forEach(function (c, i) {
          var tr = U.el('tr');
          var nameInput = U.el('input', { class: 'input', value: c.name, style: { maxWidth: '220px' } });
          tr.appendChild(U.el('td', {}, [nameInput]));
          tr.appendChild(U.el('td', { class: 'small', text: String(c.sortOrder) }));
          var chk = U.el('input', { type: 'checkbox' });
          chk.checked = !!c.enabled;
          tr.appendChild(U.el('td', {}, [U.el('label', { class: 'small', style: { fontWeight: '400' } }, [chk, U.el('span', { text: ' 启用' })])]));
          var ops = U.el('div', { class: 'table-actions' });
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '上移',
            onclick: function () { move(list, i, -1); }
          }));
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '下移',
            onclick: function () { move(list, i, 1); }
          }));
          ops.appendChild(U.el('button', {
            class: 'btn-text', type: 'button', text: '保存',
            onclick: function () {
              var name = String(nameInput.value || '').trim();
              if (name.length < 2) { UI.toast('分类名称至少 2 个字', 'error'); return; }
              api.saveReimburseCategory({ id: c.id, name: name, sortOrder: c.sortOrder, enabled: chk.checked }).then(function () {
                UI.toast('已保存', 'success');
                load();
              }).catch(function (e) { UI.toast(e.message, 'error'); });
            }
          }));
          var td = U.el('td');
          td.appendChild(ops);
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        listBox.appendChild(wrap);
      }

      function move(list, index, dir) {
        var j = index + dir;
        if (j < 0 || j >= list.length) return;
        var a = list[index];
        var b = list[j];
        Promise.all([
          api.saveReimburseCategory({ id: a.id, name: a.name, sortOrder: b.sortOrder, enabled: a.enabled }),
          api.saveReimburseCategory({ id: b.id, name: b.name, sortOrder: a.sortOrder, enabled: b.enabled })
        ]).then(function () { load(); }).catch(function (e) { UI.toast(e.message, 'error'); });
      }
    }

    /* ---------------- 数据备份 ---------------- */
    function tabBackup() {
      var body = U.el('div', { class: 'card-body' });
      body.appendChild(U.el('div', { class: 'alert alert-info' }, [
        U.el('span', { class: 'alert-icon', html: UI.icon('shield', 17) }),
        U.el('div', { text: '数据保存在服务器 MySQL 数据库中。导出的 JSON 包含业务数据与账号密码散列，不包含 uploads 目录中的附件原文件，请同时备份该目录。' })
      ]));

      var grid = U.el('div', { class: 'quick-grid' });
      grid.appendChild(U.el('div', { class: 'card', style: { marginBottom: '0' } }, [
        U.el('div', { class: 'card-body' }, [
          U.el('div', { class: 'strong', text: '一键导出备份' }),
          U.el('p', { class: 'small muted', style: { margin: '6px 0 10px' }, text: '导出全量业务数据为 JSON 文件，可用于迁移或恢复。' }),
          U.el('button', {
            class: 'btn btn-primary btn-sm', type: 'button', text: '导出 JSON 备份',
            onclick: function (e) {
              var btn = e.currentTarget;
              UI.btnLoading(btn, true, '导出中…');
              api.backup().then(function (res) {
                U.download('门店人员数据备份_' + api.storeInfo().code + '_' + U.today() + '.json', res.json, 'application/json');
                UI.btnLoading(btn, false);
                UI.toast('已导出 ' + res.count + ' 份档案', 'success');
              }).catch(function (err) {
                UI.btnLoading(btn, false);
                UI.toast(err.message, 'error');
              });
            }
          })
        ])
      ]));
      grid.appendChild(U.el('div', { class: 'card', style: { marginBottom: '0' } }, [
        U.el('div', { class: 'card-body' }, [
          U.el('div', { class: 'strong', text: '导入恢复' }),
          U.el('p', { class: 'small muted', style: { margin: '6px 0 10px' }, text: '导入前会二次确认，恢复后当前数据将被覆盖。' }),
          U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '选择备份文件',
            onclick: function () { openRestore(); }
          })
        ])
      ]));
      body.appendChild(grid);

      body.appendChild(U.el('h4', { class: 'form-section-title', text: '演示数据维护' }));
      body.appendChild(U.el('p', { class: 'small muted', text: '如果演示过程中数据被改乱，可重置为初始演示数据（会保留当前登录状态需要重新登录）。' }));
      body.appendChild(U.el('div', { class: 'inline-form mt-8' }, [
        U.el('button', {
          class: 'btn btn-danger-ghost btn-sm', type: 'button', text: '重置为初始演示数据',
          onclick: function () {
            UI.confirm({
              title: '重置演示数据',
              message: '确认将全部档案、薪资、量化分、排休与日志恢复为初始演示数据？此操作不可撤销。',
              danger: true, confirmText: '确认重置'
            }).then(function (yes) {
              if (!yes) return;
              api.resetData().then(function () {
                if (window.SiteTitle) SiteTitle.set(SiteTitle.DEFAULT);
                UI.toast('已重置演示数据，请重新登录', 'success');
                setTimeout(function () {
                  var to = Auth.loginPage();
                  api.logout().then(function () { location.replace(to); });
                }, 800);
              }).catch(function (e) { UI.toast(e.message, 'error'); });
            });
          }
        })
      ]));
      tabBody.appendChild(body);
    }

    function openRestore() {
      var input = U.el('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var file = input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var text = reader.result;
          UI.confirm({
            title: '导入并恢复数据',
            message: '恢复后当前全部业务数据将被备份文件覆盖，且不可撤销。如确认，请输入“确认恢复”。',
            requireText: '确认恢复',
            confirmText: '确认恢复',
            danger: true
          }).then(function (yes) {
            if (!yes) return;
            api.restore(text).then(function (res) {
              UI.toast('已恢复 ' + res.count + ' 份档案，即将刷新', 'success');
              setTimeout(function () { location.reload(); }, 800);
            }).catch(function (e) { UI.toast(e.message, 'error'); });
          });
        };
        reader.readAsText(file, 'utf-8');
        input.remove();
      });
      input.click();
    }
  };
})();
