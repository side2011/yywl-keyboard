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

// 生成唯一 ID
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 获取指定键盘型号的配置列表
 * @param {string} keyboardId - 设备型号，如 "3K", "6K"
 * @returns {Array} 配置列表
 */
export function getConfigs(keyboardId) {
  return getAll().filter(c => c.keyboardId === keyboardId);
}

/**
 * 新增配置
 */
export function addConfig({ configName, keyboardId, keyConfigs, rgbMode, customColor, delays, extra }) {
  const all = getAll();
  // 检查同名
  if (all.some(c => c.configName === configName && c.keyboardId === keyboardId)) {
    throw new Error('名称已存在');
  }
  const entry = {
    id: genId(),
    configName,
    keyboardId,
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
export function updateConfig(id, { configName, keyboardId, keyConfigs, rgbMode, customColor, delays, extra }) {
  const all = getAll();
  // 检查同名（排除自身）
  if (all.some(c => c.configName === configName && c.keyboardId === keyboardId && c.id !== id)) {
    throw new Error('名称已存在');
  }
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('配置不存在');
  all[idx] = { ...all[idx], configName, keyboardId, keyConfigs, rgbMode, customColor, delays, extra: extra ?? all[idx].extra ?? null };
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
export function exportConfigs(keyboardId) {
  const configs = keyboardId ? getConfigs(keyboardId) : getAll();
  return JSON.stringify(configs, null, 2);
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
    if (all.some(c => c.configName === cfg.configName && c.keyboardId === cfg.keyboardId)) continue;
    all.push({ ...cfg, id: genId() });
    count++;
  }
  saveAll(all);
  return count;
}
