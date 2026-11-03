// Original companion characters drawn as layered SVG: body, eyes, mouth, accessory slot.
import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import type { AccessoryId, Palette, PetMood, Species } from '@shared/types';

export const PALETTES: Record<Palette, { body: string; shade: string; belly: string; line: string }> = {
  0: { body: '#F6C9A8', shade: '#E9A77F', belly: '#FCE6D4', line: '#7A3F22' },
  1: { body: '#B9D8B5', shade: '#8FBF8A', belly: '#E3F0DF', line: '#345C36' },
  2: { body: '#BCD8F2', shade: '#8DB8E3', belly: '#E5F0FB', line: '#244F7A' },
  3: { body: '#D6C8EE', shade: '#B5A2DE', belly: '#EFE9F8', line: '#4E3A7D' },
};

/** The MobiPet logo in the header: sage darkened to 3.25:1 against the white header, with a dark green outline. */
export const LOGO_COLORS = { body: '#649B70', shade: '#4F7D59', belly: '#A8C7AF', line: '#1F3D28' };

export type PetAction = 'idle' | 'bounce' | 'celebrate';

interface Anchors {
  face: [number, number];
  eyeGap: number;
  headTop: number;
  neck: [number, number, number]; // x, y, width
  pack: [number, number];
  stickX: number;
}

const ANCHORS: Record<Species, Anchors> = {
  nimbus: { face: [100, 118], eyeGap: 17, headTop: 62, neck: [100, 166, 70], pack: [44, 132], stickX: 168 },
  mossback: { face: [100, 138], eyeGap: 12, headTop: 112, neck: [100, 168, 50], pack: [38, 120], stickX: 166 },
  glimkit: { face: [100, 92], eyeGap: 14, headTop: 60, neck: [100, 128, 56], pack: [50, 140], stickX: 36 },
};

const STAGE_SCALE = [0.74, 0.84, 0.93, 1];

interface Props {
  species: Species;
  palette: Palette;
  mood: PetMood;
  stage?: 1 | 2 | 3 | 4;
  accessory?: AccessoryId | null;
  action?: PetAction;
  /** Sync the body to a 4-second breathing guide (strongest on Nimbus). */
  breathing?: boolean;
  label: string;
  className?: string;
  /** Position and size when nested inside another SVG (user units). */
  box?: { x: number; y: number; size: number };
  /** Overrides the palette's colors (used only by the header logo). */
  colors?: Colors;
}

export function PetSvg({ species, palette, mood, stage = 2, accessory = null, action = 'idle', breathing = false, label, className, box, colors }: Props) {
  const reduce = useReducedMotion();
  const c = colors ?? PALETTES[palette];
  const a = ANCHORS[species];
  const asleep = mood === 'sleepy';
  const s = STAGE_SCALE[stage - 1];

  const breathe = species === 'nimbus' ? (breathing ? 1.09 : 1.035) : breathing ? 1.04 : 1.02;
  const bodyAnim: TargetAndTransition = reduce
    ? {}
    : // With the breathing guide: 4 s in, 4 s out. Otherwise a calm idle rhythm.
      { scale: [1, breathe, 1], transition: { duration: breathing ? 8 : asleep ? 5 : 4, repeat: Infinity, ease: 'easeInOut' } };

  const actionAnim: TargetAndTransition = reduce
    ? {}
    : action === 'bounce'
      ? { y: [0, -22, 0, -8, 0], transition: { duration: 0.9, ease: 'easeOut' } }
      : action === 'celebrate'
        ? { y: [0, -30, 0, -30, 0], rotate: [0, -6, 6, -4, 0], transition: { duration: 1.6, ease: 'easeOut' } }
        : { y: 0, rotate: 0 };

  return (
    <svg
      viewBox="14 30 172 166"
      className={className}
      {...(box ? { x: box.x, y: box.y, width: box.size, height: box.size } : {})}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: false })}
    >
      <ellipse cx="100" cy="188" rx={58 * s} ry="7" fill="#000" opacity="0.08" />
      <g transform={`translate(100 190) scale(${s}) translate(-100 -190)`}>
        <motion.g animate={actionAnim} style={{ originX: 0.5, originY: 1 }}>
          <motion.g animate={bodyAnim} style={{ originX: 0.5, originY: 1 }}>
            {accessory === 'backpack' && <Backpack x={a.pack[0]} y={a.pack[1]} line={c.line} />}
            {species === 'nimbus' && <NimbusBody c={c} stage={stage} />}
            {species === 'mossback' && <MossbackBody c={c} stage={stage} />}
            {species === 'glimkit' && <GlimkitBody c={c} stage={stage} reduce={!!reduce} />}
            <Face a={a} line={c.line} mood={mood} reduce={!!reduce} />
            {accessory === 'scarf' && <Scarf x={a.neck[0]} y={a.neck[1]} w={a.neck[2]} line={c.line} />}
            {accessory === 'hat' && <Hat x={a.face[0]} top={a.headTop} line={c.line} />}
          </motion.g>
          {accessory === 'stick' && <Stick x={a.stickX} line={c.line} />}
        </motion.g>
      </g>
      {asleep && !reduce && <Zzz x={a.face[0] + 40} y={a.headTop} />}
    </svg>
  );
}

