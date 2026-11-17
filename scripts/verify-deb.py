# 校验本地构建的 deb：结构 / 文件列表 / 权限 / control 内容，并与官方 1.4.24 包对比
import io
import lzma
import sys
import tarfile

sys.stdout.reconfigure(encoding='utf-8')


def ar_members(path):
    b = open(path, 'rb').read()
    assert b[:8] == b'!<arch>\n', '不是 ar 文件'
    off = 8
    out = {}
    while off < len(b):
        hdr = b[off:off + 60]
        if len(hdr) < 60:
            break
        name = hdr[0:16].decode().strip().rstrip('/')
        size = int(hdr[48:58].decode().strip())
        out[name] = b[off + 60: off + 60 + size]
        off += 60 + size + (size % 2)
    return out


def entries(deb):
    m = ar_members(deb)
    data = m.get('data.tar.xz') or m.get('data.tar.gz')
    if m.get('data.tar.xz'):
        raw = lzma.open(io.BytesIO(data), 'rb').read()
    else:
        import gzip
        raw = gzip.decompress(data)
    tf = tarfile.open(fileobj=io.BytesIO(raw))
    return tf, m


mine = sys.argv[1]
ref = sys.argv[2] if len(sys.argv) > 2 else None

tf, m = entries(mine)
names = tf.getnames()
print('  ar 成员: ' + ', '.join(m.keys()))
print('  条目数: %d' % len(names))
print('  顶层: ' + ', '.join(sorted({n.split('/')[0] if n != '.' else '.' for n in names})))

for n in ('./opt/YYWL键盘配置工具/yywl-config',
          './opt/YYWL键盘配置工具/chrome-sandbox',
          './usr/share/applications/yywl-config.desktop'):
    try:
        ti = tf.getmember(n)
        print('  %s mode=%o size=%d' % (n, ti.mode, ti.size))
    except KeyError:
        print('  ✗ 缺少 ' + n)

ctl = tarfile.open(fileobj=io.BytesIO(m['control.tar.gz']), mode='r:gz')
print('  control 成员: ' + ', '.join(ctl.getnames()))
print('  --- control 内容 ---')
print(ctl.extractfile('./control').read().decode('utf-8'))
print('  postinst 模式: %o' % ctl.getmember('./postinst').mode)

if ref:
    rtf, _ = entries(ref)
    rnames = set(rtf.getnames())
    mnames = set(names)
    missing = sorted(rnames - mnames)
    extra = sorted(mnames - rnames)
    print('  与官方包对比: 官方 %d 项 / 本地 %d 项' % (len(rnames), len(mnames)))
    print('  官方有本地无: %d 项' % len(missing))
    for n in missing[:8]:
        print('     - ' + n)
    print('  本地有官方无: %d 项' % len(extra))
    for n in extra[:8]:
        print('     + ' + n)
