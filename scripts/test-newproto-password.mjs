// 回归测试：一键密码的字符 → HID 按键映射 + 默认 100ms 间隔
// 背景：客户输入 442000800，生成出来变成 553111911（每个数字偏了一位）
// 用法: node scripts/test-newproto-password.mjs
import { readFileSync } from 'node:fs';

import { CHAR_TO_KEY, textToKeyRows } from '../src/services/char-to-hid.js';
const src = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 数字：HID 标准 '1'=0x1E … '9'=0x26，'0'=0x27
const digits = { '1': 0x1E, '2': 0x1F, '3': 0x20, '4': 0x21, '5': 0x22, '6': 0x23, '7': 0x24, '8': 0x25, '9': 0x26, '0': 0x27 };
for (const [ch, code] of Object.entries(digits)) {
  check(`'${ch}' → 0x${code.toString(16).toUpperCase()}`, CHAR_TO_KEY[ch]?.code === code,
    `实际 ${CHAR_TO_KEY[ch]?.code?.toString(16)}`);
}

// 客户现场：442000800 应映射成 4,4,2,0,0,0,8,0,0
const pwd = '442000800';
const got = [...pwd].map((ch) => CHAR_TO_KEY[ch]?.code);
const want = [0x21, 0x21, 0x1F, 0x27, 0x27, 0x27, 0x25, 0x27, 0x27];
check('442000800 的按键序列正确', JSON.stringify(got) === JSON.stringify(want),
  got.map((x) => x?.toString(16)).join(','));

// 字母大小写 + Shift
check("'a' → 0x04 不需要 Shift", CHAR_TO_KEY.a?.code === 0x04 && CHAR_TO_KEY.a?.shift === false);
check("'A' → 0x04 需要 Shift", CHAR_TO_KEY.A?.code === 0x04 && CHAR_TO_KEY.A?.shift === true);

// 符号
check("'@' → 0x1F + Shift", CHAR_TO_KEY['@']?.code === 0x1F && CHAR_TO_KEY['@']?.shift === true);
check("' ' → 0x2C", CHAR_TO_KEY[' ']?.code === 0x2C);

// 生成逻辑里默认 100ms 间隔
check('生成逻辑含默认 50ms 间隔', /MACRO_STEP\.DELAY,\s*keyCode:\s*0,\s*delay:\s*50/.test(src));
check('末尾多余间隔会被移除', src.includes('末尾那个间隔没意义，去掉') || src.includes('steps.pop()'));

// 共享模块：文本 → 行（蓝牙多键合一用）
const bt = textToKeyRows('Ab1!', 50);
check('textToKeyRows 生成 4 行', bt.rows.length === 4, String(bt.rows.length));
check('textToKeyRows A 带 Shift 位', bt.rows[0].mask === 0x02 && bt.rows[0].keyCode === 0x04);
check('textToKeyRows 数字 1 正确', bt.rows[2].keyCode === 0x1E);
check('textToKeyRows 默认间隔 50ms', bt.rows.every((r) => r.delay === 50));
check('textToKeyRows 不支持的字符会被收集', textToKeyRows('中文', 50).unsupported.length === 2);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
