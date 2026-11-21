import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ActiveExamView } from './components/ActiveExamView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DashboardView } from './components/DashboardView';
import { ExamResultView } from './components/ExamResultView';
import { ExamSetupView } from './components/ExamSetupView';
import { AppTab, Header } from './components/Header';
import { LessonPracticeView } from './components/LessonPracticeView';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from './data/questionBank';
import {
  DRIVE_TARGET_FOLDER_URL,
  findConsolidatedDriveFile,
  getCachedDriveToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  subscribeAuthState,
  syncBidirectionalWithDrive,
  uploadNewAttemptToDrive,
  upsertConsolidatedAttemptsToDrive,
} from './services/driveSync';
import { testFirestoreConnection } from './services/firebaseClient';
import {
  clearFirestoreQuotaCooldown,
  fetchFirestoreAttempts,
  fetchFirestoreAttemptsBySbd,
  formatFirestoreUserMessage,
  getConfirmedFirestoreIds,
  isFirestoreInQuotaCooldown,
  isFirestoreQuotaError,
  markAttemptSyncedToDriveInFirestore,
  pushAttemptsToFirestoreDetailed,
  saveAttemptToFirestore,
  subscribeFirestoreAttempts,
  tripFirestoreQuotaCooldown,
} from './services/firestoreSync';
import {
  fetchServerAttempts,
  pushAttemptsToServer,
  subscribeServerAttemptStream,
} from './services/serverSync';
import {
  ATTEMPTS_STORAGE_KEY_EXPORT,
  loadAttempts,
  loadSavedCandidate,
  mergeAttempts,
  saveAttempts,
  saveCandidate,
} from './services/storage';
import {
  CloudSyncStatus,
  computeCloudSyncSummary,
  findAttemptsMissingOnRemote,
  haveAttemptsChanged,
} from './services/syncReconciler';
import { AttemptRecord, GeneratedExam, StudentAnswers } from './types/exam';
import { CandidateInfo, generateExam, gradeExam, isValidSbdFormat } from './utils/examEngine';

type ExamMode = 'setup' | 'active' | 'result';

interface PendingConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'primary' | 'warning' | 'danger';
  action: () => void;
}

const SYNC_CHANNEL_NAME = 'vl_tinhoc_sync_channel';

