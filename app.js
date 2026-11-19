/* 控糖有数 · 手机版逻辑：标签换算 / 配料表解析 / 数据集录入 / 每日记录 / 知识测评 */
(function () {
  var C = window.SugarCore, D = C.D;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function f1(n) { return n == null || isNaN(+n) ? '—' : (Math.round(+n * 10) / 10); }

  var S = {
    page: 'home', stack: [], prefs: C.Prefs.load(),
    form: { state: 'solid', base: 100, portion: 100, sugar: '', carb: '', fiber: '', kj: '', ing: '', share: C.Prefs.load().sugarShare },
    result: null, scanTab: 'label', kw: '', admin: false, editing: null,
    quiz: null, answers: [], qIdx: 0, day: 0
  };

  var TABS = [
    { k: 'home', t: '首页', d: 'M4 20h16M6 16V9m5 7V5m5 11v-5' },
    { k: 'scan', t: '解读', d: 'M4 7h16M4 12h10M4 17h7' },
    { k: 'data', t: '数据集', d: 'M4 6h16v12H4zM4 10h16' },
    { k: 'daily', t: '记录', d: 'M5 4h14v16H5zM9 9h6M9 13h6' },
    { k: 'me', t: '我的', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' }
  ];
  var TITLES = {
    home: '控糖有数', scan: '标签解读', data: '数据集', daily: '每日记录', me: '我的',
    result: '解读结果', detail: '词条详情', edit: '录入实测标签', quiz: '隐形糖知识测评',
    qresult: '测评结果', about: '标准与数据来源'
  };

  /* ------------------------------------------------------------ 基础交互 */
  var toastTimer = null;
  function toast(msg, ok) {
    var t = $('#toast');
    t.innerHTML = (ok ? '<span class="ico"></span>' : '') + esc(msg);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }
  function confirmBox(title, text, onOk, danger) {
    var m = $('#modal');
    m.hidden = false;
    m.innerHTML = '<div class="dialog"><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p>' +
      '<div class="acts"><button data-act="no">取消</button><button class="' + (danger ? 'danger' : 'ok') + '" data-act="yes">确定</button></div></div>';
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act');
      if (!a) return;
      m.hidden = true; m.innerHTML = '';
      if (a === 'yes' && onOk) onOk();
    };
  }
  function go(page, keep) {
    if (!keep && S.page !== page) S.stack.push(S.page);
    S.page = page;
    render();
    $('.viewport').scrollTop = 0;
  }
  function back() { S.page = S.stack.pop() || 'home'; render(); }
  function num(id, dft) { var el = $(id); if (!el) return dft; var v = el.value.trim(); return v === '' ? null : +v; }
  function persistPrefs() { C.Prefs.save(S.prefs); }
  function download(name, text, bom) {
    var blob = new Blob([(bom ? '﻿' : '') + text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 400);
  }
  function level(pct) { return pct == null ? '' : (pct >= 100 ? 'bad' : pct >= 60 ? 'warn' : 'ok'); }

  /* ------------------------------------------------------------ 渲染骨架 */
  function render() {
    $('#nav-title').textContent = TITLES[S.page] || '控糖有数';
    $('#nav-back').hidden = S.stack.length === 0;
    var isTab = TABS.some(function (t) { return t.k === S.page; });
    $('#tabbar').hidden = !isTab;
    if (isTab) {
      $('#tabbar').innerHTML = TABS.map(function (t) {
        return '<button data-action="tab" data-k="' + t.k + '" class="' + (S.page === t.k ? 'on' : '') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="' + t.d + '"/></svg>' +
          '<span>' + t.t + '</span></button>';
      }).join('');
    }
    $('#page').innerHTML = '<div class="page">' + (PAGES[S.page] || PAGES.home)() + '</div>';
  }

  function meterBlock(value, ideal, max) {
    var scale = Math.max(max * 1.25, ideal * 2, 1);
    var p = Math.min(100, Math.round((+value || 0) / scale * 100));
    return '<div class="meter"><i style="width:' + p + '%"></i>' +
      '<span class="mark" style="left:' + (ideal / scale * 100) + '%"><span>理想 ' + f1(ideal) + '</span></span>' +
      '<span class="mark" style="left:' + (max / scale * 100) + '%"><span>上限 ' + f1(max) + '</span></span></div>';
  }

  /* ------------------------------------------------------------ 页面 */
  var PAGES = {};

  PAGES.home = function () {
    var sum = C.Daily.summary(C.today());
    var pct = Math.min(999, Math.round(sum.sugar / S.prefs.ideal * 100));
    var month = C.Daily.trend(30), msum = 0, mc = 0;
    month.forEach(function (m) { msum += m.sugar; if (m.count) mc++; });
    var recs = C.Daily.ofDate(C.today()).slice(-3).reverse();
    var prog = C.Export.progress();
    return '<div class="gauge" style="--p:' + Math.min(100, pct) + '"><div class="mid">' +
      '<b>' + f1(sum.sugar) + ' g</b><small>今日添加糖</small><em>' + (pct ? '占理想上限 ' + pct + '%' : '还没有记录') + '</em>' +
      '</div></div>' +
      meterBlock(sum.sugar, S.prefs.ideal, S.prefs.max) +
      '<div class="kpis"><div class="kpi"><b>' + f1(sum.sugar) + '</b><small>今日 g</small></div>' +
      '<div class="kpi"><b>' + (mc ? f1(msum / mc) : '—') + '</b><small>30 天日均</small></div>' +
      '<div class="kpi"><b>' + C.Daily.streak() + '</b><small>连续记录天</small></div></div>' +
      '<div class="grid4">' +
      g4('scan', '解读标签', '营养表/配料表', '#e0603a', '算') +
      g4('quiz', '知识测评', D.QUIZ.length + ' 题', '#10a56a', '测') +
      g4('daily', '今日记录', sum.count + ' 条', '#1f6b70', '记') +
      g4('data', '数据集', prog.measured + ' 条实测', '#66419e', '库') +
      '</div>' +
      '<div class="banner"><b>GB 28050-2025 已把"糖"列为强制标示项</b>' +
      '<small>' + esc(D.STANDARDS.GB28050.mandatory) + '；' + esc(D.STANDARDS.GB28050.effective) + '</small></div>' +
      '<div class="group-title">今天的记录</div>' +
      (recs.length ? '<div class="cell-group">' + recs.map(function (r) {
        return '<div class="cell noarrow"><span class="ico" style="background:#e0603a">' + esc((r.name || '?').slice(0, 1)) + '</span>' +
          '<div class="bd"><b>' + esc(r.name) + '</b><small>' + esc(r.date) + ' · ' + (r.source === 'catalog' ? '来自词条' : r.source === 'manual' ? '手工' : '标签解读') + '</small></div>' +
          '<div class="ft">' + f1(r.sugar) + ' g</div></div>';
      }).join('') + '</div>' : '<div class="empty"><div class="box"></div>还没有记录，先去「解读」算一瓶饮料</div>') +
      '<div class="notice">' + esc(D.NOTES[0]) + '</div>';
  };
  function g4(k, t, d, color, ch) {
    return '<button class="g4" data-action="tab" data-k="' + k + '"><span class="gi" style="background:' + color + '">' + ch + '</span>' +
      '<span class="gt">' + esc(t) + '</span><span class="gd">' + esc(d) + '</span></button>';
  }

  PAGES.scan = function () {
    var f = S.form;
    var seg = '<div class="tabs3"><button data-action="scan-tab" data-k="label" class="' + (S.scanTab === 'label' ? 'on' : '') + '">营养成分表</button>' +
      '<button data-action="scan-tab" data-k="ing" class="' + (S.scanTab === 'ing' ? 'on' : '') + '">配料表识别</button></div>';
    if (S.scanTab === 'ing') {
      return seg +
        '<div class="field"><label>粘贴配料表原文（按加入量递减排列）</label>' +
        '<textarea id="in-ing" placeholder="配料：水、白砂糖、果葡糖浆、小麦粉、食用盐、酵母、单，双甘油脂肪酸酯、山梨酸钾">' + esc(f.ing) + '</textarea></div>' +
        '<div class="btn-row"><button class="btn block" data-action="parse-ing">识别隐形糖</button></div>' +
        '<div class="notice">词表收录 ' + D.TERMS.filter(function (t) { return t.kind === 'added' || t.kind === 'juice'; }).length + ' 个添加糖/游离糖别名、' +
        D.TERMS.filter(function (t) { return t.kind === 'polyol'; }).length + ' 个糖醇、' +
        D.TERMS.filter(function (t) { return t.kind === 'sweetener'; }).length + ' 个非糖甜味剂；命中位置越靠前说明加得越多。</div>';
    }
    return seg +
      '<div class="seg"><button data-action="state" data-k="solid" class="' + (f.state === 'solid' ? 'on' : '') + '">固体（每 100 g）</button>' +
      '<button data-action="state" data-k="liquid" class="' + (f.state === 'liquid' ? 'on' : '') + '">液体（每 100 mL）</button></div>' +
      '<div class="field"><label>标签上的"糖"（g / 100' + (f.state === 'liquid' ? 'mL' : 'g') + '，旧包装常没有这一行）</label>' +
      '<input id="in-sugar" inputmode="decimal" placeholder="留空表示标签未标示糖" value="' + esc(f.sugar) + '" /></div>' +
      '<div class="field"><label>碳水化合物（g / 100' + (f.state === 'liquid' ? 'mL' : 'g') + '）</label>' +
      '<input id="in-carb" inputmode="decimal" placeholder="例如 10.6" value="' + esc(f.carb) + '" /></div>' +
      '<div class="field"><label>膳食纤维（g，选填，用于扣减）</label>' +
      '<input id="in-fiber" inputmode="decimal" value="' + esc(f.fiber) + '" /></div>' +
      '<div class="field"><label>能量（kJ / 100' + (f.state === 'liquid' ? 'mL' : 'g') + '）</label>' +
      '<input id="in-kj" inputmode="decimal" placeholder="例如 180" value="' + esc(f.kj) + '" /></div>' +
      '<div class="field"><label>这次实际吃掉/喝掉的分量（' + (f.state === 'liquid' ? 'mL' : 'g') + '）</label>' +
      '<input id="in-portion" inputmode="decimal" value="' + esc(f.portion) + '" /></div>' +
      '<div class="field"><label>配料表（选填，勾上就能同时识别隐形糖）</label>' +
      '<textarea id="in-ing" placeholder="配料：水、白砂糖、果葡糖浆……">' + esc(f.ing) + '</textarea></div>' +
      (f.sugar === '' ? '<div class="field"><label>糖行缺失时的假设：糖占可利用碳水 <b id="share-val">' + f.share + '</b>%（仅用于敏感性分析，不是实测值）</label>' +
        '<input id="in-share" type="range" min="0" max="100" step="5" value="' + f.share + '" /></div>' : '') +
      '<div class="btn-row"><button class="btn block" data-action="calc">算一算</button></div>';
  };

  PAGES.result = function () {
    var r = S.result;
    if (!r) return '<div class="empty">先去「解读」填一张标签</div>';
    var kv = '<table class="kv">' +
      row('每 100' + (r.state === 'liquid' ? 'mL' : 'g') + ' 含糖', (r.hasSugarLine ? '' : '假设 ') + f1(r.sugarPer100) + ' g', r.hasSugarLine ? '' : 'warn') +
      row('这一份（' + r.portion + (r.state === 'liquid' ? ' mL' : ' g') + '）', '<b>' + f1(r.servingSugar) + ' g</b>') +
      row('相当于方糖', f1(r.cubes) + ' 块') +
      row('占每日理想上限 ' + S.prefs.ideal + ' g', '<span class="' + level(r.pctIdeal) + '">' + r.pctIdeal + '%</span>') +
      row('占每日上限 ' + S.prefs.max + ' g', r.pctMax + '%') +
      (r.kcal100 != null ? row('能量', f1(r.kcalServing) + ' kcal（NRV ' + r.nrvPct + '%）') : '') +
      (r.sugarKcal != null ? row('其中糖供能', r.sugarKcal + ' kcal') : '') +
      '</table>';
    var vd = '<div class="verdict">' +
      '<span class="vd ' + (r.claim.unknown ? 'warn' : (r.claim.sugarFree || r.claim.lowSugar) ? 'ok' : 'bad') + '">' + esc(r.claim.text) + '</span>' +
      (r.hasSugarLine ? '<span class="vd">标签已标示"糖"行</span>' : '<span class="vd warn">标签未标示"糖"：结果依赖假设</span>') +
      (r.estimated ? '<span class="vd warn">假设糖占碳水 ' + r.assumeShare + '%</span>' : '') +
      '</div>';
    var ing = '';
    if (r.ingredients) {
      var g = r.ingredients;
      ing = '<div class="card"><h3>配料表识别（' + g.tokens.length + ' 项，判级 ' + esc(g.level) + '）</h3>' +
        '<div class="toks">' + g.tokens.map(function (t, i) {
          var hit = g.hits.filter(function (h) { return h.position === i + 1; })[0];
          return '<span class="tok ' + (hit ? hit.kind : '') + '">' + esc(t) + (hit ? '<sup>' + (i + 1) + '</sup>' : '') + '</span>';
        }).join('') + '</div>' +
        '<div class="hr"></div>' + g.reasons.map(function (x) { return '<div class="small muted">· ' + esc(x) + '</div>'; }).join('') +
        (g.masks.length ? '<div class="hr"></div><div class="small"><b>话术提醒</b>' + g.masks.map(function (m) {
          return '<div class="muted small">「' + esc(m.claim) + '」：' + esc(m.truth) + '</div>';
        }).join('') + '</div>' : '') +
        '</div>';
    }
    var sens = '';
    if (r.estimated && S.form.carb !== '') {
      var rows = C.Calc.range(S.form.carb, S.form.fiber, r.portion).map(function (x) {
        return '<tr><th>糖占碳水 ' + x.share + '%</th><td>' + f1(x.per100) + ' g · 每份 ' + f1(x.serving) + ' g</td></tr>';
      }).join('');
      sens = '<div class="card"><h3>敏感性分析</h3><table class="kv">' + rows + '</table>' +
        '<div class="src">旧版标签只强制标"碳水化合物"，糖含在里面；给出区间而不是假装有实测值。</div></div>';
    }
    return '<div class="gauge" style="--p:' + Math.min(100, r.pctIdeal || 0) + '"><div class="mid">' +
      '<b>' + f1(r.servingSugar) + ' g</b><small>这一份的添加糖</small><em>' + f1(r.cubes) + ' 块方糖 · 占理想上限 ' + (r.pctIdeal || 0) + '%</em></div></div>' +
      '<div class="card">' + vd + kv + '</div>' + sens + ing +
      '<div class="btn-row"><button class="btn" data-action="save-record">记入今日</button>' +
      (S.admin ? '<button class="btn ghost" data-action="save-food">存为实测词条</button>' : '') + '</div>' +
      '<div class="btn-row"><button class="btn soft block" data-action="again">再测一个</button></div>';
  };
  function row(k, v) { return '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>'; }

  PAGES.daily = function () {
    var date = C.today(S.day);
    var sum = C.Daily.summary(date);
    var recs = C.Daily.ofDate(date).slice().reverse();
    var trend = C.Daily.trend(7), mx = Math.max(S.prefs.ideal, 1);
    trend.forEach(function (t) { mx = Math.max(mx, t.sugar); });
    var days = ['今天', '昨天', '前天'];
    return '<div class="seg">' + [0, 1, 2].map(function (i) {
      return '<button data-action="day" data-k="' + i + '" class="' + (S.day === i ? 'on' : '') + '">' + days[i] + '</button>';
    }).join('') + '</div>' +
      '<div class="card"><h3>' + esc(date) + ' 合计 <span class="big">' + f1(sum.sugar) + ' g</span></h3>' +
      meterBlock(sum.sugar, S.prefs.ideal, S.prefs.max) +
      '<div class="small muted">' + sum.count + ' 条记录 · 占理想上限 ' + Math.round(sum.sugar / S.prefs.ideal * 100) + '% · 能量合计 ' + sum.kcal + ' kcal</div></div>' +
      '<div class="chart"><h4>近 7 天添加糖</h4><div class="bars">' + trend.map(function (t) {
        return '<div class="bcol"><i style="height:' + Math.round(t.sugar / mx * 76) + 'px"></i><span class="bval">' + f1(t.sugar) + '</span><em>' + t.date.slice(8) + '</em></div>';
      }).join('') + '</div></div>' +
      (recs.length ? '<div class="cell-group">' + recs.map(function (r) {
        return '<div class="cell noarrow"><span class="ico" style="background:#e0603a">' + esc((r.name || '?').slice(0, 1)) + '</span>' +
          '<div class="bd"><b>' + esc(r.name) + '</b><small>' + esc(r.note || (r.source === 'catalog' ? '词条记录' : '标签解读')) + '</small></div>' +
          '<div class="ft">' + f1(r.sugar) + ' g<button class="btn sm warn" data-action="del-record" data-id="' + r.id + '">删</button></div></div>';
      }).join('') + '</div>' : '<div class="empty"><div class="box"></div>这天没有记录</div>');
  };

  PAGES.data = function () {
    var list = C.Catalog.search(S.kw), prog = C.Export.progress();
    return '<div class="searchbar"><input id="dkw" placeholder="搜产品 / 类别" value="' + esc(S.kw) + '" />' +
      '<button class="btn sm" data-action="reset-kw">重置</button></div>' +
      '<div class="card"><h3>数据集进度 ' + prog.measured + ' / ' + prog.target + ' 条实测</h3>' +
      meterBlock(prog.measured, prog.target / 3, prog.target) +
      '<div class="small muted">已拍照片 ' + prog.withPhoto + ' 条 · 已存配料表原文 ' + prog.withIng + ' 条 · 内置带出处种子条目 ' + D.SEEDS.length + ' 条</div>' +
      '<div class="src mt">' + esc(D.NOTES[1]) + '</div></div>' +
      (S.admin ? '<div class="btn-row"><button class="btn block" data-action="new-food">＋ 录入实测标签</button></div>'
        : '<div class="notice">新增词条、删除词条与整库导出需要管理口令，在「我的 → 管理入口」设定。</div>') +
      (list.length ? '<div class="cell-group">' + list.map(function (f) {
        return '<div class="cell tap" data-action="detail" data-id="' + f.id + '"><span class="ico" style="background:' + (f.origin === 'seed' ? '#8a94a6' : '#e0603a') + '">' + esc((f.name || '?').slice(0, 1)) + '</span>' +
          '<div class="bd"><b>' + esc(f.name) + '</b><small>' + esc(f.cat || '未分类') + ' · ' + esc(f.per || '') + '</small></div>' +
          '<div class="ft">' + (f.sugarPer100 == null ? '<span class="vd warn">未标糖</span>' : f1(f.sugarPer100) + ' g/100') + '</div></div>';
      }).join('') + '</div>' : '<div class="empty"><div class="box"></div>没有匹配词条</div>') +
      '<div class="group-title">导出</div><div class="cell-group">' +
      cell('export-csv', '导出实测标签 CSV', '字段含照片文件名与录入人，可直接进论文附表') +
      cell('export-json', '导出整库 JSON', '给网页版与小程序端共用的数据源') +
      cell('export-daily', '导出我的记录 CSV', '匿名自我记录，可作为使用行为数据') +
      '</div>';
  };
  function cell(act, t, d) {
    return '<div class="cell tap" data-action="' + act + '"><div class="bd"><b>' + esc(t) + '</b><small>' + esc(d) + '</small></div><div class="ft">导出</div></div>';
  }

  PAGES.detail = function () {
    var f = C.Catalog.get(S.detailId);
    if (!f) return '<div class="empty">词条不存在</div>';
    return '<div class="card"><h3>' + esc(f.name) + '</h3>' +
      '<div class="verdict"><span class="vd">' + esc(f.cat || '未分类') + '</span><span class="vd ' + (f.origin === 'seed' ? 'warn' : 'ok') + '">' + esc(f.level || '') + '</span>' +
      (f.sugarPer100 == null ? '<span class="vd warn">标签未标示糖</span>' : '<span class="vd">' + f1(f.sugarPer100) + ' g/100</span>') + '</div>' +
      '<table class="kv">' +
      row('品牌', esc(f.brand || '—')) + row('计量口径', esc(f.per || '—')) +
      (f.carbPer100 != null ? row('碳水 /100', f1(f.carbPer100) + ' g') : '') +
      (f.fiberPer100 != null ? row('膳食纤维 /100', f1(f.fiberPer100) + ' g') : '') +
      (f.energyKjPer100 != null ? row('能量 /100', f1(f.energyKjPer100) + ' kJ ≈ ' + C.Calc.kjToKcal(f.energyKjPer100) + ' kcal') : '') +
      (f.photoFile ? row('标签照片', esc(f.photoFile)) : '') +
      (f.annotator ? row('录入人', esc(f.annotator)) : '') +
      '</table>' +
      (f.ingText ? '<div class="hr"></div><div class="small"><b>配料表原文</b><div class="muted small">' + esc(f.ingText) + '</div></div>' +
        (function () { var p = C.Parser.parseIngredients(f.ingText); return '<div class="toks mt">' + p.tokens.map(function (t, i) {
          var hit = p.hits.filter(function (h) { return h.position === i + 1; })[0];
          return '<span class="tok ' + (hit ? hit.kind : '') + '">' + esc(t) + '</span>';
        }).join('') + '</div><div class="small muted">判级：' + esc(p.level) + '</div>'; })() : '') +
      (f.src ? '<div class="hr"></div><div class="src">来源：' + esc(f.srcNote || '') + '<br><a href="' + esc(f.src) + '" target="_blank" rel="nofollow">' + esc(f.src) + '</a></div>' : '') +
      '</div>' +
      '<div class="btn-row"><button class="btn" data-action="record-food" data-id="' + f.id + '">记入今日</button>' +
      (S.admin ? '<button class="btn ghost" data-action="edit-food" data-id="' + f.id + '">编辑</button>' +
        (f.origin === 'measured' ? '<button class="btn warn" data-action="del-food" data-id="' + f.id + '">删除</button>' : '') : '') + '</div>';
  };

  PAGES.edit = function () {
    var f = S.editing || {};
    var fld = function (k, label, ph) {
      return '<div class="field"><label>' + esc(label) + '</label><input id="fd-' + k + '" value="' + esc(f[k] == null ? '' : f[k]) + '" placeholder="' + esc(ph || '') + '" /></div>';
    };
    return '<div class="notice">这一页是数据采集端：一条记录对应一张包装标签照片。编号建议和照片文件名一致，例如 S-0137。</div>' +
      fld('id', '编号（留空自动生成）', 'S-0137') + fld('brand', '品牌', '例如 某某') + fld('name', '产品名称', '例如 柠檬味苏打饼干') +
      fld('cat', '类别', '饮料 / 焙烤 / 调味品 / 乳制品 …') +
      '<div class="seg"><button data-action="edit-state" data-k="solid" class="' + (f.state !== 'liquid' ? 'on' : '') + '">固体</button>' +
      '<button data-action="edit-state" data-k="liquid" class="' + (f.state === 'liquid' ? 'on' : '') + '">液体</button></div>' +
      fld('sugarPer100', '标签"糖" g/100g(mL)（没有这一行就留空）', '10.6') +
      fld('carbPer100', '碳水化合物 g/100g(mL)', '62') + fld('fiberPer100', '膳食纤维 g/100g(mL)', '选填') +
      fld('energyKjPer100', '能量 kJ/100g(mL)', '1800') + fld('portion', '一份的量 g(mL)', '330') +
      fld('photoFile', '标签照片文件名', 'S-0137.jpg') + fld('annotator', '录入人（组员姓名或代号）', '组员A') +
      '<div class="field"><label>配料表原文</label><textarea id="fd-ingText">' + esc(f.ingText || '') + '</textarea></div>' +
      fld('src', '来源链接（选填）', 'https://…') +
      '<div class="btn-row"><button class="btn block" data-action="save-food-db">保存词条</button></div>';
  };

  PAGES.quiz = function () {
    if (!S.quiz) {
      return '<div class="card"><h3>隐形糖知识测评</h3><p class="small muted">共 ' + D.QUIZ.length + ' 题，随机抽 8 题，答完给分和解析。题目依据 GB 28050-2025、GB 7718-2025 与《中国居民膳食指南（2022）》。</p>' +
        '<div class="small muted">历史成绩：' + (C.Quiz.history().length ? C.Quiz.history().slice(-5).map(function (h) { return h.score + ' 分'; }).join('、') : '还没有') + '</div></div>' +
        '<div class="btn-row"><button class="btn block" data-action="quiz-start">开始测评</button></div>';
    }
    if (S.quiz.done) return PAGES.qresult();
    var q = S.quiz.set[S.qIdx];
    return '<div class="progress-top"><div class="line"><span>第 ' + (S.qIdx + 1) + ' / ' + S.quiz.set.length + ' 题</span><span>' + esc(q.std) + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.round((S.qIdx + 1) / S.quiz.set.length * 100) + '%"></i></div></div>' +
      '<div class="card"><div class="q-stem">' + esc(q.q) + '</div></div>' +
      q.opts.map(function (o, i) {
        return '<button class="opt" data-action="quiz-pick" data-i="' + i + '"><i>' + 'ABCD'[i] + '</i><span>' + esc(o) + '</span></button>';
      }).join('');
  };

  PAGES.qresult = function () {
    var r = S.quiz.result;
    return '<div class="result"><div class="ring" style="background:conic-gradient(var(--pri) ' + (r.score * 3.6) + 'deg,#eceef0 0);border-radius:50%">' +
      '<div class="pct"><b>' + r.score + '</b><small>得分</small></div></div>' +
      '<div class="small muted">答对 ' + r.right + ' / ' + r.total + ' 题</div></div>' +
      (r.wrong.length ? '<div class="group-title">错题解析</div>' + r.wrong.map(function (w) {
        return '<div class="explain"><b>' + esc(w.q) + '</b><div class="small muted">你选：' + esc(w.chosen || '未作答') + '</div>' +
          '<div class="small">正确：' + esc(w.right) + '</div><div class="small muted">' + esc(w.why) + '（' + esc(w.std) + '）</div></div>';
      }).join('') : '<div class="notice">全对，说明你对标签阈辞的掌握没问题。</div>') +
      '<div class="btn-row"><button class="btn" data-action="quiz-start">再来一轮</button><button class="btn ghost" data-action="tab" data-k="home">回首页</button></div>';
  };

  PAGES.me = function () {
    return '<div class="mehead"><span class="avatar" style="background:#e0603a">' + esc((S.prefs.nickname || '游').slice(0, 1)) + '</span>' +
      '<div><b>' + esc(S.prefs.nickname || '未命名使用者') + '</b><small>数据只存在本机，不上传；换设备需重新录入</small></div></div>' +
      '<div class="field"><label>昵称</label><input id="pf-nick" value="' + esc(S.prefs.nickname) + '" /></div>' +
      '<div class="field"><label>每日添加糖理想上限（g）</label><input id="pf-ideal" inputmode="decimal" value="' + S.prefs.ideal + '" /></div>' +
      '<div class="field"><label>每日添加糖上限（g）</label><input id="pf-max" inputmode="decimal" value="' + S.prefs.max + '" /></div>' +
      '<div class="field"><label>糖行缺失时的默认假设（糖占可利用碳水 %）</label><input id="pf-share" inputmode="decimal" value="' + S.prefs.sugarShare + '" /></div>' +
      '<div class="btn-row"><button class="btn block" data-action="save-prefs">保存设置</button></div>' +
      '<div class="group-title">管理入口</div>' +
      (S.admin ? '<div class="cell-group"><div class="cell noarrow"><div class="bd"><b>已解锁</b><small>可录入/删除词条、整库导出</small></div><div class="ft"><button class="btn sm ghost" data-action="admin-out">退出</button></div></div></div>'
        : (C.Admin.ready()
          ? '<div class="field"><label>管理口令</label><input id="ad-pwd" type="password" placeholder="由管理员本人设定，页面不展示" /></div><div class="btn-row"><button class="btn block ghost" data-action="admin-login">解锁管理功能</button></div>'
          : '<div class="field"><label>首次使用请设定管理口令（≥6 位，不设默认值）</label><input id="ad-pwd" type="password" /></div>' +
            '<div class="field"><label>确认管理口令</label><input id="ad-pwd2" type="password" /></div>' +
            '<div class="btn-row"><button class="btn block" data-action="admin-set">设定并解锁</button></div>')) +
      '<div class="group-title">本机数据</div><div class="cell-group">' +
      cell2('go-about', '标准与数据来源', 'GB 28050-2025 / GB 7718-2025 / 膳食指南 2022 / WHO 2015') +
      cell2('keys', '查看存储键位', C.Store.keys().join(' · ') || '还没有键') +
      '</div>' +
      '<div class="btn-row"><button class="btn warn block" data-action="clear-all">清空本机数据</button></div>' +
      '<div class="notice">' + esc(D.NOTES[2]) + '</div>';
  };
  function cell2(act, t, d) {
    return '<div class="cell tap" data-action="' + act + '"><div class="bd"><b>' + esc(t) + '</b><small>' + esc(d) + '</small></div><div class="ft"></div></div>';
  }

  PAGES.about = function () {
    var st = D.STANDARDS;
    return '<div class="card"><h3>' + esc(st.GB28050.code) + '</h3>' +
      '<div class="small muted">' + esc(st.GB28050.issued) + '，' + esc(st.GB28050.effective) + '</div>' +
      '<table class="kv">' + row('强制标示', esc(st.GB28050.mandatory)) + row('"糖"的定义', esc(st.GB28050.sugarDef)) +
      row('无糖 / 0 糖', '≤ ' + st.GB28050.claims.sugarFree.max + ' ' + st.GB28050.claims.sugarFree.unit) +
      row('低糖', '≤ ' + st.GB28050.claims.lowSugar.max + ' ' + st.GB28050.claims.lowSugar.unit) +
      row('减糖（比较声称）', esc(st.GB28050.claims.reduced.note)) + '</table>' +
      '<div class="src">依据报道：<a href="' + esc(st.GB28050.src) + '" target="_blank" rel="nofollow">' + esc(st.GB28050.src) + '</a></div></div>' +
      '<div class="card"><h3>' + esc(st.GB7718.code) + '</h3><div class="small">' + esc(st.GB7718.note) + '</div>' +
      '<div class="src"><a href="' + esc(st.GB7718.src) + '" target="_blank" rel="nofollow">' + esc(st.GB7718.src) + '</a></div></div>' +
      '<div class="card"><h3>' + esc(st.DRI.code) + '</h3><div class="small">' + esc(st.DRI.note) + '（' + st.DRI.addedSugarMax + ' g / ' + st.DRI.addedSugarIdeal + ' g，' + esc(st.CUBE_NOTE) + '）</div>' +
      '<div class="src"><a href="' + esc(st.DRI.src) + '" target="_blank" rel="nofollow">' + esc(st.DRI.src) + '</a></div></div>' +
      '<div class="card"><h3>' + esc(st.WHO.code) + '</h3><div class="small">' + esc(st.WHO.note) + '</div>' +
      '<div class="src"><a href="' + esc(st.WHO.src) + '" target="_blank" rel="nofollow">' + esc(st.WHO.src) + '</a></div></div>' +
      '<div class="card"><h3>换算约定</h3><table class="kv">' +
      row('能量换算', '1 kcal = ' + st.KJ_PER_KCAL + ' kJ') + row('糖的供能', st.KCAL_PER_SUGAR_G + ' kcal/g') +
      row('能量 NRV', st.ENERGY_NRV_KJ + ' kJ（约 2000 kcal）') + row('方糖', st.CUBE_G + ' g/块') + '</table></div>' +
      '<div class="notice">' + esc(D.NOTES[0]) + '</div><div class="notice">' + esc(D.NOTES[1]) + '</div>';
  };

  /* ------------------------------------------------------------ 事件 */
  function collectForm() {
    ['sugar', 'carb', 'fiber', 'kj', 'portion', 'ing'].forEach(function (k) {
      var el = $('#in-' + k); if (el) S.form[k] = el.value.trim();
    });
    var sh = $('#in-share'); if (sh) S.form.share = +sh.value;
  }
  document.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'dkw') { S.kw = e.target.value; clearTimeout(S._t); S._t = setTimeout(function () {
      var pos = e.target.selectionStart; render(); var n = $('#dkw'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) {} }
    }, 260); return; }
    if (id === 'in-share') { $('#share-val').textContent = e.target.value; }
  });

  var ACT = {
    'tab': function () { S.stack = []; go(el.getAttribute('data-k'), true); },
    'scan-tab': function () { collectForm(); S.scanTab = el.getAttribute('data-k'); render(); },
    'state': function () { collectForm(); S.form.state = el.getAttribute('data-k'); render(); },
    'day': function () { S.day = +el.getAttribute('data-k'); render(); },
    'reset-kw': function () { S.kw = ''; render(); },
    'calc': function () {
      collectForm();
      if (S.form.sugar === '' && S.form.carb === '' && !S.form.ing) return toast('至少填糖、碳水或配料表中的一项');
      var inp = { state: S.form.state, sugarPer100: S.form.sugar, carbPer100: S.form.carb,
        fiberPer100: S.form.fiber, energyKjPer100: S.form.kj, portion: +S.form.portion || 0,
        ingText: S.form.ing, share: +S.form.share };
      S.result = C.Calc.fromLabel(inp);
      go('result');
    },
    'parse-ing': function () {
      collectForm();
      if (!S.form.ing) return toast('先粘贴配料表');
      var p = C.Parser.parseIngredients(S.form.ing);
      S.result = C.Calc.fromLabel({ state: S.form.state, sugarPer100: S.form.sugar, carbPer100: S.form.carb,
        fiberPer100: S.form.fiber, energyKjPer100: S.form.kj, portion: +S.form.portion || 0, ingText: S.form.ing });
      go('result');
      toast('识别到 ' + p.hits.length + ' 个糖源/代糖词', !!p.hits.length);
    },
    'again': function () { go('scan'); },
    'save-record': function () {
      var r = S.result;
      if (r.servingSugar == null) return toast('没有可用的糖数值');
      C.Daily.add({ name: '自填标签 · ' + (S.form.portion || 0) + (r.state === 'liquid' ? 'mL' : 'g'),
        sugar: r.servingSugar, kcal: r.kcalServing || 0, portion: r.portion, source: 'label' });
      toast('已记入今日', true);
      go('home', true);
    },
    'save-food': function () {
      if (!S.admin) return toast('需要管理口令');
      var r = S.result;
      S.editing = { id: '', brand: '', name: '新产品 ' + new Date().toLocaleTimeString('zh-CN'), cat: '', state: r.state,
        sugarPer100: r.hasSugarLine ? r.sugarPer100 : '', carbPer100: S.form.carb, fiberPer100: S.form.fiber,
        energyKjPer100: S.form.kj, portion: S.form.portion, ingText: S.form.ing, photoFile: '', annotator: S.prefs.nickname };
      go('edit');
    },
    'new-food': function () { S.editing = { id: '', name: '', state: 'solid' }; go('edit'); },
    'edit-food': function () { S.editing = C.Catalog.get(el.getAttribute('data-id')); go('edit'); },
    'edit-state': function () { S.editing = readEdit(); S.editing.state = el.getAttribute('data-k'); render(); },
    'save-food-db': function () {
      var f = readEdit();
      if (!f.name) return toast('产品名称不能为空');
      if (!f.photoFile && !f.src) return toast('实测录入要求填照片文件名或来源链接，保证数据可追溯');
      C.Catalog.save(f);
      S.editing = null;
      toast('已保存词条', true);
      go('data', true);
    },
    'del-food': function () {
      var id = el.getAttribute('data-id');
      confirmBox('删除词条', '删除后无法恢复，确定吗？', function () { C.Catalog.remove(id); go('data', true); toast('已删除'); });
    },
    'detail': function () { S.detailId = el.getAttribute('data-id'); go('detail'); },
    'record-food': function () {
      var f = C.Catalog.get(el.getAttribute('data-id'));
      if (!f) return;
      if (f.sugarPer100 == null) return toast('这条没有糖数值（标签未标示），先补实测');
      var one = C.Calc.perServing(f.sugarPer100, +f.portion || 100);
      C.Daily.add({ name: f.name, sugar: one, kcal: f.energyKjPer100 ? C.Calc.kjToKcal(f.energyKjPer100) * ((+f.portion || 100) / 100) : 0,
        portion: +f.portion || 100, source: 'catalog', note: f.cat || '' });
      toast('已记入今日 ' + one + ' g', true);
    },
    'del-record': function () { C.Daily.remove(el.getAttribute('data-id')); render(); toast('已删除记录'); },
    'export-csv': function () { download('标签实测数据集_' + C.today() + '.csv', C.Export.csv(), true); toast('CSV 已下载'); },
    'export-json': function () { download('sugar-catalog_' + C.today() + '.json', C.Export.json()); toast('JSON 已下载'); },
    'export-daily': function () { download('我的记录_' + C.today() + '.csv', C.Export.dailyCsv(), true); toast('记录已导出'); },
    'quiz-start': function () { S.quiz = { set: C.Quiz.build(8), done: false, result: null }; S.qIdx = 0; S.answers = []; render(); },
    'quiz-pick': function () {
      S.answers[S.qIdx] = +el.getAttribute('data-i');
      if (S.qIdx < S.quiz.set.length - 1) { S.qIdx++; render(); }
      else {
        S.quiz.result = C.Quiz.grade(S.quiz.set, S.answers);
        C.Quiz.log(S.quiz.result);
        S.quiz.done = true; render();
      }
    },
    'save-prefs': function () {
      var n = $('#pf-nick').value.trim(), i = +$('#pf-ideal').value, m = +$('#pf-max').value, sh = +$('#pf-share').value;
      if (!(i > 0) || !(m > 0) || i > m) return toast('上限要大于理想值，且都要大于 0');
      S.prefs = { nickname: n, ideal: i, max: m, energyKj: S.prefs.energyKj, sugarShare: Math.min(100, Math.max(0, sh || 50)), lastState: S.form.state };
      persistPrefs(); toast('已保存', true); render();
    },
    'admin-set': function () {
      var r = C.Admin.set($('#ad-pwd').value, $('#ad-pwd2').value);
      toast(r.msg, r.ok);
      if (r.ok) { S.admin = true; sessionStorage.setItem('sg_admin', '1'); render(); }
    },
    'admin-login': function () {
      if (!C.Admin.check($('#ad-pwd').value)) return toast('口令不正确');
      S.admin = true; sessionStorage.setItem('sg_admin', '1'); toast('已解锁管理功能', true); render();
    },
    'admin-out': function () { S.admin = false; sessionStorage.removeItem('sg_admin'); render(); },
    'go-about': function () { go('about'); },
    'keys': function () { toast(C.Store.keys().join(' · ') || '还没有键'); },
    'clear-all': function () {
      confirmBox('清空本机数据', '词条、记录、测评成绩与管理口令都会删除，不可恢复。', function () {
        C.Store.clearAll(); sessionStorage.removeItem('sg_admin');
        S.prefs = C.Prefs.load(); S.admin = false; S.kw = ''; S.quiz = null;
        go('home', true); toast('已清空', true);
      }, true);
    }
  };
  function readEdit() {
    var f = S.editing || {};
    var g = function (k) { var el2 = $('#fd-' + k); return el2 ? el2.value.trim() : (f[k] == null ? '' : f[k]); };
    var n = function (k) { var v = g(k); return v === '' ? null : +v; };
    return { id: g('id') || f.id || '', brand: g('brand'), name: g('name'), cat: g('cat'), state: f.state || 'solid',
      sugarPer100: n('sugarPer100'), carbPer100: n('carbPer100'), fiberPer100: n('fiberPer100'),
      energyKjPer100: n('energyKjPer100'), portion: n('portion'), photoFile: g('photoFile'), annotator: g('annotator'),
      ingText: g('ingText'), src: g('src'), per: (n('portion') || 100) + (f.state === 'liquid' ? ' mL/份' : ' g/份') };
  }

  var el = null;
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!t) return;
    var a = t.getAttribute('data-action');
    if (!ACT[a]) return;
    el = t;
    ACT[a]();
  });
  $('#nav-back').addEventListener('click', back);

  /* 状态栏时间 */
  function clock() {
    var d = new Date();
    $('#sb-time').textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  clock(); setInterval(clock, 20000);

  if (sessionStorage.getItem('sg_admin') === '1' && C.Admin.ready()) S.admin = true;
  render();
  window.__sugar = { S: S, C: C, render: render, ACT: ACT };
}());
