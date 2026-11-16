// 回归测试：原生菜单（托盘/顶部菜单）也要跟着语言切换
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const main = readFileSync('desktop-main.cjs', 'utf8');
const ctx = readFileSync('src/context/LanguageContext.jsx', 'utf8');
const html = readFileSync('public/actions.html', 'utf8');

// ---- 主进程：字典 + mt() + 路由 ----
check('主进程有 MAIN_I18N 字典（zh/en）', main.includes('const MAIN_I18N = {') && main.includes('en: {'));
check('主进程有 mt() 取词函数', main.includes('function mt(key)'));
check('主进程有 /__lang/set 路由', main.includes("urlPath === '/__lang/set'"));
check('路由会保存语言到 config', main.includes('saveConfig({ lang })'));
check('路由会重建托盘菜单 + 应用菜单', main.includes('refreshTrayMenu()') && main.includes('buildMenu()'));

// ---- 托盘菜单全部走 mt() ----
const tray = main.slice(main.indexOf('function buildTrayMenu'), main.indexOf('function refreshTrayMenu'));
check('托盘：打开配置工具', tray.includes("mt('openApp')"));
check('托盘：扩展动作', tray.includes("mt('actions')"));
check('托盘：开机自启（两种状态）', tray.includes("mt(auto ? 'autostartOn' : 'autostartOff')"));
check('托盘：退出', tray.includes("mt('quit')"));
check('托盘：提示气泡', main.includes("tray.setToolTip(mt('tooltip'))"));
check('托盘菜单里已无中文硬编码', !/label: '[^']*[\u4e00-\u9fa5]/.test(tray));

// ---- 应用菜单全部走 mt() ----
const menu = main.slice(main.indexOf('function buildMenu'), main.indexOf('Menu.setApplicationMenu'));
const cnLabels = (menu.match(/label: '[^']*[\u4e00-\u9fa5]/g) || []);
check('应用菜单无中文硬编码', cnLabels.length === 0, cnLabels.join(', '));
check('应用菜单：文件/视图/帮助', menu.includes("mt('menuFile')") && menu.includes("mt('menuView')") && menu.includes("mt('menuHelp')"));
check('应用菜单：检查更新/自动更新/关于',
  menu.includes("mt('menuCheckUpdate')") && menu.includes("mt('menuAutoUpdate')") && menu.includes("mt('menuAbout')"));

// ---- 网页端：切换语言时通知主进程 ----
check('网页有 notifyDesktopLang', ctx.includes('function notifyDesktopLang'));
check('只在桌面版调用（UA 判断）', ctx.includes('/YYWLDesktop/i.test'));
check('切换时通知', ctx.includes('notifyDesktopLang(next)'));
check('启动时同步一次', ctx.includes('useState(() => { notifyDesktopLang(lang);'));
check('actions 窗口切换也通知', html.includes("fetch('__lang/set?lang=' + next"));

// ---- actions 窗口残留中文的两个修复 ----
check('translateNode 先按原文查词典', html.includes('if (EN_DICT[raw] !== undefined)'));
check('监听属性变化（title 后赋值）', html.includes("attributeFilter: ['title', 'placeholder']"));
check('冲突提示有正则规则', html.includes('请在对应槽位右边把热键换成不冲突的组合（例如'));
check('「这个槽位已经有 N 个步骤」有规则', html.includes('This slot already has $1 steps'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
