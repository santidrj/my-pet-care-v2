import type {
  AuthStore,
  PasswordResetRecord,
  PlatformClientRecord,
  RateReservation,
  ReserveRateSlot,
  RotateRefreshResult,
  StoredSession,
} from "../application/ports.js";

function createMutex() {
  let chain = Promise.resolve();
  return function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export function createInMemoryStore(): AuthStore {
  const sessions = new Map<string, StoredSession>();
  const resets: PasswordResetRecord[] = [];
  const clients = new Map<string, PlatformClientRecord>();
  const slots: { id: string; kind: string; subject: string; address: string; createdAt: Date }[] =
    [];
  const exclusive = createMutex();

  function cloneSession(session: StoredSession): StoredSession {
    return {
      ...session,
      createdAt: new Date(session.createdAt),
      absoluteExpiresAt: new Date(session.absoluteExpiresAt),
      verifiers: session.verifiers.map((verifier) => ({ ...verifier })),
    };
  }

  function findByVerifier(verifier: string): StoredSession | null {
    for (const session of sessions.values()) {
      if (session.verifiers.some((item) => item.verifier === verifier)) {
        return session;
      }
    }
    return null;
  }

  return {
    async insertSession(session) {
      sessions.set(session.id, cloneSession(session));
    },
    async findSessionByVerifier(verifier) {
      const session = findByVerifier(verifier);
      return session === null ? null : cloneSession(session);
    },
    async rotateRefresh(input): Promise<RotateRefreshResult> {
      return exclusive(async () => {
        const session = findByVerifier(input.presentedVerifier);
        if (session === null) {
          return "missing";
        }
        const presented = session.verifiers.find(
          (item) => item.verifier === input.presentedVerifier,
        );
        if (presented === undefined || !presented.current) {
          sessions.delete(session.id);
          return "reused";
        }
        if (session.absoluteExpiresAt.getTime() <= input.now.getTime()) {
          sessions.delete(session.id);
          return "expired";
        }
        for (const verifier of session.verifiers) {
          verifier.current = false;
        }
        session.verifiers.push({ verifier: input.nextVerifier, current: true });
        return "rotated";
      });
    },
    async deleteSession(sessionId) {
      sessions.delete(sessionId);
    },
    async deleteSessionsForOwner(ownerId) {
      for (const [id, session] of sessions) {
        if (session.ownerId === ownerId) {
          sessions.delete(id);
        }
      }
    },
    async insertPasswordReset(reset) {
      resets.push({ ...reset, expiresAt: new Date(reset.expiresAt) });
    },
    async findPasswordResetByVerifier(verifier) {
      const reset = resets.find((item) => item.verifier === verifier);
      if (reset === undefined) {
        return null;
      }
      return { ...reset, expiresAt: new Date(reset.expiresAt) };
    },
    async decidePasswordReset(input) {
      return exclusive(async () => {
        const reset = resets.find((item) => item.verifier === input.verifier);
        if (
          reset === undefined ||
          reset.used ||
          reset.expiresAt.getTime() <= input.now.getTime()
        ) {
          return "unusable";
        }
        const decision = await input.decide(reset);
        if (decision !== "consume") {
          return "left";
        }
        reset.used = true;
        for (const [id, session] of sessions) {
          if (session.ownerId === reset.ownerId) {
            sessions.delete(id);
          }
        }
        return "consumed";
      });
    },
    async findPlatformClient(serviceId) {
      const client = clients.get(serviceId);
      return client === undefined ? null : { ...client };
    },
    async upsertPlatformClient(client) {
      clients.set(client.serviceId, { ...client });
    },
    async reserveRateSlot(input: ReserveRateSlot): Promise<RateReservation> {
      return exclusive(async () => {
        const since = input.now.getTime() - input.windowMs;
        const open = slots.filter(
          (slot) => slot.kind === input.kind && slot.createdAt.getTime() >= since,
        );
        const subjectCount = open.filter((slot) => slot.subject === input.subject).length;
        const addressCount = open.filter((slot) => slot.address === input.address).length;
        if (subjectCount >= input.subjectLimit) {
          return { reserved: false };
        }
        if (input.addressLimit !== null && addressCount >= input.addressLimit) {
          return { reserved: false };
        }
        slots.push({
          id: input.id,
          kind: input.kind,
          subject: input.subject,
          address: input.address,
          createdAt: new Date(input.now),
        });
        return { reserved: true, id: input.id };
      });
    },
    async releaseRateSlot(id) {
      const index = slots.findIndex((slot) => slot.id === id);
      if (index >= 0) {
        slots.splice(index, 1);
      }
    },
    async sweep(now) {
      for (const [id, session] of sessions) {
        if (session.absoluteExpiresAt.getTime() <= now.getTime()) {
          sessions.delete(id);
        }
      }
      for (let index = resets.length - 1; index >= 0; index -= 1) {
        const reset = resets[index];
        if (reset !== undefined && reset.expiresAt.getTime() <= now.getTime()) {
          resets.splice(index, 1);
        }
      }
    },
  };
}