type Colors = (typeof PALETTES)[Palette];

function NimbusBody({ c, stage }: { c: Colors; stage: number }) {
  const puffs: [number, number, number][] = [
    [60, 128, 32], [86, 98, 36], [120, 94, 34], [144, 126, 30], [100, 142, 44],
  ];
  return (
    <g>
      {/* Outline pass then fill pass gives one clean cloud silhouette. */}
      {puffs.map(([x, y, r]) => <circle key={`o${x}`} cx={x} cy={y} r={r} fill={c.line} stroke={c.line} strokeWidth="6" />)}
      {puffs.map(([x, y, r]) => <circle key={`f${x}`} cx={x} cy={y} r={r} fill={c.body} />)}
      <ellipse cx="100" cy="146" rx="32" ry="22" fill={c.belly} />
      <circle cx="84" cy="84" r="9" fill="#fff" opacity="0.45" />
      {stage >= 3 && <circle cx="160" cy="80" r="7" fill={c.body} stroke={c.line} strokeWidth="2.5" />}
      {stage >= 4 && <circle cx="40" cy="92" r="5" fill={c.body} stroke={c.line} strokeWidth="2.5" />}
    </g>
  );
}

function MossbackBody({ c, stage }: { c: Colors; stage: number }) {
  const moss: [number, number, number][] = [[80, 86, 10], [98, 80, 12], [117, 84, 10]];
  if (stage >= 2) moss.push([132, 92, 8], [66, 94, 7]);
  return (
    <g>
      <ellipse cx="58" cy="176" rx="15" ry="10" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="142" cy="176" rx="15" ry="10" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="100" cy="126" rx="66" ry="50" fill={c.shade} stroke={c.line} strokeWidth="3" />
      <g fill={c.body} opacity="0.65">
        <ellipse cx="74" cy="114" rx="16" ry="11" />
        <ellipse cx="110" cy="106" rx="18" ry="11" />
        <ellipse cx="138" cy="122" rx="14" ry="11" />
        <ellipse cx="62" cy="138" rx="10" ry="8" />
      </g>
      {moss.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#7FA36B" stroke="#2F4F27" strokeWidth="2.5" />)}
      {stage >= 3 && <Flower x={108} y={76} />}
      {stage >= 4 && <Flower x={76} y={80} />}
      <circle cx="100" cy="142" r="31" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="100" cy="156" rx="18" ry="11" fill={c.belly} />
    </g>
  );
}

function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle key={deg} cx={x + 5 * Math.cos((deg * Math.PI) / 180)} cy={y + 5 * Math.sin((deg * Math.PI) / 180)} r="3.6" fill="#F7B2A3" />
      ))}
      <circle cx={x} cy={y} r="2.6" fill="#F4D35E" />
    </g>
  );
}

