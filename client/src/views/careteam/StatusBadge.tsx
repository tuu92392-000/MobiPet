// Status is always icon + text, never color alone.
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, type LucideIcon } from 'lucide-react';
import type { PatientStatus } from '@shared/types';

const STATUS: Record<PatientStatus, { label: string; Icon: LucideIcon; cls: string }> = {
  'needs-attention': { label: 'Needs attention', Icon: AlertTriangle, cls: 'border-alert bg-coral/30 text-alert' },
  behind: { label: 'Behind', Icon: Clock, cls: 'border-[#8A5A00] bg-[#FBE3A2]/60 text-[#6B4500]' },
  'on-track': { label: 'On track', Icon: TrendingUp, cls: 'border-sky-deep bg-sky/40 text-sky-deep' },
  'goal-met': { label: 'Goal met', Icon: CheckCircle2, cls: 'border-sage-deep bg-sage/50 text-sage-deep' },
};

export function StatusBadge({ status }: { status: PatientStatus }) {
  const { label, Icon, cls } = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 text-sm font-bold ${cls}`}>
      <Icon aria-hidden size={16} strokeWidth={2.5} />
      {label}
    </span>
  );
}
