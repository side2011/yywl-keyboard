// 回归测试：新协议灯光页的显示条件（不能再只看 backlightType）
// 用法: node scripts/test-np-led-tab.mjs
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

const np = readFileSync('src/components/NewProtoConfigurator.jsx', 'utf8');
const cs = readFileSync('yywlkey/Hid_Common/CLS/NewProtoHelper.cs', 'utf8');

// ---- C# 只解析、不用于隐藏界面（据此确认"不该只看这个字节"）----
check('C# 解析了 BacklightType', cs.includes('info.BacklightType = resp[10];'));
check('C# 没有用 BacklightType 隐藏灯光界面',
  !/BacklightType\s*[><=]=?\s*0/.test(cs));

// ---- 新协议页：探测兜底 ----
check('新增 ledProbeOk 状态', np.includes('const [ledProbeOk, setLedProbeOk] = useState(null);'));
check('hasBacklight = 声明 || 探测成功',
  np.includes('(deviceInfo?.backlightType || 0) > 0 || ledProbeOk === true'));
check('0x0A 有响应 → 置 true', np.includes('setLedProbeOk(true);'));
check('0x0A 无响应 → 置 false（且只有未声明时才记）', np.includes('setLedProbeOk(false);'));
check('探测到灯光会打日志', np.includes('0x0B 声明无灯光，但 0x0A 有响应'));
check('灯光 tab 仍受 hasBacklight 控制', np.includes('...(hasBacklight ? [{ label: t('));
check('灯光面板渲染条件一致', np.includes('{hasBacklight && activeTab === ledTabIndex && ('));

// ---- 协议隔离：老协议/蓝牙不受影响 ----
const kc = readFileSync('src/components/KeyboardConfigurator.jsx', 'utf8');
const bt = readFileSync('src/components/BtConfigurator.jsx', 'utf8');
check('老协议页未引入 ledProbeOk', !kc.includes('ledProbeOk'));
check('蓝牙页未引入 ledProbeOk', !bt.includes('ledProbeOk'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