function GlimkitBody({ c, stage, reduce }: { c: Colors; stage: number; reduce: boolean }) {
  const glow = 0.2 + stage * 0.12;
  return (
    <g>
      {/* Tail: outline stroke under a fill stroke, ending in the lantern. */}
      <path d="M132 168 C 186 168, 192 116, 170 90" fill="none" stroke={c.line} strokeWidth="24" strokeLinecap="round" />
      <path d="M132 168 C 186 168, 192 116, 170 90" fill="none" stroke={c.body} strokeWidth="18" strokeLinecap="round" />
      <motion.circle
        cx="168" cy="80" r="24" fill="#FFE3A0"
        initial={{ opacity: glow }}
        animate={reduce ? { opacity: glow } : { opacity: [glow, glow + 0.2, glow] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <circle cx="168" cy="80" r="12" fill="#FFD46B" stroke={c.line} strokeWidth="3" />
      <path d="M162 70 h12" stroke={c.line} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="82" cy="182" rx="13" ry="8" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="118" cy="182" rx="13" ry="8" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="100" cy="146" rx="43" ry="38" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="100" cy="154" rx="25" ry="22" fill={c.belly} />
      <path d="M62 78 L70 38 L94 62 Z" fill={c.body} stroke={c.line} strokeWidth="3" strokeLinejoin="round" />
      <path d="M138 78 L130 38 L106 62 Z" fill={c.body} stroke={c.line} strokeWidth="3" strokeLinejoin="round" />
      <path d="M70 70 L73 50 L85 62 Z" fill={c.shade} />
      <path d="M130 70 L127 50 L115 62 Z" fill={c.shade} />
      <circle cx="100" cy="94" r="37" fill={c.body} stroke={c.line} strokeWidth="3" />
      <ellipse cx="100" cy="108" rx="19" ry="13" fill={c.belly} />
    </g>
  );
}

function Face({ a, line, mood, reduce }: { a: Anchors; line: string; mood: PetMood; reduce: boolean }) {
  const [fx, fy] = a.face;
  const eyes = [fx - a.eyeGap, fx + a.eyeGap];
  const asleep = mood === 'sleepy';
  return (
    <g>
      <ellipse cx={fx - a.eyeGap - 9} cy={fy + 10} rx="6" ry="3.5" fill="#F08B74" opacity="0.5" />
      <ellipse cx={fx + a.eyeGap + 9} cy={fy + 10} rx="6" ry="3.5" fill="#F08B74" opacity="0.5" />
      {asleep ? (
        eyes.map((x) => <path key={x} d={`M${x - 6} ${fy} Q ${x} ${fy + 5} ${x + 6} ${fy}`} fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" />)
      ) : (
        <motion.g
          animate={reduce ? {} : { scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4.5, times: [0, 0.92, 0.96, 1], repeat: Infinity }}
          style={{ originY: 0.5 }}
        >
          {eyes.map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={fy} rx={mood === 'excited' ? 6 : 5} ry={mood === 'excited' ? 7.5 : 6.5} fill={line} />
              <circle cx={x - 1.6} cy={fy - 2.2} r="1.9" fill="#fff" />
            </g>
          ))}
        </motion.g>
      )}
      <Mouth x={fx} y={fy} mood={mood} line={line} />
    </g>
  );
}

function Mouth({ x, y, mood, line }: { x: number; y: number; mood: PetMood; line: string }) {
  switch (mood) {
    case 'curious':
      return <ellipse cx={x} cy={y + 14} rx="3.5" ry="4" fill={line} />;
    case 'excited':
      return (
        <g>
          <path d={`M${x - 11} ${y + 10} Q ${x} ${y + 26} ${x + 11} ${y + 10} Z`} fill={line} />
          <path d={`M${x - 5} ${y + 17} Q ${x} ${y + 22} ${x + 5} ${y + 17}`} fill="#F08B74" />
        </g>
      );
    case 'sleepy':
      return <path d={`M${x - 5} ${y + 14} Q ${x} ${y + 17} ${x + 5} ${y + 14}`} fill="none" stroke={line} strokeWidth="2.5" strokeLinecap="round" />;
    default:
      return <path d={`M${x - 9} ${y + 11} Q ${x} ${y + 20} ${x + 9} ${y + 11}`} fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" />;
  }
}

function Scarf({ x, y, w, line }: { x: number; y: number; w: number; line: string }) {
  return (
    <g>
      <rect x={x + w / 6} y={y} width="12" height="26" rx="5" fill="#D9604A" stroke={line} strokeWidth="2.5" transform={`rotate(12 ${x + w / 6} ${y})`} />
      <rect x={x - w / 2} y={y - 7} width={w} height="14" rx="7" fill="#E07A5F" stroke={line} strokeWidth="2.5" />
      <path d={`M${x - w / 4} ${y - 7} v14 M${x} ${y - 7} v14 M${x + w / 4} ${y - 7} v14`} stroke="#F6D0C4" strokeWidth="3" />
    </g>
  );
}

function Hat({ x, top, line }: { x: number; top: number; line: string }) {
  return (
    <g>
      <rect x={x - 21} y={top - 20} width="42" height="26" rx="13" fill="#C49A63" stroke={line} strokeWidth="2.5" />
      <rect x={x - 21} y={top - 2} width="42" height="6" fill="#7A5733" />
      <ellipse cx={x} cy={top + 5} rx="36" ry="7" fill="#C49A63" stroke={line} strokeWidth="2.5" />
    </g>
  );
}

function Backpack({ x, y, line }: { x: number; y: number; line: string }) {
  return (
    <g>
      <rect x={x - 15} y={y - 22} width="30" height="42" rx="9" fill="#6E9B7B" stroke={line} strokeWidth="2.5" />
      <rect x={x - 11} y={y - 4} width="22" height="14" rx="5" fill="#8DB89A" stroke={line} strokeWidth="2" />
    </g>
  );
}

function Stick({ x, line }: { x: number; line: string }) {
  return (
    <g>
      <path d={`M${x} 110 L${x + 5} 186`} stroke="#8B6B43" strokeWidth="6" strokeLinecap="round" />
      <path d={`M${x} 110 L${x + 5} 186`} stroke={line} strokeWidth="1" opacity="0.4" />
      <circle cx={x} cy="108" r="6" fill="#A9845A" stroke={line} strokeWidth="2" />
      <path d={`M${x + 2} 130 q 8 -4 10 -12`} stroke="#6E9B7B" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Zzz({ x, y }: { x: number; y: number }) {
  return (
    <g fontFamily="Nunito, sans-serif" fontWeight="800" fill="#4A6E8C" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.text
          key={i}
          x={x + i * 9}
          y={y - i * 12}
          fontSize={12 + i * 3}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0], y: [0, -8, -14] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 0.8 }}
        >
          z
        </motion.text>
      ))}
    </g>
  );
}
