export function DownloadRig({ active = false }: { active?: boolean }) {
  return (
    <svg
      className={active ? "dl-rig is-active" : "dl-rig"}
      viewBox="0 0 220 180"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="dl-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path
        d="M40 128 L110 156 L180 128 L110 100 Z"
        fill="#0b1220"
        stroke="url(#dl-glow)"
        strokeWidth="1.2"
      />
      <path
        d="M48 118 L110 142 L172 118 L110 94 Z"
        fill="#101826"
        stroke="#3b82f6"
        strokeOpacity="0.45"
      />
      <g className="dl-block">
        <path d="M86 62 L110 74 L134 62 L110 50 Z" fill="#152033" stroke="#8b5cf6" />
        <path d="M86 62 L86 86 L110 98 L110 74 Z" fill="#0d1522" stroke="#3b82f6" strokeOpacity="0.5" />
        <path d="M134 62 L134 86 L110 98 L110 74 Z" fill="#1a2440" stroke="#22d3ee" strokeOpacity="0.4" />
      </g>
      <path
        className="dl-arrow"
        d="M110 18 L110 44 M100 34 L110 46 L120 34"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EmptyGlyph() {
  return (
    <svg className="empty-glyph" viewBox="0 0 120 96" fill="none" aria-hidden>
      <path
        d="M20 62 L60 82 L100 62 L60 42 Z"
        stroke="#3b82f6"
        strokeOpacity="0.55"
      />
      <path
        d="M36 40 L60 52 L84 40 L60 28 Z"
        fill="#101826"
        stroke="#8b5cf6"
        strokeOpacity="0.7"
      />
      <circle cx="60" cy="40" r="3" fill="#22d3ee" />
    </svg>
  );
}

export function ModelMark({ seed }: { seed: string }) {
  const hue = [...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 60;
  const id = `mk-${[...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)}`;
  return (
    <svg className="model-mark" viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${190 + hue} 90% 62%)`} />
          <stop offset="55%" stopColor={`hsl(${230 + hue} 88% 66%)`} />
          <stop offset="100%" stopColor={`hsl(${280 + hue} 80% 68%)`} />
        </linearGradient>
        <radialGradient id={`${id}-r`} cx="32%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#1a2740" />
          <stop offset="100%" stopColor="#07090e" />
        </radialGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${id}-r)`} />
      <rect
        x="1.2"
        y="1.2"
        width="45.6"
        height="45.6"
        rx="12"
        fill="none"
        stroke={`url(#${id}-g)`}
        strokeOpacity="0.7"
      />
      <path
        d="M10 31 L24 12 L38 31 H10Z"
        fill="none"
        stroke={`url(#${id}-g)`}
        strokeWidth="1.6"
      />
      <circle cx="24" cy="26" r="3.2" fill={`url(#${id}-g)`} />
    </svg>
  );
}
