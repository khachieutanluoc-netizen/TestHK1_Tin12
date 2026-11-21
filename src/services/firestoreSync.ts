import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AttemptRecord } from '../types/exam';
import { isValidSbdFormat } from '../utils/examEngine';
import {
  hydrateAttemptFromFirestore,
  normalizeAttemptForFirestore,
  sanitizeAttemptDocId,
} from './attemptNormalizer';
import {
  FIRESTORE_PRICING_URL,
  FIRESTORE_UPGRADE_URL,
  firebaseAuth,
  firestoreDb,
} from './firebaseClient';
import {
  FIRESTORE_QUOTA_COOLDOWN_MS,
  isFirestoreQuotaError,
} from './syncReconciler';

export {
  FIRESTORE_PRICING_URL,
  FIRESTORE_UPGRADE_URL,
  hydrateAttemptFromFirestore,
  isFirestoreQuotaError,
  normalizeAttemptForFirestore,
};

export const ATTEMPTS_COLLECTION = 'attempts';
const QUOTA_COOLDOWN_STORAGE_KEY = 'vl_tinhoc_firestore_quota_until_v1';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let quotaCooldownUntilMs = 0;

function readStoredQuotaCooldown(): number {
  if (quotaCooldownUntilMs > 0) return quotaCooldownUntilMs;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(QUOTA_COOLDOWN_STORAGE_KEY);
      const parsed = raw ? Number(raw) : 0;
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        quotaCooldownUntilMs = parsed;
        return parsed;
      }
    }
  } catch {
    // Bỏ qua nếu trình duyệt hạn chế sessionStorage
  }
  return 0;
}

export function isFirestoreInQuotaCooldown(nowMs = Date.now()): boolean {
  return readStoredQuotaCooldown() > nowMs;
}

export function tripFirestoreQuotaCooldown(durationMs = FIRESTORE_QUOTA_COOLDOWN_MS): number {
  const until = Date.now() + durationMs;
  quotaCooldownUntilMs = until;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(QUOTA_COOLDOWN_STORAGE_KEY, String(until));
    }
  } catch {
    // Bỏ qua nếu trình duyệt hạn chế sessionStorage
  }
  return until;
}

export function clearFirestoreQuotaCooldown(): void {
  quotaCooldownUntilMs = 0;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(QUOTA_COOLDOWN_STORAGE_KEY);
    }
  } catch {
    // Bỏ qua
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) {
    tripFirestoreQuotaCooldown();
  }
  const user = firebaseAuth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid ?? null,
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId ?? null,
      providerInfo:
        user?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  const serialized = JSON.stringify(errInfo);
  console.error('Firestore Error: ', serialized);
  throw new Error(serialized);
}

export function formatFirestoreUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (isFirestoreQuotaError(err)) {
    return 'Cloud Firestore đã chạm hạn mức đọc/ghi miễn phí trong ngày (tự đặt lại vào ngày mai). Hệ thống vẫn lưu an toàn trên thiết bị, máy chủ ứng dụng và Google Drive.';
  }
  if (raw.includes('client is offline') || raw.includes('unavailable')) {
    return 'Thiết bị đang ngoại tuyến hoặc kết nối tới Cloud Firestore bị gián đoạn. Hệ thống sẽ tự động đồng bộ lại khi có mạng.';
  }
  if (raw.includes('Missing or insufficient permissions')) {
    return 'Không có quyền ghi dữ liệu lên Cloud Firestore hoặc định dạng bài thi chưa hợp lệ.';
  }
  return 'Không thể đồng bộ dữ liệu trực tuyến với Cloud Firestore. Vui lòng kiểm tra kết nối mạng và thử lại.';
}

// Theo dõi các ID đã xác nhận thực sự có trên máy chủ Firestore (không tính cache cục bộ chưa ghi)
const knownRemoteIds = new Set<string>();
const knownSyncedToDriveIds = new Set<string>();

export function getConfirmedFirestoreIds(): Set<string> {
  return new Set(knownRemoteIds);
}

