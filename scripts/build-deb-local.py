# 本地构建 arm64 .deb（Python 版，data 用 xz 压缩，和官方包一致）
# 官方包结构（1.4.24 实测）：
#   ./opt/YYWL键盘配置工具/...           343 项
#   ./usr/share/applications/yywl-config.desktop
#   ./usr/share/icons/hicolor/1024x1024/apps/yywl-config.png
#   ./usr/share/doc/yywl-keyboard-app/changelog.gz
#   control.tar.gz 里含 ./control ./postinst ./postrm
import io
import os
import sys
import gzip
import lzma
import time
import tarfile
import hashlib

ROOT = os.getcwd()
VERSION = __import__('json').load(open(os.path.join(ROOT, 'package.json'), encoding='utf-8'))['version']
SRC = os.path.join(ROOT, 'dist-desktop-arm64', 'linux-arm64-unpacked')
APP_NAME = 'YYWL键盘配置工具'
OUT = os.path.join(ROOT, 'release', f'yywlkey-config-{VERSION}-domestic-arm64.deb')
DESKTOP_COMMENT = 'YYWL 多功能小键盘配置工具（网页版 / Electron 桌面版）'

EXECUTABLES = {'yywl-config', 'chrome-sandbox', 'chrome_crashpad_handler'}


def add_dir(tf, name):
    ti = tarfile.TarInfo(name)
    ti.type = tarfile.DIRTYPE
    ti.mode = 0o755
    ti.mtime = int(time.time())
    tf.addfile(ti)


def add_file(tf, name, path, mode):
    data = open(path, 'rb').read()
    ti = tarfile.TarInfo(name)
    ti.size = len(data)
    ti.mode = mode
    ti.mtime = int(time.time())
    tf.addfile(ti, io.BytesIO(data))


def build_data_tar():
    tmp = os.path.join(os.environ.get('TEMP', '/tmp'), 'yywl-data.tar.xz')
    if os.path.exists(tmp):
        os.remove(tmp)
    tf = tarfile.open(tmp, 'w:xz', preset=6, format=tarfile.GNU_FORMAT)
    add_dir(tf, '.')
    add_dir(tf, './opt')
    add_dir(tf, f'./opt/{APP_NAME}')
    for base, dirs, files in os.walk(SRC):
        rel = os.path.relpath(base, SRC)
        if rel != '.':
            add_dir(tf, f'./opt/{APP_NAME}/' + rel.replace(os.sep, '/'))
        for f in sorted(files):
            full = os.path.join(base, f)
            rp = (rel.replace(os.sep, '/') + '/' + f) if rel != '.' else f
            mode = 0o755 if f in EXECUTABLES else 0o644
            add_file(tf, f'./opt/{APP_NAME}/' + rp, full, mode)

    # electron-builder 会写这两个元数据文件，官方包里也有 → 补上保持一致
    extra_dir = os.path.join(os.environ.get('TEMP', '/tmp'), 'yywl-extra-res')
    os.makedirs(extra_dir, exist_ok=True)
    open(os.path.join(extra_dir, 'app-update.yml'), 'w', encoding='utf-8', newline='\n').write(
        'provider: generic\n'
        'url: https://key.itytsoft.com/download\n'
        f'updaterCacheDirName: yywl-keyboard-app-updater\n'
    )
    open(os.path.join(extra_dir, 'package-type'), 'w', encoding='utf-8', newline='\n').write('deb\n')
    add_file(tf, f'./opt/{APP_NAME}/resources/app-update.yml', os.path.join(extra_dir, 'app-update.yml'), 0o644)
    add_file(tf, f'./opt/{APP_NAME}/resources/package-type', os.path.join(extra_dir, 'package-type'), 0o644)

    # 桌面入口
    desktop = '\n'.join([
        '[Desktop Entry]',
        f'Name={APP_NAME}',
        f'Exec="/opt/{APP_NAME}/yywl-config" %U',
        'Terminal=false',
        'Type=Application',
        'Icon=yywl-config',
        f'StartupWMClass={APP_NAME}',
        f'Comment={DESKTOP_COMMENT}',
        'Categories=Utility;',
        '',
    ])
    dp = os.path.join(os.environ.get('TEMP', '/tmp'), 'yywl-config.desktop')
    open(dp, 'w', encoding='utf-8', newline='\n').write(desktop)

    add_dir(tf, './usr'); add_dir(tf, './usr/share')
    add_dir(tf, './usr/share/applications')
    add_file(tf, './usr/share/applications/yywl-config.desktop', dp, 0o644)
    add_dir(tf, './usr/share/icons'); add_dir(tf, './usr/share/icons/hicolor')
    add_dir(tf, './usr/share/icons/hicolor/1024x1024')
    add_dir(tf, './usr/share/icons/hicolor/1024x1024/apps')
    add_file(tf, './usr/share/icons/hicolor/1024x1024/apps/yywl-config.png',
             os.path.join(ROOT, 'build', 'icon.png'), 0o644)

    # changelog（Debian 规范要求，dpkg 不强校验）
    add_dir(tf, './usr/share/doc'); add_dir(tf, './usr/share/doc/yywl-keyboard-app')
    changelog = (f'yywl-keyboard-app ({VERSION}) stable; urgency=medium\n\n'
                 f'  * 发布 {VERSION}\n\n -- YYWL <1291285148@qq.com>  {time.strftime("%a, %d %b %Y %H:%M:%S +0800")}\n')
    cp = os.path.join(os.environ.get('TEMP', '/tmp'), 'changelog')
    open(cp, 'w', encoding='utf-8', newline='\n').write(changelog)
    gz = os.path.join(os.environ.get('TEMP', '/tmp'), 'changelog.gz')
    raw = open(cp, 'rb').read()
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb', mtime=0) as f:
        f.write(raw)
    open(gz, 'wb').write(buf.getvalue())
    add_file(tf, './usr/share/doc/yywl-keyboard-app/changelog.gz', gz, 0o644)

    tf.close()
    return tmp


