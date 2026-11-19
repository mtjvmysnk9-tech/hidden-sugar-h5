/**
 * 共享内核：存储 · 标签换算 · 配料表解析 · 每日记录 · 词条(数据集) · 测评 · 导出 · 管理口令
 * 纯前端，无任何网络请求；数据只存在使用者本机。
 */
(function (root, factory) {
  var mod = factory(root.SugarData);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.SugarCore = mod;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {

  var K_PREFS = 'sg_prefs', K_DAILY = 'sg_daily', K_FOODS = 'sg_foods',
    K_PWD = 'sg_admin_pwd', K_SEED = 'sg_seed_ver', K_QUIZ = 'sg_quiz_log';
  var SEED_VER = 1;

  /* ------------------------------------------------------- Store */
  var mem = {};
  var hasLS = (function () {
    try { return !!(root.localStorage && 'setItem' in root.localStorage); } catch (e) { return false; }
  }());
  var Store = {
    get: function (k, dft) {
      var raw = hasLS ? localStorage.getItem(k) : mem[k];
      if (raw === undefined || raw === null) return dft;
      try { return JSON.parse(raw); } catch (e) { return dft; }
    },
    set: function (k, v) {
      var raw = JSON.stringify(v);
      if (hasLS) localStorage.setItem(k, raw); else mem[k] = raw;
    },
    remove: function (k) { if (hasLS) localStorage.removeItem(k); delete mem[k]; },
    keys: function () {
      if (!hasLS) return Object.keys(mem);
      var out = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('sg_') === 0) out.push(k); }
      return out;
    },
    clearAll: function () { Store.keys().forEach(Store.remove); }
  };

  function today(offset) {
    var d = new Date();
    if (offset) d.setDate(d.getDate() - offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function round(n, p) { var m = Math.pow(10, p == null ? 1 : p); return Math.round((+n || 0) * m) / m; }
  function hash(s) {
    var h = 5381, str = 'sg$' + s;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
  }

  /* ------------------------------------------------------- 偏好 */
  var Prefs = {
    load: function () {
      var p = Store.get(K_PREFS, null);
      if (!p) {
        p = { nickname: '', ideal: D.STANDARDS.DRI.addedSugarIdeal, max: D.STANDARDS.DRI.addedSugarMax,
          energyKj: D.STANDARDS.ENERGY_NRV_KJ, sugarShare: 50, lastState: 'solid' };
      }
      return p;
    },
    save: function (p) { Store.set(K_PREFS, p); }
  };

  /* ------------------------------------------------------- 换算 */
  var Calc = {
    kjToKcal: function (kj) { return round((+kj || 0) / D.STANDARDS.KJ_PER_KCAL, 0); },
    /** 每 100g(mL) 的糖 → 一份的糖 */
    perServing: function (per100, portion) { return round((+per100 || 0) * (+portion || 0) / 100, 1); },
    cubes: function (g) { return round((+g || 0) / D.STANDARDS.CUBE_G, 1); },
    pct: function (g, base) { return Math.round((+g || 0) / (+base || 1) * 100); },
    /** 声称合规判定：按 g/100g(固体) 或 g/100mL(液体) 同一阈值；无数据不下结论 */
    claim: function (sugarPer100) {
      var blank = sugarPer100 === null || sugarPer100 === undefined || sugarPer100 === '' || isNaN(+sugarPer100);
      if (blank) return { sugarFree: false, lowSugar: false, unknown: true, text: '无糖数值，无法判定能否声称' };
      var s = +sugarPer100;
      var free = s <= D.STANDARDS.GB28050.claims.sugarFree.max;
      var low = s <= D.STANDARDS.GB28050.claims.lowSugar.max;
      return { sugarFree: free, lowSugar: low, unknown: false,
        text: free ? '达到"无糖/0 糖"声称门槛（≤0.5）' : (low ? '达到"低糖"声称门槛（≤5）' : '不符合"低糖""无糖"声称条件') };
    },
    /** 标签行解析 → 结论对象；糖行缺失时只做区间假设，不冒充实测值 */
    fromLabel: function (inp) {
      var portion = +inp.portion || 0;
      var has = inp.sugarPer100 !== null && inp.sugarPer100 !== undefined && inp.sugarPer100 !== '' && !isNaN(+inp.sugarPer100);
      var carb = (inp.carbPer100 === '' || inp.carbPer100 == null || isNaN(+inp.carbPer100)) ? null : +inp.carbPer100;
      var fiber = (inp.fiberPer100 === '' || inp.fiberPer100 == null || isNaN(+inp.fiberPer100)) ? null : +inp.fiberPer100;
      var kj = (inp.energyKjPer100 === '' || inp.energyKjPer100 == null || isNaN(+inp.energyKjPer100)) ? null : +inp.energyKjPer100;
      var p = Prefs.load();
      var est = null, sugarPer100 = null, estimated = false;

      if (has) sugarPer100 = +inp.sugarPer100;
      else if (carb !== null) {
        var avail = fiber === null ? carb : Math.max(0, carb - fiber);
        est = round(avail * (+inp.share || p.sugarShare) / 100, 1);
        sugarPer100 = est; estimated = true;
      }
      var g = sugarPer100 === null ? null : Calc.perServing(sugarPer100, portion);
      var parsed = inp.ingText ? Parser.parseIngredients(inp.ingText) : null;
      return {
        state: inp.state || 'solid', portion: portion, hasSugarLine: has, estimated: estimated,
        sugarPer100: sugarPer100, assumeShare: estimated ? (+inp.share || p.sugarShare) : null,
        servingSugar: g, cubes: g === null ? null : Calc.cubes(g),
        pctIdeal: g === null ? null : Calc.pct(g, p.ideal), pctMax: g === null ? null : Calc.pct(g, p.max),
        kcal100: kj === null ? null : Calc.kjToKcal(kj),
        kcalServing: kj === null ? null : round(Calc.kjToKcal(kj) * portion / 100, 0),
        nrvPct: kj === null ? null : Calc.pct(kj, D.STANDARDS.ENERGY_NRV_KJ),
        sugarKcal: g === null ? null : round(g * D.STANDARDS.KCAL_PER_SUGAR_G, 0),
        claim: Calc.claim(sugarPer100), ingredients: parsed
      };
    },
    /** 敏感性区间：糖占可利用碳水 0/25/50/75/100% 时每份克数 */
    range: function (carbPer100, fiber, portion, share) {
      var avail = (+carbPer100 || 0) - (+fiber || 0);
      if (avail < 0) avail = 0;
      return [0, 25, 50, 75, 100].map(function (s) {
        return { share: s, per100: round(avail * s / 100, 1), serving: round(avail * s / 100 * (+portion || 0) / 100, 1) };
      });
    }
  };

  /* ------------------------------------------------------- 配料表解析 */
  var Parser = {
    /** 取包含关系中最长的词表项，避免"三氯蔗糖"被当成"蔗糖"、"低聚果糖"被当成"果糖" */
    findTerm: function (token) {
      var t = String(token || '').trim(), best = null;
      if (!t) return null;
      for (var i = 0; i < D.TERMS.length; i++) {
        if (t.indexOf(D.TERMS[i].term) >= 0 && (!best || D.TERMS[i].term.length > best.term.length)) best = D.TERMS[i];
      }
      return best;
    },
    split: function (text) {
      return String(text || '').replace(/^.{0,8}配料(表)?\s*[:：]/i, '')
        .split(/[、,，;；\/\|\s]+/).map(function (s) { return s.replace(/[（(].*?[)）]/g, '').trim(); })
        .filter(function (s) { return s.length > 0 && s !== '及' && s !== '等'; });
    },
    parseIngredients: function (text) {
      var toks = Parser.split(text), hits = [],
        ranks = { added: [], juice: [], polyol: [], sweetener: [], fastcarb: [], oligo: [] };
      toks.forEach(function (tok, idx) {
        var hit = Parser.findTerm(tok);
        if (!hit) return;
        var item = { term: hit.term, kind: hit.kind, note: hit.note, position: idx + 1, token: tok,
          top3: idx < 3, total: toks.length };
        hits.push(item);
        if (ranks[hit.kind]) ranks[hit.kind].push(item);
      });
      var addedAll = ranks.added.concat(ranks.juice);
      var top3Added = addedAll.some(function (h) { return h.top3; });
      var level, reasons = [];
      if (!addedAll.length && !ranks.fastcarb.length) { level = '未见糖源'; reasons.push('配料表里没有匹配到已收录的糖源词，仍建议核对营养标签"糖"一行'); }
      else if (top3Added) { level = '高'; reasons.push('糖源出现在配料表前三位（加入量靠前）'); }
      else if (addedAll.length >= 2) { level = '中高'; reasons.push('同时使用了 ' + addedAll.length + ' 种糖源，存在叠加效应'); }
      else { level = '中'; reasons.push('含 ' + addedAll.map(function (h) { return h.term; }).join('、') + '，位置靠后'); }
      if (ranks.polyol.length) reasons.push('另有糖醇：' + ranks.polyol.map(function (h) { return h.term; }).join('、') + '（不计入国标"糖"）');
      if (ranks.oligo.length) reasons.push('含 ' + ranks.oligo.map(function (h) { return h.term; }).join('、') + '：寡糖，多按膳食纤维标示，不计入"糖"');
      if (ranks.sweetener.length) reasons.push('另有甜味剂：' + ranks.sweetener.map(function (h) { return h.term; }).join('、'));
      if (ranks.fastcarb.length) reasons.push('含 ' + ranks.fastcarb.map(function (h) { return h.term; }).join('、') + '：不是糖但升糖快，不占"糖"这一行');
      var masks = Parser.detectClaims(text);
      return { tokens: toks, hits: hits, ranks: ranks, added: addedAll, level: level, reasons: reasons, masks: masks };
    },
    detectClaims: function (text) {
      var s = String(text || '').replace(/\s/g, '');
      return D.MASKS.filter(function (m) { return s.indexOf(m.claim.replace(/\s/g, '')) >= 0; });
    }
  };

  /* ------------------------------------------------------- 词条 = 数据集 */
  var Catalog = {
    custom: function () { return Store.get(K_FOODS, []); },
    all: function () {
      var merged = D.SEEDS.slice();
      Catalog.custom().forEach(function (c) {
        var i = -1;
        merged.forEach(function (m, j) { if (m.id === c.id) i = j; });
        if (i >= 0) merged[i] = c; else merged.push(c);
      });
      return merged;
    },
    get: function (id) {
      var out = null;
      Catalog.all().forEach(function (f) { if (f.id === id) out = f; });
      return out;
    },
    save: function (f) {
      var list = Catalog.custom();
      if (!f.id) f.id = 'c' + Date.now().toString(36);
      f.origin = 'measured'; f.level = '标签实测录入'; f.updatedAt = Date.now();
      var found = false;
      list = list.map(function (x) { if (x.id === f.id) { found = true; return f; } return x; });
      if (!found) list.push(f);
      Store.set(K_FOODS, list);
      return f;
    },
    remove: function (id) {
      Store.set(K_FOODS, Catalog.custom().filter(function (x) { return x.id !== id; }));
    },
    search: function (kw) {
      var k = String(kw || '').trim().toLowerCase();
      var all = Catalog.all();
      if (!k) return all;
      return all.filter(function (f) {
        return (f.name + ' ' + (f.brand || '') + ' ' + (f.cat || '')).toLowerCase().indexOf(k) >= 0;
      });
    }
  };

  /* ------------------------------------------------------- 每日记录 */
  var Daily = {
    list: function () { return Store.get(K_DAILY, []); },
    add: function (r) {
      var list = Daily.list();
      r.id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 900 + 100);
      r.date = r.date || today();
      r.createdAt = Date.now();
      list.push(r);
      Store.set(K_DAILY, list);
      return r;
    },
    remove: function (id) { Store.set(K_DAILY, Daily.list().filter(function (r) { return r.id !== id; })); },
    ofDate: function (date) { return Daily.list().filter(function (r) { return r.date === date; }); },
    summary: function (date) {
      var sum = { sugar: 0, kcal: 0, count: 0 };
      Daily.ofDate(date).forEach(function (r) {
        sum.sugar += (+r.sugar || 0); sum.kcal += (+r.kcal || 0); sum.count++;
      });
      sum.sugar = round(sum.sugar, 1);
      return sum;
    },
    trend: function (days) {
      var out = [];
      for (var i = days - 1; i >= 0; i--) { var d = today(i); var s = Daily.summary(d); out.push({ date: d, sugar: s.sugar, count: s.count }); }
      return out;
    },
    streak: function () {
      var n = 0;
      for (var i = 0; i < 400; i++) {
        if (Daily.summary(today(i)).count > 0) n++;
        else if (i === 0) continue;
        else break;
      }
      return n;
    }
  };

  /* ------------------------------------------------------- 测评 */
  var Quiz = {
    build: function (n) {
      var pool = D.QUIZ.slice();
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      return pool.slice(0, Math.min(n || 8, pool.length));
    },
    grade: function (set, answers) {
      var right = 0, wrong = [];
      set.forEach(function (q, i) {
        if (+answers[i] === q.a) right++;
        else wrong.push({ i: i, q: q.q, chosen: answers[i] == null ? null : q.opts[answers[i]], right: q.opts[q.a], why: q.why, std: q.std });
      });
      return { right: right, total: set.length, score: Math.round(right / set.length * 100), wrong: wrong };
    },
    log: function (r) {
      var l = Store.get(K_QUIZ, []);
      l.push({ date: today(), score: r.score, right: r.right, total: r.total, at: Date.now() });
      Store.set(K_QUIZ, l.slice(-50));
    },
    history: function () { return Store.get(K_QUIZ, []); }
  };

  /* ------------------------------------------------------- 导出（数据集交付物） */
  var Export = {
    CSV_HEADER: ['编号', '品牌', '产品', '类别', '形态', '每100g基准糖', '每100g碳水', '每100g膳食纤维',
      '每100g能量kJ', '份量', '糖/份g', '方糖块数', '占25g额度%', '配料表原文', '照片文件名', '录入人',
      '数据性质', '来源链接', '录入时间'],
    csv: function () {
      var rows = Catalog.all().map(function (f) {
        var one = f.sugarPer100 != null ? Calc.perServing(f.sugarPer100, f.portion || 100) : '';
        return [f.id, f.brand || '', f.name, f.cat || '', f.state === 'liquid' ? '液体' : '固体',
          f.sugarPer100 == null ? '' : f.sugarPer100, f.carbPer100 == null ? '' : f.carbPer100,
          f.fiberPer100 == null ? '' : f.fiberPer100, f.energyKjPer100 == null ? '' : f.energyKjPer100,
          f.portion || '', one, one === '' ? '' : Calc.cubes(one),
          one === '' ? '' : Calc.pct(one, Prefs.load().ideal),
          (f.ingText || '').replace(/[\r\n]/g, ' '), f.photoFile || '', f.annotator || '',
          f.level || '', f.src || '', f.updatedAt ? new Date(f.updatedAt).toLocaleString('zh-CN') : ''];
      });
      return Export.toCsv([Export.CSV_HEADER].concat(rows));
    },
    dailyCsv: function () {
      var rows = Daily.list().map(function (r) {
        return [r.date, r.name, r.sugar == null ? '' : r.sugar, r.kcal == null ? '' : r.kcal,
          r.portion || '', r.source || '', r.note || '', new Date(r.createdAt).toLocaleString('zh-CN')];
      });
      return Export.toCsv([['日期', '记录对象', '添加糖g', '能量kcal', '份量', '来源', '备注', '时间']].concat(rows));
    },
    json: function () {
      return JSON.stringify({ exportedAt: new Date().toISOString(), standard: D.STANDARDS,
        seedVer: SEED_VER, count: Catalog.all().length, items: Catalog.all() }, null, 2);
    },
    toCsv: function (rows) {
      return rows.map(function (r) {
        return r.map(function (c) {
          var s = String(c == null ? '' : c);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      }).join('\r\n');
    },
    /** 数据集进度：目标 300–500 条 */
    progress: function () {
      var all = Catalog.all(), measured = all.filter(function (f) { return f.origin === 'measured'; });
      var withPhoto = measured.filter(function (f) { return !!f.photoFile; });
      var withIng = measured.filter(function (f) { return !!(f.ingText && f.ingText.length > 3); });
      return { total: all.length, measured: measured.length, withPhoto: withPhoto.length,
        withIng: withIng.length, target: 300 };
    }
  };

  /* ------------------------------------------------------- 管理口令（不内置默认值） */
  var Admin = {
    ready: function () { return !!Store.get(K_PWD, null); },
    set: function (pwd, confirm) {
      if (String(pwd || '').length < 6) return { ok: false, msg: '管理口令至少 6 位' };
      if (pwd !== confirm) return { ok: false, msg: '两次输入不一致' };
      Store.set(K_PWD, hash(pwd));
      return { ok: true, msg: '管理口令已设定' };
    },
    check: function (pwd) {
      var h = Store.get(K_PWD, null);
      return !!h && h === hash(String(pwd || ''));
    }
  };

  return { D: D, Store: Store, Prefs: Prefs, Calc: Calc, Parser: Parser, Catalog: Catalog,
    Daily: Daily, Quiz: Quiz, Export: Export, Admin: Admin, today: today, round: round, hash: hash,
    SEED_VER: SEED_VER };
}));
