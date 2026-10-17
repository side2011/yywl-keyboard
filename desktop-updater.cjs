// ============================================================
// desktop-updater.cjs — 桌面版网页内容在线更新
//
// 思路: 桌面版 = Electron 外壳 + 本地网页。外壳很少变, 网页经常变。
//      所以更新只替换"网页文件", 不替换安装包:
//        · 从线上拉 update.json (文件清单 + 每个文件的 sha256)
//        · 只有内容变了的文件才下载 (典型一次更新几百 KB, 而非整包 8 MB)
//        · 装到 userData/web/<buildId>/, 用指针文件切换, 旧版本保留可回滚
//      这样三个平台通用, 而且**不需要代码签名** (macOS 上也能用)。
//
// 离线/内网: 也可以从本地目录导入 (见 installFromDir), 用 U 盘拷过去即可。
// ============================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_NAME = 'update.json';
const VERSION_NAME = 'version.json';

// ---------- 基础工具 ----------

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readVersion(dir) {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dir, VERSION_NAME), 'utf8'));
    return info && info.buildId ? info : null;
  } catch {
    return null;
  }
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// 并发执行, 限制同时进行的任务数
async function pool(items, limit, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------- 指针文件 (记录当前使用哪个版本目录) ----------

function pointerFile(webBase) {
  return path.join(webBase, 'current.json');
}

function readPointer(webBase) {
  try {
    const p = JSON.parse(fs.readFileSync(pointerFile(webBase), 'utf8'));
    if (!p || !p.dir) return null;
    const dir = path.join(webBase, p.dir);
    if (!fs.existsSync(path.join(dir, 'index.html'))) return null;
    return { dir, buildId: p.buildId || (readVersion(dir) || {}).buildId || null };
  } catch {
    return null;
  }
}

function writePointer(webBase, dirName, buildId) {
  fs.mkdirSync(webBase, { recursive: true });
  fs.writeFileSync(pointerFile(webBase), JSON.stringify({ dir: dirName, buildId }, null, 2));
}

// ---------- 安装 ----------

/**
 * 把一份清单装到 targetDir。
 * @param {object} opts
 * @param {object} opts.manifest  { buildId, files: [{ path, sha256, size }] }
 * @param {string} opts.targetDir 目标目录 (必须是空目录或已存在的空壳)
 * @param {string} [opts.currentDir] 当前运行目录, 用于"本地已有相同文件就直接复制"
 * @param {(relPath:string)=>Promise<Buffer>} opts.fetchFile 下载单个文件
 * @param {(p:{done:number,total:number,path:string})=>void} [opts.onProgress]
 */
async function install(opts) {
  const { manifest, targetDir, currentDir, fetchFile, onProgress } = opts;
  if (!manifest || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('更新清单为空');
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const total = manifest.files.length;
  let done = 0;
  let downloaded = 0;
  let copied = 0;

  const report = (relPath) => {
    done += 1;
    if (onProgress) {
      try { onProgress({ done, total, path: relPath }); } catch { /* 忽略回调异常 */ }
    }
  };

  await pool(manifest.files, 6, async (file) => {
    const dest = path.join(targetDir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    // 现状目录里已有相同内容 → 直接复制, 省流量
    if (currentDir) {
      const local = path.join(currentDir, file.path);
      try {
        if (fs.existsSync(local) && fs.statSync(local).size === file.size) {
          const buf = fs.readFileSync(local);
          if (sha256(buf) === file.sha256) {
            fs.writeFileSync(dest, buf);
            copied += 1;
            report(file.path);
            return;
          }
        }
      } catch { /* 读不到就当没有, 走下载 */ }
    }

    const buf = await fetchFile(file.path);
    if (buf.length !== file.size) {
      throw new Error(`${file.path} 大小不符 (期望 ${file.size}, 实际 ${buf.length})`);
    }
    if (sha256(buf) !== file.sha256) {
      throw new Error(`${file.path} 校验失败 (sha256 不匹配)`);
    }
    fs.writeFileSync(dest, buf);
    downloaded += 1;
    report(file.path);
  });

  // 写入版本信息, 作为该目录的"身份证"
  const versionInfo = {
    buildId: manifest.buildId,
    appVersion: manifest.appVersion || '',
    builtAt: manifest.builtAt || new Date().toISOString(),
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(targetDir, VERSION_NAME), JSON.stringify(versionInfo, null, 2));

  // 清理清单里没有的残留文件 (只在本目录内)
  const keep = new Set(manifest.files.map((f) => path.normalize(f.path)));
  keep.add(VERSION_NAME);
  for (const abs of walk(targetDir)) {
    const rel = path.relative(targetDir, abs).replace(/\\/g, '/');
    if (!keep.has(path.normalize(rel))) {
      try { fs.unlinkSync(abs); } catch { /* 忽略 */ }
    }
  }

  return { downloaded, copied, total };
}

// ---------- 在线更新 ----------

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinary(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBase(base) {
  return base.endsWith('/') ? base : base + '/';
}

async function checkRemote(baseUrl) {
  const base = normalizeBase(baseUrl);
  return fetchJson(base + MANIFEST_NAME + '?t=' + Date.now());
}

async function installFromUrl({ baseUrl, manifest, webBase, currentDir, onProgress }) {
  const base = normalizeBase(baseUrl);
  const targetDir = path.join(webBase, String(manifest.buildId));
  const prev = readPointer(webBase);            // 切换前记录, 留作回滚点
  const result = await install({
    manifest,
    targetDir,
    currentDir,
    onProgress,
    fetchFile: (relPath) => fetchBinary(base + relPath.split('/').map(encodeURIComponent).join('/')),
  });
  writePointer(webBase, String(manifest.buildId), manifest.buildId);
  pruneOldVersions(webBase, [String(manifest.buildId), prev && path.basename(prev.dir)]);
  return { ...result, targetDir };
}

// ---------- 离线导入 (内网/U 盘) ----------

async function installFromDir({ sourceDir, webBase, currentDir, onProgress }) {
  const manifestPath = path.join(sourceDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`选择的目录里没有 ${MANIFEST_NAME}, 请选择"离线更新包"解压后的目录`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const targetDir = path.join(webBase, String(manifest.buildId));
  const prev = readPointer(webBase);            // 切换前记录, 留作回滚点
  const result = await install({
    manifest,
    targetDir,
    currentDir,
    onProgress,
    fetchFile: async (relPath) => {
      const abs = path.join(sourceDir, relPath);
      if (!fs.existsSync(abs)) throw new Error(`离线包缺少文件: ${relPath}`);
      return fs.readFileSync(abs);
    },
  });
  writePointer(webBase, String(manifest.buildId), manifest.buildId);
  pruneOldVersions(webBase, [String(manifest.buildId), prev && path.basename(prev.dir)]);
  return { ...result, targetDir };
}

// 只保留最近 2 个版本目录 (当前 + 上一个作为回滚点)
function pruneOldVersions(webBase, keepNames) {
  try {
    const keep = new Set((Array.isArray(keepNames) ? keepNames : [keepNames]).filter(Boolean));
    const dirs = fs.readdirSync(webBase, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !keep.has(name));
    for (const name of dirs) {
      const full = path.join(webBase, name);
      // 只删形如 buildId 的目录 (12 位十六进制), 避免误删
      if (/^[0-9a-f]{8,16}$/i.test(name)) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  } catch { /* 清理失败不影响主流程 */ }
}

function diskInfo() {
  try {
    return { free: os.freemem() };
  } catch {
    return {};
  }
}

module.exports = {
  MANIFEST_NAME,
  VERSION_NAME,
  sha256,
  readVersion,
  walk,
  readPointer,
  writePointer,
  install,
  checkRemote,
  installFromUrl,
  installFromDir,
  pruneOldVersions,
  diskInfo,
};
