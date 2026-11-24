import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { isFirestoreQuotaError } from './syncReconciler';

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const firebaseAuth: Auth = getAuth(firebaseApp);

function createFirestoreInstance(): Firestore {
  const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  if (isBrowser) {
    try {
      return initializeFirestore(
        firebaseApp,
        {
          experimentalAutoDetectLongPolling: true,
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      // Dự phòng nếu trình duyệt chặn IndexedDB (ẩn danh / iframe hạn chế)
    }
  }
  try {
    return initializeFirestore(
      firebaseApp,
      { experimentalAutoDetectLongPolling: true },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  }
}

// CRITICAL: Pass firebaseConfig.firestoreDatabaseId so the SDK targets the provisioned Enterprise Firestore instance
export const firestoreDb: Firestore = createFirestoreInstance();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;
export const FIRESTORE_PRICING_URL = 'https://firebase.google.com/pricing#cloud-firestore';
export const FIREBASE_AUTH_DOMAINS_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`;

let connectionTested = false;

export interface ConnectionTestResult {
  ok: boolean;
  quotaExceeded: boolean;
}

export async function testFirestoreConnection(force = false): Promise<ConnectionTestResult> {
  if (connectionTested && !force) return { ok: true, quotaExceeded: false };
  connectionTested = true;
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    return { ok: true, quotaExceeded: false };
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      return { ok: false, quotaExceeded: true };
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (Firestore client is offline).');
    }
    return { ok: false, quotaExceeded: false };
  }
}
