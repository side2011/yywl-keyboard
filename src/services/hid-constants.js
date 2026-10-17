// ============================================================
// hid-constants.js — 设备型号 / 协议常量 / 键码表
// 从 C# yywlkey 项目 (buding.cs / KeyMediaForm / DeviceSelectForm) 完整迁移
// ============================================================

// ---- USB VID ----
export const VID = {
  OLD: 0x413D,
  NEW: 0x8808,
  K10_CUSTOM: 0x1189,
  BLUETOOTH: 0x1189,
  BLUETOOTH2: 0x514C,
};

// ---- 蓝牙无线款 VID 列表 + PID 列表 ----
export const BT_VIDS = [0x1189, 0x514C];
export const BT_PIDS = [0x8842, 0x8840, 0x8830, 0x8831, 0x8832, 0x8833, 0x8850];
export const BT_DOWNLOAD_URL = 'https://key.itytsoft.com/lybz.html';
export function isBluetoothModel(vendorId, productId) {
  return BT_VIDS.includes(vendorId) && BT_PIDS.includes(productId);
}

// ---- AC632N 麦克风设备 ----
export const AC632N_VID = 0x514C;
export const AC632N_PID = 0x8850;
export function isAc632nDevice(vendorId, productId) {
  return vendorId === AC632N_VID && productId === AC632N_PID;
}

// 通过 HID collection 判断是否为蓝牙无线款 (仅用于同 VID/PID 的 USB/蓝牙共存场景)
// 关键区别: USB款有 vendor-specific(0xFF00) 接口（可能在与 consumer control 不同的设备对象中）
//           蓝牙款只有 consumer control(0x0C) 接口，没有任何设备对象含 0xFF00
// 注意: 此函数仅对 VID=0x514C/PID=0x8850 设备有效
// 注意: 必须传入所有设备数组，因为 USB composite 设备可能被拆成多个 HID 设备对象
export function isBtModelByHid(devices) {
  // 仅对 VID=0x514C/PID=0x8850 设备做判断
  const matchingDevices = devices.filter(d => d.vendorId === 0x514C && d.productId === 0x8850);
  if (matchingDevices.length === 0) return false;
  // 检查所有匹配设备中是否有任何一个含 0xFF00 vendor-specific 接口
  const hasVendorSpecific = matchingDevices.some(d => d.collections?.some(c => c.usagePage === 0xFF00) ?? false);
  if (hasVendorSpecific) return false; // 有 0xFF00 → USB款
  // 没有 0xFF00，但有 0x0C → 蓝牙款
  return matchingDevices.some(d => d.collections?.some(c => c.usagePage === 0x0c) ?? false);
}

// ---- PID → 设备型号映射 (对应 DeviceSelectForm 中 VID 0x8808 的 PID 判断) ----
export const PID_TO_MODEL = {
  0x6600: '1K',
  0x6601: '2K',
  0x6602: '2K-mini',
  0x6603: '3K',
  0x6604: '4K',
  0x6605: '5K',
  0x6606: '6K',
  0x6607: '7K-noled',
  0x6608: '7K',
  0x6609: '8K',
  0x660A: '9K',
  0x660B: '12K',
  0x660C: 'DXN',
  0x660D: '2KPlus',
  0x660E: '3KPlus',
  0x660F: 'FOOT',
  0x6610: '4K-side',
  0x6611: 'FXJ',
  0x6612: 'DIY10K',
  0x6613: 'xnAnd4K',
  0x6614: '8KDZ6',
  0x6615: '4K-side-new',
  0x6616: '5K-touch',
  0x6617: '8K-new',
  0x6618: '3KDZ15',
};

