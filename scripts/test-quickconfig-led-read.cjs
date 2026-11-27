// 回归测试：快速配置（老协议）读取时必须把「灯光模式」读出来
//
// 员工反馈：5 键触摸款（老协议）实际是常亮，快速配置读出来一直是「灯光关闭」。
// 根因：设备回报顺序是「先所有按键 → 再灯光 → 最后颜色」，
//       旧实现收齐按键就立刻 resolve，把后面的灯光报告丢掉了。
// 这个测试用一个假设备按真实顺序发报告，验证 rgbMode 能拿到。
const { EventEmitter } = require('node:events');
const path = require('node:path');

const { OldProtocolHandler } = require(path.join(process.cwd(), 'quick-config', 'protocols', 'old-protocol.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log('  ✓ ' + name); }
  else { fail += 1; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
};

// 假设备：收到 0x55 后，按真实顺序回报 —— 5 个按键 → 灯光(常亮=12) → 颜色
class FakeDevice extends EventEmitter {
  constructor({ sendLed = true, ledValue = 12, sendColor = true, keyCount = 5, dataLen = 0x12 } = {}) {
    super();
    this.opts = { sendLed, ledValue, sendColor, keyCount, dataLen };
    this.writes = [];
  }

  write(arr) {
    this.writes.push(arr);
    const isRead = arr.includes(0x55);
    if (!isRead) return;
    setTimeout(() => this._emitAll(), 5);
  }

  _emitAll() {
    const dataLen = this.opts.dataLen;
    for (let keyPos = 1; keyPos <= this.opts.keyCount; keyPos += 1) {
      const buf = Buffer.alloc(64);
      buf[0] = dataLen;
      buf[1] = keyPos;
      buf[2] = 1;       // mode=1 普通按键
      buf[4] = 0x04 + keyPos - 1;
      this.emit('data', buf);
    }
    if (this.opts.sendLed) {
      const led = Buffer.alloc(64);
      led[0] = 0x02;
      led[1] = 0x08;
      led[2] = this.opts.ledValue;
      this.emit('data', led);
    }
    if (this.opts.sendColor) {
      const color = Buffer.alloc(64);
      color[0] = 0x04;
      color[1] = 0x64;
      color[2] = 0x10; // g
      color[3] = 0x20; // r
      color[4] = 0x30; // b
      this.emit('data', color);
    }
  }
}

(async () => {
  // ---- 1) 正常设备：按键 + 灯光 + 颜色都发 ----
  const dev = new FakeDevice();
  const h = new OldProtocolHandler(dev, '5K-touch', () => {});
  const t0 = Date.now();
  const r = await h.readConfig();
  const cost = Date.now() - t0;
  check('收齐按键后仍等到灯光报告', r.rgbMode === 12, 'rgbMode=' + r.rgbMode);
  check('灯光模式 12 = 常亮模式（不再显示关闭）', r.rgbMode === 12);
  check('按键配置仍然完整（5 个）', r.keyConfigs.length === 5, String(r.keyConfigs.length));
  check('自定义颜色也读到', !!r.customColor && r.customColor.r === 0x20);
  check('不会白等到 3 秒兜底', cost < 1500, cost + 'ms');

  // ---- 2) 设备不发灯光（异常情况）：不能卡死，按兜底超时返回 ----
  const dev2 = new FakeDevice({ sendLed: false });
  const h2 = new OldProtocolHandler(dev2, '5K-touch', () => {});
  const t1 = Date.now();
  const r2 = await h2.readConfig();
  const cost2 = Date.now() - t1;
  check('没灯光报告时不卡死（1 秒内返回）', cost2 < 2000, cost2 + 'ms');
  check('没灯光报告时 rgbMode 为 null（交给上层重试）', r2.rgbMode === null);
  check('按键配置仍然正常', r2.keyConfigs.length === 5);

  // ---- 3) 无灯型号（7K-noled）：不应等待灯光 ----
  const dev3 = new FakeDevice({ sendLed: false, keyCount: 7, dataLen: 0x11 });
  const h3 = new OldProtocolHandler(dev3, '7K-noled', () => {});
  const t2 = Date.now();
  await h3.readConfig();
  const cost3 = Date.now() - t2;
  check('无灯型号快速返回（不等灯光）', cost3 < 1200, cost3 + 'ms');

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
