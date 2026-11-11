// src/services/config-storage.js
// 本地配置存储服务 — 替代 C# 项目中的 SQLite yt_keyconfig 表

const STORAGE_KEY = 'yywl_keyconfigs';

function getAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAll(configs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

// 一条配置属于哪个机型：优先 modelKey（2K/6K/BT-6+0/4K…），老数据回落到 keyboardId
function scopeKeyOf(c) {
  return c.modelKey || c.keyboardId;
}

// 生成唯一 ID
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 获取指定键盘型号的配置列表
 * @param {string} keyboardId - 设备型号，如 "3K", "6K"
 * @returns {Array} 配置列表
 */
export function getConfigs(key) {
  if (!key) return [];
  return getAll().filter((c) => scopeKeyOf(c) === key);
}

/**
 * 新增配置
 */
export function addConfig({ configName, keyboardId, modelKey, keyConfigs, rgbMode, customColor, delays, extra }) {
  const all = getAll();
  // 检查同名
  if (all.some(c => c.configName === configName && scopeKeyOf(c) === (modelKey || keyboardId))) {
    throw new Error('名称已存在');
  }
  const entry = {
    id: genId(),
    configName,
    keyboardId,
    // 机型 key（BT-6+0 / 6K / 4K…）——给「快速配置」这类外部工具识别用，
    // 不能用 keyboardId：网页新协议页的 keyboardId 是芯片名 AC632N
    modelKey: modelKey || keyboardId,
    keyConfigs,
    rgbMode: rgbMode ?? 0,
    customColor: customColor ?? { r: 255, g: 255, b: 255 },
    delays: delays ?? [],
    extra: extra ?? null,
    createdAt: new Date().toISOString(),
  };
  all.push(entry);
  saveAll(all);
  return entry;
}

/**
 * 更新配置
 */
export function updateConfig(id, { configName, keyboardId, modelKey, keyConfigs, rgbMode, customColor, delays, extra }) {
  const all = getAll();
  // 检查同名（排除自身）
  if (all.some(c => c.configName === configName && scopeKeyOf(c) === (modelKey || keyboardId) && c.id !== id)) {
    throw new Error('名称已存在');
  }
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('配置不存在');
  all[idx] = { ...all[idx], configName, keyboardId, modelKey: modelKey || all[idx].modelKey || keyboardId, keyConfigs, rgbMode, customColor, delays, extra: extra ?? all[idx].extra ?? null };
  saveAll(all);
  return all[idx];
}

/**
 * 删除配置
 */
export function deleteConfig(id) {
  const all = getAll().filter(c => c.id !== id);
  saveAll(all);
}

/**
 * 导出所有配置为 JSON 字符串
 */
export function exportConfigs(key) {
  const configs = key ? getConfigs(key) : getAll();
  return JSON.stringify(configs, null, 2);
}

/**
 * 老数据迁移：新协议页历史配置的 keyboardId 都是 AC632N（没有 modelKey），
 * 按 keyConfigs/layers 的键数补上 modelKey（2K/6K…），这样各机型列表才会分开。
 * 返回迁移条数。
 */
export function migrateLegacyModelKeys(protocolId) {
  if (!protocolId) return 0;
  const all = getAll();
  let changed = 0;
  for (const c of all) {
    if (c.modelKey || c.keyboardId !== protocolId) continue;
    const n = (Array.isArray(c.layers) && c.layers[0]?.length) || (c.keyConfigs?.length) || 0;
    if (!n) continue;
    c.modelKey = `${n}K`;
    changed += 1;
  }
  if (changed) saveAll(all);
  return changed;
}

/**
 * 导入配置（合并，跳过同名）
 */
export function importConfigs(jsonStr) {
  const imported = JSON.parse(jsonStr);
  if (!Array.isArray(imported)) throw new Error('格式错误');
  const all = getAll();
  let count = 0;
  for (const cfg of imported) {
    if (!cfg.configName || !cfg.keyboardId) continue;
    if (all.some(c => c.configName === cfg.configName && scopeKeyOf(c) === scopeKeyOf(cfg))) continue;
    all.push({ ...cfg, id: genId() });
    count++;
  }
  saveAll(all);
  return count;
}
