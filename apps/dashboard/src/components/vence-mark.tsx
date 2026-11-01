/** Фирменный знак Vence, как в приложении: незамкнутое кольцо и геометрическая V внутри. */
export function VenceMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="vence-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD86B" />
          <stop offset="100%" stopColor="#FFB81F" />
        </linearGradient>
      </defs>
      <circle cx="512" cy="512" r="300" fill="none" stroke="url(#vence-accent)" strokeWidth="78" strokeLinecap="round" strokeDasharray="1620 265" transform="rotate(-58 512 512)" />
      <polygon points="397,387 463,387 512,541 561,387 627,387 549,637 475,637" fill="url(#vence-accent)" />
    </svg>
  );
}
