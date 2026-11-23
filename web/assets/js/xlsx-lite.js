/* xlsx-lite.js — 轻量 xlsx 解析（仅读取首个工作表）
 * 依赖浏览器/运行时自带的 DecompressionStream('deflate-raw') 与 TextDecoder：
 * 不依赖 JSZip / SheetJS，也不需要后端 zip 扩展。若浏览器不支持，会给出明确提示。
 * 仅解析单元格值（内联字符串 / 共享字符串 / 数字 / 布尔），不解析样式与公式。
 */
(function (global) {
  'use strict';

  function readU16(u, o) { return u[o] | (u[o + 1] << 8); }
  function readU32(u, o) {
    return (u[o] | (u[o + 1] << 8) | (u[o + 2] << 16) | (u[o + 3] << 24)) >>> 0;
  }
  function decode(u) { return new TextDecoder('utf-8').decode(u); }

  function findEOCD(u) {
    for (var i = u.length - 22; i >= 0; i--) {
      if (u[i] === 0x50 && u[i + 1] === 0x4b && u[i + 2] === 0x05 && u[i + 3] === 0x06) return i;
    }
    return -1;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined' || typeof Blob === 'undefined' || typeof Response === 'undefined') {
      return Promise.reject(new Error('当前浏览器不支持解压 xlsx（缺少 DecompressionStream）。请使用最新版 Chrome / Edge 打开，或改用 CSV 导入。'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  /* 读取 ZIP 中央目录，返回按文件名取内容的异步方法 */
  function unzip(arrayBuffer) {
    var u = new Uint8Array(arrayBuffer);
    var eocd = findEOCD(u);
    if (eocd < 0) return Promise.reject(new Error('文件不是有效的 xlsx（未找到 ZIP 结束标记）'));
    var count = readU16(u, eocd + 10);
    var cdOff = readU32(u, eocd + 16);
    var files = {};
    var p = cdOff;
    for (var i = 0; i < count; i++) {
      if (p + 46 > u.length || readU32(u, p) !== 0x02014b50) break;
      var method = readU16(u, p + 10);
      var csize = readU32(u, p + 20);
      var nlen = readU16(u, p + 28);
      var elen = readU16(u, p + 30);
      var clen = readU16(u, p + 32);
      var lho = readU32(u, p + 42);
      var name = decode(u.subarray(p + 46, p + 46 + nlen));
      files[name] = { method: method, csize: csize, lho: lho };
      p += 46 + nlen + elen + clen;
    }
    if (!files['xl/workbook.xml']) {
      return Promise.reject(new Error('文件不是有效的 xlsx（缺少 workbook.xml）'));
    }
    function get(name) {
      var f = files[name];
      if (!f) return Promise.resolve(null);
      var l = f.lho;
      if (readU32(u, l) !== 0x04034b50) return Promise.reject(new Error('xlsx 内部结构损坏：' + name));
      var nlen = readU16(u, l + 26);
      var elen = readU16(u, l + 28);
      var start = l + 30 + nlen + elen;
      var data = u.subarray(start, start + f.csize);
      if (f.method === 0) return Promise.resolve(decode(data));
      if (f.method === 8) return inflateRaw(data).then(decode);
      return Promise.reject(new Error('不支持的压缩方式：' + f.method));
    }
    return Promise.resolve({ get: get });
  }

  function xmlText(s) {
    return String(s || '')
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  function attr(attrs, name) {
    var m = new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(attrs || '');
    return m ? m[1] : '';
  }

  function collectT(inner) {
    var re = /<(?:[A-Za-z0-9_]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t>/g;
    var out = '';
    var m;
    while ((m = re.exec(inner))) out += xmlText(m[1]);
    if (!out) {
      var plain = inner.replace(/<[^>]+>/g, '');
      out = xmlText(plain);
    }
    return out;
  }

  function parseShared(xml) {
    var list = [];
    var re = /<(?:[A-Za-z0-9_]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?si>/g;
    var m;
    while ((m = re.exec(xml))) list.push(collectT(m[1]));
    return list;
  }

  function colIndex(ref) {
    var m = /^([A-Za-z]+)/.exec(ref || '');
    if (!m) return -1;
    var s = m[1].toUpperCase();
    var n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function cellValue(attrs, inner, shared) {
    var t = attr(attrs, 't');
    if (t === 'inlineStr') {
      var is = /<(?:[A-Za-z0-9_]+:)?is\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?is>/.exec(inner);
      return is ? collectT(is[1]) : '';
    }
    var vm = /<(?:[A-Za-z0-9_]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?v>/.exec(inner);
    var raw = vm ? xmlText(vm[1]) : '';
    if (t === 's') {
      var idx = parseInt(raw, 10);
      return (!isNaN(idx) && shared[idx] !== undefined) ? shared[idx] : '';
    }
    if (t === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
    if (t === 'e') return '';
    return raw;
  }

  function parseSheet(xml, shared) {
    var rows = [];
    var rowRe = /<(?:[A-Za-z0-9_]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?row>/g;
    var rm;
    var seq = 0;
    while ((rm = rowRe.exec(xml))) {
      seq++;
      var rIdx = parseInt(attr(rm[1], 'r'), 10);
      if (isNaN(rIdx)) rIdx = seq;
      var cells = [];
      var cellRe = /<(?:[A-Za-z0-9_]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?c>)/g;
      var cm;
      var cSeq = 0;
      while ((cm = cellRe.exec(rm[2]))) {
        var ci = colIndex(attr(cm[1], 'r'));
        if (ci < 0) ci = cSeq;
        cSeq++;
        cells[ci] = cellValue(cm[1], cm[2] || '', shared || []);
      }
      for (var k = 0; k < cells.length; k++) if (cells[k] === undefined) cells[k] = '';
      rows[rIdx - 1] = cells;
    }
    for (var q = 0; q < rows.length; q++) if (!rows[q]) rows[q] = [];
    return rows;
  }

  function normalizePath(target) {
    var t = String(target || '').replace(/^\/+/, '');
    if (t.indexOf('xl/') === 0) return t;
    return 'xl/' + t;
  }

  /* 解析工作簿：resolve({ sheets: [{ name, rows }] }) */
  function parse(arrayBuffer) {
    return unzip(arrayBuffer).then(function (z) {
      return z.get('xl/workbook.xml').then(function (wbXml) {
        return Promise.all([z.get('xl/_rels/workbook.xml.rels'), z.get('xl/sharedStrings.xml')]).then(function (r) {
          var relsXml = r[0] || '';
          var shared = r[1] ? parseShared(r[1]) : [];
          var relMap = {};
          var relRe = /<(?:[A-Za-z0-9_]+:)?Relationship\b([^>]*?)\/?>/g;
          var rm;
          while ((rm = relRe.exec(relsXml))) {
            var id = attr(rm[1], 'Id');
            var target = attr(rm[1], 'Target');
            if (id && target) relMap[id] = normalizePath(target);
          }
          var sheetDefs = [];
          var sheetRe = /<(?:[A-Za-z0-9_]+:)?sheet\b([^>]*?)\/?>/g;
          var sm;
          while ((sm = sheetRe.exec(wbXml))) {
            var name = xmlText(attr(sm[1], 'name'));
            var rid = attr(sm[1], 'r:id') || attr(sm[1], 'id');
            sheetDefs.push({ name: name, rid: rid });
          }
          if (!sheetDefs.length) throw new Error('xlsx 中没有工作表');
          return Promise.all(sheetDefs.map(function (sd, i) {
            var path = relMap[sd.rid] || ('xl/worksheets/sheet' + (i + 1) + '.xml');
            return z.get(path).then(function (xml) {
              if (!xml) throw new Error('找不到工作表：' + sd.name);
              return { name: sd.name, rows: parseSheet(xml, shared) };
            });
          })).then(function (sheets) {
            return { sheets: sheets };
          });
        });
      });
    });
  }

  /* ---------- 值归一 ---------- */
  function round2(n) { return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100; }
  function text(v) { return String(v === null || v === undefined ? '' : v).replace(/\u00a0/g, ' ').trim(); }
  function num(v) {
    var s = text(v).replace(/,/g, '');
    if (!s) return 0;
    var n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /* Excel 日期序列号 → YYYY-MM-DD */
  function normDate(v) {
    var s = text(v);
    if (!s) return '';
    if (/^\d+(\.\d+)?$/.test(s)) {
      var n = Number(s);
      if (n > 20000 && n < 80000) {
        var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
      }
    }
    var m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(s);
    if (!m) m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (!m) return '';
    var mo = Number(m[2]), da = Number(m[3]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return '';
    return m[1] + '-' + pad2(mo) + '-' + pad2(da);
  }

  /* 时间 → HH:MM；支持 "09:00"、"09:00:00"、0.375（Excel 时间小数） */
  function normTime(v) {
    var s = text(v);
    if (!s) return '';
    if (/^\d*\.\d+$/.test(s) || /^0?\.\d+$/.test(s)) {
      var fr = Number(s);
      if (fr >= 0 && fr < 1) {
        var mins = Math.round(fr * 1440) % 1440;
        return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
      }
    }
    var m = /(\d{1,2}):(\d{2})/.exec(s);
    if (!m) return '';
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return '';
    return pad2(h) + ':' + pad2(mi);
  }

  /* 薪资年月 → YYYY-MM；支持 202610、2026-10、2026/10、2026年10月 */
  function normMonth(v) {
    var s = text(v);
    if (!s) return '';
    var m = /^(\d{4})\s*[-/.年]?\s*(\d{1,2})\s*月?$/.exec(s);
    if (!m) return '';
    var mo = Number(m[2]);
    if (mo < 1 || mo > 12) return '';
    return m[1] + '-' + pad2(mo);
  }

  function headerMap(row) {
    var map = {};
    (row || []).forEach(function (v, i) {
      var k = text(v);
      if (k && map[k] === undefined) map[k] = i;
    });
    return map;
  }

  function findHeader(rows, required) {
    var limit = Math.min(rows.length, 30);
    for (var i = 0; i < limit; i++) {
      var row = rows[i] || [];
      var ok = required.every(function (name) {
        return row.some(function (v) { return text(v) === name; });
      });
      if (ok) return i;
    }
    return -1;
  }

  function pick(row, idx, name) {
    var i = idx[name];
    return i === undefined ? '' : row[i];
  }

  /* ---------- 考勤日报映射 ---------- */
  function mapAttendanceRows(rows) {
    var hi = findHeader(rows, ['工号', '姓名', '日期']);
    if (hi < 0) throw new Error('未找到考勤表头：需要包含「工号」「姓名」「日期」的列，请确认上传的是门店考勤日报');
    var idx = headerMap(rows[hi]);
    var list = [];
    var invalid = [];
    for (var r = hi + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var empNo = text(pick(row, idx, '工号'));
      var name = text(pick(row, idx, '姓名'));
      var rawDate = pick(row, idx, '日期');
      var date = normDate(rawDate);
      if (!empNo && !name && !text(rawDate)) continue;
      if (!empNo && !name) continue; /* 合计行 / 空行 */
      if (!date) {
        invalid.push({ row: r + 1, empNo: empNo, name: name, reason: '日期无法识别' });
        continue;
      }
      var dept = text(pick(row, idx, '所属部门'));
      var codeM = /^([A-Za-z0-9]{2,12})/.exec(dept);
      list.push({
        empNo: empNo,
        name: name,
        date: date,
        segmentNo: Math.max(1, parseInt(num(pick(row, idx, '班段')), 10) || 1),
        storeCode: codeM ? codeM[1] : '',
        storeName: dept,
        position: text(pick(row, idx, '岗位')),
        employmentType: text(pick(row, idx, '用工类型')),
        scheduleType: text(pick(row, idx, '排班类型')),
        plannedIn: normTime(pick(row, idx, '排班上班时间')),
        plannedOut: normTime(pick(row, idx, '排班下班时间')),
        plannedHours: round2(num(pick(row, idx, '排班时长'))),
        mealHours: round2(num(pick(row, idx, '排班就餐时长'))),
        plannedWorkHours: round2(num(pick(row, idx, '排班工时'))),
        clockIn: normTime(pick(row, idx, '打卡上班时间')),
        clockOut: normTime(pick(row, idx, '打卡下班时间')),
        confirmIn: normTime(pick(row, idx, '确认上班时间')),
        confirmOut: normTime(pick(row, idx, '确认下班时间')),
        confirmMealHours: round2(num(pick(row, idx, '确认就餐时长'))),
        actualHours: round2(num(pick(row, idx, '确认实际时长'))),
        hourDiff: round2(num(pick(row, idx, '确认工时差异'))),
        managerConfirm: text(pick(row, idx, '店长确认状态')),
        employeeConfirm: text(pick(row, idx, '员工确认状态'))
      });
    }
    return { rows: list, invalid: invalid, headerIndex: hi };
  }

  /* ---------- 工资明细报表映射 ---------- */
  function mapSalaryRows(rows) {
    var hi = findHeader(rows, ['工资年月', '工号', '姓名', '实发工资']);
    if (hi < 0) throw new Error('未找到薪资表头：需要包含「工资年月」「工号」「姓名」「实发工资」的列，请确认上传的是工资明细报表');
    var idx = headerMap(rows[hi]);
    var list = [];
    var invalid = [];
    for (var r = hi + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var empNo = text(pick(row, idx, '工号'));
      var name = text(pick(row, idx, '姓名'));
      var month = normMonth(pick(row, idx, '工资年月'));
      if (!empNo && !name) continue; /* 合计行 / 空行 */
      if (!month) {
        invalid.push({ row: r + 1, empNo: empNo, name: name, reason: '工资年月无法识别' });
        continue;
      }
      var payType = text(pick(row, idx, '薪酬类型'));
      var isHourly = payType.indexOf('时薪') >= 0;
      var baseStd = num(pick(row, idx, '基本工资标准'));
      var postStd = num(pick(row, idx, '岗位工资标准'));
      var hourlyRate = num(pick(row, idx, '时薪标准'));
      var totalHours = round2(num(pick(row, idx, '总工时')));
      var subtotal = num(pick(row, idx, '工资小计财务'));
      var late = num(pick(row, idx, '迟到扣款'));
      var diff = num(pick(row, idx, '出勤差额'));
      var base;
      if (isHourly || (!baseStd && !postStd)) {
        base = subtotal ? subtotal + late + diff : hourlyRate * totalHours;
        base = round2(base);
      } else {
        base = round2(baseStd);
      }
      var sourceNet = num(pick(row, idx, '实发工资'));
      list.push({
        empNo: empNo,
        name: name,
        month: month,
        payType: payType,
        shouldDays: round2(num(pick(row, idx, '本月标准核算天数'))),
        totalHours: totalHours,
        baseSalary: base,
        postAllowance: isHourly ? 0 : round2(postStd),
        performancePay: round2(num(pick(row, idx, '实发绩效工资'))),
        dailyOvertimePay: round2(num(pick(row, idx, '日常加班工资'))),
        statutoryHolidayPay: round2(num(pick(row, idx, '法定三薪'))),
        mealSubsidy: round2(num(pick(row, idx, '餐费补贴'))),
        attendanceSubsidy: round2(num(pick(row, idx, '出勤补贴'))),
        socialSubsidy: round2(num(pick(row, idx, '社保补贴'))),
        inventoryDeduction: round2(num(pick(row, idx, '盘点扣款'))),
        lateDeduction: round2(num(pick(row, idx, '迟到扣款'))),
        attendanceDiff: round2(num(pick(row, idx, '出勤差额'))),
        insurance: round2(num(pick(row, idx, '保险扣款'))),
        sourceNet: round2(sourceNet)
      });
    }
    return { rows: list, invalid: invalid, headerIndex: hi };
  }

  var XLite = {
    parse: parse,
    mapAttendanceRows: mapAttendanceRows,
    mapSalaryRows: mapSalaryRows,
    normDate: normDate,
    normTime: normTime,
    normMonth: normMonth,
    round2: round2
  };

  global.XLite = XLite;
  if (typeof module !== 'undefined' && module.exports) module.exports = XLite;
})(typeof window !== 'undefined' ? window : globalThis);
