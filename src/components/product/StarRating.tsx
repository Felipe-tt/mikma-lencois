interface Props {
  value: number; // 0-5, aceita decimal para média
  size?: number;
  className?: string;
}

export function StarRating({ value, size = 14, className = '' }: Props) {
  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0 text-mist" fill="currentColor">
              <path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg width={size} height={size} viewBox="0 0 24 24" className="text-clay" fill="currentColor">
                <path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z" />
              </svg>
            </span>
          </span>
        );
      })}
    </div>
  );
}
