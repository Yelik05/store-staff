/* scan-engine.js — 效期扫码解码引擎（原生优先 + jsQR 回退 + 脏标签增强）
   只做图像与解码，不碰页面结构；供 expiry.js 与基准脚本共用。 */
(function (global) {
  'use strict';

  var FORMATS = ['qr_code', 'data_matrix', 'code_128'];
  var detectorState = { checked: false, detector: null, formats: [] };

  function getDetector() {
    if (detectorState.detector) return Promise.resolve(detectorState.detector);
    if (detectorState.checked) return Promise.reject(new Error('no-detector'));
    if (typeof global.BarcodeDetector === 'undefined') {
      detectorState.checked = true;
      return Promise.reject(new Error('no-detector'));
    }
    return global.BarcodeDetector.getSupportedFormats().then(function (list) {
      var use = FORMATS.filter(function (f) { return list.indexOf(f) >= 0; });
      if (!use.length) throw new Error('no-format');
      detectorState.formats = use;
      detectorState.detector = new global.BarcodeDetector({ formats: use });
      detectorState.checked = true;
      return detectorState.detector;
    }).catch(function (e) {
      detectorState.checked = true;
      throw e;
    });
  }

  function canvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w));
    cv.height = Math.max(1, Math.round(h));
    return cv;
  }

  function crop(source, sx, sy, sw, sh, target, maxScale) {
    if (sw < 8 || sh < 8) return null;
    var ratio = Math.max(0.3, Math.min(maxScale || 3, target / Math.max(sw, sh)));
    var cv = canvas(sw * ratio, sh * ratio);
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return { canvas: cv, ctx: ctx, w: cv.width, h: cv.height };
  }

  function centerRect(w, h, k) {
    var side = Math.min(w, h) * k;
    return { x: (w - side) / 2, y: (h - side) / 2, w: side, h: side };
  }

  /* 紧裁 ROI 会吃掉二维码的静区，jsQR 的定位图形会判不出来；补一圈白边还原静区 */
  function pad(part, ratio) {
    if (!part) return null;
    var m = Math.round(Math.min(part.w, part.h) * (ratio === undefined ? 0.1 : ratio));
    var cv = canvas(part.w + m * 2, part.h + m * 2);
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(part.canvas, m, m);
    return { canvas: cv, ctx: ctx, w: cv.width, h: cv.height };
  }

  function toGray(data, w, h) {
    var g = new Uint8Array(w * h);
    for (var i = 0, j = 0; i < data.length; i += 4, j++) {
      g[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    return g;
  }

  function stretch(gray) {
    var hist = new Uint32Array(256);
    for (var i = 0; i < gray.length; i++) hist[gray[i]]++;
    var total = gray.length, low = 0, high = 255, acc = 0;
    for (var lo = 0; lo < 256; lo++) { acc += hist[lo]; if (acc >= total * 0.02) { low = lo; break; } }
    acc = 0;
    for (var hi = 255; hi >= 0; hi--) { acc += hist[hi]; if (acc >= total * 0.02) { high = hi; break; } }
    var span = high - low;
    if (span < 8) return gray;
    var out = new Uint8Array(gray.length);
    for (var k = 0; k < gray.length; k++) {
      var v = Math.round((gray[k] - low) * 255 / span);
      out[k] = v < 0 ? 0 : (v > 255 ? 255 : v);
    }
    return out;
  }

  /* 轻度锐化：只补边缘，不放大噪声；amount 可按模糊程度调，不增加遍历成本 */
  function sharpen(gray, w, h, amount) {
    var k = amount === undefined ? 0.55 : amount;
    var out = new Uint8Array(gray.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        var c = gray[i];
        var l = x > 0 ? gray[i - 1] : c;
        var r = x < w - 1 ? gray[i + 1] : c;
        var u = y > 0 ? gray[i - w] : c;
        var d = y < h - 1 ? gray[i + w] : c;
        var v = c + k * (c - (l + r + u + d) / 4);
        out[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
      }
    }
    return out;
  }

  /* 一次采样同时得到边缘强度、均值与标准差：模糊看 lap 低，低对比看 std 小，反光看 mean 高 */
  function analyzeGray(gray, w, h) {
    var sum = 0, sum2 = 0, lsum = 0, lsum2 = 0, n = 0;
    for (var y = 1; y < h - 1; y += 2) {
      for (var x = 1; x < w - 1; x += 2) {
        var i = y * w + x;
        var g0 = gray[i];
        sum += g0; sum2 += g0 * g0;
        var lap = 4 * g0 - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        lsum += lap; lsum2 += lap * lap; n++;
      }
    }
    if (!n) return { lap: 0, mean: 0, std: 0 };
    var mean = sum / n;
    var lmean = lsum / n;
    return {
      lap: Math.max(0, lsum2 / n - lmean * lmean),
      mean: mean,
      std: Math.sqrt(Math.max(0, sum2 / n - mean * mean))
    };
  }

  function grayToRGBA(g) {
    var out = new Uint8ClampedArray(g.length * 4);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) {
      out[j] = out[j + 1] = out[j + 2] = g[i];
      out[j + 3] = 255;
    }
    return out;
  }

  /* 局部自适应阈值：积分图 O(n)，对反光与不均匀照明更稳 */
  function adaptive(gray, w, h, block, C) {
    var iw = w + 1, integral = new Float64Array(iw * (h + 1));
    for (var y = 0; y < h; y++) {
      var row = 0;
      for (var x = 0; x < w; x++) {
        row += gray[y * w + x];
        integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + row;
      }
    }
    var r = Math.max(1, Math.floor(block / 2));
    var out = new Uint8ClampedArray(w * h * 4);
    for (var yy = 0; yy < h; yy++) {
      var y1 = Math.max(0, yy - r), y2 = Math.min(h - 1, yy + r);
      for (var xx = 0; xx < w; xx++) {
        var x1 = Math.max(0, xx - r), x2 = Math.min(w - 1, xx + r);
        var count = (x2 - x1 + 1) * (y2 - y1 + 1);
        var sum = integral[(y2 + 1) * iw + (x2 + 1)] - integral[y1 * iw + (x2 + 1)] -
          integral[(y2 + 1) * iw + x1] + integral[y1 * iw + x1];
        var v = gray[yy * w + xx] > (sum / count - C) ? 255 : 0;
        var o = (yy * w + xx) * 4;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  function meanThresh(gray, delta) {
    var sum = 0;
    for (var i = 0; i < gray.length; i++) sum += gray[i];
    var t = sum / gray.length + (delta || 0);
    var out = new Uint8ClampedArray(gray.length * 4);
    for (var k = 0, j = 0; k < gray.length; k++, j += 4) {
      var v = gray[k] > t ? 255 : 0;
      out[j] = out[j + 1] = out[j + 2] = v;
      out[j + 3] = 255;
    }
    return out;
  }

  /* 按列归一化：反光多是竖向条带，把每列自己的黑/白参考拉回 0~255，压平的灰阶重新拉开 */
  function normColumns(gray, w, h) {
    var out = new Uint8Array(gray.length);
    for (var x = 0; x < w; x++) {
      var hist = new Uint32Array(256);
      for (var y = 0; y < h; y++) hist[gray[y * w + x]]++;
      var lo = 0, hi = 255, acc = 0, n = h;
      for (var i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.08) { lo = i; break; } }
      acc = 0;
      for (var j = 255; j >= 0; j--) { acc += hist[j]; if (acc >= n * 0.08) { hi = j; break; } }
      var span = hi - lo;
      for (var yy = 0; yy < h; yy++) {
        var v = gray[yy * w + x];
        out[yy * w + x] = span < 12 ? v : Math.max(0, Math.min(255, Math.round((v - lo) * 255 / span)));
      }
    }
    return out;
  }

  function jsQr(data, w, h) {
    if (typeof global.jsQR !== 'function' || !data) return '';
    var r = global.jsQR(data, w, h, { inversionAttempts: 'attemptBoth' });
    return r && r.data ? r.data : '';
  }

  /* 阈值参数组：block 用占裁剪宽度的比例（窗口需覆盖 5~7 个模块，固定像素在放大后会被单模块“带跑偏”）；
     C 偏小，才能在「反光压平的 10 级灰阶」与「低对比淡印」里保住模块黑白差 */
  var VARIANTS = [
    { kind: 'adaptive', frac: 0.18, C: 10 },
    { kind: 'adaptiveRaw', frac: 0.18, C: 4 },
    { kind: 'columnNorm' },
    { kind: 'adaptive', frac: 0.12, C: 8 },
    { kind: 'sharpen', frac: 0.18, C: 10, amount: 0.85 },
    { kind: 'adaptive', frac: 0.28, C: 14 },
    { kind: 'columnNormAdaptive', frac: 0.18, C: 10 },
    { kind: 'meanRaw', delta: -15 }
  ];
  /* 视频帧轮转尺度：每帧只解一次，命中即停 */
  var VIDEO_SCALES = [0.72, 0.5, 0.36, 0.9];

  function applyVariant(gray, w, h, variant) {
    var block = variant.frac ? Math.max(9, Math.round(w * variant.frac)) : (variant.block || 41);
    if (variant.kind === 'meanRaw') return meanThresh(gray, variant.delta);
    /* adaptiveRaw：不拉伸直接局部阈值，保反光区那点残余灰阶差 */
    if (variant.kind === 'adaptiveRaw') return adaptive(gray, w, h, block, variant.C);
    if (variant.kind === 'columnNorm') return grayToRGBA(normColumns(gray, w, h));
    if (variant.kind === 'columnNormAdaptive') return adaptive(normColumns(gray, w, h), w, h, block, variant.C);
    var base = stretch(gray);
    if (variant.kind === 'sharpen') return adaptive(sharpen(base, w, h, variant.amount), w, h, block, variant.C);
    if (variant.kind === 'mean') return meanThresh(base, variant.delta);
    return adaptive(base, w, h, block, variant.C);
  }

  /* 按画面特征挑一组：每帧仍然只解一次，只是把这一次放到最可能命中的组合上 */
  function pickVariant(info) {
    if (info.std < 25) return VARIANTS[7];       // 低对比淡印：原始灰度更容易保住模块差
    if (info.lap < 30) return VARIANTS[4];       // 模糊：提高锐化强度后再阈值
    if (info.mean > 185) return VARIANTS[2];     // 反光偏亮：按列把黑白参考拉回来
    return VARIANTS[0];
  }

  function decodeCropped(part, variant) {
    if (!part) return '';
    var img = part.ctx.getImageData(0, 0, part.w, part.h);
    var data = img.data;
    var raw = jsQr(data, part.w, part.h);
    if (raw) return raw;
    var gray = toGray(data, part.w, part.h);
    if (analyzeGray(gray, part.w, part.h).lap < 2) return '';
    return jsQr(applyVariant(gray, part.w, part.h, variant), part.w, part.h);
  }

  function nativeDecode(source) {
    return getDetector().then(function (d) { return d.detect(source); }).then(function (codes) {
      if (!codes || !codes.length) throw new Error('empty');
      return { text: codes[0].rawValue, format: codes[0].format || '' };
    });
  }

  function nativeVideoFrame(video, frame) {
    if (detectorState.checked && !detectorState.detector) return Promise.resolve(null);
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return Promise.resolve(null);
    var rect = centerRect(vw, vh, 0.72);
    var part = crop(video, rect.x, rect.y, rect.w, rect.h, 1280, 2);
    if (!part) return Promise.resolve(null);
    return nativeDecode(part.canvas).then(function (hit) {
      /* 中心 ROI 命中后回全帧确认，确认失败仍接受 ROI 结果 */
      return nativeDecode(video).then(function (full) {
        return { text: full.text || hit.text, method: 'native', confirmed: true, frame: frame };
      }).catch(function () {
        return { text: hit.text, method: 'native', confirmed: false, frame: frame };
      });
    }).catch(function () { return null; });
  }

  /* 同一标签连续出现时，下一帧优先复用上次成功的尺度与参数，缩短重复出码时间 */
  var lastHit = null;

  function decodeVideoFrame(video, opts) {
    opts = opts || {};
    var frame = opts.frame || 0;
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return Promise.resolve(null);
    var started = Date.now();

    return nativeVideoFrame(video, frame).then(function (hit) {
      if (hit) return hit;
      var reuse = lastHit && frame % 2 === 0;
      var scale = reuse ? lastHit.scale : VIDEO_SCALES[frame % VIDEO_SCALES.length];
      var rect = centerRect(vw, vh, scale);
      var target = scale <= 0.4 ? 980 : 960;
      var part = pad(crop(video, rect.x, rect.y, rect.w, rect.h, target, 3), 0.08);
      if (!part) return null;
      var data = part.ctx.getImageData(0, 0, part.w, part.h).data;
      var raw = jsQr(data, part.w, part.h);
      if (raw) {
        lastHit = { scale: scale, variant: VARIANTS[0] };
        return { text: raw, method: 'jsqr-raw', frame: frame, ms: Date.now() - started, region: scale };
      }
      var gray = toGray(data, part.w, part.h);
      var info = analyzeGray(gray, part.w, part.h);
      if (info.lap < 2) return null;
      var variant = reuse ? lastHit.variant : pickVariant(info);
      var txt = jsQr(applyVariant(gray, part.w, part.h, variant), part.w, part.h);
      if (txt) {
        lastHit = { scale: scale, variant: variant };
        return { text: txt, method: 'jsqr', variant: variant.kind, frame: frame, ms: Date.now() - started, region: scale };
      }
      if (frame % 4 === 0) {
        var full = crop(video, 0, 0, vw, vh, 1280, 1.2);
        var fullRaw = full ? jsQr(full.ctx.getImageData(0, 0, full.w, full.h).data, full.w, full.h) : '';
        if (fullRaw) return { text: fullRaw, method: 'jsqr-full', frame: frame, ms: Date.now() - started };
      }
      return null;
    });
  }

  /* 图片是一次性任务：按同一份画面特征排出阈值优先级，再跨尺度尝试 */
  function imagePlan(info) {
    var order = [];
    function push(i) { if (order.indexOf(i) < 0) order.push(i); }
    if (info.std < 25) { push(7); push(1); }
    else if (info.lap < 30) { push(4); push(3); }
    else if (info.mean > 185) { push(2); push(6); }
    else { push(0); push(3); }
    for (var i = 0; i < VARIANTS.length; i++) push(i);
    return order;
  }

  function decodeImage(img) {
    var started = Date.now();
    var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    return nativeDecode(img).then(function (hit) {
      return { text: hit.text, method: 'native', confirmed: true, ms: Date.now() - started };
    }).catch(function () {
      if (typeof global.jsQR !== 'function') throw new Error('当前浏览器不支持二维码识别');
      var budget = 30;
      var shortSide = Math.min(nw, nh);
      /* 先看中心 ROI 的画面特征，再决定尺度顺序与阈值优先级 */
      var probeRect = centerRect(nw, nh, 0.72);
      var probe = crop(img, probeRect.x, probeRect.y, probeRect.w, probeRect.h, 900, 3);
      var info = { lap: 99, mean: 128, std: 99 };
      if (probe) {
        var pdata = probe.ctx.getImageData(0, 0, probe.w, probe.h).data;
        /* 干净二维码直接出结果，避免为分析特征多花时间 */
        var praw = jsQr(pdata, probe.w, probe.h);
        if (praw) return { text: praw, method: 'jsqr-raw', ms: Date.now() - started, region: 0.72 };
        info = analyzeGray(toGray(pdata, probe.w, probe.h), probe.w, probe.h);
      }
      var plan = imagePlan(info);
      var scales = info.std < 25 ? [0.9, 0.72, 0.5, 0.36] : [0.72, 0.9, 0.5, 0.36];
      for (var s = 0; s < scales.length && budget > 0; s++) {
        var rect = centerRect(nw, nh, scales[s]);
        var part = pad(crop(img, rect.x, rect.y, rect.w, rect.h, scales[s] <= 0.4 ? 1000 : 900, 3), 0.1);
        if (!part) continue;
        for (var k = 0; k < 2 && budget > 0; k++) {
          budget--;
          var variant = VARIANTS[plan[(s * 2 + k) % plan.length]];
          var txt = decodeCropped(part, variant);
          if (txt) return { text: txt, method: 'jsqr', variant: variant.kind, ms: Date.now() - started, region: scales[s] };
        }
      }
      var full = crop(img, 0, 0, nw, nh, 1400, 1.2);
      if (full && budget > 0) {
        budget--;
        var raw = jsQr(full.ctx.getImageData(0, 0, full.w, full.h).data, full.w, full.h);
        if (raw) return { text: raw, method: 'jsqr-full', ms: Date.now() - started };
      }
      /* 滑窗兜底：只做原始解码，避免大图反复阈值化 */
      var win = shortSide * 0.45;
      var xs = [0, (nw - win) / 2, nw - win], ys = [0, (nh - win) / 2, nh - win];
      for (var xi = 0; xi < xs.length && budget > 0; xi++) {
        for (var yi = 0; yi < ys.length && budget > 0; yi++) {
          budget--;
          var wpart = crop(img, xs[xi], ys[yi], win, win, 820, 2.4);
          var wraw = wpart ? jsQr(wpart.ctx.getImageData(0, 0, wpart.w, wpart.h).data, wpart.w, wpart.h) : '';
          if (wraw) return { text: wraw, method: 'jsqr-window', ms: Date.now() - started };
        }
      }
      throw new Error('未识别到二维码：请靠近拍摄、避开反光/褶皱，让二维码填满取景框；或先把照片裁切到二维码附近再上传');
    });
  }

  global.ScanEngine = {
    formats: FORMATS,
    supportedFormats: function () { return detectorState.formats.slice(); },
    hasDetector: function () { return !!detectorState.detector; },
    decodeVideoFrame: decodeVideoFrame,
    decodeImage: decodeImage
  };
})(window);
