import { create } from 'zustand';
import type { BenchmarksView, BoardView } from '@shared/api';
import type { SafetyFlag, ShiftInfo } from '@shared/types';
import type { UnitFact } from '@shared/unitFacts';
import { api } from '../api/client';

export type FlagRow = SafetyFlag & { room: string; name: string };

interface UnitView {
  now: number;
  shift: ShiftInfo;
  facts: UnitFact[];
}

interface CareTeamState {
  board: BoardView | null;
  unit: UnitView | null;
  benchmarks: BenchmarksView | null;
  flags: FlagRow[];
  error: string | null;
  refresh: () => Promise<void>;
}

export const useCareTeamStore = create<CareTeamState>((set) => ({
  board: null,
  unit: null,
  benchmarks: null,
  flags: [],
  error: null,
  async refresh() {
    try {
      const [board, unit, flags, benchmarks] = await Promise.all([
        api.get<BoardView>('/board'),
        api.get<UnitView>('/unit'),
        api.get<FlagRow[]>('/flags'),
        api.get<BenchmarksView>('/unit/benchmarks'),
      ]);
      set({ board, unit, flags, benchmarks, error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
}));
