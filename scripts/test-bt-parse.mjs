// ============================================================
// scripts/test-bt-parse.mjs — 蓝牙按键记录解析的回归测试
//
// 背景: 客户反馈「6 键蓝牙款读出来全是 左Ctrl+无，但按键实际发出 Ctrl+A」。
// 对照原厂 Qt 源码 (QT9/KEY_PRO/widget.cpp) 后发现两处解析问题：
//   1. V10 记录：原厂遍历 18 个组槽位，不看"组数量"字节；我们信了 data[5]
//   2. 旧协议记录：mask 与 key 在同一个组里，原厂分别取；我们写成
//      "value && !mask 才算键码"，于是带修饰键的按键键码全丢
// 这个脚本用构造字节锁住这两种记录格式，避免以后再踩。
//
// 用法: node scripts/test-bt-parse.mjs
// ============================================================
import { parseBtKeyRecord } from '../src/services/bt-protocol.js'

let pass = 0
let fail = 0

function check(name, got, want) {
  const ok = got === want
  if (ok) pass += 1
  else fail += 1
  console.log(`  ${ok ? '✓' : '✗'} ${name}  期望 0x${want.toString(16)}，实际 0x${got.toString(16)}`)
}

function rec(bytes) {
  const data = new Uint8Array(64)
  for (const [i, v] of Object.entries(bytes)) data[Number(i)] = v
  return data
}

console.log('[1] V10：Ctrl+A（组数量字节被固件填成 1）')
{
  // [3]=模式1  [5]=组数量(错误地填 1)  [8]=0xF1(左Ctrl token)  [11]=0x04(A)
  const cfg = parseBtKeyRecord(rec({ 0: 0xfa, 1: 1, 2: 1, 3: 1, 5: 1, 8: 0xf1, 11: 0x04 }), true)
  check('修饰键', cfg.modifierMask, 0x01)
  check('键码', cfg.keyCode, 0x04)
}

console.log('[2] V10：纯字母 A（无修饰）')
{
  const cfg = parseBtKeyRecord(rec({ 3: 1, 5: 1, 8: 0x04 }), true)
  check('修饰键', cfg.modifierMask, 0x00)
  check('键码', cfg.keyCode, 0x04)
}

console.log('[3] 旧协议：左Ctrl+B（mask 与 key 同组）')
{
  const cfg = parseBtKeyRecord(rec({ 3: 1, 9: 1, 10: 0x01, 11: 0x05 }), false)
  check('修饰键', cfg.modifierMask, 0x01)
  check('键码', cfg.keyCode, 0x05)
}

console.log('[4] 旧协议：纯 C（无修饰，mask=0）')
{
  const cfg = parseBtKeyRecord(rec({ 3: 1, 9: 1, 10: 0x00, 11: 0x06 }), false)
  check('修饰键', cfg.modifierMask, 0x00)
  check('键码', cfg.keyCode, 0x06)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
if (fail) process.exit(1)
