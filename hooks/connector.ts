export function linkPath(x1: number, y1: number, x2: number, y2: number): string {
  const k = Math.min(96, Math.max(24, (y2 - y1) * 0.5));
  return `M ${x1} ${y1} C ${x1} ${y1 + k}, ${x2} ${y2 - k}, ${x2} ${y2}`;
}
