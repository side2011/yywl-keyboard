// 验证旧协议"延时"记录的字节（对照客户日志）
// 客户日志: 写 fd 01 02 05 32 00 ...（我们写的），读回 fa 01 02 01 00 32 ...
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import esbuild from 'esbuild';

const src = readFileSync('src/services/bt-protocol.js', 'utf8');
const out = esbuild.transformSync(src, { loader: 'js', format: 'cjs', target: 'node18' }).code;
const file = resolve('node_modules', '.cache-bt-delay.cjs');
writeFileSync(file, out);
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { serializeBtKeyRecord, parseBtKeyRecord } = require(file);

const hex = (a, n = 14) => Array.from(a.slice(0, n)).map((b) => b.toString(16).padStart(2, '0')).join(' ');

const rec = serializeBtKeyRecord({ mode: 5, delay: 50 }, 1, 2, false);
console.log('我们写出的延时记录(50ms):', hex(rec));
console.log('  [3]=mode:', rec[3], ' [4]=', rec[4], ' [5]=', rec[5], ' [9]=组数', rec[9]);

// 客户设备读回的记录
const back = parseBtKeyRecord(new Uint8Array([0xFA, 0x01, 0x02, 0x01, 0x00, 0x32, 0, 0, 0, 0x03, 0, 0x1e, 0, 0x1f, 0]), false);
console.log('设备读回解析:', JSON.stringify({ mode: back.mode, delay: back.delay, groups: back.groups }));
