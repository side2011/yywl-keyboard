// 刷新下载清单：为服务器上已存在的安装包重新计算 size + sha256，生成 manifest.json
// 背景：GitHub Actions 额度用尽，CI 的"生成下载清单"任务跑不了，
//       线上 manifest 一直停在 1.4.6，而服务器上已经是 1.4.7 的包。
// 用法：node scripts/refresh-manifest.mjs 1.4.7            （下载 + 计算 + 上传）
//       node scripts/refresh-manifest.mjs 1.4.7 --dry-run  （只计算，不上传）
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const VERSION = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
if (!VERSION) {
  console.error('用法: node scripts/refresh-manifest.mjs <版本号> [--dry-run]')
  process.exit(1)
}

const HOST = 'key.itytsoft.com'
const BASE = `https://${HOST}/download/`

const SLOTS = [
  { id: 'win-x64', platform: 'windows', arch: 'x64', file: `yywlkey-config-${VERSION}-win-x64.zip`, label: 'Windows 10 / 11（64 位）', note: '免安装绿色版，解压即用' },
  { id: 'mac-x64', platform: 'macos', arch: 'x64', file: `yywlkey-config-${VERSION}-mac-x64.zip`, label: 'macOS · Intel 芯片', note: '首次打开：右键 → 打开；或双击包内「首次打开请双击我.command」' },
  { id: 'mac-arm64', platform: 'macos', arch: 'arm64', file: `yywlkey-config-${VERSION}-mac-arm64.zip`, label: 'macOS · Apple 芯片（M 系列）', note: '首次打开：右键 → 打开；或双击包内「首次打开请双击我.command」' },
  { id: 'linux-x64', platform: 'linux', arch: 'x64', file: `yywlkey-config-${VERSION}-linux-x64.AppImage`, label: 'Linux（AppImage）', note: 'chmod +x 后运行' },
  { id: 'linux-x64-domestic', platform: 'linux', arch: 'x64', file: `yywlkey-config-${VERSION}-linux-x64-domestic.tar.gz`, label: '国产系统 · x86_64（麒麟 / UOS 便携版）', note: '解压即用，无需安装' },
  { id: 'linux-arm64-domestic', platform: 'linux', arch: 'arm64', file: `yywlkey-config-${VERSION}-linux-arm64-domestic.tar.gz`, label: '国产系统 · ARM64（飞腾 / 鲲鹏）', note: '解压即用，无需安装' },
]

const CACHE = path.join(ROOT, '.manifest-cache')

function downloadAndHash(url, onProgress) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume()
        return resolve(downloadAndHash(res.headers.location, onProgress))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error('HTTP ' + res.statusCode + ' ' + url))
      }
      const total = Number(res.headers['content-length'] || 0)
      const hash = crypto.createHash('sha256')
      let got = 0
      res.on('data', (chunk) => {
        hash.update(chunk)
        got += chunk.length
        if (onProgress) onProgress(got, total)
      })
      res.on('end', () => {
        if (total && got !== total) return reject(new Error(`长度不符: 期望 ${total} 实际 ${got}`))
        resolve({ size: got, sha256: hash.digest('hex').toUpperCase() })
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('下载超时')))
    req.on('error', reject)
  })
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true })
  const cacheFile = path.join(CACHE, `meta-${VERSION}.json`)
  let cache = {}
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) } catch { cache = {} }

  const packages = []
  for (const slot of SLOTS) {
    if (cache[slot.file] && cache[slot.file].size > 0) {
      console.log(`  = ${slot.file}  (缓存) ${(cache[slot.file].size / 1048576).toFixed(1)} MB`)
      packages.push({ ...slot, available: true, size: cache[slot.file].size, sha256: cache[slot.file].sha256 })
      continue
    }
    process.stdout.write(`  ↓ ${slot.file} ... `)
    try {
      let lastLog = 0
      const r = await downloadAndHash(BASE + slot.file, (got, total) => {
        const now = Date.now()
        if (now - lastLog > 5000 && total) {
          lastLog = now
          process.stdout.write(`${((got / total) * 100).toFixed(0)}% `)
        }
      })
      cache[slot.file] = r
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
      console.log(`OK ${(r.size / 1048576).toFixed(1)} MB  ${r.sha256.slice(0, 12)}…`)
      packages.push({ ...slot, available: true, size: r.size, sha256: r.sha256 })
    } catch (e) {
      console.log('失败:', e.message)
      packages.push({ ...slot, available: false, size: 0, sha256: '' })
    }
  }

  const manifest = {
    version: VERSION,
    webBuildId: '',
    updated: new Date().toISOString().slice(0, 10),
    packages: packages.map((p) => ({
      id: p.id,
      platform: p.platform,
      arch: p.arch,
      label: p.label,
      file: p.file,
      available: p.available,
      size: p.size,
      sha256: p.sha256,
      note: p.note,
    })),
  }
  const outDir = path.join(ROOT, 'public', 'download')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'manifest.json')
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\n已生成 ${outFile}`)
  const okCount = manifest.packages.filter((p) => p.available).length
  console.log(`可用包: ${okCount}/${manifest.packages.length}`)

  if (okCount < manifest.packages.length) {
    console.log('⚠ 有包不可用，仍会生成清单（页面上会显示"暂不可用"）')
  }
  if (dryRun) {
    console.log('--dry-run 模式，不上传')
    return
  }

  // 上传到 FTP
  const envMap = {}
  for (const line of fs.readFileSync(path.join(ROOT, 'quick-config', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) envMap[m[1]] = m[2].trim()
  }
  const { execFileSync } = await import('node:child_process')
  const ftpUrl = `ftp://${envMap.FTP_HOST}/download/manifest.json`
  execFileSync('curl.exe', ['-s', '--max-time', '120', '-T', outFile, ftpUrl, '--user', `${envMap.FTP_USER}:${envMap.FTP_PASS}`])
  console.log('已上传:', ftpUrl)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
