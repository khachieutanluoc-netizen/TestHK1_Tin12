import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { AttemptRecord } from '../types/exam';

// Thư mục Google Drive đích được người dùng chỉ định
export const DRIVE_TARGET_FOLDER_ID = '13noH2pKEpJVVfwy5r2zO-q_U4GVEI46x';
export const DRIVE_TARGET_FOLDER_URL =
  'https://drive.google.com/drive/folders/13noH2pKEpJVVfwy5r2zO-q_U4GVEI46x?usp=sharing';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const CONSOLIDATED_FILE_NAME = 'vinhlong_tinhoc12_hk1_2026_consolidated.json';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

// TUYỆT ĐỐI chỉ lưu accessToken trong bộ nhớ RAM (không lưu localStorage/sessionStorage)
let cachedAccessToken: string | null = null;

function ensureAuth(): Auth {
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!firebaseAuth) {
    firebaseAuth = getAuth(firebaseApp);
  }
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
    throw new Error('Phiên Google Drive đã hết hạn. Vui lòng đăng nhập lại bằng Google.');
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
    throw new Error('Không đủ quyền hoặc token Google Drive đã hết hạn. Vui lòng đăng nhập lại.');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Lỗi Google Drive API (${res.status}): ${errText.slice(0, 180)}`);
  }
  return (await res.json()) as T;
}

export async function listDriveJsonFiles(): Promise<DriveFileMeta[]> {
  const query = `'${DRIVE_TARGET_FOLDER_ID}' in parents and trashed = false and mimeType = 'application/json'`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime)',
    pageSize: '100',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const data = await driveFetchJson<{ files?: DriveFileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`
  );
  return data.files ?? [];
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

/**
 * Đọc tất cả các tệp kết quả JSON trong thư mục Drive được chia sẻ để đồng bộ về thiết bị.
 */
export async function fetchRemoteAttemptsFromDrive(): Promise<AttemptRecord[]> {
  const files = await listDriveJsonFiles();
  const collected: AttemptRecord[] = [];

  for (const file of files) {
    if (!file.name.startsWith('ketqua_') && file.name !== CONSOLIDATED_FILE_NAME) {
      continue;
    }
    try {
      const content = await driveFetchJson<AttemptRecord | { attempts?: AttemptRecord[] }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`
      );
      if (Array.isArray((content as { attempts?: AttemptRecord[] }).attempts)) {
        for (const item of (content as { attempts: AttemptRecord[] }).attempts) {
          if (item && item.id && item.exam) {
            collected.push({ ...item, syncedToDrive: true });
          }
        }
      } else if ((content as AttemptRecord).id && (content as AttemptRecord).exam) {
        collected.push({ ...(content as AttemptRecord), syncedToDrive: true });
      }
    } catch {
      // Bỏ qua tệp không đúng định dạng hoặc không đọc được
    }
  }

  return collected;
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
      attempts: realOrExportable.map((a) => ({ ...a, syncedToDrive: true })),
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
