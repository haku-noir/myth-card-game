interface Props {
  size?: 'sm' | 'xs'
  onClick?: () => void
  label?: string
}

/** カード裏面(相手の手札・伏せカード用) */
export default function CardBack({ size = 'sm', onClick, label }: Props) {
  const sizeClass = size === 'sm' ? 'w-28 h-40' : 'w-16 h-24'
  return (
    <div
      onClick={onClick}
      className={`${sizeClass} flex items-center justify-center rounded-lg border-2 border-indigo-400/40 bg-gradient-to-br from-indigo-900 to-slate-900 shadow ${onClick ? 'cursor-pointer hover:scale-105' : ''}`}
    >
      <span className="text-2xl opacity-60">🎴</span>
      {label && <span className="absolute text-[10px] text-slate-300">{label}</span>}
    </div>
  )
}
