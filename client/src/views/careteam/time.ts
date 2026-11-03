export function clock(t: number): string {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "12 min ago", "3 h 5 min ago" relative to simulated now. */
export function ago(t: number, now: number): string {
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}
