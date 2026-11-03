// Illustrated Journey Home strip: parallax layers, regions, keepsakes, and the pet walking the path.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import type { PetChoice, PetMood } from '@shared/types';
import { HOME_STEPS, journeyFraction, KEEPSAKES, nextRegion, REGION_SPAN, type KeepsakeId, type RegionId } from '@shared/progression';
import type { Translate } from '../i18n';
import { PetSvg } from '../pets/PetSvg';
import { KeepsakeIcon } from './KeepsakeIcon';

const W = 1600;
const H = 200;
const PATH = 'M 30 160 C 150 160, 200 122, 320 130 S 520 168, 640 142 S 860 106, 980 134 S 1180 172, 1300 134 S 1460 78, 1560 112';
const FAR = 0.35;
const NEAR = 1.25;

interface Props {
  steps: number;
  region: RegionId;
  pet: PetChoice;
  mood: PetMood;
  stage: 1 | 2 | 3 | 4;
  keepsakes: KeepsakeId[];
  t: Translate;
  /** Patient's first name when someone else (family) is viewing; headings switch to third person. */
  viewerOf?: string;
}

export function JourneyMap({ steps, region, pet, mood, stage, keepsakes, t, viewerOf }: Props) {
  const reduce = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [samples, setSamples] = useState<[number, number][] | null>(null);
  const [aspect, setAspect] = useState(5);

  const target = journeyFraction(steps);
  const fracRef = useRef(target);
  const [frac, setFrac] = useState(target);
  const [walking, setWalking] = useState(false);

  useLayoutEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    const pts: [number, number][] = [];
    for (let i = 0; i <= 320; i++) {
      const pt = p.getPointAtLength((len * i) / 320);
      pts.push([pt.x, pt.y]);
    }
    setSamples(pts);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (height > 0) setAspect(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Walk the pet forward when steps increase. Progress never animates backward.
  useEffect(() => {
    if (reduce || target <= fracRef.current) {
      fracRef.current = target;
      setFrac(target);
      return;
    }
    setWalking(true);
    const controls = animate(fracRef.current, target, {
      duration: 1.8,
      ease: 'easeInOut',
      onUpdate: (v) => {
        fracRef.current = v;
        setFrac(v);
      },
      onComplete: () => setWalking(false),
    });
    return () => controls.stop();
  }, [target, reduce]);

  const pointAt = (f: number): [number, number] => {
    if (!samples) return [f * W, 150];
    const i = Math.min(samples.length - 2, Math.max(0, Math.floor(f * (samples.length - 1))));
    const r = f * (samples.length - 1) - i;
    return [samples[i][0] + (samples[i + 1][0] - samples[i][0]) * r, samples[i][1] + (samples[i + 1][1] - samples[i][1]) * r];
  };

  const vw = Math.min(W, Math.max(320, H * aspect));
  const [px, py] = pointAt(frac);
  const camX = Math.min(W - vw, Math.max(0, px - vw * 0.42));
  const layer = (f: number) => `translate(${camX * (1 - f)} 0)`;

  const next = nextRegion(steps);
  const regionName = t(`region.${region}`);
  const have = new Set(keepsakes);

  return (
    <section aria-labelledby="journey-title" className="overflow-hidden rounded-blob border-2 border-line bg-paper">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 pt-2">
        <h2 id="journey-title" className="font-display text-xl font-extrabold">
          {t('journey.label')} · <span className="text-sage-deep">{steps >= HOME_STEPS
              ? t('journey.atHome', { pet: pet.name })
              : viewerOf
                ? t('journey.theyAreIn', { name: viewerOf, region: regionName })
                : t('journey.here', { region: regionName })}</span>
        </h2>
        {/* Progress in words only: never step counts or percentages. */}
        {steps < HOME_STEPS && (
          <p className="text-base">
            {t('journey.exploring', { pet: pet.name, region: regionName })}
            {next && <> · {t('journey.next', { region: t(`region.${next}`) })}</>}
          </p>
        )}
      </div>
      <div ref={wrapRef} className="h-[9rem] w-full">
        <svg
          viewBox={`${camX} 0 ${vw} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full"
          role="img"
          aria-label={`${t('journey.mapLabel', { pet: pet.name, region: regionName })}${next ? ` ${t('journey.mapNext', { region: t(`region.${next}`) })}` : ''}`}
        >
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#DCEBF7" />
              <stop offset="1" stopColor="#FBF7EF" />
            </linearGradient>
          </defs>

          {/* Sky stays fixed to the viewport. */}
          <g transform={layer(0)}>
            <rect x="0" y="0" width={vw} height={H} fill="url(#sky)" />
          </g>

          {/* Far layer: sun, clouds, distant hills. */}
          <g transform={layer(FAR)}>
            <circle cx="180" cy="46" r="22" fill="#FBE3A2" />
            {[[90, 40], [420, 30], [760, 48], [1080, 28], [1380, 44]].map(([x, y]) => (
              <g key={x} fill="#fff" opacity="0.85">
                <ellipse cx={x} cy={y} rx="34" ry="11" />
                <ellipse cx={x + 18} cy={y - 7} rx="18" ry="10" />
              </g>
            ))}
            {[[120, 260], [480, 300], [860, 260], [1240, 320], [1600, 280]].map(([x, rx]) => (
              <ellipse key={x} cx={x} cy="176" rx={rx} ry="70" fill="#CFE3CF" />
            ))}
          </g>

          {/* Scenery + path layer (moves with the camera). */}
          <g transform={layer(1)}>
            <Scenery />
            <path d={PATH} fill="none" stroke="#E7D6AF" strokeWidth="20" strokeLinecap="round" />
            <path ref={pathRef} d={PATH} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
            <path d={PATH} fill="none" stroke="#8DB89A" strokeWidth="8" strokeLinecap="round" pathLength={1} strokeDasharray={`${frac} 1`} />
            <RegionLabels t={t} pointAt={pointAt} />
            {next && <NextStop label={t('journey.next', { region: t(`region.${next}`) })} at={pointAt(REGION_SPAN[next][0])} />}
            {KEEPSAKES.map((k) => {
              const [kx, ky] = pointAt(journeyFraction(k.at));
              return have.has(k.id) ? (
                <g key={k.id}>
                  <circle cx={kx} cy={ky} r="14" fill="#fff" stroke="#C9B89A" strokeWidth="2" />
                  <KeepsakeIcon id={k.id} size={20} x={kx - 10} y={ky - 10} />
                </g>
              ) : (
                <g key={k.id}>
                  <circle cx={kx} cy={ky} r="11" fill="#fff" opacity="0.8" stroke="#9A8F7E" strokeWidth="1.5" strokeDasharray="3 3" />
                  <text x={kx} y={ky + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#6B6358" fontFamily="Nunito, sans-serif">?</text>
                </g>
              );
            })}
            <motion.g
              animate={walking && !reduce ? { y: [0, -6, 0] } : { y: 0 }}
              transition={walking ? { duration: 0.35, repeat: Infinity } : { duration: 0.2 }}
            >
              <PetSvg
                species={pet.species}
                palette={pet.palette}
                mood={walking ? 'excited' : mood}
                stage={stage}
                accessory={pet.accessory}
                label=""
                box={{ x: px - 38, y: py - 72, size: 76 }}
              />
            </motion.g>
          </g>

          {/* Foreground grass moves faster than the path. */}
          <g transform={layer(NEAR)}>
            {Array.from({ length: 70 }, (_, i) => {
              const x = i * 30 + (i % 3) * 7;
              return <path key={i} d={`M${x} 200 q 3 -14 6 0 q 3 -10 6 0`} fill="#7FA36B" opacity="0.8" />;
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}

/** A signpost where the next region begins. */
function NextStop({ label, at: [x, y] }: { label: string; at: [number, number] }) {
  const w = label.length * 9 + 24;
  return (
    <g fontFamily="Nunito, sans-serif" fontWeight="800" fontSize="15">
      <line x1={x} y1={y} x2={x} y2={y - 52} stroke="#7A5C3A" strokeWidth="4" strokeLinecap="round" />
      <rect x={x - 4} y={y - 74} width={w} height="26" rx="8" fill="#FFF8E7" stroke="#7A5C3A" strokeWidth="2.5" />
      <path d={`M ${x + w - 4} ${y - 74} l 10 13 l -10 13 z`} fill="#FFF8E7" stroke="#7A5C3A" strokeWidth="2.5" strokeLinejoin="round" />
      <text x={x + 8} y={y - 56} fill="#2B2A28">{label}</text>
    </g>
  );
}

function RegionLabels({ t, pointAt }: { t: Translate; pointAt: (f: number) => [number, number] }) {
  return (
    <g fontFamily="Nunito, sans-serif" fontWeight="800" fontSize="20">
      {(Object.keys(REGION_SPAN) as RegionId[]).map((id) => {
        const [a, b] = REGION_SPAN[id];
        const [x] = pointAt(id === 'home' ? a : (a + b) / 2);
        return (
          <text key={id} x={x} y="26" textAnchor="middle" fill="#2B2A28" stroke="#FBF7EF" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
            {t(`region.${id}`)}
          </text>
        );
      })}
    </g>
  );
}

/** Static illustrated scenery for each region, in path coordinates. */
function Scenery() {
  return (
    <g>
      {/* Hospital Room */}
      <rect x="4" y="66" width="92" height="104" rx="8" fill="#E5EEF6" stroke="#8AA5BE" strokeWidth="2.5" />
      {[[16, 80], [52, 80], [16, 112], [52, 112]].map(([x, y]) => (
        <rect key={`${x}${y}`} x={x} y={y} width="28" height="22" rx="4" fill="#FBF3D8" stroke="#8AA5BE" strokeWidth="2" />
      ))}
      <rect x="36" y="142" width="24" height="28" rx="4" fill="#B0D1EC" stroke="#8AA5BE" strokeWidth="2" />

      {/* Hallway Garden */}
      {[[130, 118, 70], [230, 112, 80], [350, 120, 76]].map(([x, y, w]) => (
        <rect key={x} x={x} y={y} width={w} height="34" rx="17" fill="#9CC49A" stroke="#5E8A5C" strokeWidth="2" />
      ))}
      <path d="M268 112 V70 Q290 46 312 70 V112" fill="none" stroke="#A9845A" strokeWidth="5" />
      {[[150, 112, '#F6A08A'], [182, 108, '#F4D35E'], [262, 104, '#D6C8EE'], [300, 100, '#F6A08A'], [380, 112, '#F4D35E'], [412, 116, '#F6A08A']].map(([x, y, c]) => (
        <circle key={`${x}`} cx={x as number} cy={y as number} r="6" fill={c as string} stroke="#3D3A36" strokeWidth="1" />
      ))}

      {/* Window Meadow: a big arched window looking onto open grass. */}
      <path d="M520 160 V70 Q620 -10 720 70 V160" fill="#EAF4FB" opacity="0.7" stroke="#C9B89A" strokeWidth="7" />
      <path d="M620 32 V160 M520 104 H720" stroke="#C9B89A" strokeWidth="5" />
      {Array.from({ length: 22 }, (_, i) => {
        const x = 470 + i * 15;
        return <path key={i} d={`M${x} 170 q 4 -22 2 -30`} stroke="#7FA36B" strokeWidth="3" fill="none" strokeLinecap="round" />;
      })}
      {[[500, 136], [560, 128], [690, 132], [770, 124]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="5" fill="#fff" stroke="#3D3A36" strokeWidth="1" />
      ))}

      {/* Riverside Path */}
      <path d="M800 200 C 880 168, 960 196, 1040 176 S 1120 168, 1160 186 V200 Z" fill="#9CC8E8" />
      <path d="M840 190 q 12 -6 24 0 M950 186 q 12 -6 24 0 M1060 182 q 12 -6 24 0" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {[880, 896, 1110, 1126].map((x) => (
        <g key={x}>
          <path d={`M${x} 176 V140`} stroke="#5E8A5C" strokeWidth="3" />
          <rect x={x - 3} y="134" width="6" height="14" rx="3" fill="#8B6B43" />
        </g>
      ))}

      {/* Hilltop */}
      <path d="M1150 200 C 1250 130, 1330 66, 1420 74 C 1480 80, 1500 130, 1520 200 Z" fill="#A9CC9A" />
      <rect x="1408" y="40" width="8" height="34" fill="#8B6B43" />
      <circle cx="1412" cy="36" r="22" fill="#6E9B6B" stroke="#4E7A4B" strokeWidth="2" />

      {/* Home */}
      <rect x="1552" y="54" width="12" height="22" fill="#B5523B" />
      <motion.circle cx="1558" cy="44" r="6" fill="#fff" opacity="0.7" animate={{ cy: [44, 30], opacity: [0.7, 0] }} transition={{ duration: 3, repeat: Infinity }} />
      <path d="M1500 84 L1540 50 L1580 84 Z" fill="#B5523B" stroke="#7A3324" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="1506" y="84" width="68" height="46" fill="#F6E3C6" stroke="#7A3324" strokeWidth="2.5" />
      <rect x="1532" y="102" width="16" height="28" rx="3" fill="#9D2235" />
      <rect x="1512" y="94" width="14" height="14" rx="2" fill="#FBE3A2" stroke="#7A3324" strokeWidth="1.5" />
      <rect x="1554" y="94" width="14" height="14" rx="2" fill="#FBE3A2" stroke="#7A3324" strokeWidth="1.5" />
    </g>
  );
}
