import React from 'react';
import { useLang } from '../context/LanguageContext.jsx';

// 通用二次确认弹窗（防止误点危险操作，比如"把当前层复制到全部层"）
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  danger = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useLang();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-bold text-gray-800 mb-2">{title}</div>
        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{message}</div>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold rounded-lg border-2 border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
          >
            {cancelText || t('取消')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold rounded-lg text-white cursor-pointer ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {confirmText || t('确定')}
          </button>
        </div>
      </div>
    </div>
  );
}
