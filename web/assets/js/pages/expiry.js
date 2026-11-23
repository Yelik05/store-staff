/* 员工端 — 效期检查 / 当天到期 / 效期总览 */
(function () {
  'use strict';

  window.Pages = window.Pages || {};

  window.Pages['expiry'] = function () {
    var state = {
      tab: 'check',
      checkDate: U.today(),
      dueDate: U.today(),
      dayDate: U.today(),
      checkData: null,
      dueList: null,
      dayList: null
    };
    var content = U.el('div');
    var card = U.el('div', { class: 'card' });
    var tabs = U.el('div', { class: 'tabs', style: { padding: '0 12px', marginBottom: '0' } });
    var tabDefs = [
      { key: 'check', label: '效期检查' },
      { key: 'due', label: '当天到期' },
      { key: 'day', label: '效期总览' }
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
    var body = U.el('div');
    card.appendChild(body);
    content.appendChild(card);
    content.appendChild(U.el('p', { class: 'text-center small muted', text: '仅登记已填写具体到期时间的原物料；未填写不产生记录。' }));

    Layout.staffShell({ title: '效期检查', active: 'expiry' }, content);
    renderTab();

    function renderTab() {
      body.innerHTML = '';
      if (state.tab === 'check') renderCheck();
      else if (state.tab === 'due') renderDue();
      else renderDay();
    }

    function closeTime() {
      return (state.checkData && state.checkData.closeTime) || '23:00';
    }

    /* 到期时间与当前时间都按本地墙上时间比较；禁止再把本地到期时间和 UTC 字符串混用 */
    function dueTimestamp(text) {
      var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(text || ''));
      if (!m) return NaN;
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0).getTime();
    }

    function isDueExpired(text, nowTs) {
      var t = dueTimestamp(text);
      var now = typeof nowTs === 'number' ? nowTs : Date.now();
      return !isNaN(t) && t <= now;
    }

    function ruleText(m) {
      if (m.closeDue) return '默认打烊到期（' + closeTime() + '）';
      return '手动选择到期时间';
    }

    function dateBar(value, onChange, label) {
      var input = U.el('input', { class: 'input', type: 'date', value: value, style: { maxWidth: '170px' } });
      input.addEventListener('change', function () {
        if (input.value) onChange(input.value);
      });
      return U.el('div', { class: 'flex gap-8 wrap', style: { alignItems: 'center', padding: '12px' } }, [
        U.el('span', { class: 'small muted', text: label || '选择日期' }),
        input
      ]);
    }

    /* ---------- 扫码录入到期时间 ---------- */
    var scanState = { stream: null, timer: null, hintTimer: null, openTimer: null, stopped: true, onDecode: null, detector: null, detectorChecked: false };

    function materialPool() {
      var list = [];
      ((state.checkData && state.checkData.categories) || []).forEach(function (c) {
        (c.materials || []).forEach(function (m) { list.push(m); });
      });
      return list;
    }

    /* 解析二维码文本：兼容 JSON / URL 查询参数 / key:value 文本；字段名不区分大小写 */
    var QR_NAME_KEYS = ['boomname', 'productname', 'materialname', 'itemname', 'name', '品名', '名称', '原物料', '产品名称'];
    var QR_TIME_KEYS = ['expirationtime', 'expirytime', 'expiretime', 'expiration', 'expire', 'exp', 'validuntil', 'validtime', '到期时间', '保质期至', '有效期至', '效期'];

    function pickField(obj, keys) {
      var lower = {};
      Object.keys(obj).forEach(function (k) { lower[String(k).toLowerCase()] = obj[k]; });
      for (var i = 0; i < keys.length; i++) {
        var v = lower[keys[i]];
        if (v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    }

    function parsePairs(text) {
      var t = String(text || '').trim().replace(/^[?&]+/, '');
      var pairs = {};
      if (/^\{[\s\S]*\}$/.test(t)) {
        try {
          var o = JSON.parse(t);
          if (o && typeof o === 'object') {
            Object.keys(o).forEach(function (k) { if (o[k] !== null && typeof o[k] !== 'object') pairs[k] = String(o[k]); });
            return { pairs: pairs, form: 'json' };
          }
        } catch (e) {}
      }
      var q = t, qi = q.indexOf('?');
      if (qi >= 0) q = q.slice(qi + 1);
      if (/^https?:\/\//i.test(t) || q.indexOf('=') >= 0) {
        var got = 0;
        q.split(/[&;]/).forEach(function (seg) {
          var i = seg.indexOf('=');
          if (i <= 0) return;
          var k = seg.slice(0, i).trim(), v = seg.slice(i + 1).trim();
          try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
          pairs[k] = v; got++;
        });
        if (got) return { pairs: pairs, form: /^https?:\/\//i.test(t) ? 'url' : 'query' };
      }
      var re = /([A-Za-z_][A-Za-z0-9_]*|[\u4e00-\u9fa5]{2,8})\s*[:=]\s*([^,;&|\r\n]+)/g;
      var m;
      while ((m = re.exec(t))) pairs[m[1]] = m[2].trim();
      return { pairs: pairs, form: Object.keys(pairs).length ? 'text' : 'none' };
    }

    /* 统一按门店时区 UTC+8 展示，不受浏览器/服务器时区影响 */
    function stampFromMs(ms, raw) {
      if (isNaN(ms)) return { ok: false, reason: '无效时间戳', raw: raw };
      var d = new Date(ms + 8 * 3600 * 1000);
      var y = d.getUTCFullYear();
      var p = function (n) { return ('0' + n).slice(-2); };
      if (y < 2000 || y > 2100) return { ok: false, reason: '时间戳超出合理范围', raw: raw };
      return {
        ok: true,
        date: y + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()),
        time: p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()),
        raw: raw
      };
    }

    /* 到期时间归一化：标准为 10 位 Unix 秒；13 位毫秒兼容；8 位紧凑日期需为合法日期；12 位及以上视为异常 */
    function normExpiry(raw) {
      var v = String(raw || '').trim();
      var pad = function (n) { return ('0' + n).slice(-2); };
      if (!v) return { ok: false, reason: '空值', raw: v };
      if (/^\d+$/.test(v)) {
        if (v.length === 10) return stampFromMs(Number(v) * 1000, v);
        if (v.length === 13) return stampFromMs(Number(v), v);
        if (v.length === 8) {
          var mm = Number(v.slice(4, 6)), dd = Number(v.slice(6, 8));
          if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
            return { ok: true, date: v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8), time: '', raw: v };
          }
          return { ok: false, reason: '8 位数字不是有效日期', raw: v };
        }
        return { ok: false, reason: v.length + ' 位数字，位数异常（仅支持 10 位秒级或 13 位毫秒级时间戳）', raw: v };
      }
      var m = v.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]*(\d{1,2})[:：](\d{2})(?::(\d{2}))?)?/);
      if (m) return { ok: true, date: m[1] + '-' + pad(m[2]) + '-' + pad(m[3]), time: m[4] ? pad(m[4]) + ':' + m[5] : '', raw: v };
      return { ok: false, reason: '无法识别的日期格式', raw: v };
    }

    /* 物料名归一化：去空格、去括号规格后缀、忽略大小写 */
    function normMatName(s) {
      return String(s || '')
        .replace(/[\s\u3000]/g, '')
        .replace(/[（(\[【][^）)\]】]*[）)\]】]/g, '')
        .toLowerCase();
    }

    function fuzzyMatchMaterial(name, pool) {
      var key = normMatName(name);
      if (!key) return null;
      var exact = pool.filter(function (m) { return normMatName(m.name) === key; })[0];
      if (exact) return exact;
      var best = null, bestLen = 0;
      pool.forEach(function (m) {
        var k = normMatName(m.name);
        if (!k) return;
        if (key.indexOf(k) >= 0 || k.indexOf(key) >= 0) {
          var len = Math.min(k.length, key.length);
          if (len > bestLen) { best = m; bestLen = len; }
        }
      });
      return best;
    }

    function parseQrResult(text) {
      var p = parsePairs(text);
      var name = pickField(p.pairs, QR_NAME_KEYS);
      var timeRaw = pickField(p.pairs, QR_TIME_KEYS);
      if (name || timeRaw) {
        var info = timeRaw ? normExpiry(timeRaw) : null;
        var issues = [];
        if (!name) issues.push('缺少物料名称');
        if (!timeRaw) issues.push('缺少到期时间');
        else if (/^\d+$/.test(timeRaw) && timeRaw.length !== 10 && timeRaw.length !== 13) {
          issues.push('到期时间位数异常（' + timeRaw.length + ' 位）');
        }
        return {
          kind: 'kv', form: p.form, raw: text, name: name, timeRaw: timeRaw,
          date: info && info.ok ? info.date : '',
          time: info && info.ok ? info.time : '',
          timeError: info && !info.ok ? info.reason : '',
          issues: issues,
          pairs: p.pairs
        };
      }
      /* 兜底：纯文本里直接带日期（效期机打印说明文字等） */
      var t = String(text || '').replace(/：/g, ':').replace(/／/g, '/')
        .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
      var pad = function (n) { return ('0' + n).slice(-2); };
      var dtRe = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?[ T]*(\d{1,2}):(\d{2})/g;
      var dRe = /(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g;
      var m, dts = [], ds = [];
      while ((m = dtRe.exec(t))) dts.push({ date: m[1] + '-' + pad(m[2]) + '-' + pad(m[3]), time: pad(m[4]) + ':' + m[5] });
      if (dts.length) {
        var pick = dts[dts.length - 1];
        return { kind: 'datetime', date: pick.date, time: pick.time, raw: text };
      }
      while ((m = dRe.exec(t))) ds.push({ date: m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) });
      if (ds.length) return { kind: 'date', date: ds[ds.length - 1].date, time: '', raw: text };
      var code = /^\s*\d{4,24}\s*$/.test(t) ? t.trim() : '';
      return { kind: code ? 'code' : 'text', code: code, date: '', time: '', raw: text };
    }

    /* ---------- 扫码提示音（Web Audio 现场合成，无外部文件） ---------- */
    var SOUND_KEY = 'ts_expiry_scan_sound';
    var audioCtx = null;

    function soundPref() {
      try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; }
    }

    function saveSoundPref(on) {
      try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch (e) { /* 隐私模式等写入失败时仅本次生效 */ }
    }

    /* 必须在用户手势中创建/恢复 AudioContext，避免自动播放策略拦截 */
    function primeAudio() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') {
          var p = audioCtx.resume();
          if (p && p.catch) p.catch(function () {});
        }
        return audioCtx;
      } catch (e) { return null; }
    }

    /* 两声短音：880Hz 45ms + 1320Hz 45ms，间隔 10ms，总长约 100ms；force 用于弹窗内「试听」 */
    function playBeep(force) {
      if (!force && !soundPref()) return;
      var ctx = primeAudio();
      if (!ctx) return;
      try {
        var t0 = ctx.currentTime + 0.01;
        [880, 1320].forEach(function (freq, i) {
          var t = t0 + i * 0.055;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(0.14, t + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.05);
        });
      } catch (e) { /* 音频失败不影响扫码 */ }
    }

    function scanSuccessFeedback() {
      playBeep();
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* 不支持则静默跳过 */ }
    }

    function stopScan() {
      scanState.stopped = true;
      if (scanState.timer) { clearTimeout(scanState.timer); scanState.timer = null; }
      if (scanState.hintTimer) { clearInterval(scanState.hintTimer); scanState.hintTimer = null; }
      if (scanState.openTimer) { clearTimeout(scanState.openTimer); scanState.openTimer = null; }
      if (scanState.stream) {
        scanState.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        scanState.stream = null;
      }
    }

    /* 高分辨率 + 连续对焦优先；advanced 不支持时浏览器会忽略，不阻塞取流 */
    function cameraConstraints(level) {
      if (level === 0) {
        return {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 }, height: { ideal: 1080 },
            advanced: [
              { focusMode: 'continuous', exposureMode: 'continuous', whiteBalanceMode: 'continuous' },
              { pointsOfInterest: [{ x: 0.5, y: 0.5 }] }
            ]
          }
        };
      }
      if (level === 1) {
        return {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 },
            advanced: [{ focusMode: 'continuous' }]
          }
        };
      }
      return { audio: false, video: { facingMode: { ideal: 'environment' } } };
    }

    /* 首次进入等一次对焦完成再抽帧，随后尝试锁定曝光/白平衡 */
    function prepareCamera(stream, video) {
      return new Promise(function (resolve) {
        var track = stream.getVideoTracks && stream.getVideoTracks()[0];
        var done = false;
        var timer = setTimeout(finish, 2000);
        function finish() {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(track);
        }
        try {
          if (!track || !track.applyConstraints) { finish(); return; }
          var caps = track.getCapabilities ? track.getCapabilities() : {};
          var adv = [];
          if ((caps.focusMode || []).indexOf('continuous') >= 0) adv.push({ focusMode: 'continuous' });
          else if ((caps.focusMode || []).indexOf('auto') >= 0) adv.push({ focusMode: 'auto' });
          if (caps.pointsOfInterest) adv.push({ pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
          if (adv.length) track.applyConstraints({ advanced: adv }).catch(function () {});
        } catch (e) { /* 对焦约束失败时静默降级 */ }
        function settle() {
          if (done) return;
          clearTimeout(timer);
          setTimeout(function () { lockCamera(track); finish(); }, 550);
        }
        if (video.readyState >= 2) settle();
        else video.addEventListener('playing', settle, { once: true });
      });
    }

    /* 反光场景：能手动锁定就锁定，不能则保持连续模式减少来回跳 */
    function lockCamera(track) {
      if (!track || !track.applyConstraints) return;
      try {
        var caps = track.getCapabilities ? track.getCapabilities() : {};
        var s = track.getSettings ? track.getSettings() : {};
        var adv = [];
        if ((caps.exposureMode || []).indexOf('manual') >= 0 && s.exposureTime) {
          adv.push({ exposureMode: 'manual', exposureTime: s.exposureTime });
        } else if ((caps.exposureMode || []).indexOf('continuous') >= 0) {
          adv.push({ exposureMode: 'continuous' });
        }
        if ((caps.whiteBalanceMode || []).indexOf('manual') >= 0 && s.colorTemperature) {
          adv.push({ whiteBalanceMode: 'manual', colorTemperature: s.colorTemperature });
        } else if ((caps.whiteBalanceMode || []).indexOf('continuous') >= 0) {
          adv.push({ whiteBalanceMode: 'continuous' });
        }
        if (adv.length) track.applyConstraints({ advanced: adv }).catch(function () {});
      } catch (e) { /* 锁定失败不影响扫码 */ }
    }

    function torchSupport(stream) {
      try {
        var track = stream.getVideoTracks && stream.getVideoTracks()[0];
        var caps = track && track.getCapabilities ? track.getCapabilities() : {};
        return { track: track, supported: !!caps.torch };
      } catch (e) { return { track: null, supported: false }; }
    }

    function setTorch(track, on) {
      if (!track) return Promise.resolve(false);
      return track.applyConstraints({ advanced: [{ torch: !!on }] }).then(function () { return true; }).catch(function () { return false; });
    }

    /* 低照度检测：中心 60% 区域平均亮度 */
    function frameLuma(video) {
      try {
        var w = 64, h = 64;
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        var vw = video.videoWidth, vh = video.videoHeight;
        var side = Math.min(vw, vh) * 0.6;
        ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, w, h);
        var d = ctx.getImageData(0, 0, w, h).data;
        var sum = 0;
        for (var i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        return sum / (w * h);
      } catch (e) { return 255; }
    }

    /* 解码统一交给 scan-engine.js：原生 BarcodeDetector 优先，jsQR 回退 */

    /* 单张图片识别：ScanEngine 内部按中心 ROI、阈值轮转与滑窗兜底处理 */
    function decodeImage(file) {
      return new Promise(function (resolve, reject) {
        if (!window.ScanEngine) { reject(new Error('扫码引擎未加载，请刷新页面重试')); return; }
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          window.ScanEngine.decodeImage(img).then(function (r) {
            URL.revokeObjectURL(url);
            resolve(r.text);
          }).catch(function (e) {
            URL.revokeObjectURL(url);
            reject(e);
          });
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
        img.src = url;
      });
    }

    function openScan() {
      var pool = materialPool();
      if (!pool.length) { UI.toast('当前没有可填写的原物料', 'error'); return; }
      primeAudio();
      stopScan();
      scanState.stopped = false;

      var video = U.el('video', { class: 'scan-video', playsinline: '', muted: '', autoplay: '' });
      var scanProgress = U.el('div', { class: 'scan-progress', text: '正在识别…' });
      var scanFrame = U.el('div', { class: 'scan-frame' });
      var stage = U.el('div', { class: 'scan-stage' }, [video, scanFrame, scanProgress]);
      var hint = U.el('div', { class: 'scan-hint', text: '' });
      var rawBox = U.el('div', { class: 'scan-raw', style: { display: 'none' } });
      var select = U.el('select', { class: 'select' });
      pool.forEach(function (m) {
        select.appendChild(U.el('option', { value: m.id, text: m.name }));
      });
      try {
        var lastMaterial = localStorage.getItem('ts_expiry_scan_material');
        if (lastMaterial && pool.some(function (m) { return m.id === lastMaterial; })) select.value = lastMaterial;
      } catch (e) { /* 本地记忆不可用时忽略 */ }
      select.addEventListener('change', function () {
        try { localStorage.setItem('ts_expiry_scan_material', select.value); } catch (e) {}
        var picked = pool.filter(function (x) { return x.id === select.value; })[0];
        if (current && current.date && !current.time && picked) {
          timeFill.style.display = picked.closeDue ? 'none' : '';
        }
      });
      var assign = U.el('div', { class: 'field', style: { display: 'none' } }, [
        U.el('label', { class: 'label', text: '填入哪一项原物料' }), select
      ]);
      var timeInput = U.el('input', { class: 'input', type: 'time', 'aria-label': '补充到期时间' });
      var timeFill = U.el('div', { class: 'field scan-time-fill', style: { display: 'none' } }, [
        U.el('label', { class: 'label', text: '已识别日期，请补充到期时间' }), timeInput
      ]);
      var fileInput = U.el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
      var uploadBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '上传二维码图片' });
      var torchBtn = U.el('button', { class: 'btn btn-ghost btn-sm scan-torch', type: 'button', text: '补光灯', style: { display: 'none' } });
      var lightHint = U.el('div', { class: 'scan-light-hint', style: { display: 'none' }, text: '' });
      var torchTrack = null;
      var torchOn = false;
      uploadBtn.addEventListener('click', function () { fileInput.click(); });

      var soundInput = U.el('input', { type: 'checkbox', checked: soundPref(), 'aria-label': '识别成功提示音' });
      soundInput.addEventListener('change', function () {
        saveSoundPref(soundInput.checked);
        if (soundInput.checked) primeAudio();
      });
      var previewBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '试听' });
      previewBtn.addEventListener('click', function () { playBeep(true); });
      var soundRow = U.el('div', { class: 'scan-sound' }, [
        U.el('span', { class: 'small muted', text: '识别成功提示音' }),
        U.el('div', { class: 'scan-sound-actions' }, [
          previewBtn,
          U.el('label', { class: 'switch' }, [soundInput])
        ])
      ]);

      var current = null;
      torchBtn.addEventListener('click', function () {
        if (!torchTrack) return;
        var next = !torchOn;
        setTorch(torchTrack, next).then(function (ok) {
          if (!ok) { UI.toast('当前设备不支持补光灯', 'error'); return; }
          torchOn = next;
          torchBtn.textContent = torchOn ? '关闭补光' : '补光灯';
          torchBtn.classList.toggle('active', torchOn);
          if (torchOn) lightHint.style.display = 'none';
        });
      });
      var applyBtn = { text: '填入', class: 'btn-primary', onClick: function () { applyScan(); return false; }, close: false };
      var continueBtn = { text: '继续扫描', class: 'btn-ghost', onClick: function () { continueScan(); return false; }, close: false };
      var doneBtn = { text: '完成', class: 'btn-soft' };

      function setHint(t) { hint.textContent = t; }

      /* 清空上一条的识别结果与取景画面，已填入的行不受影响 */
      function resetReading() {
        current = null;
        rawBox.style.display = 'none';
        rawBox.innerHTML = '';
        assign.style.display = 'none';
        timeFill.style.display = 'none';
        timeInput.value = '';
        stage.style.display = '';
        video.style.display = '';
        scanProgress.style.display = '';
        scanFrame.style.display = '';
      }

      /* 填入成功后保留弹窗，短暂停留后自动回到继续扫描，不用重新点开扫码 */
      function afterFilled(m, dueText, covered) {
        current = null;
        rawBox.style.display = 'none';
        rawBox.innerHTML = '';
        assign.style.display = 'none';
        timeFill.style.display = 'none';
        stage.style.display = 'none';
        video.style.display = 'none';
        scanProgress.style.display = 'none';
        scanFrame.style.display = 'none';
        setHint('已填入「' + m.name + '」' + dueText + (covered ? '（已覆盖原值）' : '') + '；正在回到取景，可继续扫描下一条');
        setTimeout(function () {
          if (!hint.isConnected) return;
          continueScan();
        }, 900);
      }

      /* 继续扫描：重新取流，不清空已填数据 */
      function continueScan() {
        resetReading();
        setHint('将二维码放入取景框，识别成功后自动停止');
        startScan();
      }

      function onDecoded(text) {
        if (scanState.stopped) return;
        scanSuccessFeedback();
        stopScan();
        current = parseQrResult(text);
        var matched = current.name ? fuzzyMatchMaterial(current.name, pool) : null;
        current.matchedId = matched ? matched.id : '';
        if (matched) select.value = matched.id;
        rawBox.style.display = '';
        rawBox.innerHTML = '';
        if (current.kind === 'kv') {
          rawBox.appendChild(U.el('div', { class: 'strong', text: '物料：' + (current.name || '未识别') }));
          rawBox.appendChild(U.el('div', { class: 'small', text: '到期：' + (current.timeRaw || '未识别') }));
          if (current.timeError) {
            rawBox.appendChild(U.el('div', { class: 'small', style: { color: 'var(--danger)' }, text: '到期时间格式异常（' + current.timeError + '），不会自动填入，请手动选择' }));
          } else {
            var isStamp = /^\d{10}$|^\d{13}$/.test(current.timeRaw || '');
            rawBox.appendChild(U.el('div', { class: 'small muted', text: '解析结果：' + current.date + (current.time ? ' ' + current.time : '（仅日期）') + (isStamp ? '（北京时间 UTC+8）' : '') }));
          }
          var extraIssues = (current.issues || []).filter(function (x) { return x.indexOf('位数异常') < 0; });
          if (extraIssues.length) {
            rawBox.appendChild(U.el('div', { class: 'small', style: { color: 'var(--danger)' }, text: '识别结果可能不完整：' + extraIssues.join('、') + '，建议重新扫描' }));
          }
          rawBox.appendChild(U.el('div', { class: 'small muted', text: '匹配物料：' + (matched ? matched.name + '（已自动选中）' : '未匹配，请从下方选择') }));
        } else if (current.kind === 'datetime' || current.kind === 'date') {
          rawBox.appendChild(U.el('div', { class: 'strong', text: '识别到到期时间：' + current.date + (current.time ? ' ' + current.time : '') }));
        } else if (current.kind === 'code') {
          rawBox.appendChild(U.el('div', { class: 'strong', text: '二维码内容为编号「' + current.code + '」，不含日期时间' }));
        } else {
          rawBox.appendChild(U.el('div', { class: 'strong', text: '识别到文本：' + String(current.raw || '').slice(0, 60) }));
        }
        rawBox.appendChild(U.el('div', { class: 'small muted', text: '原始内容：' + String(current.raw || '').slice(0, 160) }));
        assign.style.display = '';
        var selMat = pool.filter(function (x) { return x.id === select.value; })[0];
        if (current.date && !current.time && selMat && !selMat.closeDue) {
          timeFill.style.display = '';
          setHint('已识别日期，请补充到期时间后点「填入」');
        } else {
          timeFill.style.display = 'none';
        }
        setHint(matched
          ? '已匹配「' + matched.name + '」，确认无误后点「填入」'
          : (current.name ? '未匹配到物料，请选择要填入的原物料' : '未识别到物料，请选择要填入的原物料'));
        video.style.display = 'none';
        stage.style.display = 'none';
      }

      function isPast(dueText) {        return isDueExpired(dueText);
      }

      function applyScan() {
        var m = pool.filter(function (x) { return x.id === select.value; })[0];
        if (!m) { UI.toast('请选择原物料', 'error'); return; }
        var row = U.$('.check-row[data-material-id="' + m.id + '"]', body);
        if (!row) { UI.toast('当前检查列表中没有该原物料', 'error'); return; }
        var input = row.querySelector('[data-due]');
        row.classList.add('scan-hit');
        row.scrollIntoView({ block: 'center' });
        var info = current || {};
        if (info.issues && info.issues.length) {
          UI.toast('识别结果可能不完整（' + info.issues.join('、') + '），请重新扫描', 'error');
          return { close: false };
        }
        if (info.timeError) {
          UI.toast('到期时间「' + info.timeRaw + '」无法识别，请手动选择', 'error');
          return { close: false };
        }
        if (info.invalid) {
          UI.toast('识别日期超出合理范围，已排除，请手动核对后填写', 'error');
          return { close: false };
        }
        if (!info.date) {
          UI.toast('识别结果未包含日期，已定位到「' + m.name + '」，请手动选择', 'error');
          return { close: false };
        }
        if (!m.closeDue && !info.time && timeInput.value) info.time = timeInput.value;
        if (!m.closeDue && !info.time) {
          timeFill.style.display = '';
          UI.toast('仅识别到日期，请在弹窗内补充具体时间，或在「' + m.name + '」行内填写', 'error');
          return { close: false };
        }
        var dueText = info.date + ' ' + (m.closeDue ? closeTime() : info.time);
        if (isPast(dueText)) {
          UI.toast('识别结果到期时间 ' + dueText + ' 早于当前时间，请核对后手动填写', 'error');
          return { close: false };
        }
        var prev = input.value;
        if (m.closeDue) {
          input.value = info.date;
        } else {
          input.value = info.date + 'T' + info.time;
        }
        row.classList.add('has-value');
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        try {
          localStorage.setItem('ts_expiry_scan_material', m.id);
          if (!m.closeDue) localStorage.setItem('ts_expiry_scan_time', info.time);
        } catch (e) { /* 本地记忆不可用时忽略 */ }
        var covered = !!prev && prev !== input.value;
        /* change 事件会触发所在行的即时保存；这里只负责关闭取景并自动回到继续扫描 */
        stopScan();
        afterFilled(m, dueText, covered);
        return true;
      }

      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        setHint('正在识别图片…');
        decodeImage(f).then(onDecoded).catch(function (e) { setHint(e.message); });
        fileInput.value = '';
      });

      var modal = UI.openModal({
        title: '扫一扫录入到期时间',
        subtitle: '把效期标签二维码放入取景框；无法调起摄像头时可上传图片',
        body: U.el('div', { class: 'scan-wrap' }, [
          stage,
          hint,
          lightHint,
          U.el('div', { class: 'scan-actions' }, [torchBtn, uploadBtn, fileInput]),
          soundRow,
          rawBox,
          assign,
          timeFill
        ]),
        footer: [
          { text: '关闭', class: 'btn-ghost' },
          applyBtn,
          continueBtn,
          doneBtn
        ],
        onClose: stopScan
      });
      if (modal && modal.footer) modal.footer.classList.add('scan-foot');

      function getCameraStream(level) {
        if (level >= 3) return Promise.reject(new Error('no-camera'));
        return navigator.mediaDevices.getUserMedia(cameraConstraints(level)).catch(function () {
          return getCameraStream(level + 1);
        });
      }

      function streamAlive() {
        if (!scanState.stream || !scanState.stream.getTracks) return false;
        var tracks = scanState.stream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
          if (tracks[i].readyState === 'live') return true;
        }
        return false;
      }

      /* 流还在就复用，已停就重新取流 */
      function ensureScanRunning() {
        if (!scanState.stopped && streamAlive()) return;
        startScan();
      }

      function startScan() {
        stopScan();
        scanState.stopped = false;
        stage.style.display = '';
        video.style.display = '';
        scanProgress.style.display = '';
        scanFrame.style.display = '';
        setHint('正在打开摄像头…');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          stage.style.display = 'none';
          setHint('当前环境无法使用摄像头（需 HTTPS 或 localhost），请使用「上传图片」识别');
          return;
        }

        /* 摄像头 8 秒仍未就绪时给出兜底提示，避免一直停在“正在打开摄像头” */
        scanState.openTimer = setTimeout(function () {
          if (scanState.stopped || scanState.stream) return;
          stage.style.display = 'none';
          setHint('摄像头仍未打开：请检查系统权限或改用 HTTPS，也可以直接上传图片；点「继续扫描」可重试');
        }, 8000);

        getCameraStream(0)
          .then(function (stream) {
            if (scanState.openTimer) { clearTimeout(scanState.openTimer); scanState.openTimer = null; }
            if (scanState.stopped) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
            scanState.stream = stream;
            video.srcObject = stream;
            video.play().catch(function () {});
            setHint('正在等待对焦…');
            scanProgress.style.display = '';
            scanFrame.style.display = '';

            prepareCamera(stream, video).then(function () {
              if (scanState.stopped) return;
              var torch = torchSupport(stream);
              torchTrack = torch.track;
              torchBtn.style.display = torch.supported ? '' : 'none';
              torchOn = false;
              torchBtn.textContent = '补光灯';
              torchBtn.classList.remove('active');
              setHint('将二维码放入取景框，识别成功后自动停止');
              setTimeout(function () {
                if (scanState.stopped || !video.videoWidth) return;
                if (frameLuma(video) < 55) {
                  lightHint.textContent = torch.supported ? '光线较暗，建议开启补光灯' : '光线较暗，请移到亮处或开启环境光';
                  lightHint.style.display = '';
                }
              }, 500);

              var busy = false;
              var startedAt = Date.now();
              var dots = 0;
              var frameNo = 0;

              scanState.hintTimer = setInterval(function () {
                if (scanState.stopped) return;
                dots = (dots + 1) % 4;
                var sec = Math.floor((Date.now() - startedAt) / 1000);
                var tip = sec >= 8
                  ? '；如仍无结果，请靠近拍摄、避开反光/褶皱，让二维码填满取景框，或改用上传裁切图'
                  : '';
                scanProgress.textContent = '正在识别' + new Array(dots + 1).join('·') + ' ' + sec + 's' + tip;
              }, 800);

              /* 抽帧解码：约 4–5 帧/秒；每帧只跑一组缩放/阈值，命中即停 */
              function tick() {
                if (scanState.stopped) return;
                if (!video.videoWidth) { scanState.timer = setTimeout(tick, 140); return; }
                if (busy) { scanState.timer = setTimeout(tick, 120); return; }
                busy = true;
                var p = window.ScanEngine
                  ? window.ScanEngine.decodeVideoFrame(video, { frame: frameNo++ })
                  : Promise.resolve(null);
                p.then(function (hit) {
                  busy = false;
                  if (!scanState.stopped && hit && hit.text) onDecoded(hit.text);
                }).catch(function () { busy = false; });
                scanState.timer = setTimeout(tick, 220);
              }
              tick();
            });
          })
          .catch(function () {
            if (scanState.openTimer) { clearTimeout(scanState.openTimer); scanState.openTimer = null; }
            stage.style.display = 'none';
            setHint('无法打开摄像头（需 HTTPS 或 localhost，且已授权），请改用「上传二维码图片」，或点「继续扫描」重试');
          });
      }

      startScan();
    }

    /* ---------- 今日检查记录：即时保存 + 本地草稿 ---------- */
    var CHECK_DRAFT_KEY = 'ts_expiry_check_draft';

    function readDrafts() {
      try {
        var o = JSON.parse(localStorage.getItem(CHECK_DRAFT_KEY) || '{}');
        return o && typeof o === 'object' ? o : {};
      } catch (e) { return {}; }
    }

    function writeDrafts(all) {
      try { localStorage.setItem(CHECK_DRAFT_KEY, JSON.stringify(all)); } catch (e) { /* 隐私模式忽略 */ }
    }

    function setDraft(date, mid, value) {
      var all = readDrafts();
      all[date] = all[date] || {};
      if (value) all[date][mid] = value;
      else delete all[date][mid];
      if (!Object.keys(all[date]).length) delete all[date];
      writeDrafts(all);
    }

    function draftsOf(date) {
      var all = readDrafts();
      return all[date] || {};
    }

    /* ---------- TAB 1：效期检查 ---------- */
    function renderCheck() {
      body.appendChild(dateBar(state.checkDate, function (v) {
        state.checkDate = v;
        state.checkData = null;
        renderTab();
      }, '检查日期'));
      var scanBtn = U.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '扫一扫' });
      scanBtn.addEventListener('click', openScan);
      body.appendChild(U.el('div', { class: 'scan-bar' }, [
        U.el('span', { class: 'small muted', text: '扫描效期标签二维码，自动识别到期时间' }),
        scanBtn
      ]));
      if (!state.checkData) {
        body.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(2)]));
        api.expiryCheckData({ date: state.checkDate }).then(function (res) {
          state.checkData = res;
          renderTab();
        }).catch(function (e) {
          body.innerHTML = '';
          body.appendChild(UI.errorState({ message: e.message, onRetry: function () { state.checkData = null; renderTab(); } }));
        });
        return;
      }
      var cats = state.checkData.categories || [];
      if (!cats.length) {
        body.appendChild(U.el('div', { class: 'card-body' }, [
          UI.emptyState({ icon: 'clock', title: '暂无可检查的原物料', desc: '请先在后台「效期配置」中添加分类与原物料。' })
        ]));
        return;
      }
      var form = U.el('form', { class: 'form-stack expiry-form', onsubmit: function (e) { e.preventDefault(); } });
      var draftMap = draftsOf(state.checkDate);
      var retryQueue = [];
      cats.forEach(function (c) {
        var sec = U.el('div', { class: 'form-section' });
        sec.appendChild(U.el('div', { class: 'form-section-title', text: c.name }));
        c.materials.forEach(function (m) {
          var rec = m.record;
          var savedVal = rec && rec.dueAt
            ? (m.closeDue ? String(rec.dueAt).slice(0, 10) : String(rec.dueAt).replace(' ', 'T').slice(0, 16))
            : '';
          var draftVal = draftMap[m.id] || '';
          var row = U.el('div', {
            class: 'check-row expiry-check-item' + ((savedVal || draftVal) ? ' has-value' : '') + (m.closeDue ? '' : ' has-time'),
            style: { padding: '10px 16px' },
            dataset: { materialId: m.id }
          });
          var sub = U.el('div', { class: 'check-sub' });
          var saveStatus = '';
          function paintSub() {
            if (m.closeDue) {
              var day = row.querySelector('[data-due]') ? row.querySelector('[data-due]').value : '';
              sub.textContent = day
                ? '到期时间 ' + day + ' ' + closeTime() + '（门店打烊）'
                : '打烊到期 · ' + closeTime();
            } else {
              var v = row.querySelector('[data-due]') ? row.querySelector('[data-due]').value : '';
              sub.textContent = v ? '到期时间 ' + v.replace('T', ' ') : ruleText(m);
            }
            if (saveStatus) sub.textContent += ' · ' + saveStatus;
          }
          var badgeEl = U.el('span', {
            class: 'badge ' + (rec && rec.status === 'processed' ? 'badge-info' : 'badge-success'),
            text: rec ? (rec.status === 'processed' ? '已处理' : '已登记') : '已登记',
            style: { display: rec ? '' : 'none' }
          });
          var retryBtn = U.el('button', { class: 'btn-text small', type: 'button', text: '重试保存', style: { display: 'none' } });
          var main = U.el('div', { class: 'check-main' }, [
            U.el('div', { class: 'check-name' }, [
              U.el('span', { text: m.name }),
              badgeEl,
              retryBtn
            ]),
            sub
          ]);
          row.appendChild(main);
          /* 打烊到期只选日期；其余保持日期 + 时间 */
          var dueInput = U.el('input', {
            class: 'input check-date',
            type: m.closeDue ? 'date' : 'datetime-local',
            value: draftVal || savedVal
          });
          dueInput.setAttribute('data-due', '');
          if (m.closeDue) dueInput.setAttribute('data-close-due', '1');
          row.appendChild(dueInput);
          var lastSaved = draftVal || savedVal;
          var pending = false;

          function dueTextOf(v) {
            return m.closeDue ? (String(v).slice(0, 10) + ' ' + closeTime()) : String(v).replace('T', ' ');
          }

          function markSaved(v) {
            lastSaved = v;
            badgeEl.style.display = '';
            badgeEl.className = 'badge badge-success';
            badgeEl.textContent = '已登记';
            retryBtn.style.display = 'none';
            saveStatus = '';
            paintSub();
          }

          function markFailed(msg) {
            retryBtn.style.display = '';
            saveStatus = '未保存，可重试';
            paintSub();
            if (msg) UI.toast('保存失败：' + msg + '；已保留草稿，可点「重试保存」', 'error', 6000);
          }

          function doSave(scrap, silent) {
            if (pending) return;
            var v = dueInput.value;
            if (!v) return;
            pending = true;
            saveStatus = '保存中…';
            paintSub();
            api.expirySaveCheck({ date: state.checkDate, items: [{ materialId: m.id, dueAt: v, scrap: !!scrap }] }).then(function () {
              pending = false;
              setDraft(state.checkDate, m.id, '');
              /* 同步内存中的当天记录，切 Tab / 重渲染后仍显示已保存值 */
              m.record = m.record || {};
              m.record.materialId = m.id;
              m.record.checkDate = state.checkDate;
              m.record.dueAt = m.closeDue ? (String(v).slice(0, 10) + ' ' + closeTime()) : String(v).replace('T', ' ');
              m.record.status = scrap ? 'scrapped' : 'normal';
              markSaved(v);
              if (!silent) UI.toast(m.name + ' 已保存', 'success', 1800);
            }).catch(function (e) {
              pending = false;
              setDraft(state.checkDate, m.id, v);
              markFailed(e.message);
            });
          }

          function commit(silent) {
            var v = dueInput.value;
            row.classList.toggle('has-value', !!v);
            paintSub();
            if (!v) {
              setDraft(state.checkDate, m.id, '');
              saveStatus = '';
              retryBtn.style.display = 'none';
              paintSub();
              return;
            }
            if (isDueExpired(dueTextOf(v))) {
              setDraft(state.checkDate, m.id, v);
              UI.confirm({
                title: '该效期已过期',
                message: '该时间已过期，确认后将按「已报废」状态登记，操作不可撤销；可在当天到期与效期总览中追溯。',
                detail: '<div class="small">' + m.name + '（' + dueTextOf(v) + '）</div>',
                confirmText: '确认已报废',
                cancelText: '返回修改',
                danger: true
              }).then(function (ok) {
                if (!ok) {
                  dueInput.value = lastSaved;
                  row.classList.toggle('has-value', !!lastSaved);
                  setDraft(state.checkDate, m.id, '');
                  saveStatus = '';
                  paintSub();
                  UI.toast('已返回，请调整到期时间或按报废流程处理', 'error');
                  return;
                }
                doSave(true, silent);
              });
              return;
            }
            setDraft(state.checkDate, m.id, v);
            doSave(false, silent);
          }

          dueInput.addEventListener('change', function () { commit(false); });
          retryBtn.addEventListener('click', function () { doSave(false, false); });
          row.addEventListener('click', function (e) {
            if (e.target === dueInput || dueInput.contains(e.target)) return;
            if (e.target === retryBtn || retryBtn.contains(e.target)) return;
            if (typeof dueInput.showPicker === 'function') { try { dueInput.showPicker(); } catch (err) {} }
            else dueInput.focus();
          });
          paintSub();
          /* 上次未保存成功的草稿：重进页面先静默重试一次，失败仍保留草稿 */
          if (draftVal) {
            if (isDueExpired(dueTextOf(draftVal))) {
              saveStatus = '待保存';
              retryBtn.style.display = '';
              paintSub();
            } else {
              retryQueue.push(function () { doSave(false, true); });
            }
          }
          sec.appendChild(row);
        });
        form.appendChild(sec);
      });
      body.appendChild(form);
      body.appendChild(U.el('p', {
        class: 'text-center small muted',
        style: { marginTop: '10px' },
        text: '到期时间修改后即时保存到当天检查记录，可随时继续修改。'
      }));
      if (retryQueue.length) {
        setTimeout(function () {
          retryQueue.forEach(function (fn) { fn(); });
        }, 200);
      }
    }

    /* ---------- TAB 2 / 3：记录列表 ---------- */
    function renderDue() {
      body.appendChild(dateBar(state.dueDate, function (v) {
        state.dueDate = v;
        state.dueList = null;
        renderTab();
      }, '到期日期'));
      if (!state.dueList) {
        body.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(2)]));
        api.expiryDueList({ date: state.dueDate }).then(function (res) {
          state.dueList = res.list || [];
          renderTab();
        }).catch(function (e) {
          body.innerHTML = '';
          body.appendChild(UI.errorState({ message: e.message, onRetry: function () { state.dueList = null; renderTab(); } }));
        });
        return;
      }
      renderDueRecords(state.dueList);
    }

    function renderDay() {
      body.appendChild(dateBar(state.dayDate, function (v) {
        state.dayDate = v;
        state.dayList = null;
        renderTab();
      }, '登记日期'));
      if (!state.dayList) {
        body.appendChild(U.el('div', { class: 'card-body' }, [UI.skeleton(2)]));
        api.expiryDayList({ date: state.dayDate }).then(function (res) {
          state.dayList = res.list || [];
          renderTab();
        }).catch(function (e) {
          body.innerHTML = '';
          body.appendChild(UI.errorState({ message: e.message, onRetry: function () { state.dayList = null; renderTab(); } }));
        });
        return;
      }
      renderDayRecords(state.dayList);
    }

    function statusBadge(status) {
      if (status === 'scrapped') return UI.badge('已报废', 'danger');
      if (status === 'processed') return UI.badge('已处理', 'success');
      return UI.badge('未处理', 'warn');
    }

    /* 统一展示：2026年11月20日 22:00（月日不补零，24 小时制）；mode 可只取 date / time */
    function cnDateTime(value, mode) {
      var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(value || ''));
      if (!m) return value ? String(value) : '—';
      var date = Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
      if (m[4] === undefined) return date;
      var time = U.pad(Number(m[4])) + ':' + m[5];
      if (mode === 'time') return time;
      if (mode === 'date') return date;
      return date + ' ' + time;
    }

    /* 当天到期：操作按钮固定在行右侧，窄屏只压缩左侧文字 */
    function renderDueRecords(list) {
      if (!list.length) {
        body.appendChild(U.el('div', { class: 'card-body' }, [
          UI.emptyState({ icon: 'clock', title: '当天没有到期的原物料', desc: '未填写产品效期的原物料不会展示。' })
        ]));
        return;
      }
      var wrap = U.el('div', { class: 'card-body tight' });
      list.forEach(function (r) {
        var status = r.status || 'normal';
        var unprocessed = status === 'normal';
        var item = U.el('div', {
          class: 'leave-item expiry-due-item',
          style: unprocessed ? { background: 'var(--warn-soft)', borderColor: 'var(--warn)' } : {}
        });
        var main = U.el('div', { class: 'expiry-due-main' });
        main.appendChild(U.el('div', { class: 'flex gap-8 wrap', style: { alignItems: 'center' } }, [
          UI.badge(r.categoryName || '未分类', 'brand'),
          U.el('strong', { class: 'expiry-due-name', text: r.materialName })
        ]));
        main.appendChild(U.el('div', { class: 'leave-sub', text: '到期 ' + cnDateTime(r.dueAt) + ' · 登记 ' + (r.createdBy || '—') + (r.note ? ' · ' + r.note : '') }));
        if (!unprocessed) {
          main.appendChild(U.el('div', { class: 'leave-sub', text: (status === 'scrapped' ? '报废人 ' : '处理人 ') + (r.processedBy || '—') + ' · ' + cnDateTime(r.processedAt) }));
        }
        var side = U.el('div', { class: 'expiry-due-side' }, [statusBadge(status)]);
        if (unprocessed) {
          var btn = U.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '标记已处理' });
          btn.addEventListener('click', function () {
            UI.confirm({
              title: '确认已处理',
              message: '确认将「' + r.materialName + '」标记为已处理？标记后不可撤销。',
              confirmText: '标记已处理'
            }).then(function (ok) {
              if (!ok) return;
              UI.btnLoading(btn, true, '处理中…');
              api.expiryProcess({ id: r.id }).then(function () {
                UI.btnLoading(btn, false);
                UI.toast('已标记处理', 'success');
                state.dueList = null;
                renderTab();
              }).catch(function (e) {
                UI.btnLoading(btn, false);
                UI.toast(e.message, 'error');
              });
            });
          });
          side.appendChild(btn);
        }
        item.appendChild(U.el('div', { class: 'expiry-due-row' }, [main, side]));
        wrap.appendChild(item);
      });
      body.appendChild(wrap);
    }

    /* 效期总览：按分类分栏，组内按到期时间排序，只做预览不提供处理操作 */
    function renderDayRecords(list) {
      if (!list.length) {
        body.appendChild(U.el('div', { class: 'card-body' }, [
          UI.emptyState({ icon: 'clock', title: '当天没有登记效期', desc: '未填写产品效期的原物料不会展示。' })
        ]));
        return;
      }
      var cats = (state.checkData && state.checkData.categories) || [];
      var order = {};
      cats.forEach(function (c, i) { order[c.name] = i; });
      var groups = [], map = {};
      list.slice().sort(function (a, b) {
        return String(a.dueAt).localeCompare(String(b.dueAt));
      }).forEach(function (r) {
        var name = r.categoryName || '未分类';
        if (!map[name]) { map[name] = { name: name, rows: [] }; groups.push(map[name]); }
        map[name].rows.push(r);
      });
      groups.sort(function (a, b) {
        var oa = order[a.name] === undefined ? 999 : order[a.name];
        var ob = order[b.name] === undefined ? 999 : order[b.name];
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
      var wrap = U.el('div', { class: 'expiry-day' });
      /* 统一按本地墙上时间判定：已过点标红，今天未过点标黄；已处理/已报废不参与 */
      var nowTs = Date.now();
      var day = new Date(nowTs);
      var dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      var dayEnd = dayStart + 86400000;
      groups.forEach(function (g) {
        var sec = U.el('div', { class: 'expiry-day-group' });
        sec.appendChild(U.el('div', { class: 'expiry-day-head' }, [
          U.el('div', { class: 'expiry-day-title', text: g.name }),
          U.el('span', { class: 'expiry-day-count', text: g.rows.length + ' 项' })
        ]));
        g.rows.forEach(function (r) {
          var status = r.status || 'normal';
          var markClass = '';
          if (status === 'normal') {
            var dueTs = dueTimestamp(r.dueAt);
            if (!isNaN(dueTs)) {
              if (dueTs <= nowTs) markClass = ' is-overdue';
              else if (dueTs < dayEnd) markClass = ' is-due-today';
            }
          }
          var main = U.el('div', { class: 'expiry-day-main' }, [
            U.el('div', { class: 'expiry-day-name', text: r.materialName }),
            U.el('div', { class: 'expiry-day-sub', text: '登记 ' + (r.createdBy || '—') + ' · ' + cnDateTime(r.checkDate) + (r.note ? ' · ' + r.note : '') })
          ]);
          if (status !== 'normal') {
            main.appendChild(U.el('div', { class: 'expiry-day-sub', text: (status === 'scrapped' ? '报废人 ' : '处理人 ') + (r.processedBy || '—') + ' · ' + cnDateTime(r.processedAt) }));
          }
          var sideItems = [
            U.el('div', { class: 'expiry-day-date', text: cnDateTime(r.dueAt, 'date') }),
            U.el('div', { class: 'expiry-day-time', text: cnDateTime(r.dueAt, 'time') })
          ];
          /* 总览只标注已处理 / 已报废；未处理不占徽标位，日期时间紧凑居中 */
          if (status !== 'normal') sideItems.push(statusBadge(status));
          var side = U.el('div', {
            class: 'expiry-day-side' + (status === 'normal' ? ' no-badge' : '')
          }, sideItems);
          sec.appendChild(U.el('div', { class: 'expiry-day-row' + markClass }, [main, side]));
        });
        wrap.appendChild(sec);
      });
      body.appendChild(wrap);
    }
  };
})();