function recordConfirmedDoc(item: { id: string; syncedToDrive?: boolean }): void {
  knownRemoteIds.add(item.id);
  if (item.syncedToDrive) {
    knownSyncedToDriveIds.add(item.id);
  }
}

export interface FirestoreSnapshotUpdate {
  attempts: AttemptRecord[];
  fromCache: boolean;
  hasPendingWrites: boolean;
  confirmedServerIds: Set<string>;
}

/**
 * Đọc trực tiếp toàn bộ bài thi từ máy chủ Cloud Firestore (chỉ gọi khi thực sự cần làm mới thủ công trên Dashboard).
 */
export async function fetchFirestoreAttempts(): Promise<AttemptRecord[]> {
  if (isFirestoreInQuotaCooldown()) {
    throw new Error('Quota exceeded (cooldown active)');
  }
  try {
    const q = query(
      collection(firestoreDb, ATTEMPTS_COLLECTION),
      where('isSeedData', '==', false)
    );
    const snap = await getDocsFromServer(q);
    clearFirestoreQuotaCooldown();
    const items: AttemptRecord[] = [];
    snap.forEach((docSnap) => {
      const parsed = hydrateAttemptFromFirestore(docSnap.data());
      if (parsed) {
        items.push(parsed);
        recordConfirmedDoc(parsed);
      }
    });
    return items.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ATTEMPTS_COLLECTION);
  }
}

/**
 * Truy vấn đích danh lịch sử của 1 thí sinh theo SBD 8 chữ số — chỉ đọc 1–5 bản ghi thay vì tải toàn tỉnh (tiết kiệm >98% hạn mức đọc).
 */
export async function fetchFirestoreAttemptsBySbd(sbd: string): Promise<AttemptRecord[]> {
  if (!isValidSbdFormat(sbd)) return [];
  if (isFirestoreInQuotaCooldown()) return [];
  try {
    const q = query(
      collection(firestoreDb, ATTEMPTS_COLLECTION),
      where('isSeedData', '==', false),
      where('sbd', '==', sbd)
    );
    const snap = await getDocsFromServer(q);
    clearFirestoreQuotaCooldown();
    const items: AttemptRecord[] = [];
    snap.forEach((docSnap) => {
      const parsed = hydrateAttemptFromFirestore(docSnap.data());
      if (parsed) {
        items.push(parsed);
        recordConfirmedDoc(parsed);
      }
    });
    return items.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      tripFirestoreQuotaCooldown();
      return [];
    }
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('index') || msg.includes('failed-precondition')) {
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, `${ATTEMPTS_COLLECTION}?sbd=${sbd}`);
  }
}

/**
 * Lắng nghe thay đổi thời gian thực từ Cloud Firestore (chỉ kích hoạt khi mở Dashboard / xem toàn tỉnh, tiết kiệm tối đa lượt đọc).
 */
export function subscribeFirestoreAttempts(
  onUpdate: (update: FirestoreSnapshotUpdate) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(firestoreDb, ATTEMPTS_COLLECTION),
    where('isSeedData', '==', false)
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.metadata.fromCache) {
        clearFirestoreQuotaCooldown();
      }
      const items: AttemptRecord[] = [];
      const confirmedIdsInSnap = new Set<string>();
      snap.forEach((docSnap) => {
        const parsed = hydrateAttemptFromFirestore(docSnap.data());
        if (!parsed) return;
        items.push(parsed);
        const isServerConfirmed =
          !snap.metadata.fromCache && !docSnap.metadata.hasPendingWrites;
        if (isServerConfirmed) {
          recordConfirmedDoc(parsed);
          confirmedIdsInSnap.add(parsed.id);
        }
      });
      items.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      onUpdate({
        attempts: items,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
        confirmedServerIds: confirmedIdsInSnap,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, ATTEMPTS_COLLECTION);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    }
  );
}

