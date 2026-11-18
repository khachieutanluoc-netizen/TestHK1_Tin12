import { AttemptRecord } from '../types/exam';
import { CandidateInfo, isValidSbdFormat } from '../utils/examEngine';

const CANDIDATE_STORAGE_KEY = 'vl_tinhoc_hk1_2026_candidate_v2';
const ATTEMPTS_STORAGE_KEY = 'vl_tinhoc_hk1_2026_attempts_v2';
const LEGACY_KEYS_TO_CLEAR = [
  'vl_tinhoc_hk1_2026_candidate',
  'vl_tinhoc_hk1_2026_attempts',
  'vl_tinhoc_hk1_2026_seed_v1',
];

function clearLegacyLogsOnce(): void {
  try {
    for (const key of LEGACY_KEYS_TO_CLEAR) {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Bỏ qua nếu trình duyệt hạn chế localStorage
  }
}

export function loadSavedCandidate(): CandidateInfo | null {
  try {
    clearLegacyLogsOnce();
    const raw = window.localStorage.getItem(CANDIDATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CandidateInfo>;
    if (typeof parsed.school === 'string' && typeof parsed.sbd === 'string') {
      return {
        school: parsed.school,
        sbd: isValidSbdFormat(parsed.sbd) ? parsed.sbd : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone : '',
        email: typeof parsed.email === 'string' ? parsed.email : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCandidate(candidate: CandidateInfo): void {
  try {
    window.localStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(candidate));
  } catch {
    // Bỏ qua lỗi quota localStorage
  }
}

export function loadAttempts(): AttemptRecord[] {
  try {
    clearLegacyLogsOnce();
    const raw = window.localStorage.getItem(ATTEMPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AttemptRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a) => a && typeof a.id === 'string' && isValidSbdFormat(String(a.sbd ?? '')) && !a.isSeedData
    );
  } catch {
    return [];
  }
}

export function saveAttempts(attempts: AttemptRecord[]): void {
  try {
    const clean = attempts.filter((a) => !a.isSeedData && isValidSbdFormat(String(a.sbd ?? '')));
    window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Bỏ qua nếu đầy localStorage
  }
}

export const ATTEMPTS_STORAGE_KEY_EXPORT = ATTEMPTS_STORAGE_KEY;

export function mergeAttempts(
  local: readonly AttemptRecord[],
  remote: readonly AttemptRecord[]
): AttemptRecord[] {
  const byId = new Map<string, AttemptRecord>();
  for (const item of local) {
    if (!item || !item.id || item.isSeedData || !isValidSbdFormat(String(item.sbd ?? ''))) continue;
    byId.set(item.id, { ...item, isSeedData: false });
  }
  for (const item of remote) {
    if (!item || !item.id || item.isSeedData || !isValidSbdFormat(String(item.sbd ?? ''))) continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, {
        ...item,
        syncedToDrive: Boolean(item.syncedToDrive),
        isSeedData: false,
      });
    } else {
      byId.set(item.id, {
        ...existing,
        syncedToDrive: Boolean(existing.syncedToDrive || item.syncedToDrive),
        isSeedData: false,
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}
