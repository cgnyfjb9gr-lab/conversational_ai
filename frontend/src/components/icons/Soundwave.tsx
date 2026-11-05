import type { SVGProps } from "react";

/** Alfred glyph (Figma "AI / Glyph / soundwave"): six rounded bars in the current text color. */
const bars: [x: number, top: number, bottom: number][] = [
  [1, 9, 14],
  [5, 5, 18],
  [9, 2, 22],
  [13, 7, 16],
  [17, 4, 19],
  [21, 9, 14],
];

export function Soundwave(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      {bars.map(([x, top, bottom]) => (
        <rect key={x} x={x} y={top} width={2} height={bottom - top} rx={1} />
      ))}
    </svg>
  );
}