function broadcastLocalSync(): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
      ch.postMessage({ type: 'attempts-updated', at: Date.now() });
      ch.close();
    }
  } catch {
    // Bỏ qua nếu trình duyệt hạn chế BroadcastChannel
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('exam');
  const [examMode, setExamMode] = useState<ExamMode>('setup');
  const [candidate, setCandidate] = useState<CandidateInfo>(
    () => loadSavedCandidate() ?? { school: '', sbd: '', phone: '', email: '' }
  );
  const [isNewlyGeneratedSbd, setIsNewlyGeneratedSbd] = useState<boolean>(false);
  const activeExamCandidateRef = useRef<CandidateInfo>(candidate);
  const [attempts, setAttempts] = useState<AttemptRecord[]>(() => loadAttempts());
  const attemptsRef = useRef<AttemptRecord[]>(attempts);
  attemptsRef.current = attempts;

  const [currentExam, setCurrentExam] = useState<GeneratedExam | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Google Drive Auth & Sync state (accessToken chỉ giữ trong bộ nhớ RAM ở driveSync.ts)
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [isRefreshingCloud, setIsRefreshingCloud] = useState<boolean>(false);
  const [confirmedCloudIds, setConfirmedCloudIds] = useState<Set<string>>(() => new Set());
  const confirmedCloudIdsRef = useRef<Set<string>>(confirmedCloudIds);
  const [provinceSyncEnabled, setProvinceSyncEnabled] = useState<boolean>(false);
  const [firestoreRetryNonce, setFirestoreRetryNonce] = useState<number>(0);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    if (isFirestoreInQuotaCooldown()) return 'quota';
    return 'synced';
  });
  const [cloudErrorMessage, setCloudErrorMessage] = useState<string | null>(null);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);

  const [statusBanner, setStatusBanner] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmState | null>(null);

  const cloudSyncInFlightRef = useRef<boolean>(false);
  const lastManualFirestoreFetchRef = useRef<number>(0);
  const snapshotHealthyRef = useRef<boolean>(false);
  const lookedUpSbdsRef = useRef<Set<string>>(new Set());
  const pendingPushInFlightRef = useRef<boolean>(false);

  const commitAttempts = useCallback((next: AttemptRecord[], broadcast = false) => {
    attemptsRef.current = next;
    setAttempts(next);
    saveAttempts(next);
    if (broadcast) {
      broadcastLocalSync();
    }
  }, []);

  const addConfirmedCloudIds = useCallback((ids: Iterable<string>) => {
    let added = false;
    const next = new Set(confirmedCloudIdsRef.current);
    for (const id of ids) {
      if (id && !next.has(id)) {
        next.add(id);
        added = true;
      }
    }
    if (added) {
      confirmedCloudIdsRef.current = next;
      setConfirmedCloudIds(next);
    }
  }, []);

  const showBanner = useCallback(
    (tone: 'success' | 'error' | 'info', message: string) => {
      setStatusBanner({ tone, message });
    },
    []
  );

  // Đồng bộ miễn phí qua Express backend cục bộ (0 lượt đọc Firestore)
  const syncWithServerOnly = useCallback(async (): Promise<AttemptRecord[] | null> => {
    try {
      const serverAttempts = await fetchServerAttempts();
      if (serverAttempts === null) return null;

      const currentLocal = attemptsRef.current;
      let merged = mergeAttempts(currentLocal, serverAttempts);

      const serverById = new Map(serverAttempts.map((a) => [a.id, a]));
      const needsServerPush = merged.filter((a) => {
        if (a.isSeedData) return false;
        const onServer = serverById.get(a.id);
        return !onServer || (Boolean(a.syncedToDrive) && !Boolean(onServer.syncedToDrive));
      });

      if (needsServerPush.length > 0) {
        const afterPush = await pushAttemptsToServer(needsServerPush);
        if (afterPush) {
          merged = mergeAttempts(merged, afterPush);
        }
      }

      if (haveAttemptsChanged(currentLocal, merged)) {
        commitAttempts(merged, false);
      }
      return merged;
    } catch {
      return null;
    }
  }, [commitAttempts]);

  // Đẩy riêng các bài thi còn thiếu trên Firestore (chỉ ghi setDoc, 0 lượt list đọc toàn tỉnh)
  const pushPendingLocalAttemptsToFirestore = useCallback(
    async (candidateList: readonly AttemptRecord[]): Promise<boolean> => {
      if (pendingPushInFlightRef.current || isFirestoreInQuotaCooldown()) return false;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

      const missing = findAttemptsMissingOnRemote(candidateList, getConfirmedFirestoreIds());
      if (missing.length === 0) return true;

      pendingPushInFlightRef.current = true;
      try {
        const pushRes = await pushAttemptsToFirestoreDetailed(missing);
        addConfirmedCloudIds([...pushRes.pushedIds, ...pushRes.alreadyRemoteIds]);
        if (pushRes.abortedByQuota) {
          setCloudSyncStatus('quota');
          setCloudErrorMessage(formatFirestoreUserMessage(pushRes.failed[0]?.error));
          return false;
        }
        if (pushRes.failed.length > 0) {
          setCloudSyncStatus('error');
          setCloudErrorMessage(formatFirestoreUserMessage(pushRes.failed[0]?.error));
          return false;
        }
        if (pushRes.pushedIds.length > 0) {
          setLastCloudSyncAt(Date.now());
        }
        return true;
      } finally {
        pendingPushInFlightRef.current = false;
      }
    },
    [addConfirmedCloudIds]
  );

  // Truy vấn đích danh lịch sử 1 thí sinh theo SBD (tiết kiệm >98% lượt đọc so với tải toàn tỉnh)
  const lookupAttemptsBySbd = useCallback(
    async (rawSbd: string) => {
      if (!isValidSbdFormat(rawSbd)) return;
      if (snapshotHealthyRef.current) return;
      if (lookedUpSbdsRef.current.has(rawSbd)) return;
      if (isFirestoreInQuotaCooldown()) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      lookedUpSbdsRef.current.add(rawSbd);
      try {
        const found = await fetchFirestoreAttemptsBySbd(rawSbd);
        if (found.length > 0) {
          addConfirmedCloudIds(found.map((a) => a.id));
          const merged = mergeAttempts(attemptsRef.current, found);
          if (haveAttemptsChanged(attemptsRef.current, merged)) {
            commitAttempts(merged, false);
          }
          setLastCloudSyncAt(Date.now());
        }
      } catch (err) {
        lookedUpSbdsRef.current.delete(rawSbd);
        if (isFirestoreQuotaError(err)) {
          setCloudSyncStatus('quota');
          setCloudErrorMessage(formatFirestoreUserMessage(err));
        }
      }
    },
    [addConfirmedCloudIds, commitAttempts]
  );

  // Đồng bộ thủ công có kiểm soát hạn mức (tránh gọi getDocsFromServer trùng lặp gây vượt quota)
  const syncWithCloud = useCallback(
    async (opts?: { silent?: boolean; forceFirestoreRead?: boolean }) => {
      if (cloudSyncInFlightRef.current) return false;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setCloudSyncStatus('offline');
        setCloudErrorMessage('Thiết bị đang ngoại tuyến. Sẽ tự động đồng bộ lại khi có kết nối mạng.');
        if (!opts?.silent) {
          showBanner(
            'info',
            'Thiết bị đang ngoại tuyến. Kết quả được lưu an toàn trên máy và sẽ tự động đồng bộ khi có mạng.'
          );
        }
        return false;
      }

      cloudSyncInFlightRef.current = true;
      if (!opts?.silent) setIsRefreshingCloud(true);

      try {
        // Luôn đồng bộ Express backend trước (0 lượt đọc Firestore)
        await syncWithServerOnly();

        if (isFirestoreInQuotaCooldown()) {
          setCloudSyncStatus('quota');
          setCloudErrorMessage(
            'Cloud Firestore đã tạm chạm hạn mức đọc miễn phí trong ngày (tự động đặt lại vào ngày mai).'
          );
          if (!opts?.silent) {
            const realCount = attemptsRef.current.filter((a) => !a.isSeedData).length;
            showBanner(
              'info',
              `Đã làm mới từ máy chủ ứng dụng & thiết bị (${realCount} lượt). Cloud Firestore đang tạm nghỉ do chạm hạn mức miễn phí trong ngày.`
            );
          }
          return false;
        }

        const now = Date.now();
        const canReuseLiveSnapshot =
          snapshotHealthyRef.current &&
          !opts?.forceFirestoreRead &&
          now - lastManualFirestoreFetchRef.current < 60_000;

        if (canReuseLiveSnapshot) {
          await pushPendingLocalAttemptsToFirestore(attemptsRef.current);
          setCloudSyncStatus('synced');
          setCloudErrorMessage(null);
          setLastCloudSyncAt(Date.now());
          if (!opts?.silent) {
            const realCount = attemptsRef.current.filter((a) => !a.isSeedData).length;
            showBanner(
              'success',
              `Dữ liệu đang đồng bộ thời gian thực với Cloud Firestore (${realCount} lượt thi).`
            );
          }
          return true;
        }

        setCloudSyncStatus('syncing');
        lastManualFirestoreFetchRef.current = now;

        const firestoreAttempts = await fetchFirestoreAttempts();
        const remoteIds = new Set(firestoreAttempts.map((a) => a.id));
        addConfirmedCloudIds(remoteIds);

        const currentLocal = attemptsRef.current;
        const merged = mergeAttempts(currentLocal, firestoreAttempts);
        if (haveAttemptsChanged(currentLocal, merged)) {
          commitAttempts(merged, false);
        }

        const missingOnFirestore = findAttemptsMissingOnRemote(merged, remoteIds);
        if (missingOnFirestore.length > 0) {
          const pushRes = await pushAttemptsToFirestoreDetailed(missingOnFirestore);
          addConfirmedCloudIds([...pushRes.pushedIds, ...pushRes.alreadyRemoteIds]);
          if (pushRes.abortedByQuota) {
            setCloudSyncStatus('quota');
            setCloudErrorMessage(formatFirestoreUserMessage(pushRes.failed[0]?.error));
            return false;
          }
          if (pushRes.failed.length > 0) {
            const errMsg = `${formatFirestoreUserMessage(pushRes.failed[0]?.error)} (Còn ${pushRes.failed.length} lượt thi chưa lên Cloud.)`;
            setCloudSyncStatus('error');
            setCloudErrorMessage(errMsg);
            if (!opts?.silent) showBanner('error', errMsg);
            return false;
          }
        }

        // Cập nhật ngược lại Express backend để các thiết bị khác đọc miễn phí
        void syncWithServerOnly();

        setCloudSyncStatus('synced');
        setCloudErrorMessage(null);
        setLastCloudSyncAt(Date.now());

        if (!opts?.silent) {
          const realCount = merged.filter((a) => !a.isSeedData).length;
          showBanner(
            'success',
            `Đã đồng bộ trực tuyến Cloud Firestore (${realCount} lượt thi trên toàn hệ thống).`
          );
        }
        return true;
      } catch (err) {
        const isQuota = isFirestoreQuotaError(err);
        const errMsg = formatFirestoreUserMessage(err);
        setCloudSyncStatus(
          isQuota
            ? 'quota'
            : typeof navigator !== 'undefined' && navigator.onLine === false
              ? 'offline'
              : 'error'
        );
        setCloudErrorMessage(errMsg);
        if (!opts?.silent && !isQuota) {
          showBanner('error', errMsg);
        }
        return false;
      } finally {
        cloudSyncInFlightRef.current = false;
        if (!opts?.silent) setIsRefreshingCloud(false);
      }
    },
    [addConfirmedCloudIds, commitAttempts, pushPendingLocalAttemptsToFirestore, showBanner, syncWithServerOnly]
  );

  // Theo dõi trạng thái Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeAuthState((user) => {
      setDriveUser(user);
      setHasDriveToken(Boolean(user && getCachedDriveToken()));
    });
    return () => unsubscribe();
  }, []);

  // Khởi tạo đồng bộ nhẹ (KHÔNG đọc toàn bộ Firestore trên Thẻ 1 / Thẻ 3 để tiết kiệm >95% hạn mức)
  useEffect(() => {
    let unmounted = false;

    void syncWithServerOnly();

    if (isFirestoreInQuotaCooldown()) {
      setCloudSyncStatus('quota');
    } else if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void testFirestoreConnection(false).then((res) => {
        if (unmounted) return;
        if (res.quotaExceeded) {
          tripFirestoreQuotaCooldown();
          setCloudSyncStatus('quota');
          setCloudErrorMessage(
            'Cloud Firestore đã tạm chạm hạn mức đọc miễn phí trong ngày (tự động đặt lại vào ngày mai).'
          );
          return;
        }
        if (res.ok && isValidSbdFormat(candidate.sbd)) {
          void lookupAttemptsBySbd(candidate.sbd);
        }
      });
    }

    // SSE chỉ cập nhật từ Express server (0 lượt đọc Firestore)
    const unsubscribeStream = subscribeServerAttemptStream(() => {
      void syncWithServerOnly();
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === ATTEMPTS_STORAGE_KEY_EXPORT && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as AttemptRecord[];
          if (Array.isArray(parsed)) {
            const merged = mergeAttempts(attemptsRef.current, parsed);
            attemptsRef.current = merged;
            setAttempts(merged);
          }
        } catch {
          // Bỏ qua JSON lỗi
        }
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.onmessage = () => {
          const fromStorage = loadAttempts();
          const merged = mergeAttempts(attemptsRef.current, fromStorage);
          attemptsRef.current = merged;
          setAttempts(merged);
        };
      }
    } catch {
      channel = null;
    }

    const handleOnline = () => {
      void syncWithServerOnly();
      if (!isFirestoreInQuotaCooldown()) {
        setFirestoreRetryNonce((n) => n + 1);
      }
    };

    const handleOffline = () => {
      snapshotHealthyRef.current = false;
      setCloudSyncStatus('offline');
      setCloudErrorMessage('Thiết bị đang ngoại tuyến. Sẽ tự động đồng bộ lại khi có mạng.');
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unmounted = true;
      unsubscribeStream();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (channel) {
        channel.close();
      }
    };
  }, [candidate.sbd, lookupAttemptsBySbd, syncWithServerOnly]);

  // Kích hoạt DUY NHẤT 1 luồng onSnapshot toàn tỉnh khi người dùng mở Dashboard (hoặc xem toàn bộ lịch sử Cloud),
  // giữ nguyên kết nối trong phiên để chuyển qua lại giữa các thẻ tốn 0 lượt đọc thêm, và tự ngắt khi chạm quota.
  useEffect(() => {
    if (!provinceSyncEnabled) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setCloudSyncStatus('offline');
      return;
    }
    if (isFirestoreInQuotaCooldown()) {
      setCloudSyncStatus('quota');
      return;
    }

    let unmounted = false;
    let unsubscribeFirestore: (() => void) | null = null;

    setCloudSyncStatus('syncing');
    unsubscribeFirestore = subscribeFirestoreAttempts(
      (update) => {
        if (unmounted) return;
        if (!update.fromCache) {
          snapshotHealthyRef.current = true;
          addConfirmedCloudIds(update.confirmedServerIds);
          setLastCloudSyncAt(Date.now());
          setCloudErrorMessage(null);
          setCloudSyncStatus('synced');
        }

        const currentLocal = attemptsRef.current;
        const merged = mergeAttempts(currentLocal, update.attempts);
        if (haveAttemptsChanged(currentLocal, merged)) {
          commitAttempts(merged, false);
        }

        // Nếu có bài thi trên máy chưa lên Cloud -> chỉ đẩy setDoc (0 lượt list đọc), đồng thời đồng bộ mirror server
        if (!update.fromCache) {
          void pushPendingLocalAttemptsToFirestore(merged);
          void syncWithServerOnly();
        }
      },
      (error) => {
        if (unmounted) return;
        snapshotHealthyRef.current = false;
        const isQuota = isFirestoreQuotaError(error);
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setCloudSyncStatus(isQuota ? 'quota' : isOffline ? 'offline' : 'error');
        setCloudErrorMessage(formatFirestoreUserMessage(error));
        if (isQuota && unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
      }
    );

    return () => {
      unmounted = true;
      snapshotHealthyRef.current = false;
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [
    addConfirmedCloudIds,
    commitAttempts,
    firestoreRetryNonce,
    provinceSyncEnabled,
    pushPendingLocalAttemptsToFirestore,
    syncWithServerOnly,
  ]);

  const cloudSyncSummary = useMemo(
    () => computeCloudSyncSummary(attempts, confirmedCloudIds),
    [attempts, confirmedCloudIds]
  );

  const selectedAttempt = useMemo(
    () => attempts.find((a) => a.id === selectedAttemptId) ?? null,
    [attempts, selectedAttemptId]
  );

  const unsyncedAttempts = useMemo(
    () => attempts.filter((a) => !a.isSeedData && !a.syncedToDrive),
    [attempts]
  );

  const studentHistory = useMemo(() => {
    if (!selectedAttempt) return [];
    return attempts.filter((a) => a.sbd === selectedAttempt.sbd);
  }, [attempts, selectedAttempt]);

  // Đồng bộ 2 chiều với Google Drive (tải về + đẩy bài thiếu lên Drive) rồi đồng bộ Cloud Firestore & máy chủ
  const runDriveTwoWaySync = useCallback(
    async (opts?: { emailLabel?: string; extraAttempt?: AttemptRecord }) => {
      setIsSyncingDrive(true);
      try {
        await syncWithServerOnly();

        const res = await syncBidirectionalWithDrive(attemptsRef.current);
        const uploadedSet = new Set(res.uploadedAttemptIds);

        if (
          opts?.extraAttempt &&
          !opts.extraAttempt.isSeedData &&
          !uploadedSet.has(opts.extraAttempt.id) &&
          !res.remoteAttempts.some((r) => r.id === opts.extraAttempt!.id)
        ) {
          await uploadNewAttemptToDrive(opts.extraAttempt);
          uploadedSet.add(opts.extraAttempt.id);
        }

        const updatedLocal = attemptsRef.current.map((a) =>
          uploadedSet.has(a.id) ? { ...a, syncedToDrive: true } : a
        );
        const merged = mergeAttempts(updatedLocal, res.remoteAttempts);
        commitAttempts(merged, true);

        const realMerged = merged.filter((a) => !a.isSeedData);
        if (realMerged.length > 0) {
          if (!isFirestoreInQuotaCooldown()) {
            const pushRes = await pushAttemptsToFirestoreDetailed(realMerged);
            addConfirmedCloudIds([...pushRes.pushedIds, ...pushRes.alreadyRemoteIds]);
            if (pushRes.abortedByQuota) {
              setCloudSyncStatus('quota');
            } else {
              for (const id of uploadedSet) {
                await markAttemptSyncedToDriveInFirestore(id).catch(() => false);
              }
            }
          }
          await pushAttemptsToServer(realMerged).catch(() => null);
        }

        const warnNote =
          res.readErrors > 0 || res.pushErrors > 0
            ? ` (Lưu ý: ${res.readErrors + res.pushErrors} tệp gặp lỗi mạng khi đồng bộ)`
            : '';
        const prefix = opts?.emailLabel
          ? `Đã kết nối Google Drive (${opts.emailLabel}). `
          : 'Đồng bộ Google Drive thành công: ';

        showBanner(
          'success',
          `${prefix}Nhận ${res.pulledCount} bài trên Drive, đẩy thêm ${uploadedSet.size} bài mới lên đám mây.${warnNote}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Không thể đồng bộ Google Drive.';
        showBanner('error', msg);
        setHasDriveToken(Boolean(getCachedDriveToken()));
      } finally {
        setIsSyncingDrive(false);
      }
    },
    [addConfirmedCloudIds, commitAttempts, showBanner, syncWithServerOnly]
  );

  const handleSyncFromDrive = useCallback(async () => {
    if (!getCachedDriveToken()) {
      showBanner('info', 'Vui lòng nhấn "Kết nối Google Drive" để đồng bộ dữ liệu trực tuyến.');
      return;
    }
    await runDriveTwoWaySync();
  }, [runDriveTwoWaySync, showBanner]);

  const handleSignInDrive = useCallback(async () => {
    setIsSyncingDrive(true);
    try {
      const { user, hasToken } = await signInWithGoogleDrive();
      setDriveUser(user);
      setHasDriveToken(hasToken);
      if (hasToken) {
        await runDriveTwoWaySync({ emailLabel: user.email ?? undefined });
      } else {
        setIsSyncingDrive(false);
        showBanner('info', 'Đã đăng nhập Google nhưng chưa nhận được quyền ghi Drive.');
      }
    } catch (err) {
      setIsSyncingDrive(false);
      const msg = err instanceof Error ? err.message : 'Đăng nhập Google Drive thất bại.';
      showBanner('error', msg);
    }
  }, [runDriveTwoWaySync, showBanner]);

  const handleSignInAndUploadDrive = useCallback(
    async (attempt: AttemptRecord) => {
      setIsSyncingDrive(true);
      try {
        const { user, hasToken } = await signInWithGoogleDrive();
        setDriveUser(user);
        setHasDriveToken(hasToken);
        if (hasToken) {
          await runDriveTwoWaySync({
            emailLabel: user.email ?? undefined,
            extraAttempt: attempt,
          });
        } else {
          setIsSyncingDrive(false);
          showBanner('info', 'Đã đăng nhập Google nhưng chưa nhận được quyền ghi Drive.');
        }
      } catch (err) {
        setIsSyncingDrive(false);
        const msg = err instanceof Error ? err.message : 'Kết nối Google Drive thất bại.';
        showBanner('error', msg);
      }
    },
    [runDriveTwoWaySync, showBanner]
  );

  const handleSignOutDrive = async () => {
    await signOutGoogleDrive();
    setDriveUser(null);
    setHasDriveToken(false);
    showBanner('info', 'Đã ngắt kết nối Google Drive khỏi phiên làm việc.');
  };

  const handleUploadSingleAttemptToDrive = useCallback(
    async (attempt: AttemptRecord) => {
      if (!getCachedDriveToken()) {
        showBanner('info', 'Hãy kết nối Google Drive trước khi lưu bài thi lên đám mây.');
        return;
      }
      setIsSyncingDrive(true);
      try {
        await uploadNewAttemptToDrive(attempt);
        const updated = attemptsRef.current.map((a) =>
          a.id === attempt.id ? { ...a, syncedToDrive: true } : a
        );
        commitAttempts(updated, true);
        if (!isFirestoreInQuotaCooldown()) {
          const saved = await saveAttemptToFirestore({ ...attempt, syncedToDrive: true })
            .then(() => true)
            .catch(() => false);
          if (saved) {
            addConfirmedCloudIds([attempt.id]);
            await markAttemptSyncedToDriveInFirestore(attempt.id).catch(() => false);
          }
        }
        await pushAttemptsToServer([{ ...attempt, syncedToDrive: true }]).catch(() => null);
        showBanner('success', `Đã lưu bài thi ${attempt.id} lên thư mục Google Drive.`);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Lưu bài thi lên Google Drive thất bại.';
        showBanner('error', msg);
        setHasDriveToken(Boolean(getCachedDriveToken()));
      } finally {
        setIsSyncingDrive(false);
      }
    },
    [addConfirmedCloudIds, commitAttempts, showBanner]
  );

  // Đồng bộ tệp tổng hợp trên Google Drive (có bước xác nhận rõ ràng nếu ghi đè tệp)
  const handleBackupConsolidatedToDrive = async () => {
    if (!getCachedDriveToken()) {
      showBanner('info', 'Vui lòng kết nối Google Drive trước.');
      return;
    }

    const toPush = attemptsRef.current.filter((a) => !a.isSeedData);
    if (toPush.length === 0) {
      showBanner('info', 'Chưa có bài làm thực tế nào trên thiết bị để đồng bộ.');
      return;
    }

    setIsSyncingDrive(true);
    try {
      const existing = await findConsolidatedDriveFile();
      setIsSyncingDrive(false);

      const confirmMsg = existing
        ? `Tệp tổng hợp "${existing.name}" đã tồn tại trong thư mục Google Drive.\nBạn có đồng ý cập nhật/ghi đè tệp này với ${toPush.length} lượt làm bài hiện có không?`
        : `Tạo tệp tổng hợp mới chứa ${toPush.length} lượt làm bài trong thư mục Google Drive của bạn?`;

      setPendingConfirm({
        title: existing
          ? 'Xác nhận cập nhật tệp trên Google Drive'
          : 'Xác nhận lưu tệp lên Google Drive',
        message: confirmMsg,
        confirmLabel: existing ? 'Đồng ý cập nhật tệp' : 'Lưu lên Drive',
        tone: existing ? 'warning' : 'primary',
        action: async () => {
          setPendingConfirm(null);
          setIsSyncingDrive(true);
          try {
            await upsertConsolidatedAttemptsToDrive(attemptsRef.current, existing?.id ?? null);
            const next = attemptsRef.current.map((a) =>
              !a.isSeedData ? { ...a, syncedToDrive: true } : a
            );
            commitAttempts(next, true);
            const realList = next.filter((a) => !a.isSeedData);
            if (!isFirestoreInQuotaCooldown()) {
              const pushRes = await pushAttemptsToFirestoreDetailed(realList);
              addConfirmedCloudIds([...pushRes.pushedIds, ...pushRes.alreadyRemoteIds]);
              if (pushRes.abortedByQuota) {
                setCloudSyncStatus('quota');
              } else {
                for (const att of realList) {
                  await markAttemptSyncedToDriveInFirestore(att.id).catch(() => false);
                }
              }
            }
            await pushAttemptsToServer(realList).catch(() => null);
            showBanner(
              'success',
              `Đã đồng bộ ${toPush.length} bài thi lên thư mục Google Drive thành công.`
            );
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'Lỗi khi cập nhật tệp Google Drive.';
            showBanner('error', msg);
            setHasDriveToken(Boolean(getCachedDriveToken()));
          } finally {
            setIsSyncingDrive(false);
          }
        },
      });
    } catch (err) {
      setIsSyncingDrive(false);
      const msg =
        err instanceof Error ? err.message : 'Không thể kiểm tra thư mục Google Drive.';
      showBanner('error', msg);
      setHasDriveToken(Boolean(getCachedDriveToken()));
    }
  };

  const handleRefreshDashboard = useCallback(async () => {
    setProvinceSyncEnabled(true);
    if (getCachedDriveToken()) {
      await runDriveTwoWaySync();
    } else {
      await syncWithCloud({ silent: false, forceFirestoreRead: false });
    }
  }, [runDriveTwoWaySync, syncWithCloud]);

  const handleRetryFirestoreConnection = useCallback(async () => {
    clearFirestoreQuotaCooldown();
    setProvinceSyncEnabled(true);
    setIsRefreshingCloud(true);
    setCloudSyncStatus('syncing');
    try {
      const check = await testFirestoreConnection(true);
      if (check.quotaExceeded) {
        tripFirestoreQuotaCooldown();
        setCloudSyncStatus('quota');
        showBanner(
          'info',
          'Cloud Firestore vẫn đang trong giới hạn hạn mức miễn phí trong ngày (sẽ tự đặt lại vào ngày mai). Bạn vẫn có thể đồng bộ qua Google Drive ngay lúc này.'
        );
        return;
      }
      if (!check.ok) {
        setCloudSyncStatus(
          typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'
        );
        showBanner('error', 'Chưa thể kết nối tới Cloud Firestore. Vui lòng kiểm tra mạng và thử lại.');
        return;
      }
      setFirestoreRetryNonce((n) => n + 1);
      await syncWithCloud({ silent: false, forceFirestoreRead: true });
    } finally {
      setIsRefreshingCloud(false);
    }
  }, [showBanner, syncWithCloud]);

  const handleDashboardDriveSync = useCallback(async () => {
    if (getCachedDriveToken()) {
      await runDriveTwoWaySync();
    } else {
      await handleSignInDrive();
    }
  }, [handleSignInDrive, runDriveTwoWaySync]);

  const handleStartExam = (
    validatedCandidate: CandidateInfo,
    newlyGeneratedSbd = false
  ) => {
    setCandidate(validatedCandidate);
    activeExamCandidateRef.current = validatedCandidate;
    setIsNewlyGeneratedSbd(newlyGeneratedSbd);
    saveCandidate(validatedCandidate);
    const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
    setCurrentExam(exam);
    setSelectedAttemptId(null);
    setExamMode('active');
    setActiveTab('exam');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinishExam = useCallback(
    async (
      answers: StudentAnswers,
      durationSpentSeconds: number,
      violations: number,
      autoSubmittedReason: 'timeout' | 'violations' | null
    ) => {
      if (!currentExam) return;
      const examCandidate = activeExamCandidateRef.current;
      const graded = gradeExam(currentExam, answers, {
        sbd: examCandidate.sbd,
        school: examCandidate.school,
        phone: examCandidate.phone,
        email: examCandidate.email,
        durationSpentSeconds,
        violations,
        autoSubmittedReason,
      });

      const nextAfterLocal = mergeAttempts([graded], attemptsRef.current);
      commitAttempts(nextAfterLocal, true);
      setSelectedAttemptId(graded.id);
      setExamMode('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Đồng bộ ngay với Express backend (0 lượt đọc Firestore, đồng bộ tức thì qua SSE nếu có server)
      let syncedToServer = false;
      try {
        const serverList = await pushAttemptsToServer([graded]);
        if (serverList) {
          syncedToServer = true;
          const reconciled = mergeAttempts(attemptsRef.current, serverList);
          commitAttempts(reconciled, true);
        }
      } catch {
        // Không có server cục bộ cũng không sao
      }

      // Đẩy bản ghi nén (~2.2 KB) lên Cloud Firestore để mọi thiết bị nhận kết quả tức thời
      let syncedToFirestore = false;
      let hitQuota = isFirestoreInQuotaCooldown();
      let firestoreErrorText: string | null = null;
      if (!hitQuota) {
        try {
          await saveAttemptToFirestore(graded);
          syncedToFirestore = true;
          addConfirmedCloudIds([graded.id]);
          setLastCloudSyncAt(Date.now());
          setCloudSyncStatus('synced');
          setCloudErrorMessage(null);
        } catch (err) {
          hitQuota = isFirestoreQuotaError(err);
          firestoreErrorText = formatFirestoreUserMessage(err);
          setCloudSyncStatus(
            hitQuota
              ? 'quota'
              : typeof navigator !== 'undefined' && navigator.onLine === false
                ? 'offline'
                : 'error'
          );
          setCloudErrorMessage(firestoreErrorText);
        }
      } else {
        setCloudSyncStatus('quota');
      }

      // Nếu đã kết nối Google Drive, tự động tạo tệp ketqua_<id>.json trên Drive
      if (getCachedDriveToken()) {
        setIsSyncingDrive(true);
        try {
          await uploadNewAttemptToDrive(graded);
          const marked = attemptsRef.current.map((a) =>
            a.id === graded.id ? { ...a, syncedToDrive: true } : a
          );
          commitAttempts(marked, true);
          if (!hitQuota) {
            await markAttemptSyncedToDriveInFirestore(graded.id).catch(() => false);
          }
          await pushAttemptsToServer([{ ...graded, syncedToDrive: true }]).catch(() => null);
          showBanner(
            'success',
            syncedToFirestore
              ? `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và tự động lưu lên Google Drive & đồng bộ trực tuyến các thiết bị.`
              : `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và lưu an toàn lên Google Drive${syncedToServer ? ' & máy chủ ứng dụng' : ''}.`
          );
        } catch {
          showBanner(
            'info',
            `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10)${syncedToFirestore ? ' và đồng bộ Cloud đa thiết bị' : syncedToServer ? ' và lưu trên máy chủ ứng dụng' : ' (đã lưu trên thiết bị)'}. Nhấn "Lưu bài này lên Google Drive" để sao lưu lên Drive.`
          );
          setHasDriveToken(Boolean(getCachedDriveToken()));
        } finally {
          setIsSyncingDrive(false);
        }
      } else if (syncedToFirestore) {
        showBanner(
          'success',
          `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và đồng bộ trực tuyến lên Cloud đa thiết bị.`
        );
      } else if (hitQuota) {
        showBanner(
          'info',
          `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và lưu an toàn trên thiết bị${syncedToServer ? ' & máy chủ ứng dụng' : ''}. Cloud Firestore tạm chạm hạn mức miễn phí trong ngày — bài sẽ tự đồng bộ khi đặt lại hoặc khi bạn đồng bộ Google Drive.`
        );
      } else {
        showBanner(
          'error',
          `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và lưu trên thiết bị, nhưng chưa đẩy được lên Cloud: ${firestoreErrorText ?? 'Lỗi mạng'}`
        );
      }
    },
    [addConfirmedCloudIds, commitAttempts, currentExam, showBanner]
  );

  const handleTabSwitch = (nextTab: AppTab) => {
    if (nextTab === activeTab) return;
    if (examMode === 'active' && nextTab !== 'exam') {
      setPendingConfirm({
        title: 'Đang trong thời gian làm bài thi',
        message:
          'Bạn đang có bài thi thử đang diễn ra. Nếu chuyển sang thẻ khác lúc này, bài thi hiện tại sẽ bị hủy bỏ và không tính điểm.\nBạn có chắc chắn muốn rời khỏi bài thi không?',
        confirmLabel: 'Rời khỏi bài thi',
        tone: 'danger',
        action: () => {
          setPendingConfirm(null);
          setCurrentExam(null);
          setExamMode('setup');
          setActiveTab(nextTab);
          if (nextTab === 'dashboard') {
            setProvinceSyncEnabled(true);
            void syncWithServerOnly();
          }
        },
      });
      return;
    }
    setActiveTab(nextTab);
    if (nextTab === 'dashboard') {
      setProvinceSyncEnabled(true);
      void syncWithServerOnly();
    }
  };

  const handleReviewAttempt = (attempt: AttemptRecord) => {
    setSelectedAttemptId(attempt.id);
    setIsNewlyGeneratedSbd(false);
    setExamMode('result');
    setActiveTab('exam');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        activeTab={activeTab}
        onSelectTab={handleTabSwitch}
        driveUser={driveUser}
        hasDriveToken={hasDriveToken}
        isSyncingDrive={isSyncingDrive}
        unsyncedCount={unsyncedAttempts.length}
        onSignInDrive={handleSignInDrive}
        onSignOutDrive={handleSignOutDrive}
        onSyncFromDrive={handleSyncFromDrive}
        onBackupConsolidatedToDrive={handleBackupConsolidatedToDrive}
      />

      {/* Non-blocking status notification banner */}
      {statusBanner && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div
            role="status"
            className={`px-4 py-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
              statusBanner.tone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusBanner.tone === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {statusBanner.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : statusBanner.tone === 'error' ? (
                <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-blue-700 shrink-0" />
              )}
              <span className="font-medium break-words">{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Đóng thông báo"
              className="p-1 rounded-md hover:bg-black/5 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'exam' ? (
          examMode === 'active' && currentExam ? (
            <ActiveExamView
              candidate={candidate}
              exam={currentExam}
              onFinishExam={handleFinishExam}
            />
          ) : examMode === 'result' && selectedAttempt ? (
            <ExamResultView
              attempt={selectedAttempt}
              studentHistory={studentHistory}
              isNewlyGeneratedSbd={isNewlyGeneratedSbd}
              isConfirmedOnCloud={confirmedCloudIds.has(selectedAttempt.id)}
              canSyncDrive={hasDriveToken}
              isSyncingDrive={isSyncingDrive}
              onSelectHistoryAttempt={(att) => {
                setSelectedAttemptId(att.id);
                setIsNewlyGeneratedSbd(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onUploadSingleAttemptToDrive={handleUploadSingleAttemptToDrive}
              onSignInAndUploadDrive={handleSignInAndUploadDrive}
              onStartNewExam={() => handleStartExam(candidate, false)}
              onBackToSetup={() => {
                setExamMode('setup');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          ) : (
            <ExamSetupView
              initialCandidate={candidate}
              attempts={attempts}
              onStartExam={handleStartExam}
              onReviewAttempt={handleReviewAttempt}
              onLookupSbd={(sbd) => void lookupAttemptsBySbd(sbd)}
              onRequestAllCloudAttempts={() => {
                setProvinceSyncEnabled(true);
                void syncWithServerOnly();
              }}
            />
          )
        ) : activeTab === 'practice' ? (
          <LessonPracticeView
            d1Questions={ALL_D1_QUESTIONS}
            d2Questions={ALL_D2_QUESTIONS}
          />
        ) : (
          <DashboardView
            attempts={attempts}
            onInspectAttempt={handleReviewAttempt}
            onRefreshData={handleRefreshDashboard}
            onRetryFirestore={handleRetryFirestoreConnection}
            onSyncWithDrive={handleDashboardDriveSync}
            hasDriveToken={hasDriveToken}
            isRefreshing={isRefreshingCloud || isSyncingDrive}
            cloudSyncStatus={cloudSyncStatus}
            confirmedCloudCount={cloudSyncSummary.confirmedCount}
            pendingCloudCount={cloudSyncSummary.pendingCount}
            lastCloudSyncAt={lastCloudSyncAt}
            cloudErrorMessage={cloudErrorMessage}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
            <span className="font-semibold text-slate-700">
              Ứng dụng Ôn tập chuẩn bị kiểm tra Học Kỳ 1 năm học 2026-2027 Bộ môn Tin học Tỉnh Vĩnh Long
            </span>
            <span className="hidden sm:inline">·</span>
            <a
              href={DRIVE_TARGET_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              Kho lưu trữ Google Drive
            </a>
          </div>
          <p className="font-mono text-[11px] text-slate-500">
            Design:{' '}
            <a
              href="https://vinhlongcode.kodemy.site"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-700 hover:text-blue-700 hover:underline font-medium"
            >
              https://vinhlongcode.kodemy.site
            </a>
          </p>
        </div>
      </footer>

      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={pendingConfirm?.confirmLabel ?? 'Xác nhận'}
        tone={pendingConfirm?.tone ?? 'primary'}
        onConfirm={() => pendingConfirm?.action()}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
