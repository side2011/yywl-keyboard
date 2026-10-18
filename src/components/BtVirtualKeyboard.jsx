// src/components/BtVirtualKeyboard.jsx
// 蓝牙无线款专用虚拟键盘 — 完全独立组件, 不依赖 NewProtoConfigurator / hid-constants
// (与其他协议模块隔离, 避免相互改动影响)

// ---- 虚拟键盘布局 (蓝牙模块独立副本) ----
const mainRows = [
  [{ label: '空', value: 0x00, wide: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 13}`, value: 0x68 + i, wide: 1 }))],
  [{ label: 'Esc', value: 0x29, wide: 1 }, ...Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, value: 0x3A + i, wide: 1 }))],
  [
    { label: '`~', value: 0x35, wide: 1 }, { label: '1!', value: 0x1E, wide: 1 }, { label: '2@', value: 0x1F, wide: 1 },
    { label: '3#', value: 0x20, wide: 1 }, { label: '4$', value: 0x21, wide: 1 }, { label: '5%', value: 0x22, wide: 1 },
    { label: '6^', value: 0x23, wide: 1 }, { label: '7&', value: 0x24, wide: 1 }, { label: '8*', value: 0x25, wide: 1 },
    { label: '9(', value: 0x26, wide: 1 }, { label: '0)', value: 0x27, wide: 1 }, { label: '-_', value: 0x2D, wide: 1 },
    { label: '=+', value: 0x2E, wide: 1 }, { label: 'Bksp', value: 0x2A, wide: 2 }
  ],
  [
    { label: 'Tab', value: 0x2B, wide: 1.5 }, { label: 'Q', value: 0x14, wide: 1 }, { label: 'W', value: 0x1A, wide: 1 },
    { label: 'E', value: 0x08, wide: 1 }, { label: 'R', value: 0x15, wide: 1 }, { label: 'T', value: 0x17, wide: 1 },
    { label: 'Y', value: 0x1C, wide: 1 }, { label: 'U', value: 0x18, wide: 1 }, { label: 'I', value: 0x0C, wide: 1 },
    { label: 'O', value: 0x12, wide: 1 }, { label: 'P', value: 0x13, wide: 1 }, { label: '[{', value: 0x2F, wide: 1 },
    { label: ']}', value: 0x30, wide: 1 }, { label: '\\|', value: 0x31, wide: 1.5 }
  ],
  [
    { label: 'Caps', value: 0x39, wide: 1.8 }, { label: 'A', value: 0x04, wide: 1 }, { label: 'S', value: 0x16, wide: 1 },
    { label: 'D', value: 0x07, wide: 1 }, { label: 'F', value: 0x09, wide: 1 }, { label: 'G', value: 0x0A, wide: 1 },
    { label: 'H', value: 0x0B, wide: 1 }, { label: 'J', value: 0x0D, wide: 1 }, { label: 'K', value: 0x0E, wide: 1 },
    { label: 'L', value: 0x0F, wide: 1 }, { label: ';:', value: 0x33, wide: 1 }, { label: "'\"", value: 0x34, wide: 1 },
    { label: 'Enter', value: 0x28, wide: 2.2 }
  ],
  [
    { label: 'Z', value: 0x1D, wide: 1 }, { label: 'X', value: 0x1B, wide: 1 },
    { label: 'C', value: 0x06, wide: 1 }, { label: 'V', value: 0x19, wide: 1 }, { label: 'B', value: 0x05, wide: 1 },
    { label: 'N', value: 0x11, wide: 1 }, { label: 'M', value: 0x10, wide: 1 }, { label: ',<', value: 0x36, wide: 1 },
    { label: '.>', value: 0x37, wide: 1 }, { label: '/?', value: 0x38, wide: 1 }
  ],
  [
    { label: 'Space', value: 0x2C, wide: 6 },
    { label: 'Menu', value: 0x65, wide: 1 }
  ]
];
const functionGrid = [
  { label: 'PrtSc', value: 0x46 }, { label: 'ScrLk', value: 0x47 }, { label: 'Pause', value: 0x48 },
  { label: 'Insert', value: 0x49 }, { label: 'Delete', value: 0x4C }, { label: 'Home', value: 0x4A },
  { label: 'End', value: 0x4D }, { label: 'PgUp', value: 0x4B }, { label: 'PgDn', value: 0x4E },
];
const numpadKeys = [
  { label: 'Num', value: 0x53, row: 0, col: 0 }, { label: '/', value: 0x54, row: 0, col: 1 },
  { label: '*', value: 0x55, row: 0, col: 2 }, { label: '-', value: 0x56, row: 0, col: 3 },
  { label: '7', value: 0x5F, row: 1, col: 0 }, { label: '8', value: 0x60, row: 1, col: 1 },
  { label: '9', value: 0x61, row: 1, col: 2 }, { label: '+', value: 0x57, row: 1, col: 3, rowspan: 2 },
  { label: '4', value: 0x5C, row: 2, col: 0 }, { label: '5', value: 0x5D, row: 2, col: 1 },
  { label: '6', value: 0x5E, row: 2, col: 2 },
  { label: '1', value: 0x59, row: 3, col: 0 }, { label: '2', value: 0x5A, row: 3, col: 1 },
  { label: '3', value: 0x5B, row: 3, col: 2 }, { label: 'Enter', value: 0x58, row: 3, col: 3, rowspan: 2 },
  { label: '0', value: 0x62, row: 4, col: 0, colspan: 2 }, { label: '.', value: 0x63, row: 4, col: 2 },
];

