import { AttemptRecord } from '../types/exam';
import { isValidSbdFormat } from '../utils/examEngine';

export type CloudSyncStatus = 'syncing' | 'synced' | 'offline' | 'quota' | 'error';

export const FIRESTORE_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;

export function isFirestoreQuotaError(err: unknown): boolean {
  if (!err) return false;
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.message);
  }
  if (typeof err === 'object') {
    const obj = err as { code?: unknown; message?: unknown };
    if (typeof obj.code === 'string') parts.push(obj.code);
    if (typeof obj.message === 'string') parts.push(obj.message);
  } else {
    parts.push(String(err));
  }
  const lower = parts.join(' ').toLowerCase();
  return (
    lower.includes('quota exceeded') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('resource_exhausted') ||
    lower.includes('resource-exhausted') ||
    lower.includes('free daily read units') ||
    lower.includes('free daily write units')
  );
}

export interface CloudSyncSummary {
  totalCount: number;
  confirmedCount: number;
  pendingCount: number;
  pendingIds: string[];
}

export function haveAttemptsChanged(
  prev: readonly AttemptRecord[],
  next: readonly AttemptRecord[]
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (!a || !b) return true;
    if (
      a.id !== b.id ||
      a.sbd !== b.sbd ||
      a.totalScore !== b.totalScore ||
      a.submittedAt !== b.submittedAt ||
      Boolean(a.syncedToDrive) !== Boolean(b.syncedToDrive)
    ) {
      return true;
    }
  }
  return false;
}

export function findAttemptsMissingOnRemote(
  attempts: readonly AttemptRecord[],
  confirmedRemoteIds: ReadonlySet<string>
): AttemptRecord[] {
  return attempts.filter(
    (a) =>
      a &&
      typeof a.id === 'string' &&
      !a.isSeedData &&
      isValidSbdFormat(String(a.sbd ?? '')) &&
      !confirmedRemoteIds.has(a.id)
  );
}

export function computeCloudSyncSummary(
  attempts: readonly AttemptRecord[],
  confirmedCloudIds: ReadonlySet<string>
): CloudSyncSummary {
  const realAttempts = attempts.filter(
    (a) => a && !a.isSeedData && isValidSbdFormat(String(a.sbd ?? ''))
  );
  const pendingIds = realAttempts
    .filter((a) => !confirmedCloudIds.has(a.id))
    .map((a) => a.id);

  return {
    totalCount: realAttempts.length,
    confirmedCount: realAttempts.length - pendingIds.length,
    pendingCount: pendingIds.length,
    pendingIds,
  };
}

export function formatSyncTimeLabel(timestampMs: number | null): string {
  if (!timestampMs) return '';
  try {
    return new Date(timestampMs).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}