export async function markAttemptSyncedToDriveInFirestore(attemptId: string): Promise<boolean> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified || isFirestoreInQuotaCooldown()) {
    return false;
  }
  const safeId = sanitizeAttemptDocId(attemptId);
  const path = `${ATTEMPTS_COLLECTION}/${safeId}`;
  try {
    await updateDoc(doc(firestoreDb, ATTEMPTS_COLLECTION, safeId), {
      syncedToDrive: true,
    });
    knownRemoteIds.add(safeId);
    knownSyncedToDriveIds.add(safeId);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveAttemptToFirestore(attempt: AttemptRecord): Promise<boolean> {
  if (attempt.isSeedData) return false;
  if (isFirestoreInQuotaCooldown()) {
    throw new Error('Quota exceeded (cooldown active)');
  }
  const payload = normalizeAttemptForFirestore(attempt);
  const path = `${ATTEMPTS_COLLECTION}/${payload.id}`;
  const docRef = doc(firestoreDb, ATTEMPTS_COLLECTION, payload.id);

  if (knownRemoteIds.has(payload.id)) {
    if (
      payload.syncedToDrive &&
      !knownSyncedToDriveIds.has(payload.id) &&
      firebaseAuth.currentUser?.emailVerified
    ) {
      return markAttemptSyncedToDriveInFirestore(payload.id);
    }
    return false;
  }

  try {
    await setDoc(docRef, payload);
    clearFirestoreQuotaCooldown();
    recordConfirmedDoc(payload);
    return true;
  } catch (createError) {
    if (isFirestoreQuotaError(createError)) {
      handleFirestoreError(createError, OperationType.CREATE, path);
    }
    // Nếu thất bại do bản ghi đã tồn tại trên máy chủ Firestore (allow update yêu cầu đăng nhập),
    // kiểm tra trực tiếp trên máy chủ để xác nhận đồng bộ thay vì báo lỗi giả.
    try {
      const existing = await getDocFromServer(docRef);
      if (existing.exists()) {
        knownRemoteIds.add(payload.id);
        if (existing.data()?.syncedToDrive) {
          knownSyncedToDriveIds.add(payload.id);
        } else if (payload.syncedToDrive && firebaseAuth.currentUser?.emailVerified) {
          return markAttemptSyncedToDriveInFirestore(payload.id);
        }
        return false;
      }
    } catch {
      // Bỏ qua lỗi kiểm tra phụ, ném lại lỗi ghi gốc bên dưới
    }
    handleFirestoreError(createError, OperationType.CREATE, path);
  }
}

export interface BatchPushResult {
  pushedIds: string[];
  alreadyRemoteIds: string[];
  failed: Array<{ id: string; error: unknown }>;
  abortedByQuota: boolean;
}

/**
 * Đẩy từng lượt thi lên Cloud Firestore độc lập:
 * - Một bản ghi lỗi thông thường không làm gián đoạn các bản ghi khác.
 * - Nếu chạm hạn mức Quota, dừng ngay vòng lặp để tránh gửi thêm yêu cầu dư thừa.
 */
export async function pushAttemptsToFirestoreDetailed(
  attempts: readonly AttemptRecord[],
  saver: (attempt: AttemptRecord) => Promise<boolean> = saveAttemptToFirestore
): Promise<BatchPushResult> {
  const realAttempts = attempts.filter((a) => !a.isSeedData);
  const pushedIds: string[] = [];
  const alreadyRemoteIds: string[] = [];
  const failed: Array<{ id: string; error: unknown }> = [];
  let abortedByQuota = false;

  for (const att of realAttempts) {
    try {
      const wrote = await saver(att);
      if (wrote) {
        pushedIds.push(att.id);
      } else {
        alreadyRemoteIds.push(att.id);
      }
    } catch (error) {
      failed.push({ id: att.id, error });
      if (isFirestoreQuotaError(error)) {
        abortedByQuota = true;
        break;
      }
    }
  }

  return { pushedIds, alreadyRemoteIds, failed, abortedByQuota };
}

export async function pushAttemptsToFirestore(
  attempts: readonly AttemptRecord[]
): Promise<number> {
  const res = await pushAttemptsToFirestoreDetailed(attempts);
  return res.pushedIds.length;
}
