// Demo switcher logic. It never bypasses sign-in: it fills in the seeded credentials and goes through
// the same login, bedside-start and PIN-unlock calls a real user would.
import type { PetChoice, Role } from '@shared/types';
import { api } from '../../api/client';
import { useSession } from '../../auth/session';

export interface DemoAccounts {
  staffPassword: string;
  staff: { label: string; role: Role; username: string }[];
  patients: { patientId: string; room: string; name: string; pin: string; pet: PetChoice | null }[];
  family: { label: string; patientId: string; code: string }[];
}

export const loadDemoAccounts = () => api.get<DemoAccounts>('/demo/accounts');

/**
 * `who` is a staff username ("nurse1"), "patient-<id>" or "family-<id>".
 * Returns the route to open afterwards.
 */
export async function switchTo(who: string, opts: { stopAtLock?: boolean } = {}): Promise<string> {
  const accounts = await loadDemoAccounts();
  const session = useSession.getState();
  await session.signOut();

  const staff = accounts.staff.find((s) => s.username === who);
  if (staff) {
    await session.signInStaff(staff.username, accounts.staffPassword);
    return '/';
  }
  if (who.startsWith('patient-')) {
    const patient = accounts.patients.find((p) => p.patientId === who.slice(8));
    if (!patient) throw new Error('Unknown patient');
    // A nurse starts the bedside session, then the patient types their PIN.
    await session.signInStaff(accounts.staff[0].username, accounts.staffPassword);
    await session.startBedside(patient.patientId);
    if (!opts.stopAtLock) await session.unlock(patient.pin);
    return '/bedside';
  }
  if (who.startsWith('family-')) {
    const family = accounts.family.find((f) => f.patientId === who.slice(7));
    if (!family) throw new Error('Unknown family');
    await session.signInFamily(family.code);
    return '/family/home';
  }
  throw new Error('Unknown account');
}
