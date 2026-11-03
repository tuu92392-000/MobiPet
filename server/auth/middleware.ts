// Express middleware: who is asking (authenticate) and may they do this (requireCan).
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Account, AuthSession } from '../../shared/types';
import { can, type Action, type Actor } from './permissions';
import { findSession } from './sessions';

declare module 'express-serve-static-core' {
  interface Request {
    actor?: Actor;
    session?: AuthSession;
    account?: Account;
  }
}

export function tokenFrom(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

export function actorFor(account: Account): Actor {
  return { accountId: account.id, role: account.role, label: account.label, patientId: account.patientId };
}

/** Attaches the session and account if the token is valid. A locked bedside session gets no actor. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const found = findSession(tokenFrom(req));
  if (found) {
    req.session = found.session;
    req.account = found.account;
    if (!found.session.locked) req.actor = actorFor(found.account);
  }
  next();
}

const defaultPatient = (req: Request) => req.params.id ?? req.params.patientId ?? null;

/** 401 when signed out or the tablet is locked; 403 when the role (or patient) isn't allowed. */
export function requireCan(action: Action, patientOf: (req: Request) => string | null = defaultPatient): RequestHandler {
  return (req, res, next) => {
    if (!req.actor) {
      return res.status(401).json({ error: req.session?.locked ? 'locked' : 'signed-out' });
    }
    if (!can(req.actor, action, patientOf(req))) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
