// ============================================================
// hid-service.js — WebHID communication protocol layer
// ============================================================

import { DEVICE_MODELS, VID, PID_TO_MODEL, MEDIA_KEYS, ledIndexToDevice, ledDeviceToIndex, getRgbModes2ForModel, KEYCODE_LABELS } from './hid-constants';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// 旧协议设备型号检测 (仅处理 VID 0x8808/0x413D/0x1189 的设备)
// 新协议设备 (VID 0x514C) 由 new-protocol.js 独立处理
export function detectModel(device) {
  if (!device) return null;
  const { vendorId, productId } = device;

  if (vendorId === VID.K10_CUSTOM && productId === 0x8834) {
    return '10KDZ1';
  }
  if (vendorId === VID.NEW && PID_TO_MODEL[productId]) {
    return PID_TO_MODEL[productId];
  }
  // 新协议设备 (VID 0x514C) 不在此模块处理
  if (vendorId === 0x514C) {
    return null; // 由调用方通过 isNewProtocolDevice 判断
  }
  if (vendorId === VID.OLD) {
    return null;
  }
  return null;
}

export async function hidSend(device, byData) {
  if (!device || !device.opened) throw new Error('设备未连接');

  // 自动检测正确的 outputReport reportId 和期望的数据长度
  // 优先选择厂商自定义 usagePage (0xffa0 / 0xFF00), 对应 C# 的 mi_03 接口
  let targetReportId = 0;
  let expectedReportSize = 0;
  if (device.collections) {
    // 优先找厂商自定义接口 — 0xff00 对应 C# 的 mi_03 (最常用), 0xffa0 次之
    const vendorPages = [0xFF00, 0xffa0];
    let selectedCollection = null;
    for (const c of device.collections) {
      if (vendorPages.includes(c.usagePage) && c.outputReports?.length > 0) {
        selectedCollection = c;
        break;
      }
    }
    // 兜底: 第一个有 outputReports 的 collection
    if (!selectedCollection) {
      for (const c of device.collections) {
        if (c.outputReports?.length > 0) {
          selectedCollection = c;
          break;
        }
      }
    }
    if (selectedCollection) {
      const report = selectedCollection.outputReports[0];
      targetReportId = report.reportId;
      if (report.items) {
        for (const item of report.items) {
          expectedReportSize += (item.reportSize * item.reportCount) / 8;
        }
      }
      console.log(`[hidSend] 选中: usagePage=0x${selectedCollection.usagePage?.toString(16)} reportId=${targetReportId} expectedSize=${expectedReportSize}`);
    }
  }

  // 构造数据: [length, ...byData, ...padding]
  // WebHID sendReport 的 data 不包含 reportId (reportId 是第一个参数, 浏览器自动处理)
  const sendtemp = new Uint8Array(byData.length + 1);
  sendtemp[0] = byData.length;
  sendtemp.set(byData, 1);

  // 填充到设备期望的输出报告长度
  let finalData = sendtemp;
  if (expectedReportSize > sendtemp.length) {
    finalData = new Uint8Array(expectedReportSize);
    finalData.set(sendtemp);
  }

  console.log(`[hidSend] reportId=${targetReportId} dataLen=${finalData.length}`);

  await delay(20);
  try {
    await device.sendReport(targetReportId, finalData);
  } catch (e) {
    console.error('[hidSend] 第1次 sendReport 失败:', e.message);
    throw e;
  }

  try {
    await delay(20);
    await device.sendReport(targetReportId, finalData);
  } catch (e) {
    console.warn('[hidSend] 第2次 sendReport 失败(非致命):', e.message);
  }
}

export async function hidSendK10(device, byData) {
  if (!device || !device.opened) throw new Error('设备未连接');

  const padded = new Uint8Array(64);
  padded.set(byData);

  await delay(20);
  await device.sendReport(0x03, padded);
  await delay(20);
  await device.sendReport(0x03, padded);
}

export async function readConfig(device, modelId) {
  const model = DEVICE_MODELS[modelId];
  if (!model) throw new Error('未知设备型号');

  console.log(`[readConfig] modelId=${modelId} reportId=${model.reportId} dataLen=${model.dataLen} keyCount=${model.keyCount}`);
  if (model.reportId === 3) {
    await hidSendK10(device, new Uint8Array([0xFA, 0x08, 0x01]));
  } else {
    await hidSend(device, new Uint8Array([0x55]));
  }
}

