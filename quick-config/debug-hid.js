// debug-hid.js — 独立调试脚本，测试 node-hid 原始数据
const HID = require('node-hid');

const VID = 0x514C;
const PIDS = [0x8850, 0x8851];
const REPORT_ID = 0x03;

function xorChecksum(bytes, len) {
  let v = 0;
  for (let i = 0; i < len; i++) v ^= bytes[i];
  return v;
}

// 找设备
const devices = HID.devices().filter(d =>
  d.vendorId === VID && PIDS.includes(d.productId) && d.usagePage !== 0x01
);
console.log('Found devices:', devices.length);
if (devices.length === 0) {
  console.log('No device found! Listing all HID devices:');
  HID.devices().filter(d => d.vendorId === VID).forEach(d => {
    console.log(`  VID:${d.vendorId.toString(16)} PID:${d.productId.toString(16)} usagePage:${(d.usagePage||0).toString(16)} path:${d.path?.substring(0,60)}`);
  });
  process.exit(1);
}

const dev = devices[0];
console.log('Connecting to:', dev.path?.substring(0, 60));
console.log('Product:', dev.product, 'usagePage:', dev.usagePage?.toString(16));

let hid;
try {
  hid = new HID.HID(dev.path);
} catch (err) {
  console.error('Failed to open:', err.message);
  process.exit(1);
}
console.log('Device opened successfully');

// 监听所有原始数据 (不做任何过滤)
let dataCount = 0;
hid.on('data', (rawData) => {
  dataCount++;
  const buf = Buffer.from(rawData);
  console.log(`\n[DATA #${dataCount}] length=${buf.length}`);
  console.log('  Hex:', buf.toString('hex').match(/.{1,2}/g).join(' '));
  console.log('  [0]=0x' + buf[0].toString(16) + ' [1]=0x' + (buf[1]||0).toString(16) + ' [2]=0x' + (buf[2]||0).toString(16));

  // 尝试两种解析方式
  // 方式A: data[0]=reportId, data[1..63]=body
  if (buf[0] === REPORT_ID && buf.length >= 64) {
    const bodyA = buf.slice(1, 64);
    const ckA = xorChecksum(bodyA, 62);
    console.log('  [方式A] reportId=0x03, body[0]=0x' + bodyA[0].toString(16) + ', checksum=' + (ckA === bodyA[62] ? 'OK' : `FAIL(calc=0x${ckA.toString(16)} vs 0x${bodyA[62].toString(16)})`));
  }
  // 方式B: 整个64字节就是body (无reportId)
  if (buf.length >= 63) {
    const bodyB = buf.slice(0, 63);
    const ckB = xorChecksum(bodyB, 62);
    console.log('  [方式B] body[0]=0x' + bodyB[0].toString(16) + ', checksum=' + (ckB === bodyB[62] ? 'OK' : `FAIL(calc=0x${ckB.toString(16)} vs 0x${bodyB[62].toString(16)})`));
  }
});

hid.on('error', (err) => {
  console.error('HID error:', err.message);
});

// 等500ms让设备稳定，然后发送 READ_DEVICE_INFO
setTimeout(() => {
  console.log('\n--- Sending READ_DEVICE_INFO (cmd=0x0B) ---');

  const body = Buffer.alloc(63);
  body[0] = 0x0B; // CMD.READ_DEVICE_INFO
  body[1] = 0x00; // layer
  body[2] = 0x00; // keyIdx
  body[3] = 0x00; // payload length
  body[62] = xorChecksum(body, 62);
  console.log('Packet body hex:', body.toString('hex').match(/.{1,2}/g).join(' '));
  console.log('Checksum byte:', body[62].toString(16));

  // node-hid write: 需要在前面加 reportId
  const packet = Buffer.alloc(64);
  packet[0] = REPORT_ID; // reportId
  body.copy(packet, 1);
  console.log('Full packet hex:', packet.toString('hex').match(/.{1,2}/g).join(' '));

  try {
    hid.write(Array.from(packet));
    console.log('Write successful');
  } catch (err) {
    console.error('Write failed:', err.message);

    // 尝试不带 reportId
    console.log('\nRetrying without reportId prefix...');
    try {
      hid.write(Array.from(body));
      console.log('Write (no reportId) successful');
    } catch (err2) {
      console.error('Write (no reportId) also failed:', err2.message);
    }
  }

  // 5秒后退出
  setTimeout(() => {
    console.log('\n--- Timeout, no response received ---');
    console.log('Total data packets received:', dataCount);
    hid.close();
    process.exit(0);
  }, 5000);
}, 500);
