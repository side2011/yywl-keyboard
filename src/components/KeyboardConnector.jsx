// src/components/KeyboardConnector.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext.jsx';
import { useLang } from '../context/LanguageContext.jsx';
import CableHint from './CableHint';
import { DEVICE_FILTERS, MODEL_NAMES, isBluetoothModel, BT_PIDS, VID, isAc632nDevice, isBtModelByHid } from '../services/hid-constants';
import { isNewProtocolDevice, NEW_DEVICE_FILTERS } from '../services/new-protocol';
import { isBtWirelessDevice, BtProtocolHandler } from '../services/bt-protocol';
import toast from 'react-hot-toast';

// 构建版本标记 (用于强制刷新浏览器缓存)
const __BUILD_TAG = 'v20261013-macrolabel';

// 合并两套协议的设备过滤器 (路由层需要发现所有设备)
const ALL_DEVICE_FILTERS = [...DEVICE_FILTERS, ...NEW_DEVICE_FILTERS];

// 宽松过滤器: 只按 VID 过滤
// 用途: 键盘已插好但列表里看不到时手动开启。
// 背景: 严格过滤器按 VID+PID 精确匹配, 新型号 PID 一旦还没登记进 PID_TO_MODEL / BT_PIDS,
//       系统授权框会直接把它过滤掉, 用户只能看到"未检测到键盘设备", 完全无从下手。
const VENDOR_FALLBACK_FILTERS = [
  { vendorId: 0x8808 }, // 旧协议 CH55x
  { vendorId: 0x514C }, // 新协议 AC632N / 蓝牙无线款
  { vendorId: 0x1189 }, // 10KDZ1 / 蓝牙无线款
  { vendorId: 0x413D }, // 老野型号 (需手动选型号)
];

