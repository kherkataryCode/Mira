import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/** Same deterministic poster artwork as the web app (apps/web/components/Art.tsx). */
const PALETTES = [
  ['#4F7755', '#DECDB6', '#D63229', '#2E3A2F'],
  ['#7E886E', '#D4BC9E', '#D63229', '#1F241E'],
  ['#D4BC9E', '#4F7755', '#D63229', '#444335'],
  ['#444335', '#DECDB6', '#D63229', '#7E886E'],
] as const;

function rng(seed: number) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function Art({ seed = 1, height = 160, wide = true }: { seed?: number; height?: number; wide?: boolean }) {
  const r = rng(seed + 7);
  const p = PALETTES[seed % PALETTES.length]!;
  const w = wide ? 400 : 200;
  const h = 200;
  const cx1 = w * (0.45 + r() * 0.3);
  const cy1 = h * (0.3 + r() * 0.4);
  const big = h * (0.55 + r() * 0.25);
  const ex = w * (0.18 + r() * 0.2);
  const ey = h * (0.2 + r() * 0.2);
  const rot = -30 + r() * 60;
  const dx = w * (0.82 + r() * 0.1);
  const dy = h * (0.18 + r() * 0.1);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" accessible={false}>
      <Rect width={w} height={h} fill={p[3]} />
      <Path d={`M ${w * 0.1} ${h} Q ${w * 0.25} ${h * 0.1} ${w * 0.62} ${h * 0.35} T ${w} ${h * 0.15} L ${w} ${h} Z`} fill={p[0]} />
      <Circle cx={cx1} cy={cy1} r={big / 2} fill={p[1]} />
      <Path d={`M ${w * 0.58} ${h * 1.05} C ${w * 0.62} ${h * 0.55}, ${w * 0.9} ${h * 0.45}, ${w * 1.02} ${h * 0.62} L ${w} ${h} Z`} fill={p[2]} />
      <Ellipse cx={ex} cy={ey} rx={h * 0.16} ry={h * 0.28} rotation={rot} origin={`${w * 0.25}, ${h * 0.3}`} fill={p[0]} opacity={0.85} />
      <Circle cx={dx} cy={dy} r={h * 0.07} fill={p[2]} />
    </Svg>
  );
}
