import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { LESSON_MAP, MAX_VIOLATIONS_ALLOWED } from '../data/matrix';
import { GeneratedExam, StudentAnswers } from '../types/exam';
import { CandidateInfo, createEmptyAnswers } from '../utils/examEngine';
import { CodeSnippetText } from './CodeSnippetText';
import { ConfirmDialog } from './ConfirmDialog';

interface ActiveExamViewProps {
  candidate: CandidateInfo;
  exam: GeneratedExam;
  onFinishExam: (
    answers: StudentAnswers,
    durationSpentSeconds: number,
    violations: number,
    autoSubmittedReason: 'timeout' | 'violations' | null
  ) => void;
}

function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ActiveExamView: React.FC<ActiveExamViewProps> = ({
  candidate,
  exam,
  onFinishExam,
}) => {
  const [answers, setAnswers] = useState<StudentAnswers>(() => createEmptyAnswers(exam));
  const [secondsLeft, setSecondsLeft] = useState<number>(exam.durationSeconds);
  const [violations, setViolations] = useState<number>(0);
  const [warningModalOpen, setWarningModalOpen] = useState<boolean>(false);
  const [submitModalOpen, setSubmitModalOpen] = useState<boolean>(false);
  const [lastViolationReason, setLastViolationReason] = useState<string>('');

  // Refs giữ trạng thái mới nhất cho timer & sự kiện giám sát không bị stale closure
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;

  const violationsRef = useRef(violations);
  violationsRef.current = violations;

  const submittedRef = useRef(false);
  const lastViolationAtRef = useRef<number>(0);

  const finalize = useCallback(
    (reason: 'timeout' | 'violations' | null, overrideViolations?: number) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const spent = exam.durationSeconds - secondsLeftRef.current;
      onFinishExam(
        answersRef.current,
        spent,
        overrideViolations ?? violationsRef.current,
        reason
      );
    },
    [exam.durationSeconds, onFinishExam]
  );

  // Đồng hồ đếm ngược 45 phút
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (submittedRef.current) return;
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          finalize('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finalize]);

  // Giám sát chuyển tab, thu nhỏ cửa sổ, mất tiêu điểm cửa sổ
  const registerViolation = useCallback(
    (reason: string) => {
      if (submittedRef.current) return;
      const now = Date.now();
      // Chống đếm trùng lặp cùng 1 hành động blur + visibilitychange trong 1.2 giây
      if (now - lastViolationAtRef.current < 1200) return;
      lastViolationAtRef.current = now;

      const nextCount = violationsRef.current + 1;
      violationsRef.current = nextCount;
      setViolations(nextCount);
      setLastViolationReason(reason);

      if (nextCount > MAX_VIOLATIONS_ALLOWED) {
        // Vượt quá 5 lần vi phạm -> tự động thu bài ngay lập tức
        setWarningModalOpen(false);
        setSubmitModalOpen(false);
        finalize('violations', nextCount);
      } else {
        setWarningModalOpen(true);
      }
    },
    [finalize]
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        registerViolation('Bạn vừa chuyển sang tab khác hoặc thu nhỏ trình duyệt.');
      }
    };
    const onWindowBlur = () => {
      registerViolation('Cửa sổ làm bài vừa bị mất tiêu điểm (chuyển ứng dụng hoặc thu nhỏ).');
    };
    const onWindowResize = () => {
      if (window.outerHeight < 260 || window.outerWidth < 260) {
        registerViolation('Cửa sổ làm bài bị thu nhỏ quá mức cho phép.');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('resize', onWindowResize);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [registerViolation]);

  const answeredStats = useMemo(() => {
    const p1Done = exam.part1.filter((q) => answers.part1[q.questionId] !== null).length;
    const p2Done = exam.part2.filter((q) => {
      const a = answers.part2[q.questionId];
      return a && a.a !== null && a.b !== null && a.c !== null && a.d !== null;
    }).length;
    return {
      p1Done,
      p2Done,
      totalDone: p1Done + p2Done,
      totalQuestions: exam.part1.length + exam.part2.length,
    };
  }, [answers, exam]);

  const handleSelectD1 = (questionId: string, label: 'A' | 'B' | 'C' | 'D') => {
    setAnswers((prev) => ({
      ...prev,
      part1: {
        ...prev.part1,
        [questionId]: label,
      },
    }));
  };

  const handleSelectD2 = (
    questionId: string,
    subKey: 'a' | 'b' | 'c' | 'd',
    value: boolean
  ) => {
    setAnswers((prev) => ({
      ...prev,
      part2: {
        ...prev.part2,
        [questionId]: {
          ...(prev.part2[questionId] || { a: null, b: null, c: null, d: null }),
          [subKey]: value,
        },
      },
    }));
  };

  const scrollToAnchor = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const timerCritical = secondsLeft <= 300; // Dưới 5 phút

  return (
    <div className="space-y-5">
      {/* Top Proctoring + Candidate Bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-medium">
            <span className="font-mono text-slate-700 font-semibold">{exam.examId}</span>
            <span>·</span>
            <span className="truncate">{candidate.school}</span>
            <span>·</span>
            <span>{candidate.email}</span>
          </div>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            Bài thi thử Giữa HK1 Tin học 12 (Chế độ giám sát đang hoạt động)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold tabular-nums flex items-center gap-1.5 ${
              violations === 0
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : violations >= 4
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Vi phạm: {violations}/{MAX_VIOLATIONS_ALLOWED}
            </span>
          </div>

          <div
            data-testid="exam-timer"
            className={`px-3.5 py-1.5 rounded-lg border font-mono text-sm font-bold tabular-nums flex items-center gap-2 ${
              timerCritical
                ? 'bg-rose-50 border-rose-300 text-rose-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>{formatMMSS(secondsLeft)}</span>
          </div>

          <button
            type="button"
            onClick={() => setSubmitModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Nộp bài</span>
          </button>
        </div>
      </div>

      {/* Main Layout: 8 cols questions + 4 cols sticky navigator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Phần I: 24 câu Dạng 1 */}
          <section aria-labelledby="part1-heading" className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <h2 id="part1-heading" className="text-base font-bold text-slate-900">
                PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn (24 câu · 6.0 điểm)
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Thí sinh trả lời từ Câu 1 đến Câu 24. Mỗi câu hỏi chỉ chọn một phương án đúng nhất.
              </p>
            </div>

            {exam.part1.map((q, idx) => {
              const selected = answers.part1[q.questionId];
              const lessonMeta = LESSON_MAP[q.lessonId];
              return (
                <article
                  key={q.questionId}
                  id={`q-part1-${idx}`}
                  className="bg-white rounded-xl border border-slate-200 p-5 space-y-3.5 scroll-mt-24"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-blue-800">
                      Câu {idx + 1}
                    </span>
                    <span className="text-slate-500 font-medium">
                      {lessonMeta?.code} · Mức {q.level} · {q.competency}
                    </span>
                  </div>

                  <div className="text-sm sm:text-[15px] font-medium text-slate-900 leading-relaxed">
                    <CodeSnippetText text={q.prompt} />
                  </div>

                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {q.options.map((opt) => {
                      const isChecked = selected === opt.label;
                      return (
                        <label
                          key={opt.label}
                          className={`flex items-start gap-3 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-blue-50/80 border-blue-600 text-slate-900'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`d1-${q.questionId}`}
                            checked={isChecked}
                            onChange={() => handleSelectD1(q.questionId, opt.label)}
                            className="mt-0.5 h-4 w-4 text-blue-700 border-slate-300 focus:ring-blue-600 shrink-0"
                          />
                          <span className="font-bold text-slate-700 shrink-0">{opt.label}.</span>
                          <span className="leading-relaxed">
                            <CodeSnippetText text={opt.text} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </section>

          {/* Phần II: 4 câu Dạng 2 */}
          <section aria-labelledby="part2-heading" className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <h2 id="part2-heading" className="text-base font-bold text-slate-900">
                PHẦN II. Câu trắc nghiệm đúng sai (4 câu · 4.0 điểm)
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn Đúng hoặc Sai. (1 ý đúng: 0.1đ · 2 ý: 0.25đ · 3 ý: 0.5đ · 4 ý: 1.0đ).
              </p>
            </div>

            {exam.part2.map((cluster, idx) => {
              const clusterAns = answers.part2[cluster.questionId] || {
                a: null,
                b: null,
                c: null,
                d: null,
              };
              const lessonMeta = LESSON_MAP[cluster.lessonId];

              return (
                <article
                  key={cluster.questionId}
                  id={`q-part2-${idx}`}
                  className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 scroll-mt-24"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-blue-800">
                      Câu {idx + 1} (Phần II)
                    </span>
                    <span className="text-slate-500 font-medium">
                      {lessonMeta?.title} · {cluster.competency}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed">
                    <CodeSnippetText text={cluster.context} />
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {cluster.items.map((item) => {
                      const val = clusterAns[item.key];
                      return (
                        <div
                          key={item.key}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
                        >
                          <div className="text-sm text-slate-900 leading-relaxed flex-1">
                            <span className="font-bold mr-1.5">{item.key})</span>
                            <CodeSnippetText text={item.text} />
                            <span className="ml-2 text-[11px] text-slate-400 font-medium">
                              ({item.level})
                            </span>
                          </div>

                          <div className="inline-flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSelectD2(cluster.questionId, item.key, true)}
                              aria-pressed={val === true}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md border transition-colors cursor-pointer ${
                                val === true
                                  ? 'bg-blue-700 border-blue-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectD2(cluster.questionId, item.key, false)}
                              aria-pressed={val === false}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md border transition-colors cursor-pointer ${
                                val === false
                                  ? 'bg-slate-800 border-slate-800 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Sai
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        {/* Sticky Sidebar Navigator */}
        <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Phiếu điều hướng câu hỏi</h3>
              <span className="text-xs font-mono font-semibold text-blue-700 tabular-nums">
                {answeredStats.totalDone}/{answeredStats.totalQuestions} câu
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">
                Phần I ({answeredStats.p1Done}/24)
              </p>
              <div className="grid grid-cols-6 gap-1.5">
                {exam.part1.map((q, idx) => {
                  const done = answers.part1[q.questionId] !== null;
                  return (
                    <button
                      key={q.questionId}
                      type="button"
                      onClick={() => scrollToAnchor(`q-part1-${idx}`)}
                      className={`py-1.5 text-xs font-mono font-bold rounded-md border transition-colors cursor-pointer tabular-nums ${
                        done
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">
                Phần II — Đúng/Sai ({answeredStats.p2Done}/4)
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {exam.part2.map((cluster, idx) => {
                  const a = answers.part2[cluster.questionId];
                  const countDone = a
                    ? (['a', 'b', 'c', 'd'] as const).filter((k) => a[k] !== null).length
                    : 0;
                  const fullyDone = countDone === 4;
                  return (
                    <button
                      key={cluster.questionId}
                      type="button"
                      onClick={() => scrollToAnchor(`q-part2-${idx}`)}
                      className={`py-2 px-1 text-xs font-mono font-bold rounded-md border transition-colors cursor-pointer tabular-nums ${
                        fullyDone
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : countDone > 0
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-400'
                      }`}
                    >
                      II.{idx + 1} ({countDone}/4)
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Tiến độ hoàn thành</span>
                <span className="font-mono font-bold tabular-nums">
                  {Math.round((answeredStats.totalDone / answeredStats.totalQuestions) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-all duration-300"
                  style={{
                    width: `${(answeredStats.totalDone / answeredStats.totalQuestions) * 100}%`,
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setSubmitModalOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Nộp bài &amp; Chấm điểm</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Không thu nhỏ cửa sổ hoặc chuyển tab trong khi làm bài. Vi phạm quá 5 lần hệ thống tự động thu bài ngay.
            </span>
          </div>
        </aside>
      </div>

      {/* Proctoring Warning Modal (Vi phạm 1..5) */}
      <ConfirmDialog
        open={warningModalOpen}
        title={`Cảnh báo vi phạm quy chế (${violations}/${MAX_VIOLATIONS_ALLOWED})`}
        message={`${lastViolationReason}\n\nHệ thống chỉ cho phép tối đa ${MAX_VIOLATIONS_ALLOWED} lần cảnh báo. Nếu vi phạm vượt quá 5 lần (lần thứ ${MAX_VIOLATIONS_ALLOWED + 1}), bài thi sẽ bị tự động thu ngay lập tức.`}
        confirmLabel="Tôi đã hiểu, tiếp tục làm bài"
        hideCancel
        tone={violations >= 4 ? 'danger' : 'warning'}
        onConfirm={() => setWarningModalOpen(false)}
        onCancel={() => setWarningModalOpen(false)}
      />

      {/* Submit Confirmation Modal */}
      <ConfirmDialog
        open={submitModalOpen}
        title="Xác nhận nộp bài thi?"
        message={`Bạn đã hoàn thành ${answeredStats.p1Done}/24 câu Phần I và ${answeredStats.p2Done}/4 câu Phần II.\nSau khi nộp bài, hệ thống sẽ chấm điểm, chẩn đoán chủ đề còn hạn chế và lưu kết quả.`}
        confirmLabel="Nộp bài ngay"
        cancelLabel="Tiếp tục làm bài"
        tone="primary"
        onConfirm={() => {
          setSubmitModalOpen(false);
          finalize(null);
        }}
        onCancel={() => setSubmitModalOpen(false)}
      />
    </div>
  );
};
