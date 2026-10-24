/**
 * Original generative "poster" artwork: deterministic abstract shapes from a seed,
 * in the editorial palette. Decorative only (aria-hidden).
 */
const PALETTES = [
  ['#4F7755', '#DECDB6', '#D63229', '#2E3A2F'],
  ['#7E886E', '#D4BC9E', '#D63229', '#1F241E'],
  ['#D4BC9E', '#4F7755', '#D63229', '#444335'],
  ['#444335', '#DECDB6', '#D63229', '#7E886E'],
];

function rng(seed: number) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function Art({ seed = 1, className = '', variant = 'wide' }: { seed?: number; className?: string; variant?: 'wide' | 'square' }) {
  const r = rng(seed + 7);
  const p = PALETTES[seed % PALETTES.length]!;
  const w = variant === 'wide' ? 400 : 200;
  const h = 200;
  const cx1 = w * (0.45 + r() * 0.3);
  const cy1 = h * (0.3 + r() * 0.4);
  const big = h * (0.55 + r() * 0.25);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <rect width={w} height={h} fill={p[3]} />
      <path d={`M ${w * 0.1} ${h} Q ${w * 0.25} ${h * 0.1} ${w * 0.62} ${h * 0.35} T ${w} ${h * 0.15} L ${w} ${h} Z`} fill={p[0]} />
      <circle cx={cx1} cy={cy1} r={big / 2} fill={p[1]} />
      <path
        d={`M ${w * 0.58} ${h * 1.05} C ${w * 0.62} ${h * 0.55}, ${w * 0.9} ${h * 0.45}, ${w * 1.02} ${h * 0.62} L ${w} ${h} Z`}
        fill={p[2]}
      />
      <ellipse cx={w * (0.18 + r() * 0.2)} cy={h * (0.2 + r() * 0.2)} rx={h * 0.16} ry={h * 0.28} transform={`rotate(${-30 + r() * 60} ${w * 0.25} ${h * 0.3})`} fill={p[0]} opacity="0.85" />
      <circle cx={w * (0.82 + r() * 0.1)} cy={h * (0.18 + r() * 0.1)} r={h * 0.07} fill={p[2]} />
    </svg>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" fill="#4F7755" />
      <circle cx="22" cy="10" r="6.5" fill="#D4BC9E" />
      <circle cx="10" cy="22" r="6.5" fill="#D63229" />
      <circle cx="22" cy="22" r="6.5" fill="#DECDB6" />
    </svg>
  );
}
