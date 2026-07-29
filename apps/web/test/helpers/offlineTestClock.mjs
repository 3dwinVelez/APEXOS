const DEFAULT_NOW = "2026-07-27T13:00:00.000Z";

export function createOfflineTestClock(initialNow = DEFAULT_NOW) {
  let current = new Date(initialNow);
  if (Number.isNaN(current.getTime())) throw new Error("OFFLINE_TEST_CLOCK_INVALID");

  const at = (offsetMs = 0) => new Date(current.getTime() + offsetMs).toISOString();

  return {
    now: () => new Date(current),
    nowMs: () => current.getTime(),
    at,
    reset: () => {
      current = new Date(initialNow);
    },
    advance: (milliseconds) => {
      current = new Date(current.getTime() + milliseconds);
      return new Date(current);
    }
  };
}

export function createValidSnapshotTimes(clock) {
  return {
    generatedAt: clock.at(-60 * 60 * 1000),
    expiresAt: clock.at(23 * 60 * 60 * 1000),
    serverUpdatedAt: clock.at(-2 * 60 * 60 * 1000),
    scheduledAt: clock.at(60 * 60 * 1000)
  };
}

export function createExpiringSnapshotTimes(clock) {
  return {
    ...createValidSnapshotTimes(clock),
    expiresAt: clock.at(60 * 1000)
  };
}

export function createExpiredSnapshotTimes(clock) {
  return {
    ...createValidSnapshotTimes(clock),
    generatedAt: clock.at(-25 * 60 * 60 * 1000),
    expiresAt: clock.at(-60 * 1000)
  };
}

export function advanceOfflineClock(clock, milliseconds) {
  return clock.advance(milliseconds);
}
