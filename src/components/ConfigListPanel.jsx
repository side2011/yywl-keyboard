// src/components/ConfigListPanel.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { getConfigs, addConfig, updateConfig, deleteConfig, exportConfigs, importConfigs } from '../services/config-storage';
import toast from 'react-hot-toast';

export default function ConfigListPanel({ modelId, keyConfigs, rgbMode, rgbMode2, customColor, customColor2, delays, extra, layers, onLoadConfig }) {
  const { t } = useLang();
  const [configs, setConfigs] = useState([]);
  const [configName, setConfigName] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const refresh = useCallback(() => {
    if (modelId) setConfigs(getConfigs(modelId));
  }, [modelId]);

  useEffect(() => { refresh(); }, [refresh]);

  // 多层配置存储: 统一收进 extra.layers
  // 修复: 早期版本 props 里没有 layers, NewProtoConfigurator 传进来的多层数据被静默忽略,
  //       导致新协议的多层配置只存在内存里, 存盘/读回全部丢失。
  const buildExtra = () => {
    const merged = { ...(extra || {}) };
    if (Array.isArray(layers) && layers.length > 0) merged.layers = layers;
    return Object.keys(merged).length > 0 ? merged : null;
  };

  const handleSave = () => {
    if (!configName.trim()) { toast.error(t('请输入配置名称')); return; }
    try {
      const entry = addConfig({ configName: configName.trim(), keyboardId: modelId, keyConfigs, rgbMode, rgbMode2, customColor, customColor2, delays, extra: buildExtra() });
      toast.success(t('配置已保存'));
      setConfigName('');
      setSelectedId(entry.id);
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const handleUpdate = () => {
    if (!selectedId) { toast.error(t('请先选择一个配置')); return; }
    if (!configName.trim()) { toast.error(t('请输入配置名称')); return; }
    try {
      updateConfig(selectedId, { configName: configName.trim(), keyboardId: modelId, keyConfigs, rgbMode, rgbMode2, customColor, customColor2, delays, extra: buildExtra() });
      toast.success(t('配置已更新'));
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = () => {
    if (!selectedId) { toast.error(t('请先选择一个配置')); return; }
    if (!confirm(t('确定删除此配置？'))) return;
    deleteConfig(selectedId);
    setSelectedId(null);
    setConfigName('');
    toast.success(t('已删除'));
    refresh();
  };

  const handleSelect = (cfg) => {
    setSelectedId(cfg.id);
    setConfigName(cfg.configName);
  };

  const handleLoad = (cfg) => {
    setSelectedId(cfg.id);
    setConfigName(cfg.configName);
    onLoadConfig({
      keyConfigs: cfg.keyConfigs,
      rgbMode: cfg.rgbMode ?? 0,
      rgbMode2: cfg.rgbMode2 ?? 0,
      customColor: cfg.customColor ?? { r: 255, g: 255, b: 255 },
      customColor2: cfg.customColor2 ?? { r: 255, g: 255, b: 255 },
      delays: cfg.delays ?? [],
      extra: cfg.extra ?? null,
      // 多层配置回传 (新协议用 loaded.layers 恢复所有层)
      layers: cfg.extra?.layers ?? cfg.layers ?? null,
    });
    toast.success(t('已加载: {name}', { name: cfg.configName }));
  };

  const handleExport = () => {
    const json = exportConfigs(modelId);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config_${modelId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('导出成功'));
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const count = importConfigs(ev.target.result);
          toast.success(t('导入成功 ({count} 条)', { count }));
          refresh();
        } catch (err) { toast.error(t('导入失败: 文件格式错误')); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-xs font-semibold text-gray-500">{t('配置列表')}</h4>
        <div className="flex gap-1">
          <button className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors cursor-pointer" onClick={handleExport}>{t('导出')}</button>
          <button className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors cursor-pointer" onClick={handleImport}>{t('导入')}</button>
        </div>
      </div>

      <div className="mb-2.5">
        <input
          type="text"
          className="w-full rounded-lg border border-gray-200 text-xs px-2.5 py-2 outline-none focus:border-gray-400 mb-1.5"
          placeholder={t('输入配置名称...')}
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
        />
        <div className="flex gap-1">
          <button className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors cursor-pointer" onClick={handleSave}>{t('保存')}</button>
          <button className="flex-1 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer" onClick={() => { const cfg = configs.find(c => c.id === selectedId); if (cfg) handleLoad(cfg); else toast.error(t('请先选择一个配置')); }}>{t('读取')}</button>
          <button className="flex-1 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer" onClick={handleUpdate}>{t('更新')}</button>
          <button className="flex-1 py-1.5 text-xs font-medium text-red-400 border border-red-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" onClick={handleDelete}>{t('删除')}</button>
        </div>
      </div>

      <div className="space-y-1 max-h-52 overflow-y-auto">
        {configs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">{t('暂无保存的配置')}</p>
        ) : (
          configs.map((cfg) => (
            <button
              key={cfg.id}
              className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                selectedId === cfg.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'hover:bg-white text-gray-500 border border-transparent'
              }`}
              onClick={() => handleSelect(cfg)}
              onDoubleClick={() => handleLoad(cfg)}
            >
              <div className="text-sm font-medium truncate">{cfg.configName}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {cfg.keyConfigs?.length || 0} {t('键')} · {cfg.createdAt ? new Date(cfg.createdAt).toLocaleDateString() : ''}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
