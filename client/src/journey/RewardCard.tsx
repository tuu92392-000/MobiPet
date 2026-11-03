// Shown after an activity that found something: keepsakes, growth, a new region, home.
import type { ReactNode } from 'react';
import { MapPin, Sparkles, House } from 'lucide-react';
import type { ProgressResult } from '@shared/progression';
import type { Translate } from '../i18n';
import { Modal } from '../components/Modal';
import { KeepsakeIcon } from './KeepsakeIcon';

export function hasRewards(p: ProgressResult): boolean {
  return p.newKeepsakes.length > 0 || p.stageUp || p.newRegion !== null || p.reachedHome;
}

/** Plain-text summary for read-aloud and the live region. */
export function rewardText(p: ProgressResult, petName: string, t: Translate): string {
  const parts: string[] = [];
  if (p.reachedHome) parts.push(t('reward.home', { pet: petName }));
  else if (p.newRegion) parts.push(t('reward.region', { region: t(`region.${p.newRegion}`) }));
  p.newKeepsakes.forEach((k) => parts.push(t('reward.keepsake', { item: t(`keepsake.${k}`).toLowerCase() })));
  if (p.stageUp) parts.push(t('reward.stage', { pet: petName }));
  return parts.join(' ');
}

export function RewardCard({ result, petName, t, onClose }: { result: ProgressResult | null; petName: string; t: Translate; onClose: () => void }) {
  const p = result;
  return (
    <Modal open={p !== null} onClose={onClose} labelledBy="reward-title">
      {p && (
        <div className="p-6 text-center">
          <h2 id="reward-title" className="font-display text-3xl font-extrabold">{t('reward.title')}</h2>
          <ul className="mt-4 flex flex-col gap-3 text-left text-xl">
            {p.reachedHome && <Row icon={<House aria-hidden size={32} className="text-cherry" />}>{t('reward.home', { pet: petName })}</Row>}
            {!p.reachedHome && p.newRegion && (
              <Row icon={<MapPin aria-hidden size={32} className="text-sky-deep" />}>{t('reward.region', { region: t(`region.${p.newRegion}`) })}</Row>
            )}
            {p.newKeepsakes.map((k) => (
              <Row key={k} icon={<KeepsakeIcon id={k} size={36} />}>{t('reward.keepsake', { item: t(`keepsake.${k}`).toLowerCase() })}</Row>
            ))}
            {p.stageUp && <Row icon={<Sparkles aria-hidden size={32} className="text-coral-deep" />}>{t('reward.stage', { pet: petName })}</Row>}
          </ul>
          <button autoFocus onClick={onClose} className="mt-6 min-h-tap rounded-full bg-sage-deep px-12 text-xl font-bold text-cream">
            {t('reward.ok')}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl bg-cream p-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
