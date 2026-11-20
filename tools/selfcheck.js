/* 控糖有数 · 内核自检：可在浏览器打开 tools/selfcheck.html 运行，也可用 node tools/selfcheck.js */
(function (root) {
  var D, C;
  if (typeof module !== 'undefined' && module.exports) {
    D = require('../assets/data.js');
    C = require('../assets/core.js');
  } else { D = root.SugarData; C = root.SugarCore; }

  var pass = 0, fails = [];
  function ok(name, cond) { if (cond) pass++; else fails.push(name); }
  function eq(name, a, b) { ok(name + ' [' + a + ' ≠ ' + b + ']', a === b); }
  function near(name, a, b, tol) { ok(name + ' [' + a + ' ↮ ' + b + ']', Math.abs(a - b) <= (tol == null ? 0.05 : tol)); }
  C.Store.clearAll();

  /* ------------------------------------------------ 数据层可溯源 */
  ok('数据版本号存在', !!D.version);
  ok('糖源词表 ≥ 40 条', D.TERMS.length >= 40);
  var KINDS = { added: 1, juice: 1, polyol: 1, sweetener: 1, fastcarb: 1, oligo: 1 };
  ok('词表 kind 全部合法', D.TERMS.every(function (t) { return KINDS[t.kind] && t.term && t.note; }));
  ok('词表无重复词条', D.TERMS.map(function (t) { return t.term; }).filter(function (v, i, a) { return a.indexOf(v) !== i; }).length === 0);
  ok('内置条目全部带来源链接', D.SEEDS.every(function (s) { return /^https?:\/\//.test(s.src || ''); }));
  ok('内置条目全部标注数据性质', D.SEEDS.every(function (s) { return !!s.level && s.origin === 'seed'; }));
  ok('测评题 ≥ 10', D.QUIZ.length >= 10);
  ok('每题正确项在选项范围内', D.QUIZ.every(function (q) { return q.opts.length >= 2 && q.a >= 0 && q.a < q.opts.length; }));
  ok('每题都标注了依据', D.QUIZ.every(function (q) { return !!q.std && !!q.why; }));
  ok('话术清单 ≥ 8', D.MASKS.length >= 8);
  eq('无糖阈值 0.5', D.STANDARDS.GB28050.claims.sugarFree.max, 0.5);
  eq('低糖阈值 5', D.STANDARDS.GB28050.claims.lowSugar.max, 5);
  eq('比较声称差异 25%', D.STANDARDS.GB28050.claims.reduced.diff, 25);
  eq('膳食指南上限 50', D.STANDARDS.DRI.addedSugarMax, 50);
  eq('膳食指南理想 25', D.STANDARDS.DRI.addedSugarIdeal, 25);
  eq('能量 NRV 8400kJ', D.STANDARDS.ENERGY_NRV_KJ, 8400);
  eq('方糖按 4g', D.STANDARDS.CUBE_G, 4);

  /* ------------------------------------------------ 换算 */
  var K = C.Calc;
  eq('1700kJ ≈ 406kcal', K.kjToKcal(1700), 406);
  eq('0kJ → 0kcal', K.kjToKcal(0), 0);
  eq('每份糖 = 10.6×500/100', K.perServing(10.6, 500), 53);
  eq('份量为 0 时糖为 0', K.perServing(10.6, 0), 0);
  eq('53g 折方糖', K.cubes(53), 13.3);
  eq('占 25g 的百分比', K.pct(53, 25), 212);
  ok('0.4 达无糖', K.claim(0.4).sugarFree);
  ok('0.6 不达无糖', !K.claim(0.6).sugarFree);
  ok('5.0 达低糖', K.claim(5).lowSugar);
  ok('5.1 不达低糖', !K.claim(5.1).lowSugar);
  ok('空值不误判为低糖', !K.claim(null).lowSugar && !K.claim(null).sugarFree);
  ok('空值标注为未知', K.claim(null).unknown === true && /无法判定/.test(K.claim(null).text));
  ok('空字符串不误判为无糖', K.claim('').unknown === true);

  var r1 = K.fromLabel({ state: 'liquid', sugarPer100: 10.6, portion: 500, energyKjPer100: 180 });
  eq('可乐每份糖 53g', r1.servingSugar, 53);
  ok('可乐占理想 212%', r1.pctIdeal === 212);
  ok('可乐占上限 106%', r1.pctMax === 106);
  ok('已标糖行不估算', r1.hasSugarLine && !r1.estimated);
  near('180kJ/100 → 每份约 215kcal', r1.kcalServing, 215, 1);
  eq('NRV 2%', r1.nrvPct, 2);
  eq('糖供能 212kcal', r1.sugarKcal, 212);
  ok('53g 糖不满足低糖声称', !r1.claim.lowSugar);

  var r2 = K.fromLabel({ state: 'solid', carbPer100: 62, portion: 100, share: 50 });
  ok('糖行缺失走假设', r2.estimated && !r2.hasSugarLine);
  eq('碳水 62 假设 50% → 31g', r2.sugarPer100, 31);
  eq('假设比例回显', r2.assumeShare, 50);
  var r3 = K.fromLabel({ state: 'solid', carbPer100: 10, fiberPer100: 4, portion: 100, share: 50 });
  eq('先扣膳食纤维', r3.sugarPer100, 3);
  var r4 = K.fromLabel({ state: 'solid', portion: 50 });
  ok('什么都没填时不编数字', r4.sugarPer100 === null && r4.servingSugar === null && r4.cubes === null);
  ok('无糖行也给结论口径', /不符合|低糖|无糖/.test(r4.claim.text));

  var rg = K.range(62, 2, 100);
  eq('敏感性分析 5 档', rg.length, 5);
  eq('0% 档为 0', rg[0].serving, 0);
  ok('档位单调递增', rg.every(function (x, i) { return i === 0 || x.per100 >= rg[i - 1].per100; }));
  eq('100% 档等于可用碳水', rg[4].per100, 60);

  /* ------------------------------------------------ 配料表解析 */
  var P = C.Parser;
  var p1 = P.parseIngredients('配料：水、白砂糖、果葡糖浆、小麦粉、食用盐');
  eq('切分 5 项', p1.tokens.length, 5);
  eq('白砂糖位置 2', p1.hits.filter(function (h) { return h.term === '白砂糖'; })[0].position, 2);
  ok('糖源进前三判为高', p1.level === '高');
  ok('两种糖源叠加', p1.added.length >= 2);
  var p2 = P.parseIngredients('小麦粉、食用盐、酵母');
  ok('无糖源判未见糖源', p2.level === '未见糖源' && p2.added.length === 0);
  ok('三氯蔗糖不被误判成蔗糖', (function () { var h = P.findTerm('三氯蔗糖'); return !!h && h.kind === 'sweetener'; })());
  ok('低聚果糖不被误判成果糖', (function () { var x = P.parseIngredients('水、低聚果糖'); return x.added.length === 0 && x.ranks.oligo.length === 1; })());
  ok('浓缩果汁按最长词命中', P.findTerm('浓缩果汁').term === '浓缩果汁');
  ok('麦芽糖浆按最长词命中', P.findTerm('麦芽糖浆').term === '麦芽糖浆');
  var p3 = P.parseIngredients('水、赤藓糖醇、麦芽糊精、浓缩果汁');
  ok('糖醇单列且提示不计入', p3.ranks.polyol.length === 1 && p3.reasons.join().indexOf('不计入') >= 0);
  ok('麦芽糊精归入快升糖', p3.ranks.fastcarb.length === 1);
  ok('浓缩果汁计入游离糖', p3.added.some(function (h) { return h.term === '浓缩果汁'; }));
  var p4 = P.parseIngredients('配料表：水、白砂糖（蔗糖）、果汁');
  eq('括号注释被清掉', p4.tokens[1], '白砂糖');
  ok('空文本不报错', P.parseIngredients('').tokens.length === 0 && P.parseIngredients(null).level);
  eq('按位置定位词元', P.parseIngredients('水、果葡糖浆').hits[0].position, 2);
  ok('识别 0 蔗糖话术', P.detectClaims('本产品 0 蔗糖').length >= 1);
  ok('话术解释不为空', P.detectClaims('低糖')[0].truth.length > 4);
  var p5 = P.parseIngredients('水、食用香精、三氯蔗糖、麦芽糖浆');
  ok('甜味剂与糖浆同时命中', p5.ranks.sweetener.length === 1 && p5.added.length === 1);

  /* ------------------------------------------------ 存储与偏好 */
  C.Store.clearAll();
  ok('清空后无 sg_ 键', C.Store.keys().length === 0);
  C.Store.set('sg_probe', { a: 1 });
  eq('读写往返', C.Store.get('sg_probe').a, 1);
  C.Store.remove('sg_probe');
  eq('默认值兜底', C.Store.get('sg_nothing', 'dft'), 'dft');
  var pf = C.Prefs.load();
  eq('默认理想 25', pf.ideal, 25);
  eq('默认上限 50', pf.max, 50);
  pf.ideal = 20; C.Prefs.save(pf);
  eq('偏好可持久化', C.Prefs.load().ideal, 20);
  C.Prefs.load().ideal === 20 && (C.Store.clearAll());

  /* ------------------------------------------------ 词条 = 数据集 */
  C.Store.clearAll();
  eq('初始只有内置种子条目', C.Catalog.all().length, D.SEEDS.length);
  var f = C.Catalog.save({ name: '柠檬味苏打饼干', cat: '焙烤', brand: '某牌', state: 'solid',
    sugarPer100: 12, carbPer100: 70, portion: 100, photoFile: 'S-0001.jpg', annotator: '组员A',
    ingText: '小麦粉、白砂糖、植物油、食用盐' });
  ok('新词条有 id', !!f.id);
  eq('实测条目 origin', f.origin, 'measured');
  eq('实测条目级别', f.level, '标签实测录入');
  eq('保存后总数 +1', C.Catalog.all().length, D.SEEDS.length + 1);
  f.carbPer100 = 72; C.Catalog.save(f);
  eq('同 id 覆盖不新增', C.Catalog.all().length, D.SEEDS.length + 1);
  eq('覆盖后字段生效', C.Catalog.get(f.id).carbPer100, 72);
  eq('按名称搜索命中', C.Catalog.search('苏打').length, 1);
  eq('按类别搜索命中', C.Catalog.search('焙烤').length, 1);
  eq('空搜索返回全量', C.Catalog.search('').length, C.Catalog.all().length);
  ok('搜不到时为空', C.Catalog.search('zzz-不存在').length === 0);
  var pg = C.Export.progress();
  ok('进度统计含实测条数', pg.measured === 1 && pg.withPhoto === 1 && pg.withIng === 1);
  ok('进度含目标值', pg.target >= 300);

  /* ------------------------------------------------ 每日记录 */
  eq('初始无记录', C.Daily.list().length, 0);
  var rec = C.Daily.add({ name: '可乐 500mL', sugar: 53, kcal: 215, portion: 500, source: 'label' });
  ok('记录有 id 与日期', !!rec.id && rec.date === C.today());
  C.Daily.add({ name: '酸奶', sugar: 12, date: C.today(1), source: 'catalog' });
  near('今日合计 53', C.Daily.summary(C.today()).sugar, 53);
  eq('今日 1 条', C.Daily.summary(C.today()).count, 1);
  eq('昨天 1 条', C.Daily.ofDate(C.today(1)).length, 1);
  eq('趋势 7 天', C.Daily.trend(7).length, 7);
  ok('趋势含今天且按日期升序', C.Daily.trend(7)[6].date === C.today() && C.Daily.trend(7)[0].date < C.today());
  ok('连续记录天数 ≥ 1', C.Daily.streak() >= 1);
  C.Daily.remove(rec.id);
  eq('删除后今日为空', C.Daily.summary(C.today()).count, 0);

  /* ------------------------------------------------ 餐次分栏（薄荷式记录） */
  eq('餐次 4 档', D.MEALS.length, 4);
  ok('每档都有键名/名称/时段', D.MEALS.every(function (m) { return m.k && m.t && m.range; }));
  ok('餐次键含 breakfast/lunch/dinner/snack', ['breakfast', 'lunch', 'dinner', 'snack'].every(function (k) {
    return D.MEALS.some(function (m) { return m.k === k; });
  }));
  ok('类别快选 ≥ 8', D.CATS.length >= 8);
  ok('OCR 停用词 ≥ 10 且都是短词', D.OCR_STOPS.length >= 10 && D.OCR_STOPS.every(function (w) { return w.length >= 2; }));
  var mrec = [
    C.Daily.add({ name: '早餐牛奶', sugar: 5, meal: 'breakfast' }),
    C.Daily.add({ name: '午餐米饭', sugar: 2, meal: 'lunch' }),
    C.Daily.add({ name: '没填餐次', sugar: 3 }),
    C.Daily.add({ name: '乱填餐次', sugar: 1, meal: 'midnight' })
  ];
  var ms = C.Daily.summary(C.today()).meals;
  eq('早餐归栏 5g', ms.breakfast.sugar, 5);
  eq('午餐归栏 2g', ms.lunch.sugar, 2);
  eq('缺餐次的落进加餐', ms.snack.sugar, 4);
  eq('没记录的餐次是 0 而不是空', ms.dinner.sugar, 0);
  eq('四档之和等于全天合计', ms.breakfast.sugar + ms.lunch.sugar + ms.dinner.sugar + ms.snack.sugar, C.Daily.summary(C.today()).sugar);
  var dlines = C.Export.dailyCsv().split('\r\n');
  eq('记录 CSV 第二列是餐次', dlines[0].split(',')[1], '餐次');
  ok('导出写中文餐次名', dlines.some(function (l) { return l.indexOf(',早餐,早餐牛奶,5,') >= 0; }));
  ok('不认识的餐次导出成加餐', dlines.some(function (l) { return l.indexOf(',加餐,乱填餐次,') >= 0; }));
  mrec.forEach(function (r) { C.Daily.remove(r.id); });

  /* ------------------------------------------------ 采集编号 + OCR 文本抽取 */
  eq('起始编号跟着已有最大编号走', C.Catalog.nextCode(), 'S-0002');
  var c1 = C.Catalog.save({ id: 'S-0007', name: '编号甲', photoFile: 'S-0007.jpg' });
  var c2 = C.Catalog.save({ id: '', name: '编号乙', photoFile: 'S-0102.png' });
  eq('按已有最大编号递增', C.Catalog.nextCode(), 'S-0103');
  C.Catalog.remove(c1.id); C.Catalog.remove(c2.id);
  eq('抽掉新增后编号回退', C.Catalog.nextCode(), 'S-0002');
  eq('抹掉汉字之间的空格', C.Parser.denoise('白 砂 糖'), '白砂糖');
  eq('顿号两侧空格清掉', C.Parser.denoise('水 、 白砂糖'), '水、白砂糖');
  eq('正常文本不被误伤', C.Parser.denoise('配料：水、白砂糖'), '配料：水、白砂糖');
  var ocrRaw = '配料 表 : 水 、 白 砂糖 、 果 葡 糖浆 、\n柠檬 汁 、 食 用 盐 、 二 氧化 碳\n产品 标准 号 GB/T 10792 保质 期 12 个 月\n';
  var ex = C.Parser.extractIngredients(ocrRaw);
  ok('配料段跨行接回来了', ex.indexOf('白砂糖') >= 0 && ex.indexOf('二氧化碳') >= 0);
  ok('撞到栏目词就截断', ex.indexOf('产品标准号') < 0 && ex.indexOf('保质期') < 0);
  ok('抽出来的段落可直接解析', C.Parser.parseIngredients(ex).level === '高');
  eq('没有"配料"二字返回空串', C.Parser.extractIngredients('营养成分表 能量 180kJ'), '');
  eq('空文本返回空串', C.Parser.extractIngredients(''), '');
  var ex2 = C.Parser.extractIngredients('单行配料：水、白砂糖、食用盐 产品标准号 GB/T 10792');
  ok('单行也能截到栏目词前', ex2.indexOf('食用盐') >= 0 && ex2.indexOf('GB/T') < 0);

  /* ------------------------------------------------ 测评 */
  var set = C.Quiz.build(8);
  eq('抽 8 题', set.length, 8);
  ok('题目不重复', new Set(set.map(function (q) { return q.q; })).size === 8);
  ok('题目来自题库', set.every(function (q) { return D.QUIZ.indexOf(q) >= 0; }));
  var allRight = C.Quiz.grade(set, set.map(function (q) { return q.a; }));
  eq('全对 100 分', allRight.score, 100);
  eq('全对无错题', allRight.wrong.length, 0);
  var oneWrong = set.map(function (q) { return q.a; }); oneWrong[0] = (set[0].a + 1) % set[0].opts.length;
  var g2 = C.Quiz.grade(set, oneWrong);
  eq('答错一题得分', g2.right, 7);
  eq('错题解析 1 条', g2.wrong.length, 1);
  ok('错题解析含依据', !!g2.wrong[0].std && !!g2.wrong[0].why);
  var g3 = C.Quiz.grade(set, []);
  eq('未作答全错', g3.right, 0);
  C.Quiz.log(g2);
  eq('成绩入库 1 条', C.Quiz.history().length, 1);
  eq('成绩记录分数', C.Quiz.history()[0].score, 88);

  /* ------------------------------------------------ 导出 */
  var csv = C.Export.csv();
  eq('CSV 字段数', C.Export.CSV_HEADER.length, 19);
  eq('CSV 行数 = 条目 + 表头', csv.split('\r\n').length, C.Catalog.all().length + 1);
  ok('CSV 含表头字段', csv.indexOf('照片文件名') >= 0 && csv.indexOf('数据性质') >= 0);
  ok('CSV 含种子来源链接', csv.indexOf('http') >= 0);
  var dcsv = C.Export.dailyCsv();
  ok('记录 CSV 有表头', dcsv.split('\r\n')[0].indexOf('添加糖g') >= 0);
  ok('逗号会被引号包裹', C.Export.toCsv([['a,b']]) === '"a,b"');
  ok('引号会被转义', C.Export.toCsv([['he said "hi"']]) === '"he said ""hi"""');
  var j = JSON.parse(C.Export.json());
  ok('JSON 可解析且含标准', j.standard.GB28050.claims.lowSugar.max === 5);
  eq('JSON 条数一致', j.count, C.Catalog.all().length);
  ok('JSON 含实测条目', j.items.some(function (x) { return x.origin === 'measured'; }));

  /* ------------------------------------------------ 管理口令（无默认值） */
  C.Store.clearAll();
  ok('出厂未设定管理口令', C.Admin.ready() === false);
  ok('未设定时任何口令都不通过', C.Admin.check('admin123') === false);
  ok('过短口令被拒', C.Admin.set('12345', '12345').ok === false);
  ok('两次不一致被拒', C.Admin.set('abcdef', 'abcdeg').ok === false);
  ok('正常设定成功', C.Admin.set('abcdef', 'abcdef').ok === true);
  ok('设定后 ready', C.Admin.ready() === true);
  ok('正确口令通过', C.Admin.check('abcdef') === true);
  ok('错误口令不通过', C.Admin.check('abcdeg') === false);
  ok('口令不以明文存储', String(C.Store.get('sg_admin_pwd', '')).indexOf('abcdef') < 0);
  eq('哈希稳定', C.hash('x'), C.hash('x'));
  ok('哈希非空且短', C.hash('x').length >= 4);
  C.Store.clearAll();

  /* ------------------------------------------------ 日期工具 */
  ok('today 格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(C.today()));
  ok('today(1) 与 today 不同', C.today(1) !== C.today());
  ok('round 保留一位', C.round(1.234, 1) === 1.2 && C.round(1.25, 1) === 1.3);
  ok('自检结束后不留本机数据', C.Store.keys().length === 0);

  var total = pass + fails.length;
  var lines = [];
  lines.push('控糖有数 · 内核自检：' + pass + ' / ' + total + ' 通过');
  fails.forEach(function (x) { lines.push('FAIL  ' + x); });
  if (!fails.length) lines.push('全部断言通过 (ALL PASS)');

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pass: pass, total: total, fails: fails, lines: lines };
    if (require.main === module) {
      console.log(lines.join('\n'));
      process.exit(fails.length ? 1 : 0);
    }
  } else {
    root.SugarSelfCheck = { pass: pass, total: total, fails: fails, lines: lines };
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
