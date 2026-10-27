// 运行日志缓冲 + 一键导出
//
// 背景：客户遇到"保存校验失败"时，让他打开 F12 控制台基本不现实。
// 这里把关键日志（[BtProto] / [NewProto] / [BtMulti] / 我们的 warn/error）留在内存环形缓冲里，
// 出错时自动下载成一个 txt，客户直接把这个文件发过来即可。
//
// 用法：
//   import { installLogCapture, dumpLogs, downloadLogs } from '../services/log-buffer';
//   installLogCapture();            // main.jsx 里调用一次
//   downloadLogs('bt-save');        // 出错时调用，浏览器会下载 txt

const MAX_LINES = 1200;
const KEY_PREFIXES = ['[BtProto]', '[NewProto]', '[BtMulti]', '[BtKnob]', '[NewProto Save]', '[actions]'];
let installed = false;
const buffer = [];
let seq = 0;

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function push(level, args) {
  try {
    const text = args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.stack || a.message;
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(' ');
    // 只留"协议/动作"相关，避免把页面上无关日志也塞进去
    if (!KEY_PREFIXES.some((k) => text.includes(k)) && level === 'log') return;
    seq += 1;
    buffer.push(`${stamp()} ${level.toUpperCase()} ${text}`);
    if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
  } catch { /* 忽略 */ }
}

export function installLogCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  ['log', 'warn', 'error'].forEach((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      push(level, args);
      orig(...args);
    };
  });
}

export function dumpLogs() {
  const header = [
    '==== YYWL 键盘配置日志 ====',
    `导出时间: ${new Date().toLocaleString()}`,
    `页面: ${typeof location !== 'undefined' ? location.href : '?'}`,
    `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : '?'}`,
    `版本: ${window.__YYWL_VERSION__ || '?'}  构建: ${window.__YYWL_BUILD__ || '?'}`,
    '============================',
    '',
  ].join('\n');
  return header + (buffer.length ? buffer.join('\n') : '(暂无日志)') + '\n';
}

export function downloadLogs(tag = 'log') {
  try {
    const text = dumpLogs();
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const name = `yywl-${tag}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return name;
  } catch (e) {
    console.warn('[log] 导出日志失败:', e.message);
    return null;
  }
}

export function logLine(text) {
  push('log', [text]);
}
