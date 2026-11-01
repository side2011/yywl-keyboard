// 字符 → HID 按键码（标准美式键盘布局），供「一键密码」使用
//
// 注意：数字键在 HID 里是 '1'=0x1E … '9'=0x26、'0'=0x27，
//       不是 0x1E+数字值（这个坑踩过：输入 442000800 生成出 553111911）。
export const SHIFT_LEFT = 0xE1;
export const SHIFT_BIT = 0x02;

const CHAR_TO_KEY = {};

for (let c = 'a'.charCodeAt(0); c <= 'z'.charCodeAt(0); c++) {
  CHAR_TO_KEY[String.fromCharCode(c)] = { code: 0x04 + (c - 97), shift: false };
}
for (let c = 'A'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
  CHAR_TO_KEY[String.fromCharCode(c)] = { code: 0x04 + (c - 65), shift: true };
}
for (let i = 0; i <= 9; i++) {
  CHAR_TO_KEY[String(i)] = { code: i === 0 ? 0x27 : 0x1D + i, shift: false };
}
Object.assign(CHAR_TO_KEY, {
  '!': { code: 0x1E, shift: true }, '@': { code: 0x1F, shift: true }, '#': { code: 0x20, shift: true },
  $: { code: 0x21, shift: true }, '%': { code: 0x22, shift: true }, '^': { code: 0x23, shift: true },
  '&': { code: 0x24, shift: true }, '*': { code: 0x25, shift: true }, '(': { code: 0x26, shift: true },
  ')': { code: 0x27, shift: true },
  '-': { code: 0x2D, shift: false }, _: { code: 0x2D, shift: true },
  '=': { code: 0x2E, shift: false }, '+': { code: 0x2E, shift: true },
  '[': { code: 0x2F, shift: false }, '{': { code: 0x2F, shift: true },
  ']': { code: 0x30, shift: false }, '}': { code: 0x30, shift: true },
  '\\': { code: 0x31, shift: false }, '|': { code: 0x31, shift: true },
  ';': { code: 0x33, shift: false }, ':': { code: 0x33, shift: true },
  "'": { code: 0x34, shift: false }, '"': { code: 0x34, shift: true },
  '`': { code: 0x35, shift: false }, '~': { code: 0x35, shift: true },
  ',': { code: 0x36, shift: false }, '<': { code: 0x36, shift: true },
  '.': { code: 0x37, shift: false }, '>': { code: 0x37, shift: true },
  '/': { code: 0x38, shift: false }, '?': { code: 0x38, shift: true },
  ' ': { code: 0x2C, shift: false },
});

export { CHAR_TO_KEY };

/** 单个字符能否生成 */
export function isSupportedChar(ch) {
  return Boolean(CHAR_TO_KEY[ch]);
}

/**
 * 文本 → 按键行（mask + keyCode + delay）
 * 每一行对应"一个按键位"：需要 Shift 的字符会带上 Shift 修饰位。
 * @param {string} text
 * @param {number} delay 每个按键之间的间隔（ms），最后一行也给（固件通常忽略最后一行的延时）
 */
export function textToKeyRows(text, delay = 50) {
  const rows = [];
  const unsupported = [];
  for (const ch of text || '') {
    const m = CHAR_TO_KEY[ch];
    if (!m) { unsupported.push(ch); continue; }
    rows.push({ mask: m.shift ? SHIFT_BIT : 0, keyCode: m.code, delay });
  }
  return { rows, unsupported };
}
