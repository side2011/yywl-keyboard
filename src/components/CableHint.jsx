// src/components/CableHint.jsx
// 连接页的「先用 USB 线连键盘」动画提示
// 实物是顶部插线: 线缆从正上方垂直插入键盘顶部的插口
// 循环节奏 (3.6s): 线缆下移插入 -> 双环脉冲 -> 绿色勾出现 -> 复位
// 动画定义在 src/index.css (.yy-cable / .yy-ring1 / .yy-ring2 / .yy-port / .yy-ready)

import React from 'react';

const COLS = [70, 86, 102, 118, 134, 150, 166]; // 7 列按键 x
const ROWS = [62, 74, 86];                     // 3 排按键 y

export default function CableHint({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center select-none">
      <svg
        width="248"
        height="108"
        viewBox="0 0 248 108"
        fill="none"
        className="w-[248px] h-[108px]"
        aria-hidden="true"
      >
        {/* 线缆 + 接头 (整体上下移动; 线缆顶端始终伸出画布外, 不会被裁成断头) */}
        <g className="yy-cable">
          <path d="M125 -14 V28" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
          <rect x="117" y="28" width="16" height="18" rx="4" fill="#eef2f7" stroke="#94a3b8" strokeWidth="2" />
          <rect x="120" y="44" width="10" height="4" rx="1.5" fill="#cbd5e1" />
        </g>

        {/* 键盘机身 (插上时描边发光) */}
        <rect
          x="48" y="50" width="152" height="52" rx="12"
          fill="#ffffff" stroke="#c7d2fe" strokeWidth="2"
          className="yy-port"
        />

        {/* 按键 */}
        <g fill="#e0e7ff">
          {ROWS.map((y) =>
            COLS.map((x) => (
              <rect key={`${y}-${x}`} x={x} y={y} width="12" height="8" rx="2.5" />
            ))
          )}
        </g>

        {/* 顶部插口 */}
        <rect x="116" y="46" width="18" height="6" rx="2" fill="#a5b4fc" />

        {/* 插入瞬间的双环脉冲 (纯 opacity, 不涉及 transform) */}
        <circle className="yy-ring1" cx="125" cy="50" r="9" fill="none" stroke="#6366f1" strokeWidth="2" opacity="0" />
        <circle className="yy-ring2" cx="125" cy="50" r="16" fill="none" stroke="#818cf8" strokeWidth="1.5" opacity="0" />

        {/* 识别成功的小绿勾 (落在键盘右侧空白处, 不压按键) */}
        <g className="yy-ready" opacity="0">
          <circle cx="189" cy="66" r="9" fill="#22c55e" />
          <path
            d="M185 66 l3 3 l6 -6"
            stroke="#ffffff" strokeWidth="2" fill="none"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </g>
      </svg>

      {title && <p className="mt-1 text-sm font-semibold text-indigo-600">{title}</p>}
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}
