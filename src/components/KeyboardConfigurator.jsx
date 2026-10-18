// src/components/KeyboardConfigurator.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import { DEVICE_MODELS, MODEL_NAMES, KEYCODE_LABELS, KEY_MODE, KEY_MODE_LABELS, getRgbModesForModel, getRgbModes2ForModel } from '../services/hid-constants';
import { readConfig, saveAllToDevice, parseReport, configToDisplay } from '../services/hid-service';
import NewProtoConfigurator from './NewProtoConfigurator';
import KeyConfigPanel from './KeyConfigPanel';
import ConfigListPanel from './ConfigListPanel';
import toast from 'react-hot-toast';

function createDefaultConfig(count) {
  return Array.from({ length: count }, () => ({
    mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [],
  }));
}

const KeyboardConfigurator = () => {
  const { t, lang, toggleLang } = useLang();
  const navigate = useNavigate();
  const { device, model, modelId, modelName, disconnectDevice, protocolVersion, deviceInfo, getNewHandler } = useDevice();
  const hadDevice = useRef(false);
  const readingRef = useRef(false); // 防重入: React StrictMode 双重调用 / 用户连击

  const isNewProto = protocolVersion === 2;
  const keyCount = (isNewProto && deviceInfo?.keyCount) || model?.keyCount || 1;
  const layout = model?.layout || 'grid';
  const multiKeyOnly = model?.multiKeyOnly || false;
  const multiKeyLen = model?.multiKeyLen || 15;
  const hasRgb = isNewProto ? false : (model?.hasRgb ?? true);
  const hasDelay = isNewProto ? false : (model?.hasDelay ?? true);

  const [keyConfigs, setKeyConfigs] = useState(() => createDefaultConfig(keyCount));
  const [selectedKey, setSelectedKey] = useState(0);
  const [rgbMode, setRgbMode] = useState(0);
  const [rgbMode2, setRgbMode2] = useState(0);
  const [customColor, setCustomColor] = useState({ r: 255, g: 255, b: 255 });
  const [customColor2, setCustomColor2] = useState({ r: 255, g: 255, b: 255 });
  const [delays, setDelays] = useState(() => Array(keyCount).fill(0));
  const [isConnected, setIsConnected] = useState(false);

  const rgbOptions = hasRgb ? getRgbModesForModel(modelId) : [];
  const isDualZone = model?.dualZone || false;
  const rgbOptions2 = isDualZone ? (getRgbModes2ForModel(modelId) || []) : [];

  const keyCodeToLabel = (code) => KEYCODE_LABELS[code] || (code ? `0x${code.toString(16)}` : t('无'));

  useEffect(() => {
    setKeyConfigs(createDefaultConfig(keyCount));
    setDelays(Array(keyCount).fill(0));
    setSelectedKey(0);
    setRgbMode(0);
    setRgbMode2(0);
    setCustomColor2({ r: 255, g: 255, b: 255 });
  }, [keyCount, modelId, model]);

  // ⚠️ 必须先注册 inputreport 监听器，再发送读取命令，否则设备回报可能在监听器就绪前到达导致丢失
  useEffect(() => {
    if (!device || !modelId || isNewProto) return; // 新协议由 NewProtocolHandler 处理
    const handleInputReport = (event) => {
      const bytes = new Uint8Array(event.data.buffer);
      if (bytes.every(b => b === 0)) return;
      const result = parseReport(bytes, modelId);
      if (!result) return;
      switch (result.type) {
        case 'key_config': {
          const idx = result.keyPos - 1;
          setKeyConfigs(prev => {
            const next = [...prev];
            if (idx >= 0 && idx < next.length) {
              const cfg = { mode: result.mode };
              if (multiKeyOnly) { cfg.multiKeys = result.multiKeys || []; }
              else {
                switch (result.mode) {
                  case 1: cfg.modifier = result.modifier || 0; cfg.keyCode = result.keyCode || 0; break;
                  case 2: cfg.mouseButton = result.mouseButton || 0; cfg.mouseX = result.mouseX || 0; cfg.mouseY = result.mouseY || 0; cfg.mouseScroll = result.mouseScroll || 0; break;
                  case 3: cfg.mediaCode = result.mediaCode || null; break;
                  case 4: cfg.modifier = result.modifier || 0; cfg.multiKeys = result.multiKeys || []; break;
                }
              }
              next[idx] = cfg;
            }
            return next;
          });
          break;
        }
        case 'rgb_mode':
          setRgbMode(result.modeIndex);
          if (result.mode2Index !== undefined) setRgbMode2(result.mode2Index);
          break;
        case 'custom_color': setCustomColor({ r: result.r, g: result.g, b: result.b }); break;
        case 'custom_color2': setCustomColor2({ r: result.r, g: result.g, b: result.b }); break;
        case 'key_delay': setDelays(prev => { const n = [...prev]; if (result.keyIndex < n.length) n[result.keyIndex] = result.delayMs; return n; }); break;
      }
    };
    device.addEventListener('inputreport', handleInputReport);
    return () => device.removeEventListener('inputreport', handleInputReport);
  }, [device, modelId, multiKeyOnly]);

  useEffect(() => {
    if (!device || !device.opened || !modelId) { setIsConnected(false); return; }
    setIsConnected(true);

    if (isNewProto) {
      // 新协议: 等 deviceInfo 就绪后自动读取
      if (deviceInfo) handleReadConfig();
    } else {
      // 旧协议: 稍微延迟确保 inputreport 监听器已注册完毕再发送读取命令
      const timer = setTimeout(() => handleReadConfig(), 100);
      return () => clearTimeout(timer);
    }
  }, [device, modelId, isNewProto, deviceInfo]);

  useEffect(() => {
    if (device) hadDevice.current = true;
    else if (hadDevice.current) { hadDevice.current = false; toast.error(t('设备已断开，请重新连接')); navigate('/'); }
  }, [device, navigate]);

  const handleReadConfig = async () => {
    if (!device || !modelId) { toast.error(t('设备未连接或型号未识别')); return; }
    if (readingRef.current) { console.log('[handleReadConfig] 防重入: 已有读取操作进行中，跳过'); return; }
    readingRef.current = true;
    try {
      toast.loading(t('正在从键盘读取配置...'), { id: 'read' });
      console.log(`[handleReadConfig] 开始读取 modelId=${modelId} isNewProto=${isNewProto} device.opened=${device?.opened}`);

      if (isNewProto) {
        const handler = getNewHandler();
        if (!handler) throw new Error('Protocol handler not available');
        const total = deviceInfo?.keyCount || keyCount;
        const configs = await handler.readLayer(0, total);
        setKeyConfigs(configs);
      } else {
        console.log('[handleReadConfig] 旧协议: 发送 0x55 读取命令');
        await readConfig(device, modelId);
        console.log('[handleReadConfig] 旧协议: 读取命令已发送，等待设备回报...');
      }

      toast.success(t('配置读取成功！'), { id: 'read' });
    }
    catch (e) {
      console.error('[handleReadConfig] 读取配置异常:', e);
      toast.error(t('读取配置失败: {msg}', { msg: e.message }), { id: 'read' });
    } finally {
      readingRef.current = false;
    }
  };

  const handleSaveToDevice = async () => {
    if (!device || !modelId) { toast.error(t('设备未连接或型号未识别')); return; }
    try {
      toast.loading(t('正在保存配置到键盘...'), { id: 'save' });

      if (isNewProto) {
        const handler = getNewHandler();
        if (!handler) throw new Error('Protocol handler not available');
        await handler.saveAll(0, keyConfigs, 0);
      } else {
        await saveAllToDevice(device, modelId, keyConfigs, hasRgb ? rgbMode : undefined, customColor, hasDelay ? delays : undefined, rgbOptions, isDualZone ? rgbMode2 : undefined, customColor2, rgbOptions2);
      }

      toast.success(t('配置已成功保存到键盘！'), { id: 'save' });
    } catch (e) { toast.error(t('保存到键盘失败: {msg}', { msg: e.message }), { id: 'save' }); }
  };

  const handleClearKey = () => {
    setKeyConfigs(prev => { const n = [...prev]; n[selectedKey] = { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [] }; return n; });
  };

  const handleClearAll = () => { setKeyConfigs(createDefaultConfig(keyCount)); setDelays(Array(keyCount).fill(0)); setRgbMode(0); setRgbMode2(0); setCustomColor2({ r: 255, g: 255, b: 255 }); toast.success(t('已清除全部按键配置')); };

  const handleLoadConfig = (loaded) => {
    if (loaded.keyConfigs && Array.isArray(loaded.keyConfigs)) {
      const padded = Array.from({ length: keyCount }, (_, i) =>
        loaded.keyConfigs[i] || { mode: 0, modifier: 0, keyCode: 0, mouseButton: 0, mouseX: 0, mouseY: 0, mouseScroll: 0, mediaCode: null, multiKeys: [] }
      );
      setKeyConfigs(padded);
    }
    if (loaded.rgbMode !== undefined) setRgbMode(loaded.rgbMode);
    if (loaded.rgbMode2 !== undefined) setRgbMode2(loaded.rgbMode2);
    if (loaded.customColor) setCustomColor(loaded.customColor);
    if (loaded.customColor2) setCustomColor2(loaded.customColor2);
    if (loaded.delays && Array.isArray(loaded.delays)) {
      const paddedDelays = Array.from({ length: keyCount }, (_, i) => loaded.delays[i] || 0);
      setDelays(paddedDelays);
    }
    toast.success(t('配置已加载'));
  };

  const handleConfigChange = (newConfig) => { setKeyConfigs(prev => { const n = [...prev]; n[selectedKey] = newConfig; return n; }); };
  const handleDelayChange = (keyIdx, value) => { const ms = Math.min(60000, Math.max(0, Number(value) || 0)); setDelays(prev => { const n = [...prev]; n[keyIdx] = ms; return n; }); };
  const handleColorChange = (e) => { const hex = e.target.value; setCustomColor({ r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) }); };
  const handleColorChange2 = (e) => { const hex = e.target.value; setCustomColor2({ r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) }); };

  const handleGoBack = async () => {
    await disconnectDevice();
    navigate('/');
  };

  const currentConfig = keyConfigs[selectedKey] || { mode: 0 };
  const getKeyDisplay = (idx) => configToDisplay(keyConfigs[idx], keyCodeToLabel, t);

  const renderKeyButton = (i, compact = false) => {
    const isSel = selectedKey === i;
    const display = getKeyDisplay(i);
    return (
      <button key={i}
        className={`relative ${compact ? 'p-2.5' : 'p-4'} rounded-xl border-2 transition-all text-left cursor-pointer ${
          isSel ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
        }`}
        onClick={() => setSelectedKey(i)}>
        <div className={`flex items-center justify-between ${compact ? 'mb-1' : 'mb-2'}`}>
          <span className={`${compact ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-0.5'} font-bold rounded-full ${isSel ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>K{i + 1}</span>
          {!compact && hasDelay && delays[i] > 0 && <span className="text-xs text-gray-400 font-mono">{delays[i]}ms</span>}
        </div>
        <div className={`${compact ? 'text-xs min-h-[2rem]' : 'text-sm min-h-[2.5rem]'} text-gray-700 font-semibold line-clamp-2 leading-tight`} title={display}>{display}</div>
      </button>
    );
  };

  const renderKeyButtons = () => {
    // 旋钮款布局：顶部 [左转K(N-1)] [按下K1(圆形)] [右转KN]，底部 [K2..K(N-2)]
    if (layout === 'knob') {
      const leftTurnIdx = keyCount - 2;  // K(N-1) 左转
      const pressIdx = 0;                // K1 按下
      const rightTurnIdx = keyCount - 1; // KN 右转
      const buttonIndices = [];
      for (let i = 1; i < keyCount - 2; i++) buttonIndices.push(i); // K2..K(N-2)

      return (
        <div className="space-y-3">
          {/* 旋钮区域 */}
          <div className="grid grid-cols-3 gap-2.5 items-center">
            {renderKeyButton(leftTurnIdx)}
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full border-4 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                <div className="w-14 h-14 rounded-full border-2 border-indigo-200 bg-white flex items-center justify-center shadow-inner">
                  <span className="text-xs font-bold text-indigo-600 text-center leading-tight">K1<br/>按下</span>
                </div>
              </div>
              <button
                className={`mt-2 w-full p-3 rounded-xl border-2 transition-all text-center cursor-pointer ${
                  selectedKey === pressIdx ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                }`}
                onClick={() => setSelectedKey(pressIdx)}>
                <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${selectedKey === pressIdx ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>K1</span>
                <div className="text-sm text-gray-700 font-semibold line-clamp-2 min-h-[2.5rem] leading-tight mt-1" title={getKeyDisplay(pressIdx)}>{getKeyDisplay(pressIdx)}</div>
              </button>
            </div>
            {renderKeyButton(rightTurnIdx)}
          </div>
          {/* 按钮区域 */}
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${buttonIndices.length}, minmax(0, 1fr))` }}>
            {buttonIndices.map(i => renderKeyButton(i))}
          </div>
        </div>
      );
    }

    // Pad布局：上方矩形大按键 + 下方圆形小按键 (2KPlus: 2方+3圆, 3KPlus: 3方+3圆)
    if (layout === 'pad') {
      const topCount = keyCount - 3;  // 上方矩形按键数
      const topIndices = Array.from({ length: topCount }, (_, i) => i);
      const bottomIndices = Array.from({ length: 3 }, (_, i) => topCount + i);

      const renderPadButton = (i, isCircle) => {
        const isSel = selectedKey === i;
        const display = getKeyDisplay(i);
        if (isCircle) {
          return (
            <button key={i}
              className={`w-16 h-16 rounded-full border-2 transition-all flex items-center justify-center cursor-pointer ${
                isSel ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
              }`}
              onClick={() => setSelectedKey(i)}>
              <span className={`text-xs font-semibold text-center leading-tight px-1 line-clamp-2 ${isSel ? 'text-indigo-700' : 'text-gray-600'}`} title={display}>{display}</span>
            </button>
          );
        }
        return (
          <button key={i}
            className={`p-4 rounded-xl border-2 transition-all flex items-center justify-center cursor-pointer min-h-[4.5rem] ${
              isSel ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm'
            }`}
            onClick={() => setSelectedKey(i)}>
            <span className={`text-sm font-semibold text-center leading-tight line-clamp-2 ${isSel ? 'text-indigo-700' : 'text-gray-700'}`} title={display}>{display}</span>
          </button>
        );
      };

      return (
        <div className="space-y-3">
          {/* 上方矩形按键 */}
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${topCount}, minmax(0, 1fr))` }}>
            {topIndices.map(i => renderPadButton(i, false))}
          </div>
          {/* 下方圆形按键 */}
          <div className="flex justify-center gap-4">
            {bottomIndices.map(i => renderPadButton(i, true))}
          </div>
        </div>
      );
    }

    // 普通网格布局
    //   ≤4 键: 单排(N 个) —— 4 键款实物就是一排 4 个
    //   >4 键: 每行 3 个 (12 键即 3×4)
    const cols = keyCount <= 4 ? keyCount : 3;
    return (
      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: keyCount }, (_, i) => renderKeyButton(i, cols === 4))}
      </div>
    );
  };

  if (!device) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-md">
          <div className="text-5xl mb-4">⌨️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{t('未连接设备')}</h2>
          <p className="text-gray-500 text-sm mb-5">{t('请先返回连接页面连接键盘设备')}</p>
          <button className="px-6 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors cursor-pointer" onClick={() => navigate('/')}>{t('返回连接页面')}</button>
        </div>
      </div>
    );
  }

  // 新协议设备 → 使用专用配置界面
  if (isNewProto) {
    return <NewProtoConfigurator />;
  }

  return (
    <div className="min-h-screen p-3 md:p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="text-sm text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer" onClick={handleGoBack}>{t('← 返回')}</button>
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-semibold text-gray-800">{modelName ? t(modelName) : t('未知型号')}</span>
          {(model || isNewProto) && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{keyCount} {t('键')}</span>}
          {modelId && <span className="text-xs text-gray-400 font-mono">PID: 0x{device.productId.toString(16).toUpperCase()}</span>}
        </div>
        <div className="flex items-center gap-3">
          <a href={`${import.meta.env.BASE_URL}tutorial.html?type=old`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer bg-white">
            {lang === 'en' ? '📖 Config Guide' : '📖 配置说明'}
          </a>
          <a href={`${import.meta.env.BASE_URL}download.html`}
            className="px-3 py-1 text-sm font-semibold border-2 border-indigo-200 rounded-lg text-indigo-600 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer bg-white">
            {lang === 'en' ? '⬇ Download App' : '⬇ 软件下载'}
          </a>
          <button onClick={() => navigate('/keytest')}
            className="px-3 py-1 text-sm font-semibold border-2 border-emerald-200 rounded-lg text-emerald-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer bg-white">
            {lang === 'en' ? '🎯 Key Test' : '🎯 按键测试'}
          </button>
          <button onClick={toggleLang}
            className="px-3 py-1 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer bg-white">
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="lg:w-[28%] xl:w-[24%] space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">{t('物理按键 · {name}', { name: modelName ? t(modelName) : '' })}</h3>
            {renderKeyButtons()}
          </div>

          <div className="bg-white rounded-xl shadow-sm border-2 border-indigo-100 p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <button className="py-3 text-sm font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer" onClick={handleReadConfig}>{t('读取键盘配置')}</button>
              <button className="py-3 text-sm font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer" onClick={handleClearKey}>{t('清除当前键')}</button>
              <button className="py-3 text-sm font-bold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer" onClick={handleClearAll}>{t('全部清除')}</button>
              <button className="py-3 text-base font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 rounded-lg transition-all cursor-pointer shadow-md active:scale-[0.97] tracking-wide" onClick={handleSaveToDevice}>{t('保存到键盘')}</button>
            </div>
          </div>

          {hasDelay && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('延迟时间 (ms)')}</h4>
              <div className="space-y-1.5">
                {Array.from({ length: keyCount }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-xs w-10 font-mono ${selectedKey === i ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>K{i + 1}</span>
                    <input type="number" className="w-full rounded-lg border border-gray-200 text-sm px-2.5 py-1.5 outline-none focus:border-indigo-400" min={0} max={60000} value={delays[i]} onChange={(e) => handleDelayChange(i, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <ConfigListPanel
            modelId={modelId}
            keyConfigs={keyConfigs}
            rgbMode={rgbMode}
            rgbMode2={rgbMode2}
            customColor={customColor}
            customColor2={customColor2}
            delays={delays}
            onLoadConfig={handleLoadConfig}
          />
        </div>

        <div className="lg:w-[72%] xl:w-[76%] space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-indigo-600">K{selectedKey + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-400 mb-0.5">{t('当前配置')}</div>
                <div className="text-base font-bold text-gray-800 break-words leading-snug">{getKeyDisplay(selectedKey)}</div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">{t('点击左侧按键选择要配置的物理按键，在下方设置功能。支持键盘、鼠标、多媒体和多键合一四种模式。')}</p>
          </div>

          <KeyConfigPanel config={currentConfig} onChange={handleConfigChange} multiKeyOnly={multiKeyOnly} multiKeyLen={multiKeyLen} />

          {hasRgb && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">{t('灯光设置')}</h3>
              <div className="flex flex-wrap items-end gap-4">
                {/* Zone 1 */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{isDualZone ? t('灯光模式 1') : t('灯光模式')}</label>
                  <select className="rounded-lg border border-gray-200 text-sm px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer" value={rgbMode} onChange={(e) => setRgbMode(Number(e.target.value))}>
                    {rgbOptions.map((name, idx) => (<option key={idx} value={idx}>{t(name)}</option>))}
                  </select>
                </div>
                {rgbOptions[rgbMode]?.includes('自定义') && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">{isDualZone ? t('颜色 1') : t('自定义颜色')}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200" value={`#${customColor.r.toString(16).padStart(2,'0')}${customColor.g.toString(16).padStart(2,'0')}${customColor.b.toString(16).padStart(2,'0')}`} onChange={handleColorChange} />
                      <span className="text-xs font-mono text-gray-400">#{customColor.r.toString(16).padStart(2,'0')}{customColor.g.toString(16).padStart(2,'0')}{customColor.b.toString(16).padStart(2,'0')}</span>
                    </div>
                  </div>
                )}
                {/* Zone 2 (仅双灯区) */}
                {isDualZone && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">{t('灯光模式 2')}</label>
                      <select className="rounded-lg border border-gray-200 text-sm px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer" value={rgbMode2} onChange={(e) => setRgbMode2(Number(e.target.value))}>
                        {rgbOptions2.map((name, idx) => (<option key={idx} value={idx}>{t(name)}</option>))}
                      </select>
                    </div>
                    {(rgbOptions2[rgbMode2]?.includes('自定义') || rgbOptions2[rgbMode2]?.includes('按下亮指定颜色')) && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">{t('颜色 2')}</label>
                        <div className="flex items-center gap-2">
                          <input type="color" className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200" value={`#${customColor2.r.toString(16).padStart(2,'0')}${customColor2.g.toString(16).padStart(2,'0')}${customColor2.b.toString(16).padStart(2,'0')}`} onChange={handleColorChange2} />
                          <span className="text-xs font-mono text-gray-400">#{customColor2.r.toString(16).padStart(2,'0')}{customColor2.g.toString(16).padStart(2,'0')}{customColor2.b.toString(16).padStart(2,'0')}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KeyboardConfigurator;
