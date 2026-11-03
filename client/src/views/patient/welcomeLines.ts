// Welcome-back greetings: six friendly lines, some about the map region or today's goal in plain words.
import type { Lang, Patient } from '@shared/types';
import type { RegionId } from '@shared/progression';
import { isRestGoal, JHHLM } from '@shared/jhhlm';
import type { MsgKey, Translate } from '../../i18n';

export const WELCOME_LINES: MsgKey[] = ['welcome.line1', 'welcome.line2', 'welcome.line3', 'welcome.line4', 'welcome.line5', 'welcome.line6'];

/** One of six friendly lines, some about where the pet is on the map or today's goal (in words). */
export function welcomeLine(t: Translate, lang: Lang, p: Pick<Patient, 'firstName' | 'goal'>, region: RegionId, pick: number): string {
  const name = p.firstName;
  const key = WELCOME_LINES[pick % WELCOME_LINES.length];
  if (key === 'welcome.line4') {
    return isRestGoal(p.goal) ? t('welcome.line4rest', { name }) : t(key, { name, goal: JHHLM[p.goal.level].goal[lang] });
  }
  return t(key, { name, region: t(`region.${region}`) });
}