// 清理设备名称中的 null 字节和控制字符 (固件描述符可能包含非法字符导致乱码)
function cleanDeviceName(name) {
  if (!name) return '';
  return name.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

// 判断是否有之前授权过的键盘设备当前在线
// 用于区分「用户主动取消选择框」(键盘在线, requestDevice 返回空) 与「未插键盘」
async function hasKnownKeyboardOnline() {
  try {
    const known = await navigator.hid.getDevices();
    return known.some(d => ALL_DEVICE_FILTERS.some(f => d.vendorId === f.vendorId && d.productId === f.productId));
  } catch {
    return false;
  }
}

function KeyboardConnector() {
  const { t, lang, toggleLang } = useLang();
  const [connecting, setConnecting] = useState(false);
  const [newProtoReady, setNewProtoReady] = useState(false); // 新协议设备信息已就绪
  const [readingInfo, setReadingInfo] = useState(false); // 已连接, 正在读取设备信息 (显示进度提示)
  const [wideMode, setWideMode] = useState(false); // 宽松匹配: 只按 VID 过滤 (新型号 PID 未登记时的兜底)
  const [failCount, setFailCount] = useState(0); // 连续连接失败次数 — 用于升级提示 (换新标签页)
  const [forceTry, setForceTry] = useState(false); // 应用内嵌窗口里用户坚持"仍要尝试"
  const navigate = useNavigate();
  // 找不到 USB 配置接口时，不再直接跳外链下载页（会让客户卡死、也容易误判），
  // 改成让用户选：按蓝牙款继续配置，或留在本页重试。
  const askBluetoothFallback = (reason) => {
    console.warn('[KeyboardConnector] 疑似蓝牙无线款:', reason);
    const goBt = window.confirm(t(
      '没找到 USB 配置接口，这个键盘可能是「蓝牙无线款」。\n\n'
      + '点「确定」 → 用蓝牙款模式继续配置（推荐）\n'
      + '点「取消」 → 留在本页，拔插一次 USB 后重试',
    ));
    if (goBt) {
      navigate('/bt');
    } else {
      setConnecting(false);
    }
  };

  const { device, modelId, modelName, protocolVersion, connectDevice, disconnectDevice, setManualModel, setDeviceInfoData, getNewHandler, switchToBt } = useDevice();
  const connected = !!device;

  // 检测浏览器是否支持 WebHID API
  // 微信/QQ/UC 等内置浏览器即使 navigator.hid 存在也无法实际使用
  const [hidSupported, setHidSupported] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') { setHidSupported(false); return; }
    const ua = (navigator.userAgent || '').toLowerCase();
    const isWeChat = /micromessenger/.test(ua);
    const isQQ = /qq\//.test(ua) || /qqlivebrowser/.test(ua);
    const isUC = /ucbrowser/.test(ua);
    const isDingTalk = /dingtalk/.test(ua);
    const isInAppBrowser = isWeChat || isQQ || isUC || isDingTalk;
    const hasHID = !!navigator.hid && typeof navigator.hid.requestDevice === 'function';
    setHidSupported(hasHID && !isInAppBrowser);
  }, []);

  // 运行环境自检: 内嵌窗口/预览面板
  // 原因: WebHID 的设备选择框由浏览器内核提供, 不是网页画的
  //   · Electron webview/BrowserView 没有系统选择器 (必须宿主监听 select-hid-device 自己挑设备)
  //   · 跨域 iframe 还需要 allow="hid" 权限策略
  // 这类环境 requestDevice 必然拿不到设备, 提示"请插入键盘USB线"会把用户彻底带偏。
  //
  // 两种宿主要区别对待:
  //   iframe (普通浏览器内嵌)  → window.open 能开出真正的系统浏览器标签页, 可以给按钮
  //   其它 Electron 宿主       → window.open 只会在应用内再开一个窗口, 给按钮等于骗人,
  //                              网页也无权调起系统浏览器, 所以只能给"可复制地址"并拦住连接。
  //                              注意: 自家 Electron 桌面版靠 UA 里的 YYWLDesktop 标识豁免。
  const [embedContext, setEmbedContext] = useState(null); // null | 'iframe' | 'electron'
  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isOwnDesktop = /YYWLDesktop/i.test(ua); // 自家桌面版: 主进程已实现 select-hid-device
    const isOtherElectron = /Electron\//i.test(ua) && !isOwnDesktop;
    let inFrame = false;
    try {
      inFrame = window.self !== window.top;
    } catch {
      inFrame = true; // 连 window.top 都访问不了 → 一定在跨域内嵌内容里
    }
    if (isOtherElectron) setEmbedContext('electron');
    else if (inFrame) setEmbedContext('iframe');
  }, []);

  // 复制当前地址 (内嵌宿主里这是唯一可靠的"拿到正确浏览器去打开"的办法)
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const [copied, setCopied] = useState(false);
  const copyPageUrl = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
    } catch {
      // 兜底: 部分内嵌环境没有 clipboard 权限
      try {
        const ta = document.createElement('textarea');
        ta.value = pageUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        toast.error(t('复制失败，请手动选中地址粘贴到 Chrome'), { id: 'hid-copy' });
        return;
      }
    }
    setCopied(true);
    toast.success(t('地址已复制，请粘贴到 Google Chrome 或 Edge 的地址栏打开'), { id: 'hid-copy' });
    setTimeout(() => setCopied(false), 3000);
  };

  // 逃生出口: 在新标签页打开 (内嵌环境里最有效的一步)
  const openStandalone = () => {
    try {
      const w = window.open(window.location.href, '_blank', 'noopener');
      if (!w) toast.error(t('浏览器阻止了新窗口，请手动复制地址栏链接到 Chrome 或 Edge 打开'), { id: 'hid-open', duration: 8000 });
    } catch {
      toast.error(t('请手动复制地址栏链接到 Chrome 或 Edge 打开'), { id: 'hid-open' });
    }
  };

  // 旧协议: device+modelId 即可跳转; 新协议: 等 deviceInfo 读取完毕再跳转
  // 蓝牙无线款(protocolVersion=3)不在此自动跳转 — 由 BT 连接流程显式 navigate('/bt')
  useEffect(() => {
    if (device && modelId && protocolVersion !== 3) {
      if (!isNewProtocolDevice(device) || newProtoReady) navigate('/customize');
    }
  }, [device, modelId, newProtoReady, protocolVersion, navigate]);

  const connectToKeyboard = async () => {
    console.log('[YYWL] build:', __BUILD_TAG);
    if (connecting) return;
    // 微信等内置浏览器提前拦截 — alert 比 toast 更可靠
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/micromessenger|qq\/|qqlivebrowser|ucbrowser|dingtalk/.test(ua)) {
      alert(t('微信、QQ 等内置浏览器不支持连接键盘，请复制链接到 Chrome 或 Edge 浏览器中打开。'));
      return;
    }
    // 应用内嵌 Electron 宿主: 没有系统 HID 选择器, 连了也必然失败, 直接拦住并给地址
    if (embedContext === 'electron' && !forceTry) {
      setFailCount(c => c + 1);
      toast.error(t('当前是应用内嵌窗口，无法连接键盘。请复制地址，用 Google Chrome 或 Edge 打开后再连接'), { duration: 10000, id: 'hid-embed-block' });
      return;
    }
    setConnecting(true);
    setNewProtoReady(false);
    setReadingInfo(false);
    try {
      if (!navigator.hid) { alert(t('请使用 Chrome 或 Edge 浏览器打开本页面。')); setConnecting(false); return; }
      const filters = wideMode ? VENDOR_FALLBACK_FILTERS : ALL_DEVICE_FILTERS;
      if (wideMode) console.log('[KeyboardConnector] 宽松匹配模式: 仅按 VID 过滤');
      const devices = await navigator.hid.requestDevice({ filters });
      if (devices.length === 0) {
        // requestDevice 返回空有两种情况:
        // 1) 用户主动取消选择框 (键盘在线) → 温和提示, 不报错
        // 2) 未插键盘/接口不匹配 → 明确提示, 避免客户以为卡死
        if (await hasKnownKeyboardOnline()) {
          console.warn('[KeyboardConnector] requestDevice 返回空: 用户取消选择');
          toast(t('已取消选择，未连接设备'), { duration: 3000, id: 'hid-select' });
        } else if (embedContext) {
          console.warn('[KeyboardConnector] 内嵌窗口内拿不到设备, 引导到新标签页', { embedContext });
          setFailCount(c => c + 1);
          toast.error(t('当前是内嵌预览窗口，无法连接键盘设备。请在新标签页中用 Chrome 或 Edge 打开本页面。'), { duration: 10000, id: 'hid-embed' });
        } else {
          console.warn('[KeyboardConnector] requestDevice 返回空, 未检测到键盘设备', { wideMode });
          setFailCount(c => c + 1);
          toast.error(t('未检测到键盘设备，请插入键盘USB线后重试'), { duration: 8000, id: 'hid-no-device' });
        }
        setConnecting(false);
        return;
      }

      // 诊断: 打印所有返回的设备及其 collections 详情
      console.log(`[KeyboardConnector] requestDevice 返回 ${devices.length} 个设备:`);
      for (const dev of devices) {
        console.log(`  设备: name="${dev.productName}" VID=0x${dev.vendorId?.toString(16)} PID=0x${dev.productId?.toString(16)}`);
        if (dev.collections) {
          for (let ci = 0; ci < dev.collections.length; ci++) {
            const c = dev.collections[ci];
            console.log(`    collection[${ci}]: usagePage=0x${c.usagePage?.toString(16)} usage=0x${c.usage?.toString(16)}`);
            if (c.outputReports) {
              for (const r of c.outputReports) {
                const size = r.items?.reduce((s, i) => s + (i.reportSize * i.reportCount) / 8, 0) || 0;
                console.log(`      outputReport: reportId=${r.reportId} items=${r.items?.length || 0} calcSize=${size}`);
              }
            }
            if (c.inputReports) {
              for (const r of c.inputReports) {
                const size = r.items?.reduce((s, i) => s + (i.reportSize * i.reportCount) / 8, 0) || 0;
                console.log(`      inputReport: reportId=${r.reportId} items=${r.items?.length || 0} calcSize=${size}`);
              }
            }
          }
        }
      }

      // 蓝牙无线款经典PID (0x8842/0x8840/0x8830-0x8833): 网页已集成 QT 协议, 直接连接配置
      // 注意: 0x8850/0x8851 属于 AC632N 新协议, 走下方原有逻辑
      const btClassicDevice = devices.find(dev => isBtWirelessDevice(dev));
      if (btClassicDevice) {
        console.log('[KeyboardConnector] 检测到蓝牙无线款, 使用 BT 协议连接:', btClassicDevice.vendorId.toString(16), btClassicDevice.productId.toString(16));
        // 蓝牙款配置接口: 优先 0xFF00/0xffa0, 兜底有 outputReports 的
        for (const dev of devices) {
          if (!dev.opened) { try { await dev.open(); } catch { /* ignore */ } }
        }
        const btConfig = devices.find(dev => dev.opened && dev.collections?.some(c => c.usagePage === 0xFF00)) ||
                         devices.find(dev => dev.opened && dev.collections?.some(c => c.usagePage === 0xffa0)) ||
                         devices.find(dev => dev.opened && dev.collections?.some(c => c.outputReports?.length > 0)) ||
                         btClassicDevice;
        if (!btConfig.opened) { try { await btConfig.open(); } catch { /* ignore */ } }
        connectDevice(btConfig);
        toast.success(t('设备已连接'));
        setReadingInfo(true);
        // 读取蓝牙设备信息
        try {
          const btHandler = getNewHandler();
          if (btHandler) {
            const btInfo = await btHandler.readDeviceInfo();
            setDeviceInfoData(btInfo);
            console.log('[KeyboardConnector] 蓝牙设备信息:', btInfo);
          }
          navigate('/bt');
        } catch (btErr) {
          console.error('[KeyboardConnector] 蓝牙设备信息读取失败:', btErr);
          toast.error(t('读取设备信息失败: {msg}', { msg: btErr.message }));
          setNewProtoReady(true);
          navigate('/bt');
        }
        setConnecting(false);
        return;
      }

      // 其他蓝牙款 (0x8850 无响应等场景) 仍走下载页引导
      const btDevice = devices.find(dev => !isAc632nDevice(dev.vendorId, dev.productId) && isBluetoothModel(dev.vendorId, dev.productId));
      if (btDevice) {
        askBluetoothFallback('非 AC632N 且 PID 属于蓝牙款');
        return;
      }

      // 通过 HID collection 检测蓝牙无线款 (同 VID/PID 场景: AC632N USB vs 蓝牙无线款)
      // USB款有 vendor-specific(0xFF00) 接口（可能在与 consumer control 不同的设备对象中）
      // 蓝牙款只有 consumer control(0x0C) 接口，没有任何设备对象含 0xFF00
      if (isBtModelByHid(devices)) {
        console.log('[KeyboardConnector] 通过 HID collection 检测到蓝牙无线款 (所有设备均无0xFF00)');
        askBluetoothFallback('所有设备都没有 0xFF00 配置接口');
        return;
      }

      // AC632N 麦克风设备检测已移至读取设备信息后（需先读取 deviceInfo 判断是否有麦克风标识）

      // 诊断: 对于 VID=0x514C/PID=0x8850 设备，打印其接口类型用于排查
      for (const dev of devices) {
        if (dev.vendorId === 0x514C && dev.productId === 0x8850) {
          const pages = (dev.collections || []).map(c => `0x${c.usagePage?.toString(16)}`);
          console.log(`[KeyboardConnector] VID=0x514C/PID=0x8850 设备接口: [${pages.join(', ')}]`);
        }
      }

      // 查找配置接口（含重试：open 失败时先 close 再 open，解决设备半占用/换口后句柄失效）
      // C# 项目要求 mi_03 (厂商自定义接口), WebHID 中对应 usagePage 0xFF00
      // 注意: 0xffa0 设备在列表中可能排在 0xff00 前面, 必须两轮扫描确保优先级正确
      let configDevice = null;

      // 先打开所有设备 (含重试)
      for (const dev of devices) {
        if (!dev.opened) {
          try { await dev.open(); } catch {
            try { await dev.close(); } catch { /* ignore */ }
            await new Promise(r => setTimeout(r, 150));
            try { await dev.open(); } catch { /* ignore */ }
          }
        }
      }

      // 第一轮: 找 0xFF00 vendor-specific (C# mi_03 对应接口)
      configDevice = devices.find(dev => dev.opened && dev.collections?.some(c => c.usagePage === 0xFF00 && c.usage === 0x01));
      if (configDevice) console.log('[KeyboardConnector] 选中设备: 0xFF00 vendor-specific 接口 (mi_03)');

      // 第二轮: 找 0xffa0 vendor-specific
      if (!configDevice) {
        configDevice = devices.find(dev => dev.opened && dev.collections?.some(c => c.usagePage === 0xffa0));
        if (configDevice) console.log('[KeyboardConnector] 选中设备: 0xffa0 vendor-specific 接口');
      }

      // 兜底: 有 outputReports 的
      if (!configDevice) {
        configDevice = devices.find(dev => dev.opened && dev.collections?.some(c => c.outputReports?.length > 0));
        if (configDevice) console.log('[KeyboardConnector] 选中设备: 兜底 (有 outputReports)');
      }
      if (!configDevice) {
        console.error('[KeyboardConnector] 无法打开设备接口, devices:', devices.map(d => ({ vid: d.vendorId?.toString(16), pid: d.productId?.toString(16), opened: d.opened, name: d.productName })));
        // 选中的设备完全没有厂商配置接口 → 多半是选错设备了 (USB 无线接收器 / 普通键鼠)
        const hasVendorIface = devices.some(d => d.collections?.some(c => c.usagePage === 0xFF00 || c.usagePage === 0xffa0));
        const ua = navigator.userAgent || '';
        const isLinux = /linux/i.test(ua) && !/android/i.test(ua);
        if (!hasVendorIface) {
          toast.error(t('选中的设备没有配置接口（可能是 USB 无线接收器或普通键鼠），请插入小键盘后重新连接'), { duration: 10000, id: 'hid-no-iface' });
        } else if (isLinux) {
          const udevCmd = `sudo bash -c 'cat > /etc/udev/rules.d/99-yywl-keyboard.rules << EOF\nSUBSYSTEM=="hidraw", ATTRS{idVendor}=="413d", MODE="0666"\nSUBSYSTEM=="hidraw", ATTRS{idVendor}=="8808", MODE="0666"\nSUBSYSTEM=="hidraw", ATTRS{idVendor}=="514c", MODE="0666"\nSUBSYSTEM=="hidraw", ATTRS{idVendor}=="1189", MODE="0666"\nEOF\n' && sudo udevadm control --reload-rules && sudo udevadm trigger`;
          const copyCmd = () => { navigator.clipboard.writeText(udevCmd).then(() => toast.success('命令已复制，请粘贴到终端运行')).catch(() => {}); };
          toast((tToast) => (
            <div className="text-sm leading-relaxed max-w-md">
              <p className="font-bold text-red-600 mb-2">检测到 Linux 系统，需配置 udev 权限才能访问键盘</p>
              <p className="font-semibold text-gray-800 mb-1">方法一：下载修复工具</p>
              <a href={`${import.meta.env.BASE_URL}fix-keyboard-permission.desktop`} download
                className="block w-full text-center py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors mb-3">
                 下载 修复键盘权限.desktop
              </a>
              <p className="text-gray-600 text-xs mb-1">下载后操作：</p>
              <p className="text-gray-600 text-xs mb-1">① 右键文件 → 属性 → 权限 → 勾选"允许作为程序执行"</p>
              <p className="text-gray-600 text-xs mb-3">② 双击运行，输入密码即可</p>
              <p className="text-gray-500 text-xs mb-3">如右键无权限选项，请用方法二 ↓</p>
              <div className="border-t border-gray-200 pt-3 mb-2">
                <p className="font-semibold text-gray-800 mb-1">方法二：手动复制命令到终端</p>
                <p className="text-gray-600 text-xs mb-2">① 右键桌面 → 打开终端 &nbsp; ② 点击下方复制按钮 &nbsp; ③ 终端中右键粘贴 → 回车 → 输密码</p>
                <div className="bg-gray-800 rounded-lg p-2.5 mb-2">
                  <code className="text-green-400 text-xs break-all leading-relaxed select-all">{udevCmd}</code>
                </div>
                <button onClick={copyCmd} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors text-sm">
                  复制命令
                </button>
              </div>
              <p className="text-gray-500 text-xs mt-2">⚠ 配置完成后请拔插键盘USB线，再重新连接</p>
            </div>
          ), { duration: 30000, id: 'linux-udev' });
        } else {
          toast.error(t('无法连接设备接口，请尝试：1.关闭其他配置软件或浏览器标签 2.拔插键盘USB线后重试'), { duration: 6000, id: 'hid-iface-fail' });
        }
        setConnecting(false); return;
      }

      if (!configDevice.opened) await configDevice.open();

      const isNewProto = isNewProtocolDevice(configDevice);
      connectDevice(configDevice);
      setFailCount(0);
      toast.success(t('设备已连接'));
      setReadingInfo(true);

      // 新协议设备: 读取设备动态信息
      if (isNewProto) {
        try {
          const handler = getNewHandler();
          if (handler) {
            const info = await handler.readDeviceInfo();
            setDeviceInfoData(info);
            console.log('[KeyboardConnector] 新协议设备信息:', info);
            console.log('[KeyboardConnector] === 设备信息详情 ===');
            console.log('[KeyboardConnector]   keyCount (按键数):', info.keyCount);
            console.log('[KeyboardConnector]   encoderCount (编码器数):', info.encoderCount);
            console.log('[KeyboardConnector]   encoderDCount (编码器档位):', info.encoderDCount);
            console.log('[KeyboardConnector]   layerCount (层数):', info.layerCount);
            console.log('[KeyboardConnector]   hardwareVersion (硬件版本):', info.hardwareVersion);
            console.log('[KeyboardConnector]   layoutId (布局ID):', info.layoutId);
            console.log('[KeyboardConnector]   backlightType (背光类型):', info.backlightType);
            console.log('[KeyboardConnector] ====================');
            // ===== 协议判定蓝牙无线款 =====
            // 蓝牙无线款与 AC632N USB 款共用 VID/PID (0x514C/0x8850) 且都带 0xFF00 接口,
            // 仅靠 HID collection 无法区分; 0x0B 正常响应时, 通过型号名字符串判定:
            // 型号名含 BT/Bluetooth/Wireless 等标记 → 蓝牙无线款
            const btModelName = (info.modelName || '').toUpperCase();
            const isBtByModelName = /BT|WIRELESS|BLUETOOTH|蓝牙|无线/.test(btModelName);
            if (isBtByModelName) {
              console.log(`[KeyboardConnector] 协议判定蓝牙无线款 (modelName='${info.modelName || ''}' keyCount=${info.keyCount} encoderCount=${info.encoderCount} layoutId=${info.layoutId} hwVer=${info.hardwareVersion})`);
              askBluetoothFallback('设备型号名里带 BT/无线 标记');
              return;
            }
            // 检测是否为麦克风设备
            // 优先使用协议命令 (0x0D/0x0E), 兜底使用设备特征判断 (keyCount=5 且 layoutId=5)
            try {
              const micResult = await handler.detectMicrophone();
              console.log('[KeyboardConnector] 麦克风检测结果:', micResult);
              let isMicDevice = micResult.hasMicrophone;

              // 兜底: 协议命令未检测到时, 通过 keyCount=5 且 layoutId=5 判断
              if (!isMicDevice && info.keyCount === 5 && info.layoutId === 5) {
                console.log('[KeyboardConnector] 兜底判定: keyCount=5 且 layoutId=5 → 麦克风设备');
                isMicDevice = true;
              }

              if (isMicDevice) {
                console.log('[KeyboardConnector] 检测到麦克风设备，跳转到引导页');
                navigate('/mic');
                setConnecting(false);
                return;
              }
            } catch (micErr) {
              console.warn('[KeyboardConnector] 麦克风检测失败 (非致命):', micErr);
              // 协议检测异常时, 也用设备特征兜底
              if (info.keyCount === 5 && info.layoutId === 5) {
                console.log('[KeyboardConnector] 麦克风检测异常但 keyCount=5 且 layoutId=5, 跳转到引导页');
                navigate('/mic');
                setConnecting(false);
                return;
              }
            }
            // 协议 8.1 要求: 读取扩展设备信息 (0x0C)
            try {
              const extInfo = await handler.readExtDeviceInfo();
              console.log('[KeyboardConnector] 扩展设备信息:', extInfo);
              console.log('[KeyboardConnector]   capabilities (hex):', extInfo.capabilities?.toString(16));
              console.log('[KeyboardConnector]   capabilities (bin):', extInfo.capabilities?.toString(2).padStart(32, '0'));
              setDeviceInfoData({ ...info, extInfo });
            } catch (extErr) {
              console.warn('[KeyboardConnector] 读取扩展设备信息失败 (非致命):', extErr);
            }
          }
          setNewProtoReady(true);
        } catch (e) {
          console.error('[KeyboardConnector] 读取设备信息失败:', e);
          // ===== 0x0B 超时的严谨判定 =====
          // 蓝牙无线款不实现 0x0B (实测完全无响应), 但部分 USB 款在枚举初期
          // 也可能短暂超时/返回垃圾数据 (拔插后恢复正常) — 绝不能单凭一次超时就判蓝牙
          if (e && e.message && /timeout/i.test(e.message)) {
            // 0x0B 超时 → 先探测 QT 蓝牙无线款协议 (0xFB):
            // 部分 0x514C/0x8850/0x8851 设备跑的是 QT KEY_PRO 协议而非 AC632N 新协议 (如 6+1旋钮款)
            try {
              const btProbe = new BtProtocolHandler(configDevice);
              btProbe.start();
              const btInfo = await btProbe.readDeviceInfo();
              console.log('[KeyboardConnector] 0x0B 超时但 QT 协议(0xFB)有响应 → 蓝牙无线款:', btInfo);
              switchToBt(configDevice, btInfo);
              setDeviceInfoData(btInfo);
              navigate('/bt');
              setConnecting(false);
              return;
            } catch (btProbeErr) {
              console.log('[KeyboardConnector] QT 协议探测无响应:', btProbeErr.message);
            }
            // 蓝牙无线款只在 PID 0x8850 上存在; 其他 PID (如 0x8851 4键新款) 绝不判蓝牙
            if (configDevice.productId !== 0x8850) {
              console.log('[KeyboardConnector] 0x0B 超时但 PID≠0x8850, 不判蓝牙, 提示拔插重试');
              toast.error(t('设备响应异常，请拔插键盘USB线后重试'), { duration: 6000 });
              setConnecting(false);
              return;
            }
            // PID=0x8850: 二次确认 — USB 款即使 0x0B 异常也会有响应 (数据/ACK/NAK),
            // 蓝牙款对所有协议命令均完全无响应
            const handler2 = getNewHandler();
            if (handler2) {
              const alive = await handler2.probeAlive(2000);
              if (alive) {
                console.log('[KeyboardConnector] 0x0B 超时但设备有响应 → USB款异常状态, 提示拔插重试');
                toast.error(t('设备响应异常，请拔插键盘USB线后重试'), { duration: 6000 });
                setConnecting(false);
                return;
              }
              console.log('[KeyboardConnector] 0x0B 超时且设备无任何响应 → 判定为蓝牙无线款, 跳转下载页');
              askBluetoothFallback('0x0B 超时且设备无响应');
              return;
            }
            // handler 不可用时按最保守处理: 提示重试, 不误跳转
            toast.error(t('读取设备信息失败，请拔插键盘USB线后重试'), { duration: 6000 });
            setConnecting(false);
            return;
          }
          toast.error(t('读取设备信息失败: {msg}', { msg: e.message }));
          setNewProtoReady(true); // 即使失败也允许跳转，使用默认参数
        }
      }
    } catch (error) {
      console.error('[KeyboardConnector] 连接失败:', error, { name: error?.name, embedContext, wideMode });
      // 桌面版/未插键盘: requestDevice 找不到匹配设备会抛 NotFoundError
      // 部分浏览器取消选择框也会抛 NotFoundError — 同样区分处理
      if (error && error.name === 'NotFoundError') {
        if (await hasKnownKeyboardOnline()) {
          toast(t('已取消选择，未连接设备'), { duration: 3000, id: 'hid-select' });
        } else if (embedContext) {
          setFailCount(c => c + 1);
          toast.error(t('当前是内嵌预览窗口，无法连接键盘设备。请在新标签页中用 Chrome 或 Edge 打开本页面。'), { duration: 10000, id: 'hid-embed' });
        } else {
          setFailCount(c => c + 1);
          toast.error(t('未检测到键盘设备，请插入键盘USB线后重试'), { duration: 8000, id: 'hid-no-device' });
        }
        return;
      }
      // 权限/安全策略拦截: 内嵌 iframe 缺少 allow="hid"、或宿主环境限制设备访问
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError' || error.name === 'NotSupportedError')) {
        setFailCount(c => c + 1);
        toast.error(t('当前窗口不允许访问 USB 设备，请用 Chrome 或 Edge 的独立标签页打开本页面'), { duration: 10000, id: 'hid-denied' });
        return;
      }
      // 某些浏览器（如微信浏览器）navigator.hid 可能存在但实际不可用
      setFailCount(c => c + 1);
      toast.error(t('连接失败，请使用 Chrome 或 Edge 浏览器打开本页面。'), { id: 'hid-connect-fail' });
    } finally { setConnecting(false); setReadingInfo(false); }
  };

  const handleDisconnect = async () => { await disconnectDevice(); toast.success(t('设备已断开')); };

  const handleModelSelect = (e) => {
    if (e.target.value) { setManualModel(e.target.value); toast.success(t('已选择: {name}', { name: t(MODEL_NAMES[e.target.value]) })); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {(() => {
          if (!hidSupported) return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">{t('浏览器不兼容')}</h1>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                {t('您当前使用的浏览器不支持连接键盘所需的')} <strong>WebHID API</strong>。{t('请更换为以下浏览器重新打开：')}
              </p>
              <div className="space-y-3 mb-6">
                <a href="https://www.google.cn/chrome/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 via-yellow-500 to-green-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">C</div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-gray-800">Google Chrome</div>
                    <div className="text-xs text-gray-400">{t('推荐 · 支持 Windows / macOS / Linux')}</div>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </a>
                <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">E</div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-gray-800">Microsoft Edge</div>
                    <div className="text-xs text-gray-400">{t('Windows 自带 · 也支持 macOS / Linux')}</div>
                  </div>
                  <svg className="w-5 h-5 text-gray-300 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </a>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-amber-800">
                  💡 {t('微信、QQ、UC 等内置浏览器均不支持此功能，请使用系统自带的 Chrome 或 Edge 浏览器。')}
                </p>
              </div>
              <div className="pt-4 border-t border-gray-100">
                {lang === 'zh'
                  ? <p className="text-sm text-gray-500">技术支持 QQ：<span className="font-mono text-gray-800 font-bold text-base">1291285148</span></p>
                  : <p className="text-sm text-gray-500">Tech Support: <a href="mailto:1291285148@qq.com" className="font-mono text-gray-800 font-bold text-base underline hover:text-indigo-600">1291285148@qq.com</a></p>}
              </div>
            </div>
          );
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="text-center mb-8">
                <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="14" rx="2" />
                    <line x1="6" y1="10" x2="6.01" y2="10" /><line x1="10" y1="10" x2="10.01" y2="10" />
                    <line x1="14" y1="10" x2="14.01" y2="10" /><line x1="18" y1="10" x2="18.01" y2="10" />
                    <line x1="8" y1="14" x2="16" y2="14" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">{t('多功能小键盘配置工具')}</h1>
                <p className="text-sm text-gray-500">{t('连接您的小键盘以开始配置')}</p>
              </div>

              {/* 插线提示动画: 键盘必须先接好 USB 线才能被浏览器识别 */}
              {!connected && (
                <div className="mb-5">
                  <CableHint
                    title={t('请先用 USB 线连接键盘')}
                    subtitle={t('插好线后，点击下方「连接键盘」开始识别')}
                  />
                </div>
              )}

              {/* 内嵌宿主提示: 这类环境没有 USB 设备选择框。
                  Electron 宿主里 window.open 只会再开一个应用内窗口, 给"新标签页"按钮等于骗人,
                  网页也无权调起系统浏览器 —— 所以只给可复制地址, 并默认拦住连接。 */}
              {embedContext && !connected && !forceTry && (
                <div className="mb-4 p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-left">
                  {embedContext === 'electron' ? (
                    <>
                      <p className="text-sm font-bold text-amber-900 mb-1.5">
                        {t('当前是应用内嵌窗口，无法连接键盘')}
                      </p>
                      <p className="text-xs text-amber-800 leading-relaxed mb-2.5">
                        {t('这类窗口没有 USB 设备选择框，键盘永远连不上；网页也无权替你打开系统浏览器。请复制下面的地址，粘贴到 Google Chrome 或 Edge 的地址栏打开。')}
                      </p>
                      <div className="bg-white border border-amber-200 rounded-lg px-2.5 py-2 mb-2">
                        <code className="text-[11px] leading-relaxed break-all text-gray-700 select-all">{pageUrl}</code>
                      </div>
                      <button type="button" onClick={copyPageUrl}
                        className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer">
                        {copied ? t('已复制，去 Chrome 粘贴打开') : t('复制地址（去外部浏览器打开）')}
                      </button>
                      <div className="mt-2 text-center">
                        <button type="button" onClick={() => setForceTry(true)}
                          className="text-[11px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer">
                          {t('仍要在此窗口尝试连接（不推荐）')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-amber-800 mb-1">
                        {t('检测到当前是内嵌窗口，此环境可能无法连接键盘')}
                      </p>
                      <p className="text-xs text-amber-700 leading-relaxed mb-2.5">
                        {t('内嵌窗口可能缺少 USB 设备选择框。请用 Google Chrome 或 Edge 的独立标签页打开；下面的按钮无效时请改用复制地址。')}
                      </p>
                      <div className="flex gap-2">
                        <button type="button" onClick={openStandalone}
                          className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer">
                          {t('在新标签页中打开')}
                        </button>
                        <button type="button" onClick={copyPageUrl}
                          className="flex-1 py-2 bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 text-sm font-semibold rounded-lg transition-colors cursor-pointer">
                          {copied ? t('已复制') : t('复制地址')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {!connected && (embedContext !== 'electron' || forceTry) && (
                <button onClick={connectToKeyboard} disabled={connecting}
                  className={`w-full py-3.5 rounded-xl text-base font-semibold text-white transition-all cursor-pointer ${
                    connecting ? 'bg-indigo-300 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-200/50 active:scale-[0.98]'
                  }`}>
                  {connecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      {t('连接中...')}
                    </span>
                  ) : t('连接键盘')}
                </button>
              )}

              {connected && (
                <button onClick={handleDisconnect} className="w-full py-3.5 rounded-xl text-base font-semibold text-white bg-red-500 hover:bg-red-600 transition-all cursor-pointer shadow-lg shadow-red-200/50 active:scale-[0.98]">{t('断开连接')}</button>
              )}

              {/* 兜底入口: 新型号 PID 未登记时, 严格过滤器会让设备根本不出现在系统授权框里 */}
              {!connected && (
                <div className="mt-3 text-center">
                  <button type="button" onClick={() => setWideMode(v => !v)}
                    className={`text-xs underline underline-offset-2 cursor-pointer transition-colors ${
                      wideMode ? 'text-indigo-600 font-semibold' : 'text-gray-400 hover:text-indigo-500'
                    }`}>
                    {wideMode ? t('恢复只显示小键盘设备') : t('找不到设备？列出全部同厂设备')}
                  </button>
                  {wideMode && (
                    <p className="mt-1.5 text-xs text-amber-600 leading-relaxed">
                      {t('宽松匹配已开启：会列出该厂商的全部 HID 设备（含鼠标/键盘），请选中带配置接口的小键盘')}
                    </p>
                  )}
                  {/* 连续失败后的升级提示: 兜住"检测不到特征"的内嵌宿主 */}
                  {!embedContext && failCount >= 2 && (
                    <p className="mt-2 text-xs text-amber-600 leading-relaxed">
                      {t('多次连不上？如果当前是在应用内嵌窗口里打开的，请')}
                      <button type="button" onClick={copyPageUrl}
                        className="text-indigo-600 font-semibold underline underline-offset-2 cursor-pointer mx-0.5">
                        {t('复制地址')}
                      </button>
                      {t('到 Google Chrome 或 Edge 中打开')}
                    </p>
                  )}
                </div>
              )}

              {device && (
                <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('设备信息')}</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-gray-500">{t('名称')}</span><span className="text-gray-800 font-medium">{cleanDeviceName(device.productName) || t('键盘')}</span>
                    <span className="text-gray-500">VID</span><span className="font-mono text-gray-700">0x{device.vendorId.toString(16).toUpperCase()}</span>
                    <span className="text-gray-500">PID</span><span className="font-mono text-gray-700">0x{device.productId.toString(16).toUpperCase()}</span>
                    <span className="text-gray-500">{t('型号')}</span><span className="font-semibold text-indigo-600">{modelName ? t(modelName) : t('未识别')}</span>
                  </div>
                  {connected && !modelId && (
                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <label className="block text-xs text-gray-500 mb-1.5">{t('未自动识别型号，请手动选择：')}</label>
                      <select className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer" onChange={handleModelSelect} defaultValue="">
                        <option value="" disabled>{t('请选择设备型号')}</option>
                        {Object.entries(MODEL_NAMES).map(([key, name]) => (<option key={key} value={key}>{t(name)} ({key})</option>))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        <div className="text-center mt-4 space-y-2">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href={lang === 'en' ? '/tutorial-en.html' : '/tutorial.html'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm rounded-xl border-2 border-indigo-200 transition-colors cursor-pointer">
              {lang === 'en' ? 'View User Guide' : '📖 查看使用说明'}
            </a>
            <button onClick={() => navigate('/keytest')}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm rounded-xl border-2 border-emerald-200 transition-colors cursor-pointer">
              {lang === 'en' ? '🎯 Key Test' : '🎯 按键测试'}
            </button>
          </div>
          {lang === 'zh'
            ? <p className="text-sm text-gray-500">技术支持 QQ：<span className="font-mono text-gray-800 font-bold text-base">1291285148</span></p>
            : <p className="text-sm text-gray-500">Tech Support: <a href="mailto:1291285148@qq.com" className="font-mono text-gray-800 font-bold text-base underline hover:text-indigo-600">1291285148@qq.com</a></p>}
          <p className="text-xs text-gray-400">{t('支持 Chrome / Edge 111 及以上，或使用桌面版')}</p>
        </div>
        {/* Language toggle */}
        <div className="text-center mt-3">
          <button onClick={toggleLang}
            className="px-4 py-1.5 text-sm font-semibold border-2 border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer bg-white">
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>
      </div>

      {/* 全局等待遮罩: 读取设备信息期间禁止一切操作 (防止误点断开连接等) */}
      {connected && readingInfo && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="flex items-center gap-3 bg-white px-6 py-3.5 rounded-full shadow-lg border border-gray-200">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-base font-semibold text-gray-700">{t('正在读取设备信息…')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default KeyboardConnector;
