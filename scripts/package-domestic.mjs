// ============================================================
// scripts/package-domestic.mjs —— 打「国产系统便携版」tar.gz
//
// 思路: 不用 AppImage(国产系统常缺 FUSE), 直接把 electron-builder 产出的
// 解包目录 + 启动脚本 + 权限脚本 + 说明, 打成 tar.gz。
//
// 用法:
//   node scripts/package-domestic.mjs --dir dist-desktop/linux-unpacked --arch x64
//   node scripts/package-domestic.mjs --dir dist-desktop/linux-arm64-unpacked --arch arm64
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const dir = path.resolve(ROOT, arg('dir', 'dist-desktop/linux-unpacked'))
const arch = arg('arch', 'x64')
const outDir = path.resolve(ROOT, arg('out', 'release/download'))
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

if (!fs.existsSync(dir)) {
  console.error(`✗ 找不到解包目录: ${dir}`)
  process.exit(1)
}

const stage = path.join(ROOT, 'release', `stage-linux-${arch}`)
fs.rmSync(stage, { recursive: true, force: true })
fs.mkdirSync(stage, { recursive: true })

// 1) 复制应用本体
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name)
    const b = path.join(dest, e.name)
    if (e.isDirectory()) copyTree(a, b)
    else if (e.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(a), b)
    else fs.copyFileSync(a, b)
  }
}
copyTree(dir, stage)

// 2) 放入国产系统专用脚本
const packDir = path.join(ROOT, 'linux-pack')
for (const f of ['run.sh', 'install-hid.sh', 'README-国产系统.txt']) {
  fs.copyFileSync(path.join(packDir, f), path.join(stage, f))
}
for (const f of ['run.sh', 'install-hid.sh']) {
  fs.chmodSync(path.join(stage, f), 0o755)
}

// 3) 校验主程序确实存在
const exeName = fs.readdirSync(stage).find((n) => n === 'yywl-config' || (n.startsWith('yywl') && fs.statSync(path.join(stage, n)).isFile()))
if (!exeName) {
  console.error('✗ 解包目录里找不到主程序 (yywl-config)，请检查 linux.executableName 配置')
  process.exit(1)
}
console.log(`  主程序: ${exeName}`)
console.log(`  已注入: run.sh / install-hid.sh / README-国产系统.txt`)

// 4) 打包
fs.mkdirSync(outDir, { recursive: true })
const tarName = `yywlkey-config-${pkg.version}-linux-${arch}-domestic.tar.gz`
const tarPath = path.join(outDir, tarName)
fs.rmSync(tarPath, { force: true })

execFileSync('tar', [
  '-czf', tarPath,
  '-C', path.dirname(stage),
  path.basename(stage),
], { stdio: 'inherit' })

// 5) 输出内部清单供人工核对
const list = execFileSync('tar', ['-tzf', tarPath], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const hasRun = list.some((p) => p.endsWith('/run.sh'))
const hasHid = list.some((p) => p.endsWith('/install-hid.sh'))
const hasReadme = list.some((p) => p.includes('README'))
console.log(`  打包: ${tarName} (${(fs.statSync(tarPath).size / 1048576).toFixed(1)} MB, ${list.length} 个条目)`)
console.log(`  校验: run.sh=${hasRun ? '✓' : '✗'} install-hid.sh=${hasHid ? '✓' : '✗'} README=${hasReadme ? '✓' : '✗'}`)
if (!hasRun || !hasHid || !hasReadme) process.exit(1)

fs.rmSync(stage, { recursive: true, force: true })
