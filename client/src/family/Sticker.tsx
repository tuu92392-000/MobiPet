// Photo-free stickers family can send. Simple hand-drawn SVGs, 48×48 user units.
export const STICKERS = ['sunflower', 'heart', 'star', 'rainbow', 'balloon', 'sun'] as const;
export type StickerId = (typeof STICKERS)[number];

const INK = '#3D3A36';

function Art({ id }: { id: string }) {
  const s = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (id) {
    case 'sunflower':
      return (
        <>
          <path d="M24 30 V46 M24 40 Q30 36 34 38" fill="none" {...s} stroke="#4E7A4B" />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <ellipse key={i} cx={24 + Math.cos(a) * 10} cy={18 + Math.sin(a) * 10} rx="5" ry="3" transform={`rotate(${(a * 180) / Math.PI} ${24 + Math.cos(a) * 10} ${18 + Math.sin(a) * 10})`} fill="#F4D35E" {...s} strokeWidth={1.2} />;
          })}
          <circle cx="24" cy="18" r="7" fill="#8B5A2B" {...s} />
        </>
      );
    case 'heart':
      return <path d="M24 42 C10 32 4 24 8 15 C12 7 21 8 24 15 C27 8 36 7 40 15 C44 24 38 32 24 42 Z" fill="#F08B74" {...s} />;
    case 'star':
      return <path d="M24 4 L29.5 17 L43.5 18 L32.8 27.3 L36.2 41 L24 33.5 L11.8 41 L15.2 27.3 L4.5 18 L18.5 17 Z" fill="#F4D35E" {...s} />;
    case 'rainbow':
      return (
        <>
          {[['#F08B74', 20], ['#F4D35E', 15], ['#8DB89A', 10], ['#9CC8E8', 5]].map(([c, r]) => (
            <path key={c} d={`M${24 - (r as number)} 36 A${r} ${r} 0 0 1 ${24 + (r as number)} 36`} fill="none" stroke={c as string} strokeWidth="5" strokeLinecap="round" />
          ))}
          <ellipse cx="7" cy="38" rx="6" ry="4" fill="#fff" {...s} strokeWidth={1.2} />
          <ellipse cx="41" cy="38" rx="6" ry="4" fill="#fff" {...s} strokeWidth={1.2} />
        </>
      );
    case 'balloon':
      return (
        <>
          <path d="M24 32 Q20 38 25 42 Q28 45 24 47" fill="none" {...s} strokeWidth={1.5} />
          <ellipse cx="24" cy="18" rx="12" ry="14" fill="#B5A2DE" {...s} />
          <path d="M22 32 L26 32 L24 34 Z" fill="#B5A2DE" {...s} strokeWidth={1.2} />
          <ellipse cx="19" cy="12" rx="3" ry="4.5" fill="#fff" opacity="0.6" />
        </>
      );
    default:
      return (
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <path key={i} d={`M${24 + Math.cos(a) * 14} ${24 + Math.sin(a) * 14} L${24 + Math.cos(a) * 20} ${24 + Math.sin(a) * 20}`} {...s} stroke="#E0A030" strokeWidth={3} />;
          })}
          <circle cx="24" cy="24" r="10" fill="#FBD46B" {...s} />
          <path d="M20 26 Q24 29 28 26" fill="none" {...s} />
        </>
      );
  }
}

export function Sticker({ id, size = 48 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <Art id={id} />
    </svg>
  );
}
