// Small hand-drawn keepsake icons, 24×24 user units.
import type { KeepsakeId } from '@shared/progression';

const INK = '#3D3A36';

function Shape({ id }: { id: KeepsakeId }) {
  const s = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  switch (id) {
    case 'leaf':
      return (
        <>
          <path d="M5 19 C5 9 11 4 20 4 C20 13 15 19 5 19 Z" fill="#8DB56F" {...s} />
          <path d="M6 18 L16 8" fill="none" {...s} />
        </>
      );
    case 'snail-shell':
      return (
        <>
          <circle cx="12" cy="12" r="8" fill="#E9B872" {...s} />
          <path d="M12 12 m0 -1.5 a1.5 1.5 0 1 1 -1.5 1.5 a3.5 3.5 0 1 1 3.5 3.5 a5.5 5.5 0 1 1 -5.5 -5.5" fill="none" {...s} />
        </>
      );
    case 'seed':
      return <ellipse cx="12" cy="12" rx="5" ry="8" fill="#B08455" transform="rotate(25 12 12)" {...s} />;
    case 'feather':
      return (
        <>
          <path d="M18 3 C8 5 5 13 6 21 C13 19 19 12 18 3 Z" fill="#BCD8F2" {...s} />
          <path d="M6 21 L15 8" fill="none" {...s} />
        </>
      );
    case 'clover':
      return (
        <>
          <path d="M12 13 Q13 18 16 21" fill="none" {...s} />
          <circle cx="12" cy="7" r="4" fill="#7FA36B" {...s} />
          <circle cx="7.5" cy="12" r="4" fill="#7FA36B" {...s} />
          <circle cx="16.5" cy="12" r="4" fill="#7FA36B" {...s} />
        </>
      );
    case 'butterfly':
      return (
        <>
          <ellipse cx="7" cy="9" rx="5" ry="5" fill="#F6A08A" {...s} />
          <ellipse cx="17" cy="9" rx="5" ry="5" fill="#F6A08A" {...s} />
          <ellipse cx="8" cy="17" rx="3.5" ry="3.5" fill="#F4D35E" {...s} />
          <ellipse cx="16" cy="17" rx="3.5" ry="3.5" fill="#F4D35E" {...s} />
          <path d="M12 6 V20" fill="none" {...s} strokeWidth={2.2} />
        </>
      );
    case 'shell':
      return (
        <>
          <path d="M3 15 C3 7 21 7 21 15 L14 20 H10 Z" fill="#F6C9A8" {...s} />
          <path d="M12 9 V20 M8 10 L10.5 20 M16 10 L13.5 20" fill="none" {...s} strokeWidth={1.1} />
        </>
      );
    case 'pebble':
      return (
        <>
          <ellipse cx="12" cy="13" rx="9" ry="6.5" fill="#B9B3AA" {...s} />
          <ellipse cx="9" cy="11" rx="2.5" ry="1.2" fill="#fff" opacity="0.6" />
        </>
      );
    case 'reed':
      return (
        <>
          <path d="M10 22 V8 M14 22 V4 M6 22 Q8 15 7 11" fill="none" {...s} />
          <rect x="12.2" y="4" width="3.6" height="8" rx="1.8" fill="#8B6B43" {...s} />
        </>
      );
    case 'star':
      return <path d="M12 2.5 L14.8 8.8 L21.5 9.3 L16.4 13.7 L18 20.3 L12 16.7 L6 20.3 L7.6 13.7 L2.5 9.3 L9.2 8.8 Z" fill="#F4D35E" {...s} />;
    case 'pinecone':
      return (
        <>
          <ellipse cx="12" cy="13" rx="6" ry="8" fill="#9C6B3C" {...s} />
          <path d="M7 10 Q12 13 17 10 M6.5 14 Q12 17 17.5 14 M8 18 Q12 20 16 18" fill="none" {...s} strokeWidth={1.1} />
          <path d="M12 5 V2" fill="none" {...s} />
        </>
      );
    case 'kite':
      return (
        <>
          <path d="M12 2 L19 10 L12 17 L5 10 Z" fill="#F08B74" {...s} />
          <path d="M12 17 Q10 19 12 20 Q14 21 12 23" fill="none" {...s} />
          <path d="M5 10 H19 M12 2 V17" fill="none" {...s} strokeWidth={1} />
        </>
      );
    case 'key':
      return (
        <>
          <circle cx="7.5" cy="12" r="4.5" fill="#F4D35E" {...s} />
          <circle cx="7.5" cy="12" r="1.6" fill="#fff" {...s} strokeWidth={1} />
          <path d="M12 12 H21 M18 12 V15.5 M21 12 V15" fill="none" {...s} strokeWidth={2} />
        </>
      );
  }
}

/** Standalone icon, or nested in another SVG when `x`/`y` are given. */
export function KeepsakeIcon({ id, size = 24, x, y }: { id: KeepsakeId; size?: number; x?: number; y?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} x={x} y={y} aria-hidden="true" focusable="false">
      <Shape id={id} />
    </svg>
  );
}
