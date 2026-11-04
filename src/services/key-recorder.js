// ============================================================
// key-recorder.js — 网页里的"按键录制"（供老协议 / 蓝牙款的多键合一使用）
//
// 设计要点：
//   · 只监听浏览器 keydown/keyup，不依赖任何驱动/权限
//   · 修饰键（Ctrl/Shift/Alt/Win）按住时记录到 mask，本身不作为步骤
//   · 每个步骤带上"距上一个键的毫秒数"，由调用方决定要不要用（协议支持才用）
//   · 录制时 preventDefault，避免触发浏览器快捷键（Ctrl+S 之类）
//   · 达到最大槽位数自动停止
//   · 不涉及新协议：新协议有自己的宏录制，这里不碰
// ============================================================
import { BROWSER_CODE_TO_HID, BROWSER_MOD_TO_BIT, HID_TO_CS_SHIFTED } from './hid-constants';

export const DEFAULT_STEP_DELAY_MS = 50;

/**
 * 创建一个按键录制器
 * @param {object} opts
 * @param {(step:{keyCode:number, mask:number, delayMs:number, index:number}) => boolean|void} opts.onStep
 *        每录到一个按键调用一次；返回 false 表示停止录制（例如槽位满了）
 * @param {number} [opts.maxSteps=18] 最多录多少步
 * @param {number} [opts.defaultDelayMs=50] 第一个键没有间隔时给的默认值
 * @param {() => void} [opts.onStop] 停止时回调（含自动停止）
 */
export function createKeyRecorder({ onStep, maxSteps = 18, defaultDelayMs = DEFAULT_STEP_DELAY_MS, onStop }) {
  let recording = false;
  let heldMods = 0;
  let lastTime = 0;
  let count = 0;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');

  function handleKeyDown(e) {
    if (!recording) return;
    // 拍照时不要触发浏览器默认行为（Ctrl+S 保存、Ctrl+P 打印…）
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;

    const modBit = BROWSER_MOD_TO_BIT[e.code];
    if (modBit !== undefined) {
      heldMods |= modBit;
      return;
    }

    const keyCode = BROWSER_CODE_TO_HID[e.code];
    if (keyCode === undefined) {
      // 不认识的键（媒体键等）直接忽略，不打断录制
      console.log('[Recorder] 忽略未知按键 code=' + e.code);
      return;
    }

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const delta = lastTime ? Math.round(now - lastTime) : defaultDelayMs;
    lastTime = now;

    count += 1;
    const keepGoing = onStep({ keyCode, mask: heldMods, delayMs: delta, index: count - 1 });
    if (keepGoing === false || count >= maxSteps) stop();
  }

  function handleKeyUp(e) {
    if (!recording) return;
    const modBit = BROWSER_MOD_TO_BIT[e.code];
    if (modBit !== undefined) {
      heldMods &= ~modBit;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // 其它键松开不处理（录制按"按下"计一次）
    e.preventDefault();
  }

  // 录制中切走窗口（点别的程序）就自动停，避免"一直在录"
  function handleBlur() {
    if (recording) stop();
  }

  function start() {
    if (recording) return;
    recording = true;
    heldMods = 0;
    lastTime = 0;
    count = 0;
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
    console.log('[Recorder] 开始录制（最多 ' + maxSteps + ' 步）');
  }

  function stop() {
    if (!recording) return;
    recording = false;
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('keyup', handleKeyUp, true);
    window.removeEventListener('blur', handleBlur);
    console.log('[Recorder] 停止录制，共 ' + count + ' 步');
    if (typeof onStop === 'function') onStop(count);
  }

  return {
    start,
    stop,
    get isRecording() { return recording; },
    get count() { return count; },
    get isMac() { return isMac; },
  };
}

/**
 * 老协议（C# 旧固件）用：HID 键码 → 设备实际存的字节
 *   · 只按 Shift 的组合 → 转成 C# 的 shifted code（0x96='!' 这种）
 *   · 其它修饰键（Ctrl/Alt/Win）老协议只支持一个"全局修饰位"，由调用方处理
 */
export function toOldProtocolCode(hidCode, mask) {
  const SHIFT_BITS = 0x22; // 左Shift 0x02 | 右Shift 0x20
  const onlyShift = (mask & ~SHIFT_BITS) === 0 && (mask & SHIFT_BITS) !== 0;
  if (onlyShift && HID_TO_CS_SHIFTED[hidCode] !== undefined) return HID_TO_CS_SHIFTED[hidCode];
  return hidCode;
}

/** 老协议：[全局修饰位] 归一化（去掉 Shift，Shift 已经体现在 shifted code 里） */
export function oldProtocolGlobalModifier(mask) {
  return mask & ~0x22;
}
