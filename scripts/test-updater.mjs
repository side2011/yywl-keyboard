// ============================================================
// scripts/test-updater.mjs — 桌面版更新逻辑的本地自测
//
// 不需要 Electron: 起一个本地 http 服务当"线上站点", 直接调用
// desktop-updater.cjs 的安装流程, 验证增量、校验、指针、清理等行为。
//
// 运行: node scripts/test-updater.mjs
// ============================================================
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const updater = require('../desktop-updater.cjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name)
    const b = path.join(dest, e.name)
    if (e.isDirectory()) copyTree(a, b)
    else fs.copyFileSync(a, b)
  }
}

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function buildManifest(dir, buildId) {
  const files = walk(dir)
    .filter((f) => path.basename(f) !== 'update.json' && path.basename(f) !== 'version.json')
    .sort()
  const entries = files.map((abs) => {
    const buf = fs.readFileSync(abs)
    return {
      path: path.relative(dir, abs).replace(/\\/g, '/'),
      size: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    }
  })
  return {
    buildId,
    appVersion: '1.0.0',
    builtAt: new Date().toISOString(),
    files: entries,
  }
}

function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const abs = path.join(dir, urlPath.replace(/^\/+/, ''))
      if (!abs.startsWith(dir) || !fs.existsSync(abs)) {
        res.writeHead(404); res.end('not found'); return
      }
      res.writeHead(200)
      res.end(fs.readFileSync(abs))
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yywl-update-test-'))
const webBase = path.join(tmp, 'web')
const dist2 = path.join(tmp, 'dist-v2')

async function main() {
  console.log('\n[1] 首次在线安装（无本地版本）')
  const m1 = buildManifest(DIST, 'aaaaaaaaaaaa')
  const srv1 = await serve(DIST)
  const base1 = `http://127.0.0.1:${srv1.address().port}/`
  const r1 = await updater.installFromUrl({
    baseUrl: base1, manifest: m1, webBase, currentDir: null,
  })
  check('下载全部文件', r1.downloaded === m1.files.length, `downloaded=${r1.downloaded} total=${m1.files.length}`)
  check('目标目录有 index.html', fs.existsSync(path.join(r1.targetDir, 'index.html')))
  check('目标目录有 version.json', fs.existsSync(path.join(r1.targetDir, 'version.json')))
  const ptr1 = updater.readPointer(webBase)
  check('指针指向新版本', ptr1 && path.basename(ptr1.dir) === 'aaaaaaaaaaaa')
  check('readVersion 读到 buildId', (updater.readVersion(r1.targetDir) || {}).buildId === 'aaaaaaaaaaaa')
  srv1.close()

  console.log('\n[2] 同一份清单再装一次（应全部复用本地文件）')
  const srv2 = await serve(DIST)
  const base2 = `http://127.0.0.1:${srv2.address().port}/`
  const r2 = await updater.installFromUrl({
    baseUrl: base2, manifest: m1, webBase, currentDir: r1.targetDir,
  })
  check('零下载', r2.downloaded === 0, `downloaded=${r2.downloaded}`)
  check('全部复用', r2.copied === m1.files.length, `copied=${r2.copied}`)
  srv2.close()

  console.log('\n[3] 新版本只改一个文件（应只下载 1 个）')
  copyTree(DIST, dist2)
  fs.writeFileSync(path.join(dist2, 'index.html'), fs.readFileSync(path.join(dist2, 'index.html'), 'utf8') + '\n<!-- v2 -->\n')
  const m2 = buildManifest(dist2, 'bbbbbbbbbbbb')
  const srv3 = await serve(dist2)
  const base3 = `http://127.0.0.1:${srv3.address().port}/`
  const r3 = await updater.installFromUrl({
    baseUrl: base3, manifest: m2, webBase, currentDir: r1.targetDir,
  })
  check('只下载 1 个文件', r3.downloaded === 1, `downloaded=${r3.downloaded}`)
  check('其余复用', r3.copied === m2.files.length - 1, `copied=${r3.copied}`)
  check('指针切到新版本', path.basename(updater.readPointer(webBase).dir) === 'bbbbbbbbbbbb')
  check('旧版本目录被清理（只留 2 个）', fs.readdirSync(webBase).filter((n) => /^[0-9a-f]{12}$/.test(n)).length === 2)
  srv3.close()

  console.log('\n[4] 校验失败应当报错（防止半包/篡改）')
  const badManifest = JSON.parse(JSON.stringify(m2))
  const victim = badManifest.files.find((f) => f.path === 'index.html')
  victim.sha256 = 'deadbeef'.repeat(8)
  const srv4 = await serve(dist2)
  const base4 = `http://127.0.0.1:${srv4.address().port}/`
  let threw = false
  try {
    await updater.installFromUrl({ baseUrl: base4, manifest: badManifest, webBase, currentDir: r3.targetDir })
  } catch { threw = true }
  check('sha256 不匹配时抛错', threw)
  srv4.close()

  console.log('\n[5] 离线目录导入')
  const offlineDir = path.join(tmp, 'offline')
  copyTree(dist2, offlineDir)
  fs.writeFileSync(path.join(offlineDir, 'update.json'), JSON.stringify(m2, null, 2))
  const r5 = await updater.installFromDir({
    sourceDir: offlineDir, webBase, currentDir: r3.targetDir,
  })
  check('离线导入成功', r5.total === m2.files.length, `total=${r5.total}`)
  check('离线全部复用', r5.downloaded === 0, `downloaded=${r5.downloaded}`)

  console.log('\n[6] 指针损坏时自动回退')
  fs.writeFileSync(path.join(webBase, 'current.json'), '{ not json')
  check('坏指针返回 null', updater.readPointer(webBase) === null)

  console.log('\n[7] 清单为空应报错')
  let threw2 = false
  try { await updater.install({ manifest: { buildId: 'x', files: [] }, targetDir: path.join(tmp, 'x'), fetchFile: async () => Buffer.alloc(0) }) }
  catch { threw2 = true }
  check('空清单抛错', threw2)

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
