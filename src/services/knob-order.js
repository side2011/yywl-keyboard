// 旋钮（编码器）左右顺序：设备槽位 ↔ 界面槽位的映射。
//
// 背景：
//   6+2 款的两个旋钮，部分固件把「左转 / 右转」在 flash 里的顺序存反了
//   （原厂 Qt 工具里 K16=左、K18=右，但这批固件实际是 16 存的是右转的配置）。
//   客户看到的现象就是：读出来左右反了，写进去后左转执行的是右转的动作。
//
// 做法：
//   · 映射是自逆的（左↔右、中不动），读写两侧用同一个函数，天然一致
//   · 6+2 款默认开启对调（defaultKnobSwap），其它款默认不动
//   · 客户仍可在「固件信息」里逐个旋钮取消勾选，换批次时不用改代码

/** 该型号默认是否需要对调左右（true = 设备存反了） */
export function defaultKnobSwap(keyCount, knobCount) {
  // 目前只有 4+1 款确认需要默认对调（现场读回 keyNo16=音量+，而 QT 定义 16=左）。
  // 其它型号一律默认不对调 —— 6+1 已确认是正的；剩余款式等客户反馈再逐个添加。
  // 个别批次真的相反时，售后可在「固件信息」里勾选「旋钮 N 左右对调」临时纠正。
  const knob = Number(knobCount) || 0;
  const keys = Number(keyCount) || 0;
  if (!knob) return [];
  const swapOn = keys === 4 && knob === 1;
  return Array.from({ length: knob }, () => swapOn);
}

/**
 * 界面槽位 → 设备槽位（同一函数也用于设备 → 界面，因为映射自逆）
 * @param {number} i 槽位下标（0 起，按键在前、旋钮在后）
 * @param {number} keyCount 按键数
 * @param {number} knobCount 旋钮数
 * @param {boolean[]} swap 每个旋钮是否对调
 */
export function mapKnobSlot(i, keyCount, knobCount, swap) {
  if (!knobCount || i < keyCount) return i;
  const rel = i - keyCount;
  const n = Math.floor(rel / 3);
  const k = rel % 3;
  if (!swap || !swap[n]) return i;
  return keyCount + n * 3 + (2 - k);
}
