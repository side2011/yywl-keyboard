// 回归测试：英文界面不再露中文 + 扩展动作窗口有语言切换入口
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// ---- 1) 跑一遍 i18n 审计（t() 用到但英文表缺失的中文 key 必须为 0）----
const require = createRequire(import.meta.url);
const out = execFileSync(process.execPath, ['scripts/audit-i18n.cjs'], { encoding: 'utf8' });
const m = out.match(/缺失英文的 key: (\d+) 条/);
check('网页端缺失英文的 key = 0', m && Number(m[1]) === 0, m ? m[1] + ' 条' : '解析失败');

const i18n = readFileSync('src/i18n.js', 'utf8');
check('i18n 英文条目 >= 520', (i18n.match(/^  '/gm) || []).length >= 520);
check('报告里那行已翻译（也可以从顶部菜单…）',
  i18n.includes("'也可以从顶部菜单「文件 → 扩展动作…」打开':") &&
  /'也可以从顶部菜单「文件 → 扩展动作…」打开': 'You can also open it from the top menu/.test(i18n));

// ---- 2) 扩展动作窗口：语言切换入口 ----
const html = readFileSync('public/actions.html', 'utf8');
check('顶部有语言切换按钮 langBtn', html.includes('id="langBtn"'));
check('按钮在「使用说明」左边', html.indexOf('id="langBtn"') < html.indexOf('id="helpBtn"'));
check('与网页共用语言记忆 yywl-lang', html.includes("localStorage.getItem('yywl-lang')") && html.includes("localStorage.setItem('yywl-lang'"));
check('有英文字典 EN_DICT', html.includes('var EN_DICT = {'));
check('字典覆盖主界面（扩展动作/槽位/未设置/等待）',
  html.includes("'扩展动作': 'Extended actions'") && html.includes("'未设置': 'Not set'") && html.includes("'等待': 'Delay'"));
check('静态文案会被翻译（translateNode）', html.includes('function translateNode('));
check('动态渲染也会翻译（MutationObserver）', html.includes('MutationObserver'));
check('切换后重载页面保证一致性', html.includes('location.reload()'));

// ---- 3) 内联脚本可解析 ----
const script = html.match(/<script>([\s\S]*)<\/script>/);
let ok = false;
try { new Function(script[1].replace(/^<script>/, '').replace(/<\/script>$/, '')); ok = true; } catch { ok = false; }
check('actions.html 内联脚本语法正确', ok);

// ---- 4) 扩展动作窗口：整窗英文覆盖 ----
check('词典 >= 200 条（覆盖整个窗口）', /var EN_DICT = \{[\s\S]*?\};/.test(html) && (html.match(/^    '[^']+': /gm) || []).length >= 200,
  String((html.match(/^    '[^']+': /gm) || []).length));
check('动态文案有正则规则 EN_RULES', html.includes('var EN_RULES') && html.includes('function applyRules'));
check('使用说明按语言打开对应 guide', html.includes("LANG === 'en' ? 'actions-guide-en.html' : 'actions-guide.html'"));
const guideEn = readFileSync('public/actions-guide-en.html', 'utf8');
check('英文 guide 存在且章节数与中文一致',
  (guideEn.match(/<h2/g) || []).length === (readFileSync('public/actions-guide.html', 'utf8').match(/<h2/g) || []).length);
check('英文 guide 基本无中文（<=5 行）',
  (guideEn.split('\n').filter((l) => /[\u4e00-\u9fa5]/.test(l)).length) <= 5);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
