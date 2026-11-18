import {
  collection,
  doc,
  getDoc,
  getDocs,
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
  return 'Không thể đồng bộ dữ liệu trực tuyến với Firestore. Vui lòng kiểm tra kết nối mạng và thử lại.';
}

// Theo dõi các ID đã xác nhận có trên Firestore để tránh ghi trùng lặp
const knownRemoteIds = new Set<string>();
const knownSyncedToDriveIds = new Set<string>();

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

function recordKnownDocs(list: readonly AttemptRecord[]): void {
  for (const item of list) {
    knownRemoteIds.add(item.id);
    if (item.syncedToDrive) {
      knownSyncedToDriveIds.add(item.id);
    }
  }
}

export async function fetchFirestoreAttempts(): Promise<AttemptRecord[]> {
  try {
    const q = query(
      collection(firestoreDb, ATTEMPTS_COLLECTION),
      where('isSeedData', '==', false)
    );
    const snap = await getDocs(q);
    const items: AttemptRecord[] = [];
    snap.forEach((docSnap) => {
      const parsed = parseSnapshotDoc(docSnap.data());
      if (parsed) {
        items.push(parsed);
      }
    });
    recordKnownDocs(items);
    return items.sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ATTEMPTS_COLLECTION);
  }
}

export function subscribeFirestoreAttempts(
  onAttempts: (attempts: AttemptRecord[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(firestoreDb, ATTEMPTS_COLLECTION),
    where('isSeedData', '==', false)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: AttemptRecord[] = [];
      snap.forEach((docSnap) => {
        const parsed = parseSnapshotDoc(docSnap.data());
        if (parsed) {
          items.push(parsed);
        }
      });
      recordKnownDocs(items);
      items.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
      onAttempts(items);
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
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      knownRemoteIds.add(payload.id);
      if (existing.data()?.syncedToDrive) {
        knownSyncedToDriveIds.add(payload.id);
      } else if (payload.syncedToDrive && firebaseAuth.currentUser?.emailVerified) {
        return markAttemptSyncedToDriveInFirestore(payload.id);
      }
      return false;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  try {
    await setDoc(docRef, payload);
    knownRemoteIds.add(payload.id);
    if (payload.syncedToDrive) {
      knownSyncedToDriveIds.add(payload.id);
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function pushAttemptsToFirestore(
  attempts: readonly AttemptRecord[]
): Promise<number> {
  const realAttempts = attempts.filter((a) => !a.isSeedData);
  let pushed = 0;
  for (const att of realAttempts) {
    const wrote = await saveAttemptToFirestore(att);
    if (wrote) pushed += 1;
  }
  return pushed;
}
