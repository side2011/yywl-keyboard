// src/context/DeviceContext.jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { DEVICE_MODELS, VID, PID_TO_MODEL, MODEL_NAMES } from '../services/hid-constants';
import { detectModel } from '../services/hid-service';
import { isNewProtocolDevice, NewProtocolHandler, NEW_MODEL_NAMES } from '../services/new-protocol';
import { isBtWirelessDevice, BtProtocolHandler } from '../services/bt-protocol';

const DeviceContext = createContext(null);

export const DeviceProvider = ({ children }) => {
  const [device, setDevice] = useState(null);
  const [modelId, setModelId] = useState(null);
  const [protocolVersion, setProtocolVersion] = useState(null); // 1=旧协议, 2=新协议(AC632N), 3=蓝牙无线款
  const [deviceInfo, setDeviceInfo] = useState(null); // 设备动态信息
  const deviceRef = useRef(null);
  const newHandlerRef = useRef(null); // 协议处理器实例 (新协议或蓝牙协议)

  // 保持 ref 同步，供事件回调使用
  useEffect(() => { deviceRef.current = device; }, [device]);

  const model = modelId ? DEVICE_MODELS[modelId] : null;
  const modelName = modelId ? (MODEL_NAMES[modelId] || NEW_MODEL_NAMES[modelId] || modelId) : null;

  // 连接设备并自动检测型号
  const connectDevice = useCallback((hidDevice, manualModelId = null) => {
    setDevice(hidDevice);

    if (isBtWirelessDevice(hidDevice)) {
      // 蓝牙无线款: QT KEY_PRO 协议 (0xFB/0xFA/0xFD)
      setProtocolVersion(3);
      setModelId('BT');
      const handler = new BtProtocolHandler(hidDevice);
      handler.start();
      newHandlerRef.current = handler;
    } else if (isNewProtocolDevice(hidDevice)) {
      // 新协议: 固定型号，实际按键数由 0x0B 动态获取
      setProtocolVersion(2);
      setModelId('AC632N');
      const handler = new NewProtocolHandler(hidDevice);
      handler.start();
      newHandlerRef.current = handler;
    } else {
      // 旧协议: 通过 hid-service.js 的 detectModel 检测型号
      setProtocolVersion(1);
      newHandlerRef.current = null;
      setModelId(manualModelId || detectModel(hidDevice));
    }
  }, []);

  // 手动设置型号 (老款设备需要用户选择)
  const setManualModel = useCallback((id) => {
    setModelId(id);
  }, []);

  // 切换到蓝牙无线款协议 (0x514C 设备 0x0B 超时后探测到 QT 协议时调用)
  // 注意: 必须把探测得到的设备信息传入 handler, 否则 handler._info 为空导致键号映射错误
  const switchToBt = useCallback((hidDevice, info) => {
    if (newHandlerRef.current) {
      try { newHandlerRef.current.stop(); } catch { /* ignore */ }
    }
    const handler = new BtProtocolHandler(hidDevice);
    if (info) {
      handler._info = info;
      handler._isV10 = info.isV10 ?? (info.version >= 10);
    }
    handler.start();
    newHandlerRef.current = handler;
    setProtocolVersion(3);
    setModelId('BT');
  }, []);

  // 设置设备动态信息 (新协议设备)
  const setDeviceInfoData = useCallback((info) => {
    setDeviceInfo(info);
  }, []);

  // 获取新协议处理器
  const getNewHandler = useCallback(() => {
    return newHandlerRef.current;
  }, []);

  // 断开设备
  const disconnectDevice = useCallback(async () => {
    // 停止新协议处理器
    if (newHandlerRef.current) {
      newHandlerRef.current.stop();
      newHandlerRef.current = null;
    }
    if (deviceRef.current) {
      try { await deviceRef.current.close(); } catch (e) { /* ignore */ }
    }
    setDevice(null);
    setModelId(null);
    setProtocolVersion(null);
    setDeviceInfo(null);
  }, []);

  // ---- 全局 HID 设备插拔监听 ----
  useEffect(() => {
    if (!navigator.hid) return;

    // 物理拔出设备 → 自动清理状态
    const onDisconnect = (event) => {
      if (deviceRef.current && event.device === deviceRef.current) {
        console.log('[DeviceContext] 设备物理断开，清理状态');
        if (newHandlerRef.current) {
          newHandlerRef.current.stop();
          newHandlerRef.current = null;
        }
        setDevice(null);
        setModelId(null);
        setProtocolVersion(null);
        setDeviceInfo(null);
      }
    };

    navigator.hid.addEventListener('disconnect', onDisconnect);
    return () => navigator.hid.removeEventListener('disconnect', onDisconnect);
  }, []);

  return (
    <DeviceContext.Provider value={{
      device, model, modelId, modelName,
      protocolVersion, deviceInfo,
      connectDevice, disconnectDevice, setManualModel,
      setDeviceInfoData, getNewHandler, switchToBt,
    }}>
      {children}
    </DeviceContext.Provider>
  );
};

export const useDevice = () => useContext(DeviceContext);
