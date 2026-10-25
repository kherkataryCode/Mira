/**
 * Original generative "poster" artwork: deterministic abstract shapes from a seed.
 * Several palettes and compositions so cards don't all look alike. Decorative only (aria-hidden).
 */
const PALETTES = [
  // editorial (original)
  ['#4F7755', '#DECDB6', '#D63229', '#2E3A2F'],
  // midnight cyber
  ['#3B5BDB', '#7FDBFF', '#F06595', '#0B1230'],
  // lagoon
  ['#0CA678', '#A5F3E1', '#FFD43B', '#083B3A'],
  // grape soda
  ['#7048E8', '#E5DBFF', '#FF922B', '#1E1238'],
  // sunset
  ['#F76707', '#FFE8CC', '#E64980', '#3A1020'],
  // terminal
  ['#40C057', '#D3F9D8', '#15AABF', '#06140C'],
  // sand & sky
  ['#4DABF7', '#D4BC9E', '#D63229', '#1C2733'],
  // bubblegum
  ['#F783AC', '#FFF0F6', '#5C7CFA', '#2B1A2E'],
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
  const p = PALETTES[Math.abs(seed) % PALETTES.length]!;
  const w = variant === 'wide' ? 400 : 200;
  const h = 200;
  const style = Math.abs(seed * 7 + 3) % 4;

  if (style === 1) {
    // Concentric rings + orbit dots
    const cx = w * (0.55 + r() * 0.3);
    const cy = h * (0.45 + r() * 0.2);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
        <rect width={w} height={h} fill={p[3]} />
        {[1.1, 0.85, 0.6, 0.35].map((k, i) => (
          <circle key={k} cx={cx} cy={cy} r={h * k * 0.55} fill={i % 2 ? p[3] : p[i === 0 ? 0 : 1]} opacity={i === 0 ? 0.9 : 1} />
        ))}
        <circle cx={cx} cy={cy} r={h * 0.09} fill={p[2]} />
        <circle cx={w * (0.12 + r() * 0.2)} cy={h * (0.25 + r() * 0.5)} r={h * 0.12} fill={p[2]} />
        <circle cx={w * (0.3 + r() * 0.1)} cy={h * 0.82} r={h * 0.05} fill={p[1]} />
      </svg>
    );
  }
  if (style === 2) {
    // Circuit grid
    const cells = variant === 'wide' ? 10 : 5;
    const size = w / cells;
    const nodes = Array.from({ length: cells * 5 }, (_, i) => ({ x: (i % cells) * size + size / 2, y: Math.floor(i / cells) * 40 + 20, on: r() > 0.62, c: r() }));
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
        <rect width={w} height={h} fill={p[3]} />
        {nodes.map((n, i) =>
          n.on ? <path key={`l${i}`} d={`M ${n.x} ${n.y} h ${size * (n.c > 0.5 ? 1 : 0)} v ${n.c > 0.5 ? 0 : 40}`} stroke={p[0]} strokeWidth="3" fill="none" strokeLinecap="round" /> : null,
        )}
        {nodes.map((n, i) => (n.on ? <circle key={`n${i}`} cx={n.x} cy={n.y} r={n.c > 0.85 ? 7 : 4} fill={n.c > 0.85 ? p[2] : p[1]} /> : null))}
        <rect x={w * 0.62} y={h * 0.3} width={w * 0.22} height={h * 0.4} rx="14" fill={p[2]} opacity="0.92" />
        <rect x={w * 0.66} y={h * 0.4} width={w * 0.14} height={h * 0.2} rx="6" fill={p[3]} />
      </svg>
    );
  }
  if (style === 3) {
    // Layered waves
    const wave = (y: number, amp: number) =>
      `M 0 ${y} C ${w * 0.25} ${y - amp}, ${w * 0.5} ${y + amp}, ${w * 0.75} ${y - amp * 0.6} S ${w} ${y + amp * 0.3}, ${w} ${y} L ${w} ${h} L 0 ${h} Z`;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
        <rect width={w} height={h} fill={p[3]} />
        <circle cx={w * (0.7 + r() * 0.2)} cy={h * 0.3} r={h * 0.18} fill={p[2]} />
        <path d={wave(h * 0.5, 30 + r() * 20)} fill={p[0]} />
        <path d={wave(h * 0.68, 22 + r() * 20)} fill={p[1]} opacity="0.95" />
        <path d={wave(h * 0.85, 16)} fill={p[3]} opacity="0.55" />
      </svg>
    );
  }
  // Editorial blobs (original composition)
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

/** Mira's little face: a gradient orb with blinking eyes. Animations are CSS (respect reduced motion). */
export function MiraFace({ size = 56, mood = 'happy' }: { size?: number; mood?: 'happy' | 'curious' | 'sly' }) {
  const mouth = mood === 'curious' ? 'M 26 41 q 6 -2 12 0' : mood === 'sly' ? 'M 24 40 q 9 6 16 -2' : 'M 23 39 q 9 8 18 0';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="mira-face">
      <defs>
        <radialGradient id="mira-g" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FFB4A8" />
          <stop offset="45%" stopColor="#F06595" />
          <stop offset="100%" stopColor="#7048E8" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="url(#mira-g)" />
      <ellipse cx="20" cy="17" rx="7" ry="4" fill="#fff" opacity="0.35" />
      <g className="mira-eyes">
        <ellipse cx="23" cy="29" rx="3.6" ry="4.6" fill="#1E1238" />
        <ellipse cx="41" cy="29" rx="3.6" ry="4.6" fill="#1E1238" />
        <circle cx="24.3" cy="27.4" r="1.2" fill="#fff" />
        <circle cx="42.3" cy="27.4" r="1.2" fill="#fff" />
      </g>
      <circle cx="16" cy="38" r="3.4" fill="#FF8FA3" opacity="0.7" />
      <circle cx="48" cy="38" r="3.4" fill="#FF8FA3" opacity="0.7" />
      <path d={mouth} stroke="#1E1238" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