const getWidthClass = (wide) => {
  if (wide >= 6) return 'flex-1';
  if (wide >= 2.2) return 'w-28';
  if (wide >= 2) return 'w-24';
  if (wide >= 1.8) return 'w-20';
  if (wide >= 1.5) return 'w-16';
  return 'w-14';
};

const keyBase = 'h-11 px-1.5 text-sm border rounded-lg transition-all flex items-center justify-center cursor-pointer select-none font-medium';
const keyNormal = `${keyBase} bg-slate-100 text-slate-700 border-slate-200 hover:bg-indigo-100 hover:text-indigo-700 hover:border-indigo-300`;
const keyActive = `${keyBase} bg-indigo-500 text-white border-indigo-500 shadow`;

export default function BtVirtualKeyboard({ onSelect, selectedCode, t }) {
  const handleKeyClick = (label, value) => { if (value >= 0xE0 && value <= 0xE7) return; onSelect(value); };
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex flex-row gap-3 min-w-[1100px]">
        <div className="flex-shrink-0">
          {mainRows.map((row, ri) => (
            <div key={ri} className="flex gap-1 mb-2">
              {row.map((key, ki) => (
                <button key={ki} className={`${selectedCode === key.value ? keyActive : keyNormal} ${getWidthClass(key.wide)}`}
                  onClick={() => handleKeyClick(key.label, key.value)}>
                  <span>{key.value === 0x00 ? t('空') : key.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-row gap-3">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1.5">
              {functionGrid.map((key, idx) => (
                <button key={idx} className={`${selectedCode === key.value ? keyActive : keyNormal} w-16`}
                  onClick={() => handleKeyClick(key.label, key.value)}>
                  <span>{key.label}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <button className={`${selectedCode === 0x52 ? keyActive : keyNormal} w-12`} onClick={() => handleKeyClick('↑', 0x52)}>↑</button>
              <div className="flex gap-1.5">
                <button className={`${selectedCode === 0x50 ? keyActive : keyNormal} w-11`} onClick={() => handleKeyClick('←', 0x50)}>←</button>
                <button className={`${selectedCode === 0x51 ? keyActive : keyNormal} w-11`} onClick={() => handleKeyClick('↓', 0x51)}>↓</button>
                <button className={`${selectedCode === 0x4F ? keyActive : keyNormal} w-11`} onClick={() => handleKeyClick('→', 0x4F)}>→</button>
              </div>
            </div>
          </div>
          {/* 数字区：显式网格坐标定位（4 列 × 5 行），行高与主键盘一致（h-11 = 2.75rem）
              跨行键用 height:100% 自动填满「行 + 间距」；不再用 -mt 挪位置、也不写死高度
              （蓝牙款曾漏改，导致 +/Enter 错位、第一行被顶出可视区） */}
          <div
            className="grid gap-1.5 content-start self-start"
            style={{ gridTemplateColumns: 'repeat(4, 3.5rem)', gridAutoRows: '2.75rem' }}
          >
            {numpadKeys.map((key) => (
              <button key={key.value} className={selectedCode === key.value ? keyActive : keyNormal}
                style={{
                  width: '100%',
                  height: '100%',
                  gridColumn: `${key.col + 1} / span ${key.colspan || 1}`,
                  gridRow: `${key.row + 1} / span ${key.rowspan || 1}`,
                }}
                onClick={() => handleKeyClick(key.label, key.value)}>
                <span>{key.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