// ---- 设备型号定义 (对应 buding.KeyIDToDataLen + 各 KxForm 构造函数) ----
// dataLen:     每个按键配置数据的字节长度 (C# hex string → decimal)
// multiKeyLen: 多键模式最大按键数 (C# mulitKeyLen)
// hasRgb:      是否支持 RGB 灯光
// hasDelay:    是否支持延迟时间
// reportId:    HID Report ID (标准设备=0, K10DZ1=3)
// multiKeyOnly: 仅支持多键模式 (8KDZ6 / 10KDZ1)
export const DEVICE_MODELS = {
  '1K':           { keyCount: 1,  dataLen: 0x35, multiKeyLen: 50, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '2K':           { keyCount: 2,  dataLen: 0x35, multiKeyLen: 50, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '2K-mini':      { keyCount: 2,  dataLen: 0x35, multiKeyLen: 50, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '3K':           { keyCount: 3,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '4K':           { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '5K':           { keyCount: 5,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '6K':           { keyCount: 6,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '7K-noled':     { keyCount: 7,  dataLen: 0x11, multiKeyLen: 15, hasRgb: false, hasDelay: false, reportId: 0 },
  '7K':           { keyCount: 7,  dataLen: 0x11, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  '8K':           { keyCount: 8,  dataLen: 0x0F, multiKeyLen: 12, hasRgb: true,  hasDelay: false, reportId: 0 },
  '9K':           { keyCount: 9,  dataLen: 0x0D, multiKeyLen: 10, hasRgb: true,  hasDelay: false, reportId: 0 },
  '12K':          { keyCount: 12, dataLen: 0x0A, multiKeyLen: 7,  hasRgb: true,  hasDelay: false, reportId: 0 },
  'DXN':          { keyCount: 1,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  '2KPlus':       { keyCount: 5,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0, layout: 'pad', dualZone: true },
  '3KPlus':       { keyCount: 6,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0, layout: 'pad', dualZone: true },
  'FOOT':         { keyCount: 1,  dataLen: 0x35, multiKeyLen: 50, hasRgb: false, hasDelay: false, reportId: 0 },
  '4K-side':      { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  'FXJ':          { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  'DIY10K':       { keyCount: 10, dataLen: 0x0A, multiKeyLen: 7,  hasRgb: true,  hasDelay: false, reportId: 0 },
  'xnAnd4K':      { keyCount: 7,  dataLen: 0x10, multiKeyLen: 12, hasRgb: true,  hasDelay: false, reportId: 0, layout: 'knob', dualZone: true },
  '8KDZ6':        { keyCount: 8,  dataLen: 0x10, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0, multiKeyOnly: true },
  '4K-side-new':  { keyCount: 4,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: false, reportId: 0 },
  '5K-touch':     { keyCount: 5,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '8K-new':       { keyCount: 8,  dataLen: 0x0C, multiKeyLen: 9,  hasRgb: true,  hasDelay: true,  reportId: 0 },
  '3KDZ15':       { keyCount: 3,  dataLen: 0x12, multiKeyLen: 15, hasRgb: true,  hasDelay: true,  reportId: 0 },
  '10KDZ1':       { keyCount: 8,  dataLen: 0x15, multiKeyLen: 20, hasRgb: false, hasDelay: true,  reportId: 3, multiKeyOnly: true },
};

// ---- WebHID 设备过滤器 ----
export const DEVICE_FILTERS = [
  { vendorId: 0x413D, productId: 0x553A },
  { vendorId: 0x413D, productId: 0x553B },
  ...Array.from({ length: 0x19 }, (_, i) => ({
    vendorId: 0x8808,
    productId: 0x6600 + i,
  })),
  { vendorId: 0x1189, productId: 0x8834 },
  // AC632N 麦克风设备
  { vendorId: 0x514C, productId: 0x8850 },
  // 蓝牙无线款 (双VID: 0x1189 + 0x514C)
  ...BT_VIDS.flatMap(vid => BT_PIDS.map(pid => ({ vendorId: vid, productId: pid }))),
];

// ---- 型号名称中文映射 ----
export const MODEL_NAMES = {
  '1K': '1键小键盘', '2K': '2键小键盘', '2K-mini': '2键迷你',
  '3K': '3键小键盘', '4K': '4键小键盘', '5K': '5键小键盘',
  '6K': '6键小键盘', '7K-noled': '7键(无灯)', '7K': '7键小键盘',
  '8K': '8键小键盘', '9K': '9键小键盘', '12K': '12键小键盘',
  'DXN': '单旋钮', '2KPlus': '2键Plus', '3KPlus': '3键Plus',
  'FOOT': '脚踏开关', '4K-side': '4键侧插', 'FXJ': '方向键',
  'DIY10K': 'DIY 10键', 'xnAnd4K': '旋钮+4键', '8KDZ6': '8键开关款',
  '4K-side-new': '4键侧插新款', '5K-touch': '5键触摸',
  '8K-new': '8键新款', '3KDZ15': '3键定制', '10KDZ1': '10键定制',
};

// ---- HID 键码 → 显示标签 (对应 KeyCodeForm 虚拟键盘) ----
export const KEYCODE_LABELS = {
  0x00: '无',
  0x04: 'A', 0x05: 'B', 0x06: 'C', 0x07: 'D', 0x08: 'E',
  0x09: 'F', 0x0A: 'G', 0x0B: 'H', 0x0C: 'I', 0x0D: 'J',
  0x0E: 'K', 0x0F: 'L', 0x10: 'M', 0x11: 'N', 0x12: 'O',
  0x13: 'P', 0x14: 'Q', 0x15: 'R', 0x16: 'S', 0x17: 'T',
  0x18: 'U', 0x19: 'V', 0x1A: 'W', 0x1B: 'X', 0x1C: 'Y',
  0x1D: 'Z',
  0x1E: '1', 0x1F: '2', 0x20: '3', 0x21: '4', 0x22: '5',
  0x23: '6', 0x24: '7', 0x25: '8', 0x26: '9', 0x27: '0',
  0x28: 'Enter', 0x29: 'Esc', 0x2A: 'Backspace', 0x2B: 'Tab',
  0x2C: 'Space', 0x2D: '-', 0x2E: '=', 0x2F: '[', 0x30: ']',
  0x31: '\\', 0x32: '#', 0x33: ';', 0x34: "'", 0x35: '`',
  0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'CapsLock',
  0x3A: 'F1', 0x3B: 'F2', 0x3C: 'F3', 0x3D: 'F4',
  0x3E: 'F5', 0x3F: 'F6', 0x40: 'F7', 0x41: 'F8',
  0x42: 'F9', 0x43: 'F10', 0x44: 'F11', 0x45: 'F12',
  0x46: 'PrtSc', 0x47: 'ScrLk', 0x48: 'Pause',
  0x49: 'Insert', 0x4A: 'Home', 0x4B: 'PgUp', 0x4C: 'Delete',
  0x4D: 'End', 0x4E: 'PgDn',
  0x4F: '→', 0x50: '←', 0x51: '↓', 0x52: '↑',
  0x53: 'NumLock', 0x54: 'Num/', 0x55: 'Num*', 0x56: 'Num-',
  0x57: 'Num+', 0x58: 'NumEnter', 0x59: 'Num1', 0x5A: 'Num2',
  0x5B: 'Num3', 0x5C: 'Num4', 0x5D: 'Num5', 0x5E: 'Num6',
  0x5F: 'Num7', 0x60: 'Num8', 0x61: 'Num9', 0x62: 'Num0',
  0x63: 'Num.', 0x65: 'Menu',
  0x68: 'F13', 0x69: 'F14', 0x6A: 'F15', 0x6B: 'F16',
  0x6C: 'F17', 0x6D: 'F18', 0x6E: 'F19', 0x6F: 'F20',
  0x70: 'F21', 0x71: 'F22', 0x72: 'F23', 0x73: 'F24',
  // C# shiftFilter() 生成的单字节 shifted codes (对应 KeyCodeForm.cs searchShiftKey)
  // 注意: 0x97 不是 shift 标记，而是直接表示 '@' 的 shifted code
  0x95: '~', 0x96: '!', 0x97: '@', 0x98: '#', 0x99: '$', 0x9A: '%',
  0x9B: '^', 0x9C: '&', 0x9D: '*', 0x9E: '(', 0x9F: ')',
  0xA1: '_', 0xA2: '+', 0xA3: '{', 0xA4: '}', 0xA5: '|',
  0xA6: ':', 0xA7: '"', 0xA8: '<', 0xA9: '>', 0xAA: '?',
  0xAB: 'A', 0xAC: 'B', 0xAD: 'C', 0xAE: 'D', 0xAF: 'E', 0xB0: 'F',
  0xB1: 'G', 0xB2: 'H', 0xB3: 'I', 0xB4: 'J', 0xB5: 'K', 0xB6: 'L',
  0xB7: 'M', 0xB8: 'N', 0xB9: 'O', 0xBA: 'P', 0xBB: 'Q', 0xBC: 'R',
  0xBD: 'S', 0xBE: 'T', 0xBF: 'U', 0xC0: 'V', 0xC1: 'W', 0xC2: 'X',
  0xC3: 'Y', 0xC4: 'Z',
  // 修饰键 (宏录制中作为独立步骤出现)
  0xE0: '左Ctrl', 0xE1: '左Shift', 0xE2: '左Alt', 0xE3: '左Win',
  0xE4: '右Ctrl', 0xE5: '右Shift', 0xE6: '右Alt', 0xE7: '右Win',
};

// ---- 修饰键定义 (对应 compositekeyForm 位掩码) ----
export const MODIFIERS = [
  { label: '左Ctrl',  bit: 0x01 },
  { label: '左Shift', bit: 0x02 },
  { label: '左Alt',   bit: 0x04 },
  { label: '左Win',   bit: 0x08 },
  { label: '右Ctrl',  bit: 0x10 },
  { label: '右Shift', bit: 0x20 },
  { label: '右Alt',   bit: 0x40 },
  { label: '右Win',   bit: 0x80 },
];

// ---- 多媒体按键 (对应 KeyMediaForm.Designer.cs 中每个按钮的 Tag) ----
// 格式: [byte1, byte2, byte3, byte4] — 4 字节媒体码
export const MEDIA_KEYS = [
  { label: '播放/暂停', code: [0x04, 0xCD, 0x00, 0x00] },
  { label: '停止播放',  code: [0x04, 0xB7, 0x00, 0x00] },
  { label: '上一首',    code: [0x04, 0xB6, 0x00, 0x00] },
  { label: '下一首',    code: [0x04, 0xB5, 0x00, 0x00] },
  { label: '我的电脑',  code: [0x04, 0x94, 0x01, 0x00] },
  { label: '亮度+',     code: [0x04, 0x6F, 0x00, 0x00] },
  { label: '亮度-',     code: [0x04, 0x70, 0x00, 0x00] },
  { label: '打开媒体',  code: [0x04, 0x83, 0x01, 0x00] },
  { label: '系统静音',  code: [0x04, 0xE2, 0x00, 0x00] },
  { label: '音量+',     code: [0x04, 0xEA, 0x00, 0x00] },
  { label: '音量-',     code: [0x04, 0xE9, 0x00, 0x00] },
  { label: '打开计算器', code: [0x04, 0x92, 0x01, 0x00] },
  { label: '打开浏览器', code: [0x04, 0x23, 0x02, 0x00] },
  { label: '打开邮件',  code: [0x04, 0x8A, 0x01, 0x00] },
  { label: '网页刷新',  code: [0x04, 0x53, 0x01, 0x00] },
  { label: '网页前进',  code: [0x04, 0x52, 0x01, 0x00] },
  { label: '网页后退',  code: [0x04, 0x55, 0x01, 0x00] },
  { label: '低音+',     code: [0x04, 0x27, 0x02, 0x00] },
  { label: '低音-',     code: [0x04, 0x25, 0x02, 0x00] },
  { label: '高音+',     code: [0x04, 0x24, 0x02, 0x00] },
];

// ---- RGB 灯光模式 — 按设备类型分组 (对应 C# 各 KxForm.Designer.cs cbo_RGB 下拉框) ----

// Type A: K1, K2 (15 modes)
export const RGB_MODES_A = [
  '灯光关闭', '按下亮-随机色', '按下亮-红', '按下亮-绿', '按下亮-蓝',
  '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
  '按下双呼吸', '按下双闪', '按下单闪', '常亮模式', '台灯模式', '自定义颜色',
];

// Type B: K3, K4, K5, K5Touch, K6, K7, K9, 10KDZ1, FXJ (15 modes)
export const RGB_MODES_B = [
  '灯光关闭', '流水模式1', '按下亮-红', '按下亮-绿', '按下亮-蓝',
  '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
  '流水模式2', '流水模式3', '放射灯光', '常亮模式', '台灯模式', '自定义颜色',
];

// Type B+: K3DZ15 (16 modes = Type B + 自定义颜色2)
export const RGB_MODES_BP = [
  '灯光关闭', '流水模式1', '按下亮-红', '按下亮-绿', '按下亮-蓝',
  '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
  '流水模式2', '流水模式3', '放射灯光', '常亮模式', '台灯模式', '自定义颜色', '自定义颜色2',
];

// Type C: K8, K8-new (15 modes, different order)
export const RGB_MODES_C = [
  '灯光关闭', '流水模式1', '流水模式2', '流水模式3', '放射灯光',
  '常亮模式', '台灯模式', '自定义颜色',
  '按下亮-红', '按下亮-绿', '按下亮-蓝', '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
];

// Type D: K8DZ6 (14 modes, no custom color)
export const RGB_MODES_D = [
  '灯光关闭', '流水模式1', '按下亮-红', '按下亮-绿', '按下亮-蓝',
  '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
  '流水模式2', '流水模式3', '放射灯光', '常亮模式', '台灯模式',
];

// Type E: K12 (11 modes)
export const RGB_MODES_E = [
  '灯光关闭', '按下亮-红', '按下亮-绿', '按下亮-蓝',
  '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
  '常亮模式', '台灯模式', '自定义颜色',
];

// Type F: DXN (4 modes)
export const RGB_MODES_F = ['灯光关闭', '常亮模式', '台灯模式', '自定义颜色'];

// Type G: K2Plus main (14 modes)
export const RGB_MODES_G = [
  '灯光关闭', '常亮模式', '台灯模式', '按下单闪', '按下双闪',
  '按下亮-红', '按下亮-绿', '按下亮-蓝', '按下亮-黄', '按下亮-青',
  '按下亮-紫', '按下亮-白', '按下亮-随机色', '自定义颜色',
];

// Type H: K3Plus main (13 modes)
export const RGB_MODES_H = [
  '灯光关闭', '常亮模式', '台灯模式', '按下单闪', '按下双闪',
  '按下亮-红', '按下亮-绿', '按下亮-蓝', '按下亮-黄', '按下亮-青',
  '按下亮-紫', '按下亮-白', '按下亮-随机色',
];

// Type I: xnAnd4K main (3 modes)
export const RGB_MODES_I = ['灯光关闭', '常亮模式', '自定义颜色'];

// ---- 双灯区 Zone2 模式列表 ----
// Type G2: 2KPlus/3KPlus Zone2 (12 modes)
export const RGB_MODES_G2 = [
  '灯光关闭', '按下亮-随机色', '按下亮-红', '按下亮-绿', '按下亮-蓝',
  '按下亮-黄', '按下亮-青', '按下亮-紫', '按下亮-白',
  '流水模式1', '常亮模式', '自定义颜色',
];

// Type I2: xnAnd4K Zone2 (5 modes)
export const RGB_MODES_I2 = ['灯光关闭', '流水模式1', '常亮模式', '自定义颜色', '按下亮指定颜色'];

// 按模型获取灯光模式列表
export function getRgbModesForModel(modelId) {
  const map = {
    '1K': 'A', '2K': 'A', '2K-mini': 'A',
    '3K': 'B', '4K': 'B', '5K': 'B', '6K': 'B', '7K': 'B',
    '9K': 'B', '10KDZ1': 'B', 'FXJ': 'B', '5K-touch': 'B',
    '8K': 'C', '8K-new': 'C',
    '8KDZ6': 'D',
    '12K': 'E',
    'DXN': 'F',
    '2KPlus': 'G',
    '3KPlus': 'H',
    'xnAnd4K': 'I', '4K-side': 'I', '4K-side-new': 'I',
    '3KDZ15': 'BP',
  };
  const type = map[modelId] || 'B';
  const lookup = {
    A: RGB_MODES_A, B: RGB_MODES_B, BP: RGB_MODES_BP,
    C: RGB_MODES_C, D: RGB_MODES_D, E: RGB_MODES_E,
    F: RGB_MODES_F, G: RGB_MODES_G, H: RGB_MODES_H, I: RGB_MODES_I,
  };
  return lookup[type];
}

// 按模型获取 Zone2 灯光模式列表 (仅双灯区型号有值，其余返回 null)
export function getRgbModes2ForModel(modelId) {
  const map = { '2KPlus': RGB_MODES_G2, '3KPlus': RGB_MODES_G2, 'xnAnd4K': RGB_MODES_I2 };
  return map[modelId] || null;
}

// 兼容旧代码
export const RGB_MODES = RGB_MODES_B;
export const DXN_RGB_MODES = RGB_MODES_F;

// ---- LED 模式下标转换 (对应 buding.IndexToLedLoc / LedToIndex / dxn_*) ----
// 大部分型号: dropdown index == 设备值 (直接映射)
// K12: 非连续映射 (dropdown 1->device 2, dropdown 8->device 12, 等)
// DXN: 另一套映射 (dropdown 1->device 12, dropdown 2->device 13, dropdown 3->device 14)
export function ledIndexToDevice(dropdownIndex, modelId) {
  if (modelId === '12K') {
    const map = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 12, 9: 13, 10: 14 };
    return map[dropdownIndex] ?? dropdownIndex;
  }
  if (modelId === 'DXN') {
    const map = { 1: 12, 2: 13, 3: 14 };
    return map[dropdownIndex] ?? dropdownIndex;
  }
  return dropdownIndex;
}
export function ledDeviceToIndex(deviceLed, modelId) {
  if (modelId === '12K') {
    const map = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 12: 8, 13: 9, 14: 10 };
    return map[deviceLed] ?? deviceLed;
  }
  if (modelId === 'DXN') {
    const map = { 12: 1, 13: 2, 14: 3 };
    return map[deviceLed] ?? deviceLed;
  }
  return deviceLed;
}

// ---- 鼠标按键 (对应 buding.IndexToMouse / MouseToIndex) ----
export const MOUSE_BUTTONS = ['无', '左键', '右键', '中键'];
export function mouseIndexToDevice(index) { return index === 3 ? 4 : index; }
export function mouseDeviceToIndex(val)  { return val === 4 ? 3 : val; }

// ---- 按键模式 ----
export const KEY_MODE = { KEYBOARD: 1, MOUSE: 2, MEDIA: 3, MULTI: 4, MACRO: 5 };
export const KEY_MODE_LABELS = { 1: '键盘', 2: '鼠标', 3: '多媒体', 4: '多键合一', 5: '宏' };

// ---- 浏览器 KeyboardEvent.code → HID keycode 映射 (用于按键捕获功能) ----
export const BROWSER_CODE_TO_HID = {
  KeyA: 0x04, KeyB: 0x05, KeyC: 0x06, KeyD: 0x07, KeyE: 0x08,
  KeyF: 0x09, KeyG: 0x0A, KeyH: 0x0B, KeyI: 0x0C, KeyJ: 0x0D,
  KeyK: 0x0E, KeyL: 0x0F, KeyM: 0x10, KeyN: 0x11, KeyO: 0x12,
  KeyP: 0x13, KeyQ: 0x14, KeyR: 0x15, KeyS: 0x16, KeyT: 0x17,
  KeyU: 0x18, KeyV: 0x19, KeyW: 0x1A, KeyX: 0x1B, KeyY: 0x1C,
  KeyZ: 0x1D,
  Digit1: 0x1E, Digit2: 0x1F, Digit3: 0x20, Digit4: 0x21, Digit5: 0x22,
  Digit6: 0x23, Digit7: 0x24, Digit8: 0x25, Digit9: 0x26, Digit0: 0x27,
  Enter: 0x28, Escape: 0x29, Backspace: 0x2A, Tab: 0x2B, Space: 0x2C,
  Minus: 0x2D, Equal: 0x2E, BracketLeft: 0x2F, BracketRight: 0x30,
  Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39,
  F1: 0x3A, F2: 0x3B, F3: 0x3C, F4: 0x3D, F5: 0x3E, F6: 0x3F,
  F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
  PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  Insert: 0x49, Home: 0x4A, PageUp: 0x4B, Delete: 0x4C,
  End: 0x4D, PageDown: 0x4E,
  ArrowRight: 0x4F, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
  NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55,
  NumpadSubtract: 0x56, NumpadAdd: 0x57,
  NumpadEnter: 0x58, Numpad1: 0x59, Numpad2: 0x5A, Numpad3: 0x5B,
  Numpad4: 0x5C, Numpad5: 0x5D, Numpad6: 0x5E,
  Numpad7: 0x5F, Numpad8: 0x60, Numpad9: 0x61, Numpad0: 0x62,
  NumpadDecimal: 0x63, ContextMenu: 0x65,
  F13: 0x68, F14: 0x69, F15: 0x6A, F16: 0x6B,
  F17: 0x6C, F18: 0x6D, F19: 0x6E, F20: 0x6F,
  F21: 0x70, F22: 0x71, F23: 0x72, F24: 0x73,
};

// 修饰键 code → HID modifier bit
export const BROWSER_MOD_TO_BIT = {
  ControlLeft: 0x01, ShiftLeft: 0x02, AltLeft: 0x04, MetaLeft: 0x08,
  ControlRight: 0x10, ShiftRight: 0x20, AltRight: 0x40, MetaRight: 0x80,
};

// ---- 宏录制专用的 code → HID 映射 (包含修饰键) ----
// 普通键盘捕获模式不需要修饰键作为独立按键, 但宏录制需要
// 修饰键作为独立的 press/release 步骤录入
export const BROWSER_MACRO_KEY_TO_HID = {
  ...BROWSER_CODE_TO_HID,
  ControlLeft: 0xE0, ShiftLeft: 0xE1, AltLeft: 0xE2, MetaLeft: 0xE3,
  ControlRight: 0xE4, ShiftRight: 0xE5, AltRight: 0xE6, MetaRight: 0xE7,
};

// ---- C# 旧协议 MULTI 模式 Shift+字符编码 ----
// C# 编码: HID 0x1E(1) → 0x96(!), HID 0x1F(2) → 0x97(@), HID 0x04(a) → 0xAB(A)
// 这是 C# 软件写入设备的实际字节值，JS 必须正确解码才能显示
export const CS_SHIFTED_CODES = {
  // 符号键 (0x95-0xAA)
  0x95: '~', 0x96: '!', 0x97: '@', 0x98: '#', 0x99: '$', 0x9A: '%',
  0x9B: '^', 0x9C: '&', 0x9D: '*', 0x9E: '(', 0x9F: ')',
  0xA1: '_', 0xA2: '+', 0xA3: '{', 0xA4: '}', 0xA5: '|',
  0xA6: ':', 0xA7: '"', 0xA8: '<', 0xA9: '>', 0xAA: '?',
  // 字母键 A-Z (0xAB-0xC4)
  0xAB: 'A', 0xAC: 'B', 0xAD: 'C', 0xAE: 'D', 0xAF: 'E', 0xB0: 'F',
  0xB1: 'G', 0xB2: 'H', 0xB3: 'I', 0xB4: 'J', 0xB5: 'K', 0xB6: 'L',
  0xB7: 'M', 0xB8: 'N', 0xB9: 'O', 0xBA: 'P', 0xBB: 'Q', 0xBC: 'R',
  0xBD: 'S', 0xBE: 'T', 0xBF: 'U', 0xC0: 'V', 0xC1: 'W', 0xC2: 'X',
  0xC3: 'Y', 0xC4: 'Z',
};

// HID keycode → C# shifted code 反向映射 (用于虚拟键盘 Shift 激活时发送)
// 对应 C# shiftFilter() 的转换规则
export const HID_TO_CS_SHIFTED = {
  0x35: 0x95, 0x1E: 0x96, 0x1F: 0x97, 0x20: 0x98, 0x21: 0x99, 0x22: 0x9A,
  0x23: 0x9B, 0x24: 0x9C, 0x25: 0x9D, 0x26: 0x9E, 0x27: 0x9F,
  0x2D: 0xA1, 0x2E: 0xA2, 0x2F: 0xA3, 0x30: 0xA4, 0x31: 0xA5,
  0x33: 0xA6, 0x34: 0xA7, 0x36: 0xA8, 0x37: 0xA9, 0x38: 0xAA,
  0x04: 0xAB, 0x05: 0xAC, 0x06: 0xAD, 0x07: 0xAE, 0x08: 0xAF, 0x09: 0xB0,
  0x0A: 0xB1, 0x0B: 0xB2, 0x0C: 0xB3, 0x0D: 0xB4, 0x0E: 0xB5, 0x0F: 0xB6,
  0x10: 0xB7, 0x11: 0xB8, 0x12: 0xB9, 0x13: 0xBA, 0x14: 0xBB, 0x15: 0xBC,
  0x16: 0xBD, 0x17: 0xBE, 0x18: 0xBF, 0x19: 0xC0, 0x1A: 0xC1, 0x1B: 0xC2,
  0x1C: 0xC3, 0x1D: 0xC4,
};
