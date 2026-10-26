/** Фирменный знак Zen, как в приложении: незамкнутый круг энсо и геометрическая Z внутри. */
export function ZenMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="zen-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD86B" />
          <stop offset="100%" stopColor="#FFB81F" />
        </linearGradient>
      </defs>
      <circle cx="512" cy="512" r="300" fill="none" stroke="url(#zen-accent)" strokeWidth="78" strokeLinecap="round" strokeDasharray="1620 265" transform="rotate(-58 512 512)" />
      <polygon points="397,387 627,387 627,443 547,581 627,581 627,637 397,637 397,581 477,443 397,443" fill="url(#zen-accent)" />
    </svg>
  );
}
