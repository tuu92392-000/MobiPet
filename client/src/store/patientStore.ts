import { create } from 'zustand';
import type { PatientView } from '@shared/api';
import { api } from '../api/client';

interface PatientState {
  view: PatientView | null;
  error: string | null;
  load: (id: string) => Promise<void>;
  setView: (view: PatientView) => void;
  clear: () => void;
}

export const usePatientStore = create<PatientState>((set) => ({
  view: null,
  error: null,
  async load(id) {
    try {
      set({ view: await api.get<PatientView>(`/patients/${id}`), error: null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },
  setView: (view) => set({ view, error: null }),
  clear: () => set({ view: null, error: null }),
}));
