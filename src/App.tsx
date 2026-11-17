import { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ActiveExamView } from './components/ActiveExamView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DashboardView } from './components/DashboardView';
import { ExamResultView } from './components/ExamResultView';
import { ExamSetupView } from './components/ExamSetupView';
import { AppTab, Header } from './components/Header';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from './data/questionBank';
import {
  DRIVE_TARGET_FOLDER_URL,
  fetchRemoteAttemptsFromDrive,
  findConsolidatedDriveFile,
  getCachedDriveToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  subscribeAuthState,
  uploadNewAttemptToDrive,
  upsertConsolidatedAttemptsToDrive,
} from './services/driveSync';
import {
  loadAttempts,
  loadSavedCandidate,
  mergeAttempts,
  saveAttempts,
  saveCandidate,
} from './services/storage';
import { AttemptRecord, GeneratedExam, StudentAnswers } from './types/exam';
import { CandidateInfo, generateExam, gradeExam } from './utils/examEngine';

type ExamMode = 'setup' | 'active' | 'result';

interface PendingConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'primary' | 'warning' | 'danger';
  action: () => void;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('exam');
  const [examMode, setExamMode] = useState<ExamMode>('setup');
  const [candidate, setCandidate] = useState<CandidateInfo>(
    () => loadSavedCandidate() ?? { school: '', phone: '', email: '' }
  );
  const [attempts, setAttempts] = useState<AttemptRecord[]>(() => loadAttempts());
  const [currentExam, setCurrentExam] = useState<GeneratedExam | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Google Drive Auth & Sync state (accessToken chỉ giữ trong bộ nhớ RAM ở driveSync.ts)
  const [driveUser, setDriveUser] = useState<User | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmState | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAuthState((user) => {
      setDriveUser(user);
      setHasDriveToken(Boolean(user && getCachedDriveToken()));
    });
    return () => unsubscribe();
  }, []);

  const showBanner = useCallback(
    (tone: 'success' | 'error' | 'info', message: string) => {
      setStatusBanner({ tone, message });
    },
    []
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
    return attempts.filter(
      (a) =>
        a.school === selectedAttempt.school &&
        a.phone === selectedAttempt.phone &&
        a.email.toLowerCase() === selectedAttempt.email.toLowerCase()
    );
  }, [attempts, selectedAttempt]);

  const handleSyncFromDrive = useCallback(async () => {
    if (!getCachedDriveToken()) {
      showBanner('info', 'Vui lòng nhấn "Kết nối Google Drive" để đồng bộ dữ liệu trực tuyến.');
      return;
    }
    setIsSyncingDrive(true);
    try {
      const remote = await fetchRemoteAttemptsFromDrive();
      setAttempts((prev) => {
        const merged = mergeAttempts(prev, remote);
        saveAttempts(merged);
        return merged;
      });
      showBanner(
        'success',
        `Đồng bộ Google Drive thành công (${remote.length} bản ghi trên đám mây).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đồng bộ từ Google Drive.';
      showBanner('error', msg);
      setHasDriveToken(Boolean(getCachedDriveToken()));
    } finally {
      setIsSyncingDrive(false);
    }
  }, [showBanner]);

  const handleSignInDrive = async () => {
    setIsSyncingDrive(true);
    try {
      const { user, hasToken } = await signInWithGoogleDrive();
      setDriveUser(user);
      setHasDriveToken(hasToken);
      if (hasToken) {
        const remote = await fetchRemoteAttemptsFromDrive();
        setAttempts((prev) => {
          const merged = mergeAttempts(prev, remote);
          saveAttempts(merged);
          return merged;
        });
        showBanner(
          'success',
          `Đã kết nối Google Drive (${user.email}) và đồng bộ ${remote.length} kết quả trực tuyến.`
        );
      } else {
        showBanner('info', 'Đã đăng nhập Google nhưng chưa nhận được quyền ghi Drive.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập Google Drive thất bại.';
      showBanner('error', msg);
    } finally {
      setIsSyncingDrive(false);
    }
  };

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
        setAttempts((prev) => {
          const next = prev.map((a) =>
            a.id === attempt.id ? { ...a, syncedToDrive: true } : a
          );
          saveAttempts(next);
          return next;
        });
        showBanner('success', `Đã lưu bài thi ${attempt.id} lên thư mục Google Drive.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lưu bài thi lên Google Drive thất bại.';
        showBanner('error', msg);
        setHasDriveToken(Boolean(getCachedDriveToken()));
      } finally {
        setIsSyncingDrive(false);
      }
    },
    [showBanner]
  );

  // Đồng bộ các bài chưa đẩy hoặc cập nhật tệp tổng hợp (có bước xác nhận rõ ràng nếu ghi đè tệp)
  const handleBackupConsolidatedToDrive = async () => {
    if (!getCachedDriveToken()) {
      showBanner('info', 'Vui lòng kết nối Google Drive trước.');
      return;
    }

    const toPush = attempts.filter((a) => !a.isSeedData);
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
        title: existing ? 'Xác nhận cập nhật tệp trên Google Drive' : 'Xác nhận lưu tệp lên Google Drive',
        message: confirmMsg,
        confirmLabel: existing ? 'Đồng ý cập nhật tệp' : 'Lưu lên Drive',
        tone: existing ? 'warning' : 'primary',
        action: async () => {
          setPendingConfirm(null);
          setIsSyncingDrive(true);
          try {
            await upsertConsolidatedAttemptsToDrive(attempts, existing?.id ?? null);
            setAttempts((prev) => {
              const next = prev.map((a) =>
                !a.isSeedData ? { ...a, syncedToDrive: true } : a
              );
              saveAttempts(next);
              return next;
            });
            showBanner(
              'success',
              `Đã đồng bộ ${toPush.length} bài thi lên thư mục Google Drive thành công.`
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật tệp Google Drive.';
            showBanner('error', msg);
            setHasDriveToken(Boolean(getCachedDriveToken()));
          } finally {
            setIsSyncingDrive(false);
          }
        },
      });
    } catch (err) {
      setIsSyncingDrive(false);
      const msg = err instanceof Error ? err.message : 'Không thể kiểm tra thư mục Google Drive.';
      showBanner('error', msg);
      setHasDriveToken(Boolean(getCachedDriveToken()));
    }
  };

  const handleStartExam = (validatedCandidate: CandidateInfo) => {
    setCandidate(validatedCandidate);
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
      const graded = gradeExam(currentExam, answers, {
        school: candidate.school,
        phone: candidate.phone,
        email: candidate.email,
        durationSpentSeconds,
        violations,
        autoSubmittedReason,
      });

      setAttempts((prev) => {
        const next = [graded, ...prev];
        saveAttempts(next);
        return next;
      });
      setSelectedAttemptId(graded.id);
      setExamMode('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Nếu đã kết nối Google Drive, tự động tạo file mới ketqua_<id>.json trên Drive (không ghi đè file khác)
      if (getCachedDriveToken()) {
        setIsSyncingDrive(true);
        try {
          await uploadNewAttemptToDrive(graded);
          setAttempts((prev) => {
            const next = prev.map((a) =>
              a.id === graded.id ? { ...a, syncedToDrive: true } : a
            );
            saveAttempts(next);
            return next;
          });
          showBanner(
            'success',
            `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và tự động lưu kết quả lên Google Drive.`
          );
        } catch {
          showBanner(
            'info',
            `Đã chấm điểm (${graded.totalScore.toFixed(2)}/10) và lưu trên thiết bị. Nhấn "Lưu bài này lên Google Drive" để thử đồng bộ lại.`
          );
          setHasDriveToken(Boolean(getCachedDriveToken()));
        } finally {
          setIsSyncingDrive(false);
        }
      }
    },
    [candidate, currentExam, showBanner]
  );

  const handleTabSwitch = (nextTab: AppTab) => {
    if (nextTab === activeTab) return;
    if (examMode === 'active' && nextTab === 'dashboard') {
      setPendingConfirm({
        title: 'Đang trong thời gian làm bài thi',
        message:
          'Bạn đang có bài thi thử đang diễn ra. Nếu chuyển sang Dashboard Thống kê lúc này, bài thi hiện tại sẽ bị hủy bỏ và không tính điểm.\nBạn có chắc chắn muốn rời khỏi bài thi không?',
        confirmLabel: 'Rời khỏi bài thi',
        tone: 'danger',
        action: () => {
          setPendingConfirm(null);
          setCurrentExam(null);
          setExamMode('setup');
          setActiveTab('dashboard');
        },
      });
      return;
    }
    setActiveTab(nextTab);
  };

  const handleReviewAttempt = (attempt: AttemptRecord) => {
    setSelectedAttemptId(attempt.id);
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
              <span className="font-medium">{statusBanner.message}</span>
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
              canSyncDrive={hasDriveToken}
              isSyncingDrive={isSyncingDrive}
              onSelectHistoryAttempt={(att) => {
                setSelectedAttemptId(att.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onUploadSingleAttemptToDrive={handleUploadSingleAttemptToDrive}
              onStartNewExam={() => handleStartExam(candidate)}
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
            />
          )
        ) : (
          <DashboardView attempts={attempts} onInspectAttempt={handleReviewAttempt} />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
            <span className="font-semibold text-slate-700">
              Ứng dụng Ôn tập kiểm tra Giữa học Kỳ 1 năm học 2026-2027 Bộ môn Tin học Tỉnh Vĩnh Long
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
