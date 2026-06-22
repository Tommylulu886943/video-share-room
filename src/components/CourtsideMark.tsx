/**
 * 場邊 Courtside mark: a sideline bar beside a play triangle — "watching the
 * play from courtside". Uses currentColor so it inherits the tile's colour.
 */
export function CourtsideMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="4.6" y="6" width="2.6" height="12" rx="1.3" fill="currentColor" />
      <path
        d="M10.6 6.7 L19 12 L10.6 17.3 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
