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
  normalizeAttemptForFirestore,
  sanitizeAttemptDocId,
} from './attemptNormalizer';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  firebaseAuth,
  firestoreDb,
} from './firebaseClient';

export { normalizeAttemptForFirestore };

export const ATTEMPTS_COLLECTION = 'attempts';

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
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
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('Quota exceeded')) {
    return `Đã vượt hạn mức đọc/ghi miễn phí trong ngày của Firestore (đặt lại vào ngày mai). Xem chi tiết tại: https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;
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

function parseSnapshotDoc(raw: unknown): AttemptRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Partial<AttemptRecord>;
  if (
    typeof rec.id !== 'string' ||
    typeof rec.sbd !== 'string' ||
    !isValidSbdFormat(rec.sbd) ||
    !rec.exam ||
    !Array.isArray(rec.lessonBreakdown) ||
    rec.isSeedData === true
  ) {
    return null;
  }
  return {
    ...(rec as AttemptRecord),
    phone: typeof rec.phone === 'string' ? rec.phone : '',
    email: typeof rec.email === 'string' ? rec.email : '',
    syncedToDrive: Boolean(rec.syncedToDrive),
    isSeedData: false,
  };
}

function recordConfirmedDoc(item: AttemptRecord): void {
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
 * Đọc trực tiếp toàn bộ bài thi từ máy chủ Cloud Firestore (bỏ qua cache cục bộ để luôn lấy dữ liệu mới nhất).
 */
export async function fetchFirestoreAttempts(): Promise<AttemptRecord[]> {
  try {
    const q = query(
      collection(firestoreDb, ATTEMPTS_COLLECTION),
      where('isSeedData', '==', false)
    );
    const snap = await getDocsFromServer(q);
    const items: AttemptRecord[] = [];
    snap.forEach((docSnap) => {
      const parsed = parseSnapshotDoc(docSnap.data());
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
 * Lắng nghe thay đổi thời gian thực từ Cloud Firestore, phân biệt dữ liệu đã xác nhận trên máy chủ vs cache cục bộ.
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
      const items: AttemptRecord[] = [];
      const confirmedIdsInSnap = new Set<string>();
      snap.forEach((docSnap) => {
        const parsed = parseSnapshotDoc(docSnap.data());
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
  if (!user || !user.emailVerified) {
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
    recordConfirmedDoc(payload);
    return true;
  } catch (createError) {
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
}

/**
 * Đẩy từng lượt thi lên Cloud Firestore độc lập: một bản ghi lỗi không làm gián đoạn các bản ghi khác.
 */
export async function pushAttemptsToFirestoreDetailed(
  attempts: readonly AttemptRecord[],
  saver: (attempt: AttemptRecord) => Promise<boolean> = saveAttemptToFirestore
): Promise<BatchPushResult> {
  const realAttempts = attempts.filter((a) => !a.isSeedData);
  const pushedIds: string[] = [];
  const alreadyRemoteIds: string[] = [];
  const failed: Array<{ id: string; error: unknown }> = [];

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
    }
  }

  return { pushedIds, alreadyRemoteIds, failed };
}

export async function pushAttemptsToFirestore(
  attempts: readonly AttemptRecord[]
): Promise<number> {
  const res = await pushAttemptsToFirestoreDetailed(attempts);
  return res.pushedIds.length;
}