def build_control_tar():
    tmp = os.path.join(os.environ.get('TEMP', '/tmp'), 'yywl-control.tar.gz')
    installed_kb = 0
    for base, _dirs, files in os.walk(SRC):
        for f in files:
            installed_kb += os.path.getsize(os.path.join(base, f))
    installed_kb = round(installed_kb / 1024)

    control = '\n'.join([
        'Package: yywl-keyboard-app',
        f'Version: {VERSION}',
        'Section: default',
        'Priority: optional',
        'Architecture: arm64',
        'Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0',
        'Recommends: libappindicator3-1',
        f'Installed-Size: {installed_kb}',
        'Maintainer: YYWL <1291285148@qq.com>',
        'Homepage: https://key.itytsoft.com',
        'Description: YYWL 多功能小键盘配置工具（网页版 / Electron 桌面版）',
        ' 支持老协议 USB / 蓝牙 / 新协议 2.0 三种键盘的按键、宏、灯光配置。',
        '',
    ])

    def readscript(p):
        return open(p, encoding='utf-8').read().replace('\r\n', '\n')

    tf = tarfile.open(tmp, 'w:gz', format=tarfile.GNU_FORMAT)
    for name, content, mode in [
        ('./control', control, 0o644),
        ('./postinst', readscript(os.path.join(ROOT, 'build', 'linux', 'after-install.sh')), 0o755),
        ('./postrm', readscript(os.path.join(ROOT, 'build', 'linux', 'after-remove.sh')), 0o755),
    ]:
        data = content.encode('utf-8')
        ti = tarfile.TarInfo(name)
        ti.size = len(data)
        ti.mode = mode
        ti.mtime = int(time.time())
        tf.addfile(ti, io.BytesIO(data))
    tf.close()
    return tmp


def ar_member(name, data):
    hdr = bytearray(b' ' * 60)
    hdr[0:len(name) + 1] = (name + '/').encode()
    hdr[16:16 + 12] = str(int(time.time())).encode().ljust(12)
    hdr[28:28 + 6] = b'0'.ljust(6)
    hdr[34:34 + 6] = b'0'.ljust(6)
    hdr[40:40 + 8] = b'100644'.ljust(8)
    hdr[48:48 + 10] = str(len(data)).encode().ljust(10)
    hdr[58:60] = b'`\n'
    out = bytes(hdr) + data
    if len(data) % 2 == 1:
        out += b'\n'
    return out


def main():
    if not os.path.isdir(SRC):
        print('找不到 ' + SRC)
        sys.exit(1)
    data_tar = build_data_tar()
    control_tar = build_control_tar()
    blob = b'!<arch>\n' + ar_member('debian-binary', b'2.0\n') \
        + ar_member('control.tar.gz', open(control_tar, 'rb').read()) \
        + ar_member('data.tar.xz', open(data_tar, 'rb').read())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'wb').write(blob)
    print('  data.tar.xz: %.1f MB' % (os.path.getsize(data_tar) / 1048576))
    print('  control.tar.gz: %.1f KB' % (os.path.getsize(control_tar) / 1024))
    print('  已生成: %s  %.1f MB' % (OUT, len(blob) / 1048576))
    print('  sha256: ' + hashlib.sha256(blob).hexdigest().upper())


main()
