/* 管理端 — 效期配置（超级管理员） */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['admin-expiry'] = function () {
    var state = { categories: [], materials: [], closeTime: '23:00', selected: {}, loaded: false };
    var content = U.el('div');
    content.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h1', { text: '效期配置' }),
      U.el('p', { text: '仅店长（超级管理员）可维护：门店默认打烊时间、效期分类、原物料到期方式、启用状态与排序。停用后不再出现在员工端检查项，历史记录保留。' })
    ]));
    var body = U.el('div');
    content.appendChild(body);
    Layout.adminShell({ title: '效期配置', active: 'admin-expiry' }, content);
    load();

    function load() {
      body.innerHTML = '';
      body.appendChild(UI.skeleton(3));
      api.expiryAdminData().then(function (res) {
        state.categories = res.categories || [];
        state.materials = res.materials || [];
        state.closeTime = res.closeTime || '23:00';
        state.selected = {};
        state.loaded = true;
        render();
      }).catch(function (e) {
        body.innerHTML = '';
        body.appendChild(UI.errorState({ message: e.message, onRetry: load }));
      });
    }

    function catName(id) {
      var c = state.categories.filter(function (x) { return x.id === id; })[0];
      return c ? c.name : '—';
    }

    function render() {
      body.innerHTML = '';
      body.appendChild(closeTimeCard());
      body.appendChild(categoryCard());
      body.appendChild(materialCard());
    }

    /* 门店默认打烊时间：仅「默认打烊到期」的原物料使用，员工端只需选日期 */
    function closeTimeCard() {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', {}, [
          U.el('div', { class: 'card-title', text: '门店默认打烊时间' }),
          U.el('div', { class: 'small muted', text: '标记「默认打烊到期」的原物料，员工端只需选择到期日期，时间自动取该时刻；修改后新登记按新时间生效，已登记记录不变。' })
        ])
      ]));
      var input = U.el('input', { class: 'input', type: 'time', value: state.closeTime || '23:00', style: { maxWidth: '150px' } });
      var save = U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '保存' });
      save.addEventListener('click', function () {
        if (!input.value) { UI.toast('请选择打烊时间', 'error'); return; }
        UI.btnLoading(save, true, '保存中…');
        api.expirySaveCloseTime({ closeTime: input.value }).then(function (res) {
          UI.btnLoading(save, false);
          state.closeTime = res.closeTime || input.value;
          UI.toast('已保存默认打烊时间', 'success');
          load();
        }).catch(function (e) { UI.btnLoading(save, false); UI.toast(e.message, 'error'); });
      });
      card.appendChild(U.el('div', { class: 'card-body flex gap-8 wrap', style: { alignItems: 'center' } }, [input, save]));
      return card;
    }

    function categoryCard() {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '效期分类' }),
        U.el('button', {
          class: 'btn btn-primary btn-sm', type: 'button', text: '新增分类',
          onclick: function () { openCategory(null); }
        })
      ]));
      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table' });
      table.innerHTML = '<thead><tr><th>排序</th><th>分类名称</th><th>状态</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      if (!state.categories.length) {
        tbody.appendChild(U.el('tr', {}, [U.el('td', { colspan: 4, class: 'small muted', text: '暂无分类' })]));
      }
      state.categories.forEach(function (c) {
        tbody.appendChild(U.el('tr', {}, [
          U.el('td', { class: 'mono', text: String(c.sortOrder || 0) }),
          U.el('td', { text: c.name }),
          U.el('td', {}, [UI.badge(c.enabled ? '启用' : '停用', c.enabled ? 'success' : 'muted')]),
          U.el('td', {}, [U.el('div', { class: 'table-actions' }, [
            U.el('button', { class: 'btn btn-text', type: 'button', text: '编辑', onclick: function () { openCategory(c); } }),
            U.el('button', {
              class: 'btn btn-text', type: 'button', text: c.enabled ? '停用' : '启用',
              onclick: function () { toggleCategory(c); }
            }),
            U.el('button', { class: 'btn-text danger', type: 'button', text: '删除', onclick: function () { removeCategory(c); } })
          ])])
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      card.appendChild(wrap);
      return card;
    }

    function materialCard() {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '原物料' }),
        U.el('div', { class: 'flex gap-8' }, [
          U.el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: '批量维护',
            onclick: function () { openBulk(); }
          }),
          U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '新增原物料', onclick: function () { openMaterial(null); } })
        ])
      ]));
      var wrap = U.el('div', { class: 'table-wrap' });
      var table = U.el('table', { class: 'data-table' });
      table.innerHTML = '<thead><tr><th style="width:36px;"></th><th>分类</th><th>原物料</th><th>效期方式</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>';
      var tbody = U.el('tbody');
      if (!state.materials.length) {
        tbody.appendChild(U.el('tr', {}, [U.el('td', { colspan: 7, class: 'small muted', text: '暂无原物料' })]));
      }
      state.materials.forEach(function (m) {
        var cb = U.el('input', { type: 'checkbox', checked: !!state.selected[m.id] });
        cb.addEventListener('change', function () { state.selected[m.id] = cb.checked; });
        var rule = m.closeDue ? '打烊到期' : '手动选择';
        tbody.appendChild(U.el('tr', {}, [
          U.el('td', {}, [cb]),
          U.el('td', { text: catName(m.categoryId) }),
          U.el('td', {}, [
            U.el('div', { text: m.name }),
            m.remark ? U.el('div', { class: 'small muted', text: m.remark }) : null
          ]),
          U.el('td', { text: rule }),
          U.el('td', { class: 'mono', text: String(m.sortOrder || 0) }),
          U.el('td', {}, [UI.badge(m.enabled ? '启用' : '停用', m.enabled ? 'success' : 'muted')]),
          U.el('td', {}, [U.el('div', { class: 'table-actions' }, [
            U.el('button', { class: 'btn btn-text', type: 'button', text: '编辑', onclick: function () { openMaterial(m); } }),
            U.el('button', {
              class: 'btn btn-text', type: 'button', text: m.enabled ? '停用' : '启用',
              onclick: function () { toggleMaterial(m); }
            }),
            U.el('button', { class: 'btn-text danger', type: 'button', text: '删除', onclick: function () { removeMaterial(m); } })
          ])])
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      card.appendChild(wrap);
      return card;
    }

    function openCategory(c) {
      var isNew = !c;
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field" data-field="name"><label class="label">分类名称 <i class="req">*</i></label>' +
        '<input class="input" name="name" maxlength="20" value="' + U.esc(isNew ? '' : c.name) + '" placeholder="如：冷藏 / 常温 / 冷冻"><div class="error-text"></div></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">排序</label><input class="input mono" type="number" name="sortOrder" value="' + (isNew ? (state.categories.length + 1) : (c.sortOrder || 0)) + '"></div>' +
        '<div class="field"><label class="label">状态</label><label class="checkbox"><input type="checkbox" name="enabled" ' + (!isNew && !c.enabled ? '' : 'checked') + '> 启用</label></div>' +
        '</div>';
      UI.openModal({
        title: isNew ? '新增效期分类' : '编辑效期分类',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var payload = {
                id: isNew ? '' : c.id,
                name: String(fd.get('name') || '').trim(),
                sortOrder: Number(fd.get('sortOrder')) || 0,
                enabled: fd.get('enabled') === 'on'
              };
              if (!payload.name) { V.applyFieldError(form, 'name', '请填写分类名称'); return false; }
              UI.btnLoading(btn, true, '保存中…');
              api.expirySaveCategory(payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已保存', 'success');
                load();
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

    function openMaterial(m) {
      var isNew = !m;
      var opts = state.categories.map(function (c) {
        return '<option value="' + c.id + '"' + (!isNew && m.categoryId === c.id ? ' selected' : '') + '>' + U.esc(c.name) + (c.enabled ? '' : '（已停用）') + '</option>';
      }).join('');
      if (!opts) { UI.toast('请先新增效期分类', 'error'); return; }
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="field"><label class="label">所属分类 <i class="req">*</i></label><select class="select" name="categoryId">' + opts + '</select></div>' +
        '<div class="field" data-field="name"><label class="label">原物料名称 <i class="req">*</i></label>' +
        '<input class="input" name="name" maxlength="40" value="' + U.esc(isNew ? '' : m.name) + '"><div class="error-text"></div></div>' +
        '<div class="field"><label class="label">到期方式</label>' +
        '<label class="checkbox"><input type="checkbox" name="closeDue" ' + (!isNew && m.closeDue ? 'checked' : '') + '> 默认打烊到期（员工端只需选日期，时间取门店默认打烊时间）</label></div>' +
        '<div class="form-grid two">' +
        '<div class="field"><label class="label">排序</label><input class="input mono" type="number" name="sortOrder" value="' + (isNew ? (state.materials.length + 1) : (m.sortOrder || 0)) + '"></div>' +
        '<div class="field"><label class="label">状态</label><label class="checkbox"><input type="checkbox" name="enabled" ' + (!isNew && !m.enabled ? '' : 'checked') + '> 启用</label></div>' +
        '</div>' +
        '<div class="field"><label class="label">备注</label><input class="input" name="remark" maxlength="200" value="' + U.esc(isNew ? '' : (m.remark || '')) + '"></div>';
      UI.openModal({
        title: isNew ? '新增原物料' : '编辑原物料',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '保存', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var payload = {
                id: isNew ? '' : m.id,
                categoryId: fd.get('categoryId'),
                name: String(fd.get('name') || '').trim(),
                closeDue: fd.get('closeDue') === 'on',
                sortOrder: Number(fd.get('sortOrder')) || 0,
                enabled: fd.get('enabled') === 'on',
                remark: fd.get('remark') || ''
              };
              if (!payload.name) { V.applyFieldError(form, 'name', '请填写原物料名称'); return false; }
              UI.btnLoading(btn, true, '保存中…');
              api.expirySaveMaterial(payload).then(function () {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已保存', 'success');
                load();
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

    function openBulk() {
      var ids = Object.keys(state.selected).filter(function (id) { return state.selected[id]; });
      if (!ids.length) { UI.toast('请先勾选原物料', 'error'); return; }
      var opts = state.categories.map(function (c) {
        return '<option value="' + c.id + '">' + U.esc(c.name) + '</option>';
      }).join('');
      var form = U.el('form', { class: 'form-stack', onsubmit: function (e) { e.preventDefault(); } });
      form.innerHTML =
        '<div class="alert alert-info">已选择 ' + ids.length + ' 项原物料，可批量启用/停用或调整所属分类。</div>' +
        '<div class="field"><label class="label">批量操作</label>' +
        '<select class="select" name="action"><option value="enable">启用</option><option value="disable">停用</option><option value="category">调整分类</option></select></div>' +
        '<div class="field"><label class="label">目标分类（调整分类时必选）</label><select class="select" name="categoryId">' + opts + '</select></div>';
      UI.openModal({
        title: '批量维护原物料',
        body: form,
        footer: [
          { text: '取消', class: 'btn-ghost' },
          {
            text: '应用', class: 'btn-primary',
            onClick: function (btn, close) {
              var fd = new FormData(form);
              var action = fd.get('action');
              var payload = { ids: ids };
              if (action === 'category') payload.categoryId = fd.get('categoryId');
              else payload.enabled = action === 'enable';
              UI.btnLoading(btn, true, '处理中…');
              api.expiryBulkMaterials(payload).then(function (res) {
                UI.btnLoading(btn, false);
                close();
                UI.toast('已更新 ' + res.updated + ' 项', 'success');
                load();
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

    function toggleCategory(c) {
      api.expiryToggleCategory({ id: c.id, enabled: !c.enabled }).then(function () {
        UI.toast(c.enabled ? '已停用' : '已启用', 'success');
        load();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    function toggleMaterial(m) {
      api.expiryBulkMaterials({ ids: [m.id], enabled: !m.enabled }).then(function () {
        UI.toast(m.enabled ? '已停用' : '已启用', 'success');
        load();
      }).catch(function (e) { UI.toast(e.message, 'error'); });
    }

    /* 删除：二次确认；有登记记录或被引用时后端会拒绝，提示改为停用 */
    function removeCategory(c) {
      UI.confirm({
        title: '删除效期分类',
        message: '确认删除分类「' + c.name + '」？删除后不可恢复。',
        detail: '分类下仍有原物料或被登记记录引用时无法删除，请改用「停用」，历史记录将保留分类名称。',
        confirmText: '删除', danger: true
      }).then(function (ok) {
        if (!ok) return;
        api.expiryDeleteCategory({ id: c.id }).then(function () {
          UI.toast('已删除分类', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }

    function removeMaterial(m) {
      UI.confirm({
        title: '删除原物料',
        message: '确认删除原物料「' + m.name + '」？删除后不可恢复。',
        detail: '该原物料已有登记记录时无法删除，请改用「停用」，历史记录将保留原物料名称。',
        confirmText: '删除', danger: true
      }).then(function (ok) {
        if (!ok) return;
        api.expiryDeleteMaterial({ id: m.id }).then(function () {
          UI.toast('已删除原物料', 'success');
          load();
        }).catch(function (e) { UI.toast(e.message, 'error'); });
      });
    }
  };
})();
