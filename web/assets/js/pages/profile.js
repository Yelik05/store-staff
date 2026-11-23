/* P04 员工端 — 主页 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  /* 从排班表返回时刷新，确保今日排班是最新数据 */
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

  window.Pages['profile'] = function () {
    var main = Layout.staffShell({ title: '主页', active: 'profile' }, UI.skeleton(3));

    api.getMe().then(function (staff) {
      return Promise.all([loadSalaryCard(), loadScoreCard(), loadShiftCard()]).then(function (r) {
        return { staff: staff, salary: r[0], score: r[1], shift: r[2] };
      });
    }).then(function (data) {
      main.innerHTML = '';
      main.appendChild(render(data.staff, data.salary, data.score, data.shift));
      maybeShowUnread();
    }).catch(function (e) {
      main.innerHTML = '';
      main.appendChild(UI.errorState({ message: e.message, onRetry: function () { location.reload(); } }));
    });

    function loadSalaryCard() {
      return api.getMySalaryMonths().then(function (months) {
        if (!months || !months.length) return null;
        var m = months.indexOf(U.curMonth()) >= 0 ? U.curMonth() : months[0];
        return api.getSalary(m).then(function (sal) {
          return sal ? { salary: sal, month: m } : null;
        });
      }).catch(function () { return null; });
    }

    function loadScoreCard() {
      return api.getMyScores().then(function (list) {
        if (!list || !list.length) return null;
        var cur = U.curMonth();
        var row = list.filter(function (x) { return x.month === cur; })[0] || list[list.length - 1];
        return row || null;
      }).catch(function () { return null; });
    }

    function loadShiftCard() {
      return api.getTodayShift().catch(function () { return null; });
    }

    function render(staff, salary, score, shift) {
      var wrap = U.el('div');
      var info = api.expiryInfo(staff);

      if (info.health.state === 'expired') {
        wrap.appendChild(U.el('div', { class: 'alert alert-danger' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('alert', 17) }),
          U.el('div', {}, [
            U.el('div', { class: 'alert-title', text: '健康证已过期 ' + Math.abs(info.health.days) + ' 天' }),
            U.el('div', { text: '请立即补办，并在「信息修改」提交新的健康证，避免影响排班与卫生检查。' })
          ])
        ]));
      } else if (info.health.state === 'soon') {
        wrap.appendChild(U.el('div', { class: 'alert alert-warn' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('clock', 17) }),
          U.el('div', { text: '健康证将于 ' + U.fmtDate(staff.healthCertExpiry) + ' 到期（剩余 ' + info.health.days + ' 天），请及时更新并在「信息修改」重新提交。' })
        ]));
      }

      if (staff.status === 'pending') {
        wrap.appendChild(U.el('div', { class: 'alert alert-info' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('clock', 17) }),
          U.el('div', { text: '资料正在审核中，审核通过后即可查看薪资与量化分。' })
        ]));
      } else if (staff.status === 'rejected') {
        wrap.appendChild(U.el('div', { class: 'alert alert-danger' }, [
          U.el('span', { class: 'alert-icon', html: UI.icon('alert', 17) }),
          U.el('div', { class: 'flex-between' }, [
            U.el('span', { text: '资料已被驳回，请修改后重新提交。' }),
            U.el('a', { class: 'link', href: 'pending.html', text: '去处理' })
          ])
        ]));
      }

      /* 个人信息卡：姓名 + 职位/用工标签同一行；不展示门店工号与在职状态 */
      var hero = U.el('div', { class: 'profile-hero' });
      hero.appendChild(UI.userAvatar(staff.name, staff.avatar, 'profile-photo'));
      hero.appendChild(U.el('div', { class: 'grow', style: { minWidth: '0' } }, [
        U.el('h2', { class: 'profile-name-row' }, [
          U.el('span', { class: 'profile-name', text: UI.displayName(staff.name, staff.nickname) }),
          UI.badge(staff.position, 'brand'),
          UI.badge(staff.employmentType, 'muted')
        ]),
        U.el('div', { class: 'profile-meta', text: '入职 ' + U.fmtDate(staff.hireDate) })
      ]));
      wrap.appendChild(hero);

      /* 薪资与量化分同一行并排 */
      var duo = U.el('div', { class: 'profile-duo' });

      /* 薪资卡片 */
      var salaryCard = U.el('div', { class: 'card' });
      salaryCard.appendChild(cardHead('薪资', 'salary.html'));
      var sb = U.el('div', { class: 'card-body' });
      if (salary) {
        sb.appendChild(U.el('div', { class: 'sum-value', text: U.money(salary.salary.netPay) }));
        sb.appendChild(U.el('p', { class: 'small muted', style: { margin: '2px 0 0' }, text: U.monthLabel(salary.month) + ' 实发工资' }));
      } else {
        sb.appendChild(U.el('p', { class: 'small muted', style: { margin: 0 }, text: '暂无已发布薪资' }));
      }
      salaryCard.appendChild(sb);
      duo.appendChild(salaryCard);

      /* 量化分卡片 */
      var delta = 0;
      if (score && score.adjust) {
        delta = score.adjust.reduce(function (sum, a) { return sum + Number(a.value || 0); }, 0);
      }
      var scoreCard = U.el('div', { class: 'card' });
      scoreCard.appendChild(cardHead('量化分', 'score.html'));
      var scb = U.el('div', { class: 'card-body' });
      if (score) {
        var deltaText = delta === 0 ? '本月无增减' : ('本月 ' + (delta > 0 ? '+' : '') + U.round2(delta) + ' 分');
        scb.appendChild(U.el('div', { class: 'sum-value', text: String(score.total) }));
        scb.appendChild(U.el('div', {
          class: 'small',
          style: {
            marginTop: '2px', color: delta > 0 ? 'var(--success)' : (delta < 0 ? 'var(--danger)' : 'var(--ink-3)'),
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          },
          text: deltaText
        }));
        scb.appendChild(U.el('p', { class: 'small muted', style: { margin: '2px 0 0' }, text: U.monthLabel(score.month) + ' · ' + score.grade + ' 级' }));
      } else {
        scb.appendChild(U.el('p', { class: 'small muted', style: { margin: 0 }, text: '暂无已发布量化分' }));
      }
      scoreCard.appendChild(scb);
      duo.appendChild(scoreCard);

      /* 今日排班：员工看本人；超管可通过弹层设置任意在职员工 */
      if (shift) wrap.appendChild(shiftCard(shift));

      /* 生日关怀横幅：位于今日排班之后、薪资量化之前 */
      var bdaySlot = U.el('div', { class: 'birthday-slot birthday-slot-inline' });
      wrap.appendChild(bdaySlot);
      Layout.mountBirthdayBanner(bdaySlot);

      /* 薪资与量化分同一行并排 */
      wrap.appendChild(duo);

      /* 常用入口 */
      var entryCard = U.el('div', { class: 'card' });
      [
        { href: 'attendance.html', icon: 'clock', label: '我的考勤', desc: '查看本月打卡与工时汇总' },
        { href: 'schedule.html', icon: 'calendar', label: '我的日程', desc: '安排个人日程并接收提醒' },
        { href: 'reimburse.html', icon: 'money', label: '我的报销', desc: '提交与查看报销进度' },
        { href: 'contacts.html', icon: 'users', label: '门店通讯录', desc: '查看同事并发送私信' },
        { action: true, icon: 'bell', label: '匿名反馈', desc: '匿名提交问题与建议，直接送达店长' }
      ].forEach(function (x) {
        var row = U.el('a', { class: 'entry-row', href: x.action ? 'javascript:void(0)' : x.href }, [
          U.el('span', { class: 'entry-row-left' }, [
            U.el('span', { class: 'icon', html: UI.icon(x.icon, 18) }),
            U.el('span', {}, [
              U.el('span', { class: 'strong', style: { display: 'block' }, text: x.label }),
              U.el('span', { class: 'small muted', text: x.desc })
            ])
          ]),
          U.el('span', { class: 'muted', style: { fontSize: '18px', lineHeight: '1' }, text: '›' })
        ]);
        if (x.action) {
          row.addEventListener('click', function (e) {
            e.preventDefault();
            openFeedbackForm();
          });
        }
        entryCard.appendChild(row);
      });

      /* 超管快捷导入：复用 ImportFlow，与后台台账页头同一套上传/预览/确认流程 */
      if (Auth.isSuper()) {
        var importRow = U.el('div', { class: 'entry-import-row' });
        [
          { mode: 'salary', label: '导入薪资', icon: 'money' },
          { mode: 'attendance', label: '导入考勤', icon: 'clock' }
        ].forEach(function (x) {
          importRow.appendChild(U.el('button', {
            class: 'btn btn-ghost entry-import-btn', type: 'button',
            onclick: function () { ImportFlow.pick(x.mode); }
          }, [
            U.el('span', { class: 'icon', html: UI.icon(x.icon, 16) }),
            U.el('span', { class: 'entry-import-text', text: x.label })
          ]));
        });
        entryCard.appendChild(importRow);
      }
      wrap.appendChild(entryCard);

      wrap.appendChild(U.el('p', { class: 'text-center small muted', text: '如对分数或薪资有疑问，请当面联系店长核对' }));
      return wrap;
    }

    function shiftCard(data) {
      var card = U.el('div', { class: 'card' });
      card.appendChild(U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: '今日排班' }),
        U.el('span', { class: 'small muted', text: U.fmtDate(data.date) })
      ]));
      var body = U.el('div', { class: 'card-body shift-card-body' });
      var recs = (data.records && data.records.length) ? data.records : (data.record ? [data.record] : []);
      if (recs.length) {
        recs.forEach(function (rec) {
          var row = U.el('div', { class: 'shift-seg' });
          row.appendChild(U.el('div', { class: 'shift-time', text: rec.startTime + ' - ' + rec.endTime }));
          var tags = U.el('div', { class: 'shift-tags' });
          var station = UI.badge(rec.stationName || '未设置岗位', 'brand');
          station.classList.add('shift-station');
          tags.appendChild(station);
          if (rec.task) {
            var low = UI.badge('低峰 · ' + rec.task, 'muted');
            low.classList.add('shift-low');
            low.setAttribute('title', rec.task);
            tags.appendChild(low);
          }
          row.appendChild(tags);
          body.appendChild(row);
        });
      } else {
        body.appendChild(U.el('div', { class: 'shift-empty', text: '今日暂无排班' }));
      }
      body.appendChild(U.el('div', { class: 'shift-reminder', text: data.reminder }));
      if (Auth.isSuper()) {
        var btn = U.el('button', { class: 'btn btn-ghost btn-sm shift-set-btn', type: 'button', text: '进入排班表' });
        btn.addEventListener('click', function () { location.href = 'shift-board.html'; });
        body.appendChild(btn);
      }
      card.appendChild(body);
      return card;
    }

    /* 匿名反馈：内容必填、500 字以内；提交后由后端写站内消息并推送店长个人提醒 */
    function openFeedbackForm() {
      var input = U.el('textarea', {
        class: 'input', rows: 5, maxlength: 500,
        placeholder: '请描述你遇到的问题、建议或需要协助的事项…',
        style: { resize: 'vertical', minHeight: '110px' }
      });
      var body = U.el('div', {}, [
        U.el('p', { class: 'small muted', style: { margin: '0 0 8px' }, text: '反馈将直接发送给店长（超级管理员）；可重复提交，10 分钟内最多 3 条。' }),
        input,
        U.el('div', {
          class: 'small muted', style: { marginTop: '6px' },
          text: '匿名提交：店长只看到反馈内容与提交时间，看不到你的姓名、工号；请勿在内容中填写个人信息。'
        })
      ]);
      UI.openModal({
        title: '匿名反馈',
        body: body,
        footer: [
          { text: '取消' },
          {
            text: '提交', class: 'btn-primary', close: false,
            onClick: function (btn, close) {
              var text = String(input.value || '').trim();
              if (text.length < 2) { UI.toast('请填写反馈内容', 'error'); return false; }
              if (text.length > 500) { UI.toast('反馈内容不能超过 500 字', 'error'); return false; }
              btn.disabled = true;
              api.submitFeedback({ content: text }).then(function () {
                btn.disabled = false;
                input.value = '';
                UI.toast('已收到你的反馈，感谢！');
                close();
              }).catch(function (e) {
                btn.disabled = false;
                UI.toast(e.message, 'error');
              });
              return false;
            }
          }
        ]
      });
    }

    /* 进入主页先弹未读通知：同一登录会话只弹一次，未读数量变化后可再弹；不改已读状态 */
    var UNREAD_TYPE = { task: '任务', notice: '公告', system: '系统', birthday: '生日', leave: '排休', shift: '排班', reimburse: '报销', salary: '薪资', score: '积分', feedback: '反馈' };
    /* 每次进入主页（点击底栏主页 / 刷新 / 登录落地）有未读即弹；关闭后不立即重弹，下次进入再弹 */
    function maybeShowUnread() {
      if (!api.messageUnreadList) return;
      api.messageUnreadList().then(function (res) {
        var list = (res && res.list) || [];
        if (!list.length) return;
        var layer = null;
        var wrap = U.el('div', { class: 'unread-list' });
        list.slice(0, 50).forEach(function (m) {
          var row = U.el('button', { class: 'unread-item', type: 'button' }, [
            U.el('div', { class: 'unread-title', text: m.title || '（无标题）' }),
            U.el('div', { class: 'unread-meta', text: (UNREAD_TYPE[m.type] || '通知') + ' · ' + U.fmtTime(m.createdAt) })
          ]);
          row.addEventListener('click', function () {
            if (!m.link) return;
            if (layer) layer.close();
            location.href = m.link;
          });
          wrap.appendChild(row);
        });
        layer = UI.openModal({
          title: '未读通知（' + list.length + '）',
          subtitle: '仅提醒，不会自动标记已读；可点条目查看或稍后再读',
          body: wrap,
          footer: [
            { text: '稍后再读', class: 'btn-ghost' },
            {
              text: '查看', class: 'btn-primary', onClick: function () {
                var first = list.filter(function (m) { return m.link; })[0];
                location.href = first ? first.link : 'messages.html';
                return false;
              }
            }
          ]
        });
      }).catch(function () {});
    }

    function cardHead(title, href) {
      return U.el('div', { class: 'card-head' }, [
        U.el('div', { class: 'card-title', text: title }),
        U.el('a', { class: 'link small', href: href, text: '查看详情' })
      ]);
    }
  };
})();
