// Who is signed in on this device. The token lives in sessionStorage, so closing the tab signs out.
import { create } from 'zustand';
import type { Lang, PetChoice, Role } from '@shared/types';
import { api, onAuthLostHandler, setAuthToken } from '../api/client';
import { setLiveToken } from '../lib/live';

export type Me =
  | { locked: false; accountId: string; role: Role; label: string; patientId: string | null; bedside: boolean }
  | { locked: true; role: Role; pinBlockedUntil: number | null; lockScreen: { firstName: string; pet: PetChoice | null; language: Lang } | null };

interface SignedIn {
  token: string;
  me: Me;
}

interface SessionState {
  token: string | null;
  me: Me | null;
  /** True once the stored token has been checked with the server. */
  ready: boolean;
  config: { demoSwitcher: boolean; bedsideIdleMinutes: number };
  restore: () => Promise<void>;
  signInStaff: (username: string, password: string) => Promise<Me>;
  signInFamily: (code: string) => Promise<Me>;
  startBedside: (patientId: string) => Promise<Me>;
  unlock: (pin: string) => Promise<Me>;
  lock: () => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const KEY = 'mobipet.token';

function store(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(KEY, token);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session lasts until reload.
  }
}

function stored(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const useSession = create<SessionState>((set, get) => {
  const apply = ({ token, me }: SignedIn) => {
    setAuthToken(token);
    setLiveToken(token);
    store(token);
    set({ token, me, ready: true });
    return me;
  };
  const clear = () => {
    setAuthToken(null);
    setLiveToken(null);
    store(null);
    set({ token: null, me: null, ready: true });
  };

  return {
    token: null,
    me: null,
    ready: false,
    config: { demoSwitcher: false, bedsideIdleMinutes: 5 },

    async restore() {
      await api.get<SessionState['config']>('/auth/config').then((config) => set({ config })).catch(() => undefined);
      const token = stored();
      if (!token) return set({ ready: true });
      setAuthToken(token);
      try {
        apply({ token, me: await api.get<Me>('/auth/me') });
      } catch {
        clear();
      }
    },

    signInStaff: async (username, password) => apply(await api.post<SignedIn>('/auth/login', { username, password })),
    signInFamily: async (code) => apply(await api.post<SignedIn>('/auth/family', { code })),
    // Staff hand this device to the patient: the staff session is replaced by a locked bedside session.
    startBedside: async (patientId) => apply(await api.post<SignedIn>('/bedside/start', { patientId })),
    unlock: async (pin) => apply(await api.post<SignedIn>('/bedside/unlock', { pin })),

    async lock() {
      await api.post('/bedside/lock').catch(() => undefined);
      await get().refreshMe();
    },

    async refreshMe() {
      const token = get().token;
      if (!token) return;
      try {
        set({ me: await api.get<Me>('/auth/me') });
      } catch {
        clear();
      }
    },

    async signOut() {
      await api.post('/auth/logout').catch(() => undefined);
      clear();
    },
  };
});

// A request that finds the tablet locked or the session gone re-checks who we are.
onAuthLostHandler(() => void useSession.getState().refreshMe());

export const isStaffRole = (role: Role | undefined) => role === 'nurse' || role === 'mobility_aid';
