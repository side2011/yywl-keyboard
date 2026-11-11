// 回归测试：1 层设备（如 2 键款）保存时只能写 1 层，不能沿用上一台 3 层设备的缓存
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const src = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');

check('保存层数按设备 layerCount 收窄',
  src.includes('const totalLayers = Math.max(1, Math.min(layerCount, cached.length || layerCount));'));
check('不再用 cached.length 直接当层数', !src.includes('const totalLayers = cached.length || 1;'));
check('缓存层数多于设备时有日志提示', src.includes('多于设备层数('));
check('换设备时清空层缓存', src.includes('allLayerConfigsRef.current = [];'));
check('层数来自设备信息并钳位到 1..16',
  src.includes('const layerCount = Math.min(Math.max(deviceInfo?.layerCount || 1, 1), 16);'));
check('3 层以上才显示层标签', src.includes('{layerCount > 1 && ('));
check('3 层以上才提示"正在保存第N层"', src.includes("if (totalLayers > 1) {"));
check('保存后逐层回读校验也按 totalLayers', src.includes('for (let l = 0; l < totalLayers; l += 1) {'));
check('灯光保存按 layerCount 逐层', src.includes('for (let l = 0; l < layerCount; l++) {'));

// 模拟：设备 1 层 + 残留 3 层缓存 → 应该只保存 1 层
const layerCount = 1;
const cached = [[], [], []];
const totalLayers = Math.max(1, Math.min(layerCount, cached.length || layerCount));
check('模拟 1 层设备 + 3 条残留缓存 → 保存 1 层', totalLayers === 1, String(totalLayers));

// 模拟：设备 3 层 + 只有 1 层缓存（读失败）→ 只保存 1 层，不凭空造层
const lc3 = 3;
const cached1 = [[]];
const t3 = Math.max(1, Math.min(lc3, cached1.length || lc3));
check('模拟 3 层设备 + 1 条缓存 → 只保存 1 层（不凭空造层）', t3 === 1, String(t3));

// 模拟：设备 3 层 + 3 条缓存 → 保存 3 层
const t33 = Math.max(1, Math.min(lc3, [[], [], []].length || lc3));
check('模拟 3 层设备 + 3 条缓存 → 保存 3 层', t33 === 3, String(t33));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
