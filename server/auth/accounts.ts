// Demo accounts and credential checks. Secrets are stored only as hashes.
import { deriveKey, randomHex, safeEqualHex, sha256Hex } from './hash';
import type { Account, Patient } from '../../shared/types';

/** One shared password for every demo staff account (listed in the README). */
export const STAFF_PASSWORD = 'mobipet-demo';

export const STAFF: { id: string; role: Account['role']; label: string; username: string }[] = [
  { id: 'acct_nurse1', role: 'nurse', label: 'Nurse 1', username: 'nurse1' },
  { id: 'acct_nurse2', role: 'nurse', label: 'Nurse 2', username: 'nurse2' },
  { id: 'acct_aid1', role: 'mobility_aid', label: 'Mobility Aide 1', username: 'aid1' },
  { id: 'acct_aid2', role: 'mobility_aid', label: 'Mobility Aide 2', username: 'aid2' },
];

export function hashSecret(secret: string, salt = randomHex(16)) {
  return { salt, secretHash: deriveKey(secret, salt) };
}

export function checkSecret(account: Account, secret: string): boolean {
  if (!account.secretHash || !account.salt) return false;
  return safeEqualHex(deriveKey(secret, account.salt), account.secretHash);
}

export function codeLookup(code: string): string {
  return sha256Hex(code.trim().toUpperCase());
}

export function staffAccounts(): Account[] {
  return STAFF.map((s) => ({ ...s, ...hashSecret(STAFF_PASSWORD), codeLookup: null, patientId: null }));
}

/** Demo PIN for a room: easy to read aloud in a demo, different for every room. */
export function demoPin(room: string): string {
  return `${(Number(room) * 7 + 1234) % 10000}`.padStart(4, '0');
}

/** The patient's own (PIN) account and the family (invite code) account for one patient. */
export function patientAccounts(p: Patient, pin: string): Account[] {
  return [
    { id: `acct_${p.id}`, role: 'patient', label: `${p.firstName} ${p.lastInitial}. (Room ${p.room})`, username: null, ...hashSecret(pin), codeLookup: null, patientId: p.id },
    { id: `acct_fam_${p.id}`, role: 'family', label: `Family of Room ${p.room}`, username: null, secretHash: null, salt: null, codeLookup: codeLookup(p.familyCode), patientId: p.id },
  ];
}
