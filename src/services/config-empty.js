// 判断某个按键槽位是不是"没设置任何东西"。
// 用途：客户点了「全部清除」又没重新设置时，直接点「保存到键盘」会写一堆空记录，
//       蓝牙设备对连续的清空指令经常不回包 → 界面一直停在"正在保存"或报保存失败。
//       保存前先拦一下，提示客户先设置好。

/** 单个槽位是否为空配置 */
export function isCfgEmpty(cfg) {
  if (!cfg) return true;
  const mode = cfg.mode || 0;
  if (mode === 0) return true;
  // 有修饰键（单独一个 Ctrl 也算有效配置）
  if (cfg.modifierMask || cfg.modifier) return false;
  if (cfg.keyCode) return false;
  if (cfg.mediaCode) return false;
  // 鼠标动作：新旧两种字段都认
  if (cfg.mouseButton || cfg.mouseX || cfg.mouseY || cfg.mouseScroll) return false;
  const m = cfg.mouse;
  if (m && (m.btn || m.mod || m.wheel || m.behavior)) return false;
  // 多键合一：只要有一步真正选了键/修饰键就不算空
  if (Array.isArray(cfg.multiKeys) && cfg.multiKeys.some((k) => k && (k.keyCode || k.mask))) return false;
  return true;
}

/** 一整层（或全部层）是否都是空的 */
export function allCfgEmpty(configs) {
  if (!Array.isArray(configs) || configs.length === 0) return true;
  return configs.every(isCfgEmpty);
}

/** 多层：所有层都空才算空 */
export function allLayersEmpty(layers) {
  if (!Array.isArray(layers) || layers.length === 0) return true;
  return layers.every((layer) => allCfgEmpty(layer));
}
