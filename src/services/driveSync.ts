import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { AttemptRecord } from '../types/exam';
import { hydrateAttemptFromFirestore } from './attemptNormalizer';
import { FIREBASE_AUTH_DOMAINS_URL, firebaseAuth } from './firebaseClient';

export { FIREBASE_AUTH_DOMAINS_URL };

export interface DriveAuthErrorInfo {
  code: string;
  message: string;
  isUnauthorizedDomain: boolean;
  hostname: string;
  authDomainsUrl: string;
}

export function formatDriveAuthError(err: unknown, hostnameOverride?: string): DriveAuthErrorInfo {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const combined = `${code} ${rawMessage}`.toLowerCase();
  const hostname =
    hostnameOverride ?? (typeof window !== 'undefined' ? window.location.hostname : '');

  if (combined.includes('auth/unauthorized-domain') || combined.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      message: hostname
        ? `Tên miền "${hostname}" chưa được thêm vào danh sách Authorized domains của Firebase Authentication nên trình duyệt chặn đăng nhập Google Drive.`
        : 'Tên miền hiện tại chưa được thêm vào danh sách Authorized domains của Firebase Authentication nên không thể đăng nhập Google Drive.',
      isUnauthorizedDomain: true,
      hostname,
      authDomainsUrl: FIREBASE_AUTH_DOMAINS_URL,
    };
  }

  if (combined.includes('auth/popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      message:
        'Trình duyệt đã chặn cửa sổ đăng nhập Google (popup). Vui lòng cho phép mở cửa sổ bật lên cho trang này rồi nhấn "Kết nối Google Drive" lại.',
      isUnauthorizedDomain: false,
      hostname,
      authDomainsUrl: FIREBASE_AUTH_DOMAINS_URL,
    };
  }

  if (
    combined.includes('auth/popup-closed-by-user') ||
    combined.includes('auth/cancelled-popup-request')
  ) {
    return {
      code: code || 'auth/popup-closed-by-user',
      message: 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất kết nối Google Drive.',
      isUnauthorizedDomain: false,
      hostname,
      authDomainsUrl: FIREBASE_AUTH_DOMAINS_URL,
    };
  }

  if (combined.includes('auth/network-request-failed')) {
    return {
      code: 'auth/network-request-failed',
      message: 'Lỗi kết nối mạng khi đăng nhập Google Drive. Vui lòng kiểm tra đường truyền và thử lại.',
      isUnauthorizedDomain: false,
      hostname,
      authDomainsUrl: FIREBASE_AUTH_DOMAINS_URL,
    };
  }

  return {
    code,
    message: rawMessage || 'Đăng nhập Google Drive thất bại. Vui lòng thử lại.',
    isUnauthorizedDomain: false,
    hostname,
    authDomainsUrl: FIREBASE_AUTH_DOMAINS_URL,
  };
}

// Thư mục Google Drive đích được người dùng chỉ định
export const DRIVE_TARGET_FOLDER_ID = '13noH2pKEpJVVfwy5r2zO-q_U4GVEI46x';
export const DRIVE_TARGET_FOLDER_URL =
  'https://drive.google.com/drive/folders/13noH2pKEpJVVfwy5r2zO-q_U4GVEI46x?usp=sharing';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const CONSOLIDATED_FILE_NAME = 'vinhlong_tinhoc12_hk1_2026_consolidated.json';

// TUYỆT ĐỐI chỉ lưu accessToken trong bộ nhớ RAM (không lưu localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

function ensureAuth() {
  return firebaseAuth;
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  const auth = ensureAuth();
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
    }
    callback(user);
  });
}

export async function signInWithGoogleDrive(): Promise<{ user: User; hasToken: boolean }> {
  const auth = ensureAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedAccessToken = credential?.accessToken ?? null;

  return {
    user: result.user,
    hasToken: Boolean(cachedAccessToken),
  };
}

export async function signOutGoogleDrive(): Promise<void> {
  const auth = ensureAuth();
  cachedAccessToken = null;
  await signOut(auth);
}

interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
}