export async function writeKeyConfig(device, modelId, keyPos, config) {
  const model = DEVICE_MODELS[modelId];
  if (!model) throw new Error('未知设备型号');

  const dataLen = model.dataLen;
  console.log('[writeKeyConfig] modelId=' + modelId + ' dataLen=0x' + dataLen.toString(16) + '(' + dataLen + ') keyPos=' + keyPos);
  const data = new Uint8Array(dataLen);
  data[0] = dataLen;
  data[1] = keyPos;
  console.log('[writeKeyConfig] data[0]=0x' + data[0].toString(16) + ' data.length=' + data.length);

  if (model.multiKeyOnly) {
    const keys = config.multiKeys || [];
    for (let i = 0; i < keys.length && i < dataLen - 2; i++) {
      data[2 + i] = keys[i];
    }
  } else {
    data[2] = config.mode;

    switch (config.mode) {
      case 1:
        data[3] = config.modifier || 0;
        data[4] = config.keyCode || 0;
        break;
      case 2:
        data[3] = config.mouseButton || 0;
        data[4] = config.mouseX || 0;
        data[5] = config.mouseY || 0;
        data[6] = config.mouseScroll || 0;
        break;
      case 3:
        if (config.mediaCode) {
          data[3] = config.mediaCode[0];
          data[4] = config.mediaCode[1];
          data[5] = config.mediaCode[2];
          data[6] = config.mediaCode[3];
        }
        break;
      case 4:
        data[3] = config.modifier || 0;
        const keys = config.multiKeys || [];
        console.log('[writeKeyConfig MULTI] keyPos=' + keyPos + ' modifier=0x' + (config.modifier || 0).toString(16) + ' multiKeys=[' + keys.map(k => '0x' + k.toString(16)).join(', ') + ']');
        for (let i = 0; i < keys.length && i < dataLen - 4; i++) {
          data[4 + i] = keys[i];
        }
        console.log('[writeKeyConfig MULTI] data bytes: [' + Array.from(data.slice(1)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ') + ']');
        break;
    }
  }

  await hidSend(device, data.slice(1));
}

export async function setRGBMode(device, modeIndex, modelId, mode2Index) {
  const model = DEVICE_MODELS[modelId];
  if (model?.dualZone && mode2Index !== undefined) {
    // 双灯区: [0x57, zone1_mode, zone2_mode]
    await hidSend(device, new Uint8Array([0x57, ledIndexToDevice(modeIndex, modelId), ledIndexToDevice(mode2Index, modelId)]));
  } else {
    await hidSend(device, new Uint8Array([0x57, ledIndexToDevice(modeIndex, modelId)]));
  }
}

export async function setCustomColor(device, r, g, b, modelId, color2) {
  const model = DEVICE_MODELS[modelId];
  if (model?.dualZone) {
    const c2 = color2 || { r: 0, g: 0, b: 0 };
    if (modelId === '3KPlus') {
      // 3KPlus: 仅发送 Zone2 颜色 [0x70, G2, R2, B2]
      await hidSend(device, new Uint8Array([0x70, c2.g, c2.r, c2.b]));
    } else {
      // 2KPlus / xnAnd4K: 发送两区颜色 [0x70, G1, R1, B1, G2, R2, B2]
      await hidSend(device, new Uint8Array([0x70, g, r, b, c2.g, c2.r, c2.b]));
    }
  } else {
    await hidSend(device, new Uint8Array([0x70, g, r, b]));
  }
}

export async function setKeyDelay(device, keyIndex, delayMs) {
  const cmdByte = 0x58 + keyIndex;
  const highByte = (delayMs >> 8) & 0xFF;
  const lowByte = delayMs & 0xFF;
  await hidSend(device, new Uint8Array([cmdByte, highByte, lowByte]));
}

export async function saveAllToDevice(device, modelId, keyConfigs, rgbMode, customColor, delays, rgbModes, rgbMode2, customColor2, rgbModes2) {
  const model = DEVICE_MODELS[modelId];
  if (!model) throw new Error('未知设备型号');

  for (let i = 0; i < keyConfigs.length; i++) {
    await writeKeyConfig(device, modelId, i + 1, keyConfigs[i]);
  }

  if (model.hasRgb && rgbMode !== undefined && rgbMode >= 0) {
    if (model.dualZone && rgbMode2 !== undefined) {
      // 双灯区: 发送 [0x57, zone1, zone2]
      await setRGBMode(device, rgbMode, modelId, rgbMode2);
      // 自定义颜色发送逻辑 (对应 C# 各 Form 的 0x70 触发条件)
      const mode1Name = rgbModes?.[rgbMode] || '';
      const mode2Name = rgbModes2?.[rgbMode2] || '';
      const c1 = customColor || { r: 255, g: 255, b: 255 };
      const c2 = customColor2 || { r: 255, g: 255, b: 255 };
      if (modelId === '3KPlus') {
        // 3KPlus: Zone2 为自定义时发送 [0x70, G2, R2, B2]
        if (mode2Name.includes('自定义')) {
          await setCustomColor(device, c1.r, c1.g, c1.b, modelId, c2);
        }
      } else if (modelId === 'xnAnd4K') {
        // xnAnd4K: Zone1自定义 或 Zone2自定义 或 Zone2按下亮指定颜色 → 发6字节
        if (mode1Name.includes('自定义') || mode2Name.includes('自定义') || mode2Name.includes('按下亮指定颜色')) {
          await setCustomColor(device, c1.r, c1.g, c1.b, modelId, c2);
        }
      } else {
        // 2KPlus: Zone1 为自定义时发送 [0x70, G1,R1,B1, G2,R2,B2]
        if (mode1Name.includes('自定义')) {
          await setCustomColor(device, c1.r, c1.g, c1.b, modelId, c2);
        }
      }
    } else {
      // 单灯区
      await setRGBMode(device, rgbMode, modelId);
      const modeName = rgbModes?.[rgbMode] || '';
      if (modeName.includes('自定义') && customColor) {
        await setCustomColor(device, customColor.r, customColor.g, customColor.b);
      }
    }
  }

  if (model.hasDelay && delays) {
    for (let i = 0; i < delays.length; i++) {
      await setKeyDelay(device, i, delays[i]);
    }
  }
}

export function parseReport(bytes, modelId) {
  const model = DEVICE_MODELS[modelId];
  if (!model) return null;

  const data0 = bytes[0];
  const data1 = bytes[1];

  if (data0 === 0x02 && data1 === 0x08) {
    const raw = bytes[2];
    return { type: 'rgb_mode', modeIndex: raw === 0xFF ? 0 : ledDeviceToIndex(raw, modelId) };
  }

  if (data0 === 0x02 && data1 === 0x63) {
    const raw = bytes[2];
    return { type: 'rgb_mode', modeIndex: raw === 0xFF ? 0 : ledDeviceToIndex(raw, modelId) };
  }

  if (data0 === 0x03 && data1 === 0x08) {
    // 双灯区: data[2]=zone1模式, data[3]=zone2模式
    const raw1 = bytes[2];
    const raw2 = bytes[3];
    const result = { type: 'rgb_mode', modeIndex: raw1 === 0xFF ? 0 : ledDeviceToIndex(raw1, modelId) };
    if (model?.dualZone) {
      result.mode2Index = raw2 === 0xFF ? 0 : ledDeviceToIndex(raw2, modelId);
    }
    return result;
  }

  if (data0 === 0x04) {
    // 自定义颜色回报: 0x64/0x65 区分灯区
    const subType = data1;
    const color = { g: bytes[2], r: bytes[3], b: bytes[4] };
    if (model?.dualZone) {
      if (modelId === '3KPlus') {
        // 3KPlus: 0x64 → Zone2 颜色
        return { type: 'custom_color2', ...color };
      }
      // 2KPlus / xnAnd4K: 0x64 → Zone1, 0x65 → Zone2
      if (subType === 0x65) return { type: 'custom_color2', ...color };
      return { type: 'custom_color', ...color };
    }
    return { type: 'custom_color', ...color };
  }

  if (data0 === 0x03 && data1 >= 0x58 && data1 <= 0x5F) {
    const keyIndex = data1 - 0x58;
    const delayMs = ((bytes[2] & 0xFF) << 8) | bytes[3];
    return { type: 'key_delay', keyIndex, delayMs };
  }

  if (data0 === model.dataLen && data1 >= 0x01 && data1 <= model.keyCount) {
    console.log(`[parseReport] ✅ 匹配按键配置: keyPos=${data1} dataLen=${data0} mode=0x${bytes[2]?.toString(16)}`);
    const keyPos = data1;
    const rawData = bytes.slice(0, model.dataLen);

    if (model.multiKeyOnly) {
      const keys = [];
      for (let i = 1; i < model.dataLen; i++) {
        if (bytes[i] === 0x00 || bytes[i] === 0xFF) break;
        keys.push(bytes[i]);
      }
      return { type: 'key_config', keyPos, mode: 4, multiKeys: keys, rawData };
    }

    const mode = bytes[2];
    if (mode === 0xFF) {
      return { type: 'key_config', keyPos, mode: 0, rawData };
    }

    const result = { type: 'key_config', keyPos, mode, rawData };
    switch (mode) {
      case 1:
        result.modifier = bytes[3];
        result.keyCode = bytes[4];
        break;
      case 2:
        result.mouseButton = bytes[3];
        result.mouseX = bytes[4];
        result.mouseY = bytes[5];
        result.mouseScroll = bytes[6];
        break;
      case 3:
        result.mediaCode = [bytes[3], bytes[4], bytes[5], bytes[6]];
        break;
      case 4:
        result.modifier = bytes[3];
        result.multiKeys = [];
        for (let i = 4; i < model.dataLen; i++) {
          if (bytes[i] === 0x00 || bytes[i] === 0xFF) break;
          result.multiKeys.push(bytes[i]);
        }
        break;
    }
    return result;
  }

  // 未匹配任何已知类型
  console.warn(`[parseReport] ❌ 未匹配: data0=0x${data0?.toString(16)}(期望key配置dataLen=0x${model.dataLen?.toString(16)}) data1=0x${data1?.toString(16)}(期望0x01-0x${model.keyCount?.toString(16)})`);
  return null;
}

/**
 * Generate human-readable display string from config.
 * @param {object} config - key config object
 * @param {function} keyCodeToLabel - maps keyCode to display label
 * @param {function} [t] - translation function (optional, defaults to identity)
 */
export function configToDisplay(config, keyCodeToLabel, t) {
  const tr = t || ((s) => s);
  if (!config || config.mode === 0) return tr('未设置');

  const label = keyCodeToLabel || ((c) => `0x${c.toString(16)}`);

  switch (config.mode) {
    case 1: {
      let str = tr('键盘: ');
      if (config.modifier) {
        if (config.modifier & 0x01) str += tr('左Ctrl') + '+';
        if (config.modifier & 0x02) str += tr('左Shift') + '+';
        if (config.modifier & 0x04) str += tr('左Alt') + '+';
        if (config.modifier & 0x08) str += tr('左Win') + '+';
        if (config.modifier & 0x10) str += tr('右Ctrl') + '+';
        if (config.modifier & 0x20) str += tr('右Shift') + '+';
        if (config.modifier & 0x40) str += tr('右Alt') + '+';
        if (config.modifier & 0x80) str += tr('右Win') + '+';
      }
      str += label(config.keyCode);
      return str;
    }
    case 2: {
      const btnNames = [tr('无'), tr('左键'), tr('右键'), tr('中键')];
      const btn = config.mouseButton === 4 ? tr('中键') : (btnNames[config.mouseButton] || tr('无'));
      return `${tr('鼠标: ')}${btn} X:${config.mouseX} Y:${config.mouseY} ${tr('滚轮')}:${config.mouseScroll}`;
    }
    case 3: {
      if (!config.mediaCode) return tr('多媒体: 未选择');
      const found = MEDIA_KEYS.find(mk => mk.code.every((b, i) => b === (config.mediaCode[i] ?? 0)));
      return found ? `${tr('多媒体: ')}${tr(found.label)}` : tr('多媒体: 未知');
    }
    case 4: {
      let str = tr('多键: ');
      if (config.modifier) {
        if (config.modifier & 0x01) str += tr('左Ctrl') + '+';
        if (config.modifier & 0x02) str += tr('左Shift') + '+';
        if (config.modifier & 0x04) str += tr('左Alt') + '+';
        if (config.modifier & 0x08) str += tr('左Win') + '+';
      }
      if (config.multiKeys) {
        // C# 旧协议使用单字节 shifted codes (如 0x96=!，0x97=@)
        // KEYCODE_LABELS 已包含这些映射，直接用 label(k) 即可正确显示
        str += config.multiKeys.map(k => label(k)).join(' + ');
      }
      return str;
    }
    default:
      return tr('未设置');
  }
}
