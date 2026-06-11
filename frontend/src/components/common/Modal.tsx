import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /**
   * trueの場合、枠外クリックで閉じる代わりに「一時非表示」になり、
   * フローティングボタンで再表示できる(盤面を確認したい時用)。
   */
  peekable?: boolean
}

export default function Modal({ open, onClose, children, peekable }: Props) {
  const [hidden, setHidden] = useState(false)

  // 新しく開いた時は必ず表示状態に戻す
  useEffect(() => {
    if (open) setHidden(false)
  }, [open])

  if (!open) return null

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="fixed bottom-4 right-4 z-50 animate-pulse rounded-lg bg-indigo-600 px-5 py-3 font-semibold shadow-2xl ring-2 ring-indigo-300 hover:bg-indigo-500"
      >
        📋 ダイアログを再表示
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => (peekable ? setHidden(true) : onClose())}
    >
      <div
        className="max-h-[90vh] overflow-y-auto rounded-xl bg-slate-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        {peekable && (
          <p className="mt-3 text-center text-xs text-slate-500">
            枠の外をクリックすると盤面を確認できます
          </p>
        )}
      </div>
    </div>
  )
}