async function driveFetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (!cachedAccessToken) {
    throw new Error('Phiên Google Drive đã hết hạn. Vui lòng kết nối lại bằng Google.');
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${cachedAccessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error(
      'Không đủ quyền hoặc token Google Drive đã hết hạn (401/403). Vui lòng kết nối lại bằng Google.'
    );
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Lỗi Google Drive API (${res.status}): ${errText.slice(0, 180)}`);
  }
  return (await res.json()) as T;
}

export async function listDriveJsonFiles(): Promise<DriveFileMeta[]> {
  const query = `'${DRIVE_TARGET_FOLDER_ID}' in parents and trashed = false`;
  const allFiles: DriveFileMeta[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,modifiedTime)',
      pageSize: '100',
      orderBy: 'modifiedTime desc',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const data = await driveFetchJson<{
      nextPageToken?: string;
      files?: DriveFileMeta[];
    }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);

    for (const f of data.files ?? []) {
      if (
        f.name.startsWith('ketqua_') ||
        f.name === CONSOLIDATED_FILE_NAME ||
        f.name.endsWith('.json')
      ) {
        allFiles.push(f);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Tải một tệp JSON kết quả mới lên thư mục Drive (không ghi đè tệp hiện có).
 */
export async function uploadNewAttemptToDrive(attempt: AttemptRecord): Promise<string> {
  if (!cachedAccessToken) {
    throw new Error('Chưa kết nối Google Drive.');
  }
  const fileName = `ketqua_${attempt.id}.json`;
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [DRIVE_TARGET_FOLDER_ID],
  };

  const payload: AttemptRecord = {
    ...attempt,
    syncedToDrive: true,
    isSeedData: false,
  };

  const boundary = '-------vlTinHocBoundary314159';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(payload, null, 2)}\r\n` +
    `--${boundary}--`;

  const created = await driveFetchJson<DriveFileMeta>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  return created.id;
}

export interface FetchDriveResult {
  attempts: AttemptRecord[];
  fileNames: Set<string>;
  errorCount: number;
}

/**
 * Đọc tất cả các tệp kết quả JSON trong thư mục Drive được chia sẻ để đồng bộ về thiết bị.
 */
export async function fetchRemoteAttemptsFromDrive(): Promise<FetchDriveResult> {
  const files = await listDriveJsonFiles();
  const collected = new Map<string, AttemptRecord>();
  const fileNames = new Set<string>(files.map((f) => f.name));
  let errorCount = 0;

  const targetFiles = files.filter(
    (f) => f.name.startsWith('ketqua_') || f.name === CONSOLIDATED_FILE_NAME
  );

  // Đọc song song theo từng lô 5 tệp để tối ưu tốc độ trên nhiều thiết bị
  const batchSize = 5;
  for (let i = 0; i < targetFiles.length; i += batchSize) {
    const batch = targetFiles.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await driveFetchJson<
            AttemptRecord | { attempts?: AttemptRecord[] }
          >(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`
          );
          if (Array.isArray((content as { attempts?: AttemptRecord[] }).attempts)) {
            for (const item of (content as { attempts: AttemptRecord[] }).attempts) {
              const hydrated = hydrateAttemptFromFirestore(item);
              if (hydrated) {
                collected.set(hydrated.id, {
                  ...hydrated,
                  syncedToDrive: true,
                  isSeedData: false,
                });
              } else if (item && item.id && item.exam && !item.isSeedData) {
                collected.set(item.id, {
                  ...item,
                  syncedToDrive: true,
                  isSeedData: false,
                });
              }
            }
          } else {
            const hydrated = hydrateAttemptFromFirestore(content);
            if (hydrated) {
              collected.set(hydrated.id, {
                ...hydrated,
                syncedToDrive: true,
                isSeedData: false,
              });
            } else if (
              (content as AttemptRecord).id &&
              (content as AttemptRecord).exam &&
              !(content as AttemptRecord).isSeedData
            ) {
              const item = content as AttemptRecord;
              collected.set(item.id, {
                ...item,
                syncedToDrive: true,
                isSeedData: false,
              });
            }
          }
        } catch {
          errorCount += 1;
        }
      })
    );
  }

  return {
    attempts: Array.from(collected.values()),
    fileNames,
    errorCount,
  };
}

export interface BidirectionalDriveSyncResult {
  remoteAttempts: AttemptRecord[];
  uploadedAttemptIds: string[];
  pulledCount: number;
  pushedCount: number;
  pushErrors: number;
  readErrors: number;
}

/**
 * Đồng bộ 2 chiều với Google Drive:
 * 1) Tải mọi kết quả từ thư mục Drive về thiết bị.
 * 2) Tự động tải lên những bài thi thực tế còn thiếu trên Drive (tạo tệp mới, không ghi đè).
 */
export async function syncBidirectionalWithDrive(
  localAttempts: readonly AttemptRecord[]
): Promise<BidirectionalDriveSyncResult> {
  const { attempts: remoteAttempts, fileNames, errorCount: readErrors } =
    await fetchRemoteAttemptsFromDrive();

  const remoteById = new Set<string>(remoteAttempts.map((a) => a.id));
  const pendingUpload = localAttempts.filter(
    (a) =>
      !a.isSeedData &&
      !remoteById.has(a.id) &&
      !fileNames.has(`ketqua_${a.id}.json`)
  );

  const uploadedAttemptIds: string[] = [];
  let pushErrors = 0;

  for (const att of pendingUpload) {
    try {
      await uploadNewAttemptToDrive(att);
      uploadedAttemptIds.push(att.id);
    } catch {
      pushErrors += 1;
    }
  }

  return {
    remoteAttempts,
    uploadedAttemptIds,
    pulledCount: remoteAttempts.length,
    pushedCount: uploadedAttemptIds.length,
    pushErrors,
    readErrors,
  };
}

export async function findConsolidatedDriveFile(): Promise<DriveFileMeta | null> {
  const files = await listDriveJsonFiles();
  return files.find((f) => f.name === CONSOLIDATED_FILE_NAME) ?? null;
}

/**
 * Tạo mới hoặc ghi đè tệp tổng hợp toàn bộ kết quả trên Google Drive.
 * CHÚ Ý: UI phải yêu cầu xác nhận rõ ràng từ người dùng trước khi gọi hàm này nếu tệp đã tồn tại.
 */
export async function upsertConsolidatedAttemptsToDrive(
  attempts: readonly AttemptRecord[],
  existingFileId: string | null
): Promise<string> {
  if (!cachedAccessToken) {
    throw new Error('Chưa kết nối Google Drive.');
  }

  const realOrExportable = attempts.filter((a) => !a.isSeedData);
  const jsonContent = JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      totalCount: realOrExportable.length,
      attempts: realOrExportable.map((a) => ({
        ...a,
        syncedToDrive: true,
        isSeedData: false,
      })),
    },
    null,
    2
  );

  if (existingFileId) {
    const updated = await driveFetchJson<DriveFileMeta>(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonContent,
      }
    );
    return updated.id;
  }

  const boundary = '-------vlTinHocConsolidated314159';
  const metadata = {
    name: CONSOLIDATED_FILE_NAME,
    mimeType: 'application/json',
    parents: [DRIVE_TARGET_FOLDER_ID],
  };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${jsonContent}\r\n` +
    `--${boundary}--`;

  const created = await driveFetchJson<DriveFileMeta>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  return created.id;
}
