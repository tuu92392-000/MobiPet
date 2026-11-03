import { useEffect } from 'react';
import { Radio, WifiOff } from 'lucide-react';
import { ensureSource, useLiveStatus } from '../lib/live';

export function LiveBadge() {
  const status = useLiveStatus((s) => s.status);
  useEffect(ensureSource, []);
  const live = status === 'live';
  const Icon = live ? Radio : WifiOff;
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${live ? 'border-sage-deep text-sage-deep' : 'border-line text-muted'}`}
    >
      <Icon aria-hidden size={16} />
      {live ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  );
}
