/* 控糖有数 · 手机版逻辑：标签换算 / 拍照识别配料表 / 按餐次记录 / 数据集采集 / 知识测评 */
(function () {
  var C = window.SugarCore, D = C.D;
  function $(s, r) { return (r || document).querySelector(s); }
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
    quiz: null, answers: [], qIdx: 0, day: 0,
    photo: null, editPhoto: null, detailPhoto: null, ocr: { state: 'idle' },
    recordMeal: null
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
  var MEAL_COLOR = { breakfast: '#ff9f43', lunch: '#00b578', dinner: '#1d8cff', snack: '#8a94a6' };

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
  /** 需要她补一个数值（手工记一条糖克数）时用，比 prompt 好看，校验也集中在一处 */
  function promptBox(title, fields, okText, onOk) {
    var m = $('#modal');
    m.hidden = false;
    m.innerHTML = '<div class="dialog"><h4>' + esc(title) + '</h4><div class="body">' +
      fields.map(function (fd, i) {
        return '<input id="dlg-' + i + '" placeholder="' + esc(fd.ph || '') + '" inputmode="' + (fd.num ? 'decimal' : 'text') +
          '" value="' + esc(fd.v == null ? '' : fd.v) + '" />';
      }).join('') + '</div>' +
      '<div class="acts"><button data-act="no">取消</button><button class="ok" data-act="yes">' + esc(okText || '确定') + '</button></div></div>';
    m.onclick = function (e) {
      var a = e.target.getAttribute('data-act');
      if (!a) return;
      var vals = fields.map(function (fd, i) {
        var v = $('#dlg-' + i).value.trim();
        return fd.num ? (v === '' ? null : +v) : v;
      });
      m.hidden = true; m.innerHTML = '';
      if (a === 'yes' && onOk) onOk(vals);
    };
  }
  function openSheet(html) {
    $('#modal').hidden = false;
    $('#modal').onclick = function (e) { if (e.target === $('#modal')) closeSheet(); };
    $('#sheet').innerHTML = html;
    $('#sheet').hidden = false;
  }
  function closeSheet() {
    var sh = $('#sheet'), m = $('#modal');
    sh.hidden = true; sh.innerHTML = '';
    m.hidden = true; m.innerHTML = ''; m.onclick = null;
  }
  function go(page, keep) {
    if (!keep && S.page !== page) S.stack.push(S.page);
    S.page = page;
    render();
    $('.viewport').scrollTop = 0;
  }
  function back() {
    if (!$('#sheet').hidden) return closeSheet();
    S.page = S.stack.pop() || 'home';
    render();
  }
  function persistPrefs() { C.Prefs.save(S.prefs); }
  function download(name, text, bom) {
    saveBlob(name, new Blob([(bom ? '\ufeff' : '') + text], { type: 'text/plain;charset=utf-8' }));
  }
  function saveBlob(name, blob) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 400);
  }
  function level(pct) { return pct == null ? '' : (pct >= 100 ? 'bad' : pct >= 60 ? 'warn' : 'ok'); }
  function badgeClass(sugar) {
    if (sugar == null) return '';
    return sugar >= S.prefs.max * 0.5 ? 'bad' : sugar >= S.prefs.ideal * 0.4 ? 'warn' : '';
  }
  function mealName(k) {
    var out = '加餐';
    D.MEALS.forEach(function (m) { if (m.k === k) out = m.t; });
    return out;
  }
  /** 按当前时刻猜餐次，时间段口径跟 data.js 里的 MEALS 一致 */
  function guessMeal() {
    var h = new Date().getHours();
    return h < 5 || h >= 21 ? 'snack' : h < 10 ? 'breakfast' : h < 14 ? 'lunch' : 'dinner';
  }
  function takenMeal(r) { return r.meal && D.MEALS.some(function (m) { return m.k === r.meal; }) ? r.meal : 'snack'; }
  function afterAdd(meal, gram) {
    if (S.page !== 'daily') S.day = 0;
    S.stack = [];
    go('daily', true);
    toast('已记入' + mealName(meal) + (gram == null ? '' : ' ' + f1(gram) + ' g'), true);
  }

  /* ------------------------------------------------------------ 照片与 OCR */
  function readPhoto(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type || '')) return rej(new Error('请选图片文件'));
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('读取图片失败')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { rej(new Error('这张图片解码失败，换一张试试')); };
        img.onload = function () {
          var max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          var out = { dataUrl: cv.toDataURL('image/jpeg', 0.82), name: file.name || 'label.jpg', w: cv.width, h: cv.height, blob: null };
          var done = function (b) { out.blob = b || null; res(out); };
          if (cv.toBlob) cv.toBlob(done, 'image/jpeg', 0.82); else done(null);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function hydratePhoto(code, cb) {
    if (!code) return;
    C.Photos.get(code).then(function (blob) {
      if (!blob) return null;
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () { res({ dataUrl: fr.result, blob: blob, name: code + '.jpg', w: 0, h: 0 }); };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(blob);
      });
    }).then(function (out) { if (out) { cb(out); render(); } }, function () { /* 读不到照片库就当作没有照片 */ });
  }
  function photoCodeOf(f) {
    var m = /(S-\d{3,})/.exec(String(((f || {}).photoFile || (f || {}).id) || ''));
    return m ? m[1] : '';
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('识别库加载失败')); };
      document.head.appendChild(s);
    });
  }
  function loadOcrLib(i) {
    i = i || 0;
    if (window.Tesseract) return Promise.resolve();
    if (i >= D.OCR.libs.length) return Promise.reject(new Error('几个 CDN 都没连上，检查网络再试'));
    return loadScript(D.OCR.libs[i]).catch(function () { return loadOcrLib(i + 1); });
  }
  function runOcr(target) {
    var photo = target === 'edit' ? S.editPhoto : S.photo;
    if (!photo) return toast('先拍一张或选一张标签照片');
    collectForm();
    S.ocrTarget = target === 'edit' ? 'edit' : 'scan';
    S.ocr = { state: 'loading' }; render();
    loadOcrLib(0).then(function () {
      if (!window.Tesseract) throw new Error('识别库没加载成功');
      S.ocr = { state: 'running' }; render();
      return window.Tesseract.createWorker(D.OCR.lang, 1, {
        workerPath: D.OCR.workerPath, corePath: D.OCR.corePath, langPath: D.OCR.langPath
      });
    }).then(function (worker) {
      return worker.recognize(photo.dataUrl).then(function (data) {
        return worker.terminate().then(function () { return data; });
      });
    }).then(function (res) {
      var d = (res || {}).data || {};
      var raw = String(d.text || '');
      if (!raw.replace(/\s/g, '')) throw new Error('照片里没读出文字，换一张更清晰、光线更足的试试');
      var ing = C.Parser.extractIngredients(raw);
      var draft = ing || C.Parser.denoise(raw).replace(/\s*\n+\s*/g, ' ').slice(0, 500);
      if (S.ocrTarget === 'edit') { var box = $('#fd-ingText'); if (box) box.value = draft; }
      else S.form.ing = draft;
      S.ocr = { state: 'done', conf: d.confidence, extracted: !!ing, raw: raw };
      render();
      toast(ing ? '配料草稿已取出，请核对' : '没定位到配料表那一段，整段文本已放进输入框', true);
    }).catch(function (err) {
      S.ocr = { state: 'error', msg: (err && err.message) || '未知错误' };
      render();
    });
  }
  function photoBlock(which) {
    var isScan = which === 'scan';
    var p = isScan ? S.photo : S.editPhoto;
    var acts = '<div class="acts"><button data-action="' + (isScan ? 'pick-photo' : 'pick-edit-photo') + '">' + (p ? '换一张' : '拍照 / 选图') + '</button>';
    if (isScan) acts += '<button class="hi" data-action="ocr-run"' + (p ? '' : ' disabled') + '>识别配料表</button>';
    else acts += '<button class="hi" data-action="ocr-fill-edit"' + (p ? '' : ' disabled') + '>识别配料表</button>';
    if (p) acts += '<button data-action="' + (isScan ? 'clear-photo' : 'clear-edit-photo') + '">移除</button>';
    acts += '</div>';
    return '<div class="photo"><div class="pv">' +
      (p ? '<img src="' + p.dataUrl + '" alt="营养标签照片" /><span class="cap">' +
        esc(p.name || '本机照片') + (p.w ? ' · ' + p.w + '×' + p.h : '') + '</span>'
        : '还没有照片：拍一张包装上的营养标签') +
      '</div>' + acts +
      '<input type="file" accept="image/*" capture="environment" id="' + (isScan ? 'in-photo' : 'fd-photo') + '" style="display:none" />' +
      '</div>';
  }
  function draftHtml() {
    var o = S.ocr || { state: 'idle' };
    if (o.state === 'loading') return '<div class="draft busy">正在加载中文识别模型（首次约 1.7 MB，走 CDN，图片不上传)…</div>';
    if (o.state === 'running') return '<div class="draft busy">识别中，请稍候，别离开这一页…</div>';
    if (o.state === 'error') return '<div class="draft">识别失败：' + esc(o.msg) + '<br>换一张光线更足、字面更平的照片重试，也可以直接在下面的框里手打配料表。</div>';
    if (o.state === 'done') return '<div class="draft"><b>已从照片取出草稿</b>' +
      '<span class="conf">置信度 ' + f1(o.conf) + '</span><span class="conf">' + (o.extracted ? '定位到配料表' : '未定位到，取整段') + '</span>' +
      '<br>' + esc(D.OCR.tip) + '</div>';
    return '';
  }

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
    var v = +value || 0;
    return '<div class="meter' + (v > max ? ' over' : '') + '"><i style="width:' + Math.min(100, Math.round(v / scale * 100)) + '%"></i>' +
      '<span class="mark" style="left:' + (ideal / scale * 100) + '%"><span>理想 ' + f1(ideal) + '</span></span>' +
      '<span class="mark" style="left:' + (max / scale * 100) + '%"><span>上限 ' + f1(max) + '</span></span></div>';
  }
  function heroBlock(sum, date) {
    var ideal = S.prefs.ideal, max = S.prefs.max;
    var pct = Math.round(sum.sugar / ideal * 100);
    var cls = sum.sugar > max ? ' over' : sum.sugar > ideal ? ' warn' : '';
    var left = Math.round((max - sum.sugar) * 10) / 10;
    return '<div class="gauge' + cls + '" style="--p:' + Math.min(100, Math.max(0, pct)) + '"><div class="mid">' +
      '<b>' + f1(sum.sugar) + ' g</b>' +
      '<small>' + esc(date) + '添加糖 · ' + f1(C.Calc.cubes(sum.sugar)) + ' 块方糖</small>' +
      '<em>' + (sum.count ? '占理想上限 ' + pct + '%' : '这一天还没有记录') + '</em></div></div>' +
      '<div class="left' + (left < 0 ? ' over' : '') + '">' +
      (sum.count ? (left >= 0 ? '距离每日上限还剩 <b>' + f1(left) + '</b> g' : '已超出每日上限 <b>' + f1(-left) + '</b> g') : '记一条就能看到剩余额度') +
      '</div><div class="sub"><span>理想 <b>' + f1(ideal) + '</b> g</span><span>上限 <b>' + f1(max) + '</b> g</span>' +
      '<span>能量 <b>' + f1(sum.kcal) + '</b> kcal</span></div>';
  }
  function weekStrip() {
    var out = '';
    for (var i = 6; i >= 0; i--) {
      var d = C.today(i), dt = new Date(d.replace(/-/g, '/'));
      var sum = C.Daily.summary(d);
      out += '<button class="d' + (S.day === i ? ' on' : '') + (sum.count ? ' has' : '') + '" data-action="day" data-k="' + i + '">' +
        '<em>' + '日一二三四五六'.charAt(dt.getDay()) + '</em><b>' + (+d.slice(8)) + '</b></button>';
    }
    return '<div class="week">' + out + '</div>';
  }
  function foodItem(r, showDel) {
    var mk = takenMeal(r);
    return '<div class="fitem"><span class="ico" style="background:' + MEAL_COLOR[mk] + '">' + esc((r.name || '?').slice(0, 1)) + '</span>' +
      '<div class="bd"><b>' + esc(r.name) + '</b><small>' +
      (r.portion ? f1(r.portion) + (r.unit === 'mL' ? ' mL' : ' g') + ' · ' : '') +
      esc(r.note || (r.source === 'catalog' ? '来自词条' : r.source === 'manual' ? '手工记录' : '标签解读')) + '</small></div>' +
      '<div class="rt"><span class="sbadge ' + badgeClass(r.sugar) + '">' + f1(r.sugar) + ' g</span>' +
      '<div class="small muted">' + f1(C.Calc.cubes(r.sugar)) + ' 块方糖</div>' +
      (showDel ? '<button class="del" data-action="del-record" data-id="' + r.id + '">删除</button>' : '') + '</div></div>';
  }
  function mealBlocks(date) {
    var sum = C.Daily.summary(date);
    var recs = C.Daily.ofDate(date);
    return D.MEALS.map(function (m) {
      var items = recs.filter(function (r) { return takenMeal(r) === m.k; }).reverse();
      var ms = sum.meals[m.k];
      return '<div class="meal"><div class="meal-h"><span class="mi" style="background:' + MEAL_COLOR[m.k] + '">' + esc(m.t.charAt(0)) + '</span>' +
        '<b>' + esc(m.t) + '</b><span class="rng">' + esc(m.range) + '</span>' +
        '<span class="sum">' + (ms.count ? '<i>' + f1(ms.sugar) + ' g</i> · ' + ms.count + ' 条' : '—') + '</span></div>' +
        (items.length ? items.map(function (r) { return foodItem(r, true); }).join('') : '') +
        '<button class="meal-add" data-action="meal-add" data-k="' + m.k + '"><span class="plus">+</span>记录这一餐</button></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ 页面 */
  var PAGES = {};

  PAGES.home = function () {
    var sum = C.Daily.summary(C.today());
    var month = C.Daily.trend(30), msum = 0, mc = 0;
    month.forEach(function (m) { msum += m.sugar; if (m.count) mc++; });
    var recs = C.Daily.ofDate(C.today()).slice(-4).reverse();
    var prog = C.Export.progress();
    return '<div class="hero" style="padding-top:14px">' + heroBlock(sum, '今天') + '</div>' +
      meterBlock(sum.sugar, S.prefs.ideal, S.prefs.max) +
      '<div class="kpis"><div class="kpi"><b>' + f1(sum.sugar) + '</b><small>今日 g</small></div>' +
      '<div class="kpi"><b>' + (mc ? f1(msum / mc) : '—') + '</b><small>30 天日均</small></div>' +
      '<div class="kpi"><b>' + C.Daily.streak() + '</b><small>连续记录天</small></div></div>' +
      '<div class="grid4">' +
      g4('scan', '解读标签', '算糖 + 拍照识配料', '#00b578', '算') +
      g4('daily', '记录这一餐', sum.count + ' 条', '#1d8cff', '记') +
      g4('quiz', '知识测评', D.QUIZ.length + ' 题', '#ff9f43', '测') +
      g4('data', '数据集', prog.measured + ' 条实测', '#66419e', '库') +
      '</div>' +
      '<div class="banner"><b>GB 28050-2025 已把"糖"列为强制标示项</b>' +
      '<small>' + esc(D.STANDARDS.GB28050.mandatory) + '；' + esc(D.STANDARDS.GB28050.effective) + '</small></div>' +
      '<div class="group-title">今天的记录</div>' +
      (recs.length ? '<div class="meal">' + recs.map(function (r) { return foodItem(r, false); }).join('') +
        '<button class="meal-add" data-action="meal-add" data-k="' + guessMeal() + '"><span class="plus">+</span>再记一条</button></div>'
        : '<div class="empty"><div class="box"></div>还没有记录，先去「解读」算一瓶饮料</div>') +
      '<div class="notice">' + esc(D.NOTES[0]) + '</div>';
  };
  function g4(k, t, d, color, ch) {
    return '<button class="g4" data-action="tab" data-k="' + k + '"><span class="gi" style="background:' + color + '">' + ch + '</span>' +
      '<span class="gt">' + esc(t) + '</span><span class="gd">' + esc(d) + '</span></button>';
  }

  PAGES.scan = function () {
    var f = S.form;
    var seg = '<div class="tabs3"><button data-action="scan-tab" data-k="label" class="' + (S.scanTab === 'label' ? 'on' : '') + '">营养成分表</button>' +
      '<button data-action="scan-tab" data-k="ing" class="' + (S.scanTab === 'ing' ? 'on' : '') + '">配料表 · 拍照识别</button></div>';
    if (S.scanTab === 'ing') {
      return seg + photoBlock('scan') + draftHtml() +
        '<div class="field" style="margin-top:10px;border-radius:16px;box-shadow:var(--sh)"><label>配料表原文（按加入量递减排列，可手打、可粘贴、可由上面的草稿改）</label>' +
        '<textarea id="in-ing" placeholder="配料：水、白砂糖、果葡糖浆、小麦粉、食用盐、酵母、单，双甘油脂肪酸酯、山梨酸钾">' + esc(f.ing) + '</textarea></div>' +
        '<div class="btn-row"><button class="btn block" data-action="parse-ing">识别隐形糖</button></div>' +
        '<div class="notice">词表收录 ' + D.TERMS.filter(function (t) { return t.kind === 'added' || t.kind === 'juice'; }).length + ' 个添加糖/游离糖别名、' +
        D.TERMS.filter(function (t) { return t.kind === 'polyol'; }).length + ' 个糖醇、' +
        D.TERMS.filter(function (t) { return t.kind === 'sweetener'; }).length + ' 个非糖甜味剂；命中位置越靠前说明加得越多。<br>' +
        '拍照识别只在本机跑，图片不上传；实测中文单字仍有 5–8% 错，所以它出的是草稿不是结论。</div>';
    }
    return seg +
      '<div class="seg"><button data-action="state" data-k="solid" class="' + (f.state === 'solid' ? 'on' : '') + '">固体（每 100 g）</button>' +
      '<button data-action="state" data-k="liquid" class="' + (f.state === 'liquid' ? 'on' : '') + '">液体（每 100 mL）</button></div>' +
      '<div class="card" style="padding:0">' +
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
      '<div class="field"><label>配料表（选填，填了就同时识别隐形糖；拍照识别在「配料表」那一栏）</label>' +
      '<textarea id="in-ing" placeholder="配料：水、白砂糖、果葡糖浆……">' + esc(f.ing) + '</textarea></div>' +
      (f.sugar === '' ? '<div class="field"><label>糖行缺失时的假设：糖占可利用碳水 <b id="share-val">' + f.share + '</b>%（仅用于敏感性分析，不是实测值）</label>' +
        '<input id="in-share" type="range" min="0" max="100" step="5" value="' + f.share + '" /></div>' : '') +
      '</div>' +
      '<div class="btn-row"><button class="btn block" data-action="calc">算一算</button></div>';
  };

  PAGES.result = function () {
    var r = S.result;
    if (!r) return '<div class="empty">先去「解读」填一张标签</div>';
    var meal = S.recordMeal || guessMeal();
    var vd = '<div class="verdict">' +
      '<span class="vd ' + (r.claim.unknown ? 'warn' : (r.claim.sugarFree || r.claim.lowSugar) ? 'ok' : 'bad') + '">' + esc(r.claim.text) + '</span>' +
      (r.hasSugarLine ? '<span class="vd">标签已标示"糖"行</span>' : '<span class="vd warn">标签未标示"糖"：结果依赖假设</span>') +
      (r.estimated ? '<span class="vd warn">假设糖占碳水 ' + r.assumeShare + '%</span>' : '') +
      '</div>';
    var kv = '<table class="kv">' +
      row('每 100' + (r.state === 'liquid' ? 'mL' : 'g') + ' 含糖', (r.hasSugarLine ? '' : '假设 ') + f1(r.sugarPer100) + ' g') +
      row('这一份（' + r.portion + (r.state === 'liquid' ? ' mL' : ' g') + '）', '<b>' + f1(r.servingSugar) + ' g</b>') +
      row('相当于方糖', f1(r.cubes) + ' 块') +
      row('占每日理想上限 ' + S.prefs.ideal + ' g', '<span class="' + level(r.pctIdeal) + '">' + r.pctIdeal + '%</span>') +
      row('占每日上限 ' + S.prefs.max + ' g', '<span class="' + level(r.pctMax) + '">' + r.pctMax + '%</span>') +
      (r.kcal100 != null ? row('能量', f1(r.kcalServing) + ' kcal（NRV ' + r.nrvPct + '%）') : '') +
      (r.sugarKcal != null ? row('其中糖供能', r.sugarKcal + ' kcal') : '') +
      '</table>';
    var ing = '';
    if (r.ingredients) {
      var g = r.ingredients;
      ing = '<div class="card"><h3>配料表识别<span class="big">' + esc(g.level) + '</span></h3>' +
        '<div class="small muted">共切出 ' + g.tokens.length + ' 项，右上角数字是它在配料表里的位次</div>' +
        '<div class="toks mt">' + g.tokens.map(function (t, i) {
          var hit = g.hits.filter(function (h) { return h.position === i + 1; })[0];
          return '<span class="tok ' + (hit ? hit.kind : '') + '">' + esc(t) + (hit ? '<sup>' + (i + 1) + '</sup>' : '') + '</span>';
        }).join('') + '</div>' +
        '<div class="legend"><span><em style="background:#f5483b"></em>添加糖</span><span><em style="background:#ff8a3d"></em>游离糖（果汁）</span>' +
        '<span><em style="background:#1d8cff"></em>糖醇</span><span><em style="background:#5b3fd0"></em>非糖甜味剂</span>' +
        '<span><em style="background:#ffc300"></em>快升碳水</span></div>' +
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
    var chips = r.servingSugar == null ? '' :
      '<div class="card" style="padding:14px 16px 4px"><h4>记到哪一餐</h4><div class="chips" style="padding:0 0 12px">' +
      D.MEALS.map(function (m) {
        return '<button class="chip' + (m.k === meal ? ' on' : '') + '" data-action="meal-choice" data-k="' + m.k + '">' + esc(m.t) + '</button>';
      }).join('') + '</div></div>';
    return '<div class="hero" style="padding-top:14px"><div class="gauge' +
      (r.pctIdeal > 200 ? ' over' : r.pctIdeal > 100 ? ' warn' : '') + '" style="--p:' + Math.min(100, r.pctIdeal || 0) + '"><div class="mid">' +
      '<b>' + f1(r.servingSugar) + ' g</b><small>这一份的添加糖</small><em>' + f1(r.cubes) + ' 块方糖 · 占理想上限 ' + (r.pctIdeal || 0) + '%</em></div></div></div>' +
      '<div class="card">' + vd + kv + '</div>' + sens + ing + chips +
      '<div class="btn-row"><button class="btn" data-action="save-record">记入' + esc(mealName(meal)) + '</button>' +
      (S.admin ? '<button class="btn ghost" data-action="save-food">存为实测词条</button>' : '') + '</div>' +
      '<div class="btn-row"><button class="btn soft block" data-action="again">再测一个</button></div>';
  };
  function row(k, v) { return '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>'; }

  PAGES.daily = function () {
    var date = C.today(S.day);
    var sum = C.Daily.summary(date);
    var trend = C.Daily.trend(7), mx = Math.max(S.prefs.ideal, 1);
    trend.forEach(function (t) { mx = Math.max(mx, t.sugar); });
    return weekStrip() +
      '<div class="hero" style="padding-top:6px">' + heroBlock(sum, date + ' ') + '</div>' +
      meterBlock(sum.sugar, S.prefs.ideal, S.prefs.max) +
      '<div class="chart"><h4>近 7 天添加糖</h4><div class="bars">' + trend.map(function (t) {
        return '<div class="bcol"><i style="height:' + Math.max(3, Math.round(t.sugar / mx * 76)) + 'px"></i>' +
          '<span class="bval">' + f1(t.sugar) + '</span><em>' + t.date.slice(8) + '</em></div>';
      }).join('') + '</div>' +
      '<div class="small muted mt">理想 ' + f1(S.prefs.ideal) + ' g / 上限 ' + f1(S.prefs.max) + ' g，口径来自《中国居民膳食指南（2022）》</div></div>' +
      mealBlocks(date) +
      '<div class="group-title">这一周</div>' +
      '<div class="chart"><h4>按天看</h4><div class="bars7">' + trend.map(function (t) {
        var p = t.sugar / Math.max(S.prefs.max, 1);
        return '<i class="' + (p === 0 ? '' : p < 0.5 ? 'l1' : p < 1 ? 'l2' : p < 1.5 ? 'l3' : 'l4') + '"></i>';
      }).join('') + '</div>' +
      '<div class="dist">' + D.MEALS.map(function (m) {
        var v = sum.meals[m.k].sugar;
        return v > 0 ? '<i style="width:' + (v / Math.max(sum.sugar, 0.1) * 100) + '%;background:' + MEAL_COLOR[m.k] + '"></i>' : '';
      }).join('') + '</div>' +
      '<div class="small muted">' + (sum.sugar > 0
        ? D.MEALS.filter(function (m) { return sum.meals[m.k].sugar > 0; }).map(function (m) {
            return m.t + ' ' + f1(sum.meals[m.k].sugar) + ' g';
          }).join(' · ')
        : '这一天还没有按餐次记录') + '</div></div>' +
      '<div class="group-title">导出</div>' +
      '<div class="cell-group">' +
      cell('export-daily', '导出我的记录 CSV', '含日期、餐次、添加糖克数，可直接做统计分析') +
      cell2('photo-count', '本机已存标签照片', '存在浏览器 IndexedDB，不上传') +
      '</div>' +
      '<div class="notice">' + esc(D.NOTES[0]) + '</div>';
  };

  PAGES.data = function () {
    var list = C.Catalog.search(S.kw), prog = C.Export.progress();
    return '<div class="searchbar"><input id="dkw" placeholder="搜产品 / 品牌 / 类别" value="' + esc(S.kw) + '" />' +
      '<button class="btn sm" data-action="reset-kw">重置</button></div>' +
      '<div class="card"><h3>数据集进度<span class="big">' + prog.measured + ' / ' + prog.target + '</span></h3>' +
      meterBlock(prog.measured, prog.target / 3, prog.target) +
      '<div class="small muted">已拍照片 ' + prog.withPhoto + ' 条 · 已存配料表原文 ' + prog.withIng + ' 条 · 内置带出处种子条目 ' + D.SEEDS.length + ' 条</div>' +
      '<div class="src mt">' + esc(D.NOTES[1]) + '</div></div>' +
      (S.admin ? '<div class="btn-row"><button class="btn block" data-action="new-food">+ 录入实测标签</button></div>'
        : '<div class="notice">新增词条、删除词条与整库导出需要管理口令，在「我的 → 管理入口」设定。</div>') +
      (list.length ? '<div class="meal">' + list.slice(0, 60).map(function (f) {
        var one = f.sugarPer100 == null ? null : C.Calc.perServing(f.sugarPer100, +f.portion || 100);
        return '<div class="fitem" data-action="detail" data-id="' + f.id + '">' +
          '<span class="ico" style="background:' + (f.origin === 'seed' ? '#8a94a6' : '#00b578') + '">' + esc((f.name || '?').slice(0, 1)) + '</span>' +
          '<div class="bd"><b>' + esc(f.name) + '</b><small>' + esc(f.cat || '未分类') + ' · ' + esc(f.per || '') + '</small></div>' +
          '<div class="rt">' + (one == null ? '<span class="sbadge warn">未标糖</span>'
            : '<span class="sbadge ' + badgeClass(one) + '">' + f1(f.sugarPer100) + ' g/100</span>') + '</div></div>';
      }).join('') + '</div>' + (list.length > 60 ? '<div class="empty">共 ' + list.length + ' 条，先显示前 60 条，用搜索缩小范围</div>' : '')
        : '<div class="empty"><div class="box"></div>没有匹配词条</div>') +
      '<div class="group-title">导出</div><div class="cell-group">' +
      cell('export-csv', '导出实测标签 CSV', '字段含照片文件名与录入人，可直接进论文附表') +
      cell('export-json', '导出整库 JSON', '给网页版与小程序端共用的数据源') +
      cell('export-daily', '导出我的记录 CSV', '匿名自我记录，可作为使用行为数据') +
      '</div>';
  };
  function cell(act, t, d) {
    return '<div class="cell tap" data-action="' + act + '"><div class="bd"><b>' + esc(t) + '</b><small>' + esc(d) + '</small></div><div class="ft">导出</div></div>';
  }
  function cell2(act, t, d) {
    return '<div class="cell tap" data-action="' + act + '"><div class="bd"><b>' + esc(t) + '</b><small>' + esc(d) + '</small></div><div class="ft"></div></div>';
  }

  PAGES.detail = function () {
    var f = C.Catalog.get(S.detailId);
    if (!f) return '<div class="empty">词条不存在</div>';
    var code = photoCodeOf(f);
    var capName = f.photoFile || ((code || f.id) + '.jpg');
    var one = f.sugarPer100 == null ? null : C.Calc.perServing(f.sugarPer100, +f.portion || 100);
    var photoHtml = S.detailPhoto
      ? '<div class="photo"><div class="pv"><img src="' + S.detailPhoto.dataUrl + '" alt="标签照片" /><span class="cap">' + esc(capName) + '</span></div>' +
        '<div class="acts"><button data-action="download-photo">下载这张照片</button></div></div>'
      : (code ? '<div class="photo"><div class="pv">本机没有找到 ' + esc(code) + ' 的照片（换过设备或清过数据）</div></div>' : '');
    return photoHtml +
      '<div class="card"><h3>' + esc(f.name) + '</h3>' +
      '<div class="verdict"><span class="vd">' + esc(f.cat || '未分类') + '</span>' +
      '<span class="vd ' + (f.origin === 'seed' ? 'warn' : 'ok') + '">' + esc(f.level || '') + '</span>' +
      (one == null ? '<span class="vd warn">标签未标示糖</span>' : '<span class="vd ok">' + f1(f.sugarPer100) + ' g/100</span>') + '</div>' +
      '<table class="kv">' +
      row('品牌', esc(f.brand || '—')) + row('计量口径', esc(f.per || '—')) +
      (one != null ? row('这一份的糖', '<b>' + f1(one) + ' g</b>（' + f1(C.Calc.cubes(one)) + ' 块方糖）') : '') +
      (one != null ? row('占每日理想上限', '<span class="' + level(C.Calc.pct(one, S.prefs.ideal)) + '">' + C.Calc.pct(one, S.prefs.ideal) + '%</span>') : '') +
      (f.carbPer100 != null ? row('碳水 /100', f1(f.carbPer100) + ' g') : '') +
      (f.fiberPer100 != null ? row('膳食纤维 /100', f1(f.fiberPer100) + ' g') : '') +
      (f.energyKjPer100 != null ? row('能量 /100', f1(f.energyKjPer100) + ' kJ ≈ ' + C.Calc.kjToKcal(f.energyKjPer100) + ' kcal') : '') +
      (f.photoFile ? row('标签照片', esc(f.photoFile)) : '') +
      (f.annotator ? row('录入人', esc(f.annotator)) : '') +
      '</table>' +
      (f.ingText ? '<div class="hr"></div><div class="small"><b>配料表原文</b><div class="muted small">' + esc(f.ingText) + '</div></div>' +
        (function () {
          var p = C.Parser.parseIngredients(f.ingText);
          return '<div class="toks mt">' + p.tokens.map(function (t, i) {
            var hit = p.hits.filter(function (h) { return h.position === i + 1; })[0];
            return '<span class="tok ' + (hit ? hit.kind : '') + '">' + esc(t) + '</span>';
          }).join('') + '</div>' +
          '<div class="small muted mt">判级：' + esc(p.level) + '</div>' +
          p.reasons.map(function (x) { return '<div class="small muted">· ' + esc(x) + '</div>'; }).join('');
        })() : '') +
      (f.src ? '<div class="hr"></div><div class="src">来源：' + esc(f.srcNote || '') + '<br><a href="' + esc(f.src) + '" target="_blank" rel="nofollow">' + esc(f.src) + '</a></div>' : '') +
      '</div>' +
      '<div class="btn-row"><button class="btn" data-action="record-food" data-id="' + f.id + '">记入今日</button>' +
      (S.admin ? '<button class="btn ghost" data-action="edit-food" data-id="' + f.id + '">编辑</button>' +
        (f.origin === 'measured' ? '<button class="btn warn" data-action="del-food" data-id="' + f.id + '">删除</button>' : '') : '') + '</div>';
  };

  PAGES.edit = function () {
    var f = S.editing || {};
    var next = C.Catalog.nextCode();
    var fld = function (k, label, ph) {
      return '<div class="field"><label>' + esc(label) + '</label><input id="fd-' + k + '" value="' + esc(f[k] == null ? '' : f[k]) + '" placeholder="' + esc(ph || '') + '" /></div>';
    };
    return '<div class="notice">这一页是数据采集端：一条记录对应一张包装标签照片。编号和照片文件名对齐，例如 ' + esc(next) + ' → ' + esc(next) + '.jpg。</div>' +
      photoBlock('edit') +
      '<div class="card" style="padding:0">' +
      fld('id', '编号（留空则按 ' + next + ' 生成）', next) +
      fld('brand', '品牌', '例如 某某') + fld('name', '产品名称', '例如 柠檬味苏打饼干') +
      fld('cat', '类别', '饮料 / 焙烤 / 调味品 / 乳制品 …') +
      '<div class="field"><label>类别快选</label></div><div class="chips">' +
      D.CATS.map(function (c) { return '<button class="chip' + (f.cat === c ? ' on' : '') + '" data-action="pick-cat" data-k="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') +
      '</div>' +
      '<div class="field"><label>形态</label></div>' +
      '<div class="seg" style="margin:0 0 4px"><button data-action="edit-state" data-k="solid" class="' + (f.state !== 'liquid' ? 'on' : '') + '">固体</button>' +
      '<button data-action="edit-state" data-k="liquid" class="' + (f.state === 'liquid' ? 'on' : '') + '">液体</button></div>' +
      fld('sugarPer100', '标签"糖" g/100g(mL)（没有这一行就留空）', '10.6') +
      fld('carbPer100', '碳水化合物 g/100g(mL)', '62') + fld('fiberPer100', '膳食纤维 g/100g(mL)', '选填') +
      fld('energyKjPer100', '能量 kJ/100g(mL)', '1800') + fld('portion', '一份的量 g(mL)', '330') +
      fld('photoFile', '标签照片文件名（留空则用编号）', next + '.jpg') +
      fld('annotator', '录入人（组员姓名或代号）', '组员A') +
      '<div class="field"><label>配料表原文（可由上面的照片识别出草稿，核对后保存）</label><textarea id="fd-ingText">' + esc(f.ingText || '') + '</textarea></div>' +
      fld('src', '来源链接（选填；没有照片时靠它保证可追溯）', 'https://…') +
      '</div>' +
      '<div class="btn-row"><button class="btn block" data-action="save-food-db">保存词条</button></div>';
  };

  PAGES.quiz = function () {
    if (!S.quiz) {
      return '<div class="card"><h3>隐形糖知识测评</h3>' +
        '<p class="small muted">共 ' + D.QUIZ.length + ' 题，随机抽 8 题，答完给分和解析。题目依据 GB 28050-2025、GB 7718-2025 与《中国居民膳食指南（2022）》。</p>' +
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
    return '<div class="result"><div class="ring" style="background:conic-gradient(var(--pri) ' + (r.score * 3.6) + 'deg,#eceef0 0)">' +
      '<div class="pct"><b>' + r.score + '</b><small>得分</small></div></div>' +
      '<div class="small muted">答对 ' + r.right + ' / ' + r.total + ' 题</div></div>' +
      (r.wrong.length ? '<div class="group-title">错题解析</div>' + r.wrong.map(function (w) {
        return '<div class="explain"><b>' + esc(w.q) + '</b><div class="small muted">你选：' + esc(w.chosen || '未作答') + '</div>' +
          '<div class="small">正确：' + esc(w.right) + '</div><div class="small muted">' + esc(w.why) + '（' + esc(w.std) + '）</div></div>';
      }).join('') : '<div class="notice">全对，说明你对标签阈值的掌握没问题。</div>') +
      '<div class="btn-row"><button class="btn" data-action="quiz-start">再来一轮</button><button class="btn ghost" data-action="tab" data-k="home">回首页</button></div>';
  };

  PAGES.me = function () {
    var sum = C.Daily.summary(C.today());
    return '<div class="mehead"><span class="avatar">' + esc((S.prefs.nickname || '游').slice(0, 1)) + '</span>' +
      '<div><b>' + esc(S.prefs.nickname || '未命名使用者') + '</b><small>数据只存在本机，不上传；换设备需重新录入</small></div></div>' +
      '<div class="card"><h3>今日额度<span class="big">' + f1(sum.sugar) + ' / ' + f1(S.prefs.max) + ' g</span></h3>' +
      meterBlock(sum.sugar, S.prefs.ideal, S.prefs.max) +
      '<div class="small muted">连续记录 ' + C.Daily.streak() + ' 天 · 词条 ' + C.Catalog.all().length + ' 条 · 本机记录 ' + C.Daily.list().length + ' 条</div></div>' +
      '<div class="card" style="padding:0">' +
      '<div class="field"><label>昵称</label><input id="pf-nick" value="' + esc(S.prefs.nickname) + '" /></div>' +
      '<div class="field"><label>每日添加糖理想上限（g）</label><input id="pf-ideal" inputmode="decimal" value="' + S.prefs.ideal + '" /></div>' +
      '<div class="field"><label>每日添加糖上限（g）</label><input id="pf-max" inputmode="decimal" value="' + S.prefs.max + '" /></div>' +
      '<div class="field"><label>糖行缺失时的默认假设（糖占可利用碳水 %）</label><input id="pf-share" inputmode="decimal" value="' + S.prefs.sugarShare + '" /></div>' +
      '</div>' +
      '<div class="btn-row"><button class="btn block" data-action="save-prefs">保存设置</button></div>' +
      '<div class="group-title">管理入口</div>' +
      (S.admin ? '<div class="cell-group"><div class="cell noarrow"><div class="bd"><b>已解锁</b><small>可录入/删除词条、存照片、整库导出</small></div><div class="ft"><button class="btn sm ghost" data-action="admin-out">退出</button></div></div></div>'
        : (C.Admin.ready()
          ? '<div class="cell-group"><div class="field"><label>管理口令</label><input id="ad-pwd" type="password" placeholder="由管理员本人设定，页面不展示" /></div>' +
            '<div class="btn-row"><button class="btn block ghost" data-action="admin-login">解锁管理功能</button></div></div>'
          : '<div class="cell-group"><div class="field"><label>首次使用请设定管理口令（≥6 位，不设默认值）</label><input id="ad-pwd" type="password" /></div>' +
            '<div class="field"><label>确认管理口令</label><input id="ad-pwd2" type="password" /></div>' +
            '<div class="btn-row"><button class="btn block" data-action="admin-set">设定并解锁</button></div></div>')) +
      '<div class="group-title">本机数据</div><div class="cell-group">' +
      cell2('go-about', '标准与数据来源', 'GB 28050-2025 / GB 7718-2025 / 膳食指南 2022 / WHO 2015') +
      cell2('photo-count', '本机标签照片', '随词条编号归档在浏览器里') +
      cell2('keys', '查看存储键位', C.Store.keys().join(' · ') || '还没有键') +
      '</div>' +
      '<div class="btn-row"><button class="btn warn block" data-action="clear-all">清空本机数据</button></div>' +
      '<div class="notice">' + esc(D.NOTES[2]) + '</div>';
  };

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
      '<div class="card"><h3>拍照识别的可靠性</h3>' +
      '<div class="small muted">' + esc(D.OCR.tip) + '</div>' +
      '<table class="kv">' + row('引擎', 'tesseract.js v5，跑在浏览器里，图片不上传') +
      row('语言包', D.OCR.lang + ' best_int，约 1.7 MB，首次点击才下载') +
      row('实测', '干净印刷体置信度约 84，中文单字仍有 5–8% 错；数字与小数点可靠') +
      row('用途', '只出配料表草稿，核对后才进识别与数据集') + '</table></div>' +
      '<div class="notice">' + esc(D.NOTES[0]) + '</div><div class="notice">' + esc(D.NOTES[1]) + '</div>';
  };

  /* ------------------------------------------------------------ 事件 */
  function collectForm() {
    ['sugar', 'carb', 'fiber', 'kj', 'portion'].forEach(function (k) {
      var x = $('#in-' + k); if (x) S.form[k] = x.value.trim();
    });
    var ing = $('#in-ing'); if (ing && S.page === 'scan') S.form.ing = ing.value.trim();
    var sh = $('#in-share'); if (sh) S.form.share = +sh.value;
  }
  document.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'dkw') {
      var box = e.target;
      S.kw = box.value;
      clearTimeout(S._t);
      S._t = setTimeout(function () {
        var pos = box.selectionStart; render();
        var n = $('#dkw'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) {} }
      }, 260);
      return;
    }
    if (id === 'in-share' && $('#share-val')) $('#share-val').textContent = e.target.value;
  });
  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id !== 'in-photo' && id !== 'fd-photo') return;
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    readPhoto(file).then(function (out) {
      if (id === 'in-photo') { S.photo = out; S.ocr = { state: 'idle' }; }
      else S.editPhoto = out;
      render();
      toast('照片已就绪 ' + out.w + '×' + out.h + '，可点识别配料表', true);
    }).catch(function (err) {
      if (id === 'fd-photo') S.editPhoto = null; else S.photo = null;
      render();
      toast((err && err.message) || '照片读取失败');
    });
  });

  function addRecord(o) {
    return C.Daily.add({ name: o.name, sugar: o.sugar, kcal: o.kcal || 0, portion: o.portion || null,
      unit: o.unit || null, source: o.source, note: o.note || '', meal: o.meal || guessMeal(),
      date: C.today(S.page === 'daily' ? S.day : 0) });
  }

  var ACT = {
    'tab': function () { S.stack = []; closeSheet(); go(el.getAttribute('data-k'), true); },
    'scan-tab': function () { collectForm(); S.scanTab = el.getAttribute('data-k'); S.ocr = { state: 'idle' }; render(); },
    'state': function () { collectForm(); S.form.state = el.getAttribute('data-k'); render(); },
    'day': function () { S.day = +el.getAttribute('data-k'); render(); },
    'reset-kw': function () { S.kw = ''; render(); },
    'close-sheet': function () { closeSheet(); },
    'meal-choice': function () { collectForm(); S.recordMeal = el.getAttribute('data-k'); render(); },
    'meal-add': function () {
      var meal = el.getAttribute('data-k');
      var list = C.Catalog.all().filter(function (f) { return f.sugarPer100 != null; }).slice(0, 12);
      openSheet('<h4>' + esc(mealName(meal)) + ' · 记一条</h4>' +
        '<div class="hint">点数据集里的条目就按词条份量记；没有想记的就手填糖克数。</div>' +
        '<button class="row" data-action="manual-form" data-k="' + meal + '"><b>手填一项</b><small>名称 + 添加糖 g，标签上算出来的数也能记进来</small></button>' +
        '<button class="row" data-action="go-scan"><b>先去「解读」算一份</b><small>填营养标签或拍配料表</small></button>' +
        list.map(function (f) {
          var one = C.Calc.perServing(f.sugarPer100, +f.portion || 100);
          return '<button class="row" data-action="record-catalog" data-id="' + f.id + '" data-k="' + meal + '">' +
            '<b>' + esc(f.name) + '<small>' + esc(f.cat || '未分类') + ' · ' + f1(one) + ' g 糖</small></b>' +
            '<span class="sbadge ' + badgeClass(one) + '">' + f1(one) + ' g</span></button>';
        }).join('') +
        '<button class="cancel" data-action="close-sheet">取消</button>');
    },
    'go-scan': function () { closeSheet(); S.stack = []; go('scan', true); },
    'manual-form': function () {
      var k = el.getAttribute('data-k');
      closeSheet();
      promptBox(mealName(k) + ' · 手填', [
        { ph: '名称，例如 全麦面包 2 片' },
        { ph: '添加糖 g', num: true },
        { ph: '能量 kcal（选填）', num: true }
      ], '记入', function (v) {
        if (!v[0]) return toast('名称不能为空');
        if (v[1] == null || isNaN(v[1]) || v[1] < 0) return toast('糖克数要填一个不小于 0 的数');
        addRecord({ name: v[0], sugar: v[1], kcal: v[2] || 0, meal: k, source: 'manual' });
        afterAdd(k, v[1]);
      });
    },
    'record-catalog': function () {
      var f = C.Catalog.get(el.getAttribute('data-id')), meal = el.getAttribute('data-k');
      closeSheet();
      if (!f || f.sugarPer100 == null) return toast('这条没有糖数值');
      var one = C.Calc.perServing(f.sugarPer100, +f.portion || 100);
      addRecord({ name: f.name, sugar: one, kcal: f.energyKjPer100 ? C.Calc.kjToKcal(f.energyKjPer100) * ((+f.portion || 100) / 100) : 0,
        portion: +f.portion || 100, unit: f.state === 'liquid' ? 'mL' : 'g', source: 'catalog', note: f.cat || '', meal: meal });
      afterAdd(meal, one);
    },
    'pick-photo': function () { $('#in-photo').click(); },
    'pick-edit-photo': function () { $('#fd-photo').click(); },
    'clear-photo': function () { S.photo = null; S.ocr = { state: 'idle' }; render(); },
    'clear-edit-photo': function () { S.editPhoto = null; S.ocr = { state: 'idle' }; render(); },
    'ocr-run': function () { runOcr('scan'); },
    'ocr-fill-edit': function () { runOcr('edit'); },
    'download-photo': function () {
      var f = C.Catalog.get(S.detailId);
      if (!S.detailPhoto || !S.detailPhoto.blob) return toast('本机没有这张照片');
      saveBlob((photoCodeOf(f) || f.id) + '.jpg', S.detailPhoto.blob);
      toast('已下载照片', true);
    },
    'photo-count': function () {
      C.Photos.codes().then(function (k) {
        toast(k.length ? '本机存了 ' + k.length + ' 张：' + k.slice(0, 6).join('、') + (k.length > 6 ? ' …' : '') : '本机还没有存照片');
      }, function () { toast('这台设备的浏览器不支持照片库'); });
    },
    'pick-cat': function () { S.editing = readEdit(); S.editing.cat = el.getAttribute('data-k'); render(); },
    'calc': function () {
      collectForm();
      if (S.form.sugar === '' && S.form.carb === '' && !S.form.ing) return toast('至少填糖、碳水或配料表中的一项');
      S.recordMeal = S.recordMeal || guessMeal();
      S.result = C.Calc.fromLabel({ state: S.form.state, sugarPer100: S.form.sugar, carbPer100: S.form.carb,
        fiberPer100: S.form.fiber, energyKjPer100: S.form.kj, portion: +S.form.portion || 0,
        ingText: S.form.ing, share: +S.form.share });
      go('result');
    },
    'parse-ing': function () {
      collectForm();
      if (!S.form.ing) return toast('先拍照识别，或粘贴/手打配料表');
      var p = C.Parser.parseIngredients(S.form.ing);
      S.recordMeal = S.recordMeal || guessMeal();
      S.result = C.Calc.fromLabel({ state: S.form.state, sugarPer100: S.form.sugar, carbPer100: S.form.carb,
        fiberPer100: S.form.fiber, energyKjPer100: S.form.kj, portion: +S.form.portion || 0, ingText: S.form.ing });
      go('result');
      toast('识别到 ' + p.hits.length + ' 个糖源/代糖词', !!p.hits.length);
    },
    'again': function () { S.stack = []; go('scan', true); },
    'save-record': function () {
      var r = S.result;
      if (r.servingSugar == null) return toast('没有可用的糖数值');
      var meal = S.recordMeal || guessMeal();
      addRecord({ name: '自填标签 · ' + (S.form.portion || 0) + (r.state === 'liquid' ? 'mL' : 'g'),
        sugar: r.servingSugar, kcal: r.kcalServing || 0, portion: r.portion, unit: r.state === 'liquid' ? 'mL' : 'g',
        source: 'label', meal: meal });
      S.recordMeal = meal;
      afterAdd(meal, r.servingSugar);
    },
    'save-food': function () {
      if (!S.admin) return toast('需要管理口令');
      var r = S.result;
      S.editing = { id: '', brand: '', name: '新产品 ' + new Date().toLocaleTimeString('zh-CN'), cat: '', state: r.state,
        sugarPer100: r.hasSugarLine ? r.sugarPer100 : '', carbPer100: S.form.carb, fiberPer100: S.form.fiber,
        energyKjPer100: S.form.kj, portion: S.form.portion, ingText: S.form.ing, photoFile: '', annotator: S.prefs.nickname };
      S.editPhoto = S.photo && S.photo.blob ? S.photo : null;
      go('edit');
    },
    'new-food': function () { S.editing = { id: '', name: '', state: 'solid' }; S.editPhoto = null; S.ocr = { state: 'idle' }; go('edit'); },
    'edit-food': function () {
      S.editing = C.Catalog.get(el.getAttribute('data-id'));
      S.editPhoto = null;
      hydratePhoto(photoCodeOf(S.editing), function (o) { S.editPhoto = o; });
      go('edit');
    },
    'edit-state': function () { S.editing = readEdit(); S.editing.state = el.getAttribute('data-k'); render(); },
    'save-food-db': function () {
      var ing = $('#fd-ingText');
      if (ing && S.editing) S.editing.ingText = ing.value.trim();
      var f = readEdit();
      if (!f.name) return toast('产品名称不能为空');
      if (!f.photoFile && !f.src && !S.editPhoto) return toast('实测录入要有照片或来源链接，保证数据可追溯');
      var code = /^S-\d{3,}$/.test(f.id) ? f.id : (photoCodeOf(f) || C.Catalog.nextCode());
      if (!f.id) f.id = code;
      if (!f.photoFile) f.photoFile = code + '.jpg';
      C.Catalog.save(f);
      var msg = '已保存词条 ' + f.id;
      var chain = S.editPhoto && S.editPhoto.blob
        ? C.Photos.put(code, S.editPhoto.blob).then(
            function () { msg = '已保存词条和照片 ' + code; },
            function () { msg = '词条已保存，但照片写进本机失败'; })
        : Promise.resolve();
      chain.then(function () {
        S.editing = null; S.editPhoto = null; S.ocr = { state: 'idle' };
        toast(msg, true);
        S.stack = []; go('data', true);
      });
    },
    'del-food': function () {
      var id = el.getAttribute('data-id');
      var code = photoCodeOf(C.Catalog.get(id));
      confirmBox('删除词条', '这条的' + (code ? '记录和照片 ' + code : '记录') + '都会被删掉，不可恢复。确定吗？', function () {
        C.Catalog.remove(id);
        if (code) C.Photos.remove(code).then(function () {}, function () {});
        S.stack = []; go('data', true); toast('已删除');
      }, true);
    },
    'detail': function () {
      S.detailId = el.getAttribute('data-id');
      S.detailPhoto = null;
      hydratePhoto(photoCodeOf(C.Catalog.get(S.detailId)), function (o) { S.detailPhoto = o; });
      go('detail');
    },
    'record-food': function () {
      var f = C.Catalog.get(el.getAttribute('data-id'));
      if (!f) return;
      if (f.sugarPer100 == null) return toast('这条没有糖数值（标签未标示），先补实测');
      var one = C.Calc.perServing(f.sugarPer100, +f.portion || 100);
      var meal = guessMeal();
      addRecord({ name: f.name, sugar: one, kcal: f.energyKjPer100 ? C.Calc.kjToKcal(f.energyKjPer100) * ((+f.portion || 100) / 100) : 0,
        portion: +f.portion || 100, unit: f.state === 'liquid' ? 'mL' : 'g', source: 'catalog', note: f.cat || '', meal: meal });
      afterAdd(meal, one);
    },
    'del-record': function () { C.Daily.remove(el.getAttribute('data-id')); render(); toast('已删除记录'); },
    'export-csv': function () { download('标签实测数据集_' + C.today() + '.csv', C.Export.csv(), true); toast('CSV 已下载'); },
    'export-json': function () { download('sugar-catalog_' + C.today() + '.json', C.Export.json()); toast('JSON 已下载'); },
    'export-daily': function () { download('我的记录_' + C.today() + '.csv', C.Export.dailyCsv(), true); toast('记录已下载'); },
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
      confirmBox('清空本机数据', '词条、照片、记录、测评成绩与管理口令都会删除，不可恢复。', function () {
        C.Store.clearAll();
        sessionStorage.removeItem('sg_admin');
        C.Photos.codes().then(function (ks) {
          ks.forEach(function (k) { C.Photos.remove(k).then(function () {}, function () {}); });
        }, function () {});
        S.prefs = C.Prefs.load(); S.admin = false; S.kw = ''; S.quiz = null;
        S.photo = null; S.editPhoto = null; S.detailPhoto = null; S.ocr = { state: 'idle' };
        S.stack = []; go('home', true); toast('已清空', true);
      }, true);
    }
  };
  function readEdit() {
    var f = S.editing || {};
    var g = function (k) { var x = $('#fd-' + k); return x ? x.value.trim() : (f[k] == null ? '' : f[k]); };
    var n = function (k) { var v = g(k); return v === '' ? null : +v; };
    return { id: g('id') || f.id || '', brand: g('brand'), name: g('name'), cat: g('cat'), state: f.state || 'solid',
      sugarPer100: n('sugarPer100'), carbPer100: n('carbPer100'), fiberPer100: n('fiberPer100'),
      energyKjPer100: n('energyKjPer100'), portion: n('portion'), photoFile: g('photoFile'), annotator: g('annotator'),
      ingText: (function () { var x = $('#fd-ingText'); return x ? x.value.trim() : (f.ingText || ''); })(),
      src: g('src'), per: (n('portion') || 100) + (f.state === 'liquid' ? ' mL/份' : ' g/份') };
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
