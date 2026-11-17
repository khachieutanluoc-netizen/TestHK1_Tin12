import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Filter,
  History,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { LESSON_MAP } from '../data/matrix';
import { AttemptRecord } from '../types/exam';
import { CodeSnippetText } from './CodeSnippetText';

interface ExamResultViewProps {
  attempt: AttemptRecord;
  studentHistory: AttemptRecord[];
  canSyncDrive: boolean;
  isSyncingDrive: boolean;
  onSelectHistoryAttempt: (attempt: AttemptRecord) => void;
  onUploadSingleAttemptToDrive: (attempt: AttemptRecord) => void;
  onStartNewExam: () => void;
  onBackToSetup: () => void;
}

function formatDurationSpent(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m} phút ${s} giây`;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({
  attempt,
  studentHistory,
  canSyncDrive,
  isSyncingDrive,
  onSelectHistoryAttempt,
  onUploadSingleAttemptToDrive,
  onStartNewExam,
  onBackToSetup,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'incorrect'>('all');

  const part1Summary = useMemo(() => {
    let correct = 0;
    for (const q of attempt.exam.part1) {
      const sel = attempt.answers.part1[q.questionId];
      const key = q.options.find((o) => o.isCorrect);
      if (sel && key && sel === key.label) correct += 1;
    }
    return { correct, total: attempt.exam.part1.length };
  }, [attempt]);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToSetup}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về màn hình thông tin thí sinh</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {!attempt.syncedToDrive && canSyncDrive && (
            <button
              type="button"
              onClick={() => onUploadSingleAttemptToDrive(attempt)}
              disabled={isSyncingDrive}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-60"
            >
              <CloudUpload className="w-4 h-4" />
              <span>Lưu bài này lên Google Drive</span>
            </button>
          )}
          <button
            type="button"
            onClick={onStartNewExam}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Thi lại (Lấy đề ngẫu nhiên mới)</span>
          </button>
        </div>
      </div>

      {/* Auto-submission alert if applicable */}
      {attempt.autoSubmittedReason === 'violations' && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-rose-900">
              Hệ thống đã tự động thu bài do vượt quá 5 lần vi phạm quy chế
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-rose-800">
              Ghi nhận {attempt.violations} lần rời khỏi màn hình thi hoặc chuyển tab. Điểm số được chấm dựa trên các câu bạn đã hoàn thành trước thời điểm thu bài.
            </p>
          </div>
        </div>
      )}

      {attempt.autoSubmittedReason === 'timeout' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-900">
              Đã hết thời gian 45 phút — Hệ thống tự động thu bài
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-amber-800">
              Bài làm của bạn đã được chấm điểm và lưu trữ tự động.
            </p>
          </div>
        </div>
      )}

      {/* Score Overview + Topic Diagnosis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Kết quả bài thi · {attempt.exam.examId}
              </p>
              <p className="mt-1 text-4xl font-extrabold text-blue-700 tabular-nums">
                {attempt.totalScore.toFixed(2)}
                <span className="text-lg font-semibold text-slate-400"> / 10</span>
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
              <Award className="w-6 h-6" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-500">Phần I ({part1Summary.correct}/{part1Summary.total} câu)</p>
              <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                {attempt.part1Score.toFixed(2)} / 6.00đ
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-500">Phần II (Đúng/Sai)</p>
              <p className="mt-0.5 font-mono font-bold text-slate-900 tabular-nums">
                {attempt.part2Score.toFixed(2)} / 4.00đ
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-500">Thời gian làm bài</p>
              <p className="mt-0.5 font-semibold text-slate-900 tabular-nums text-xs sm:text-sm">
                {formatDurationSpent(attempt.durationSpentSeconds)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
              <p className="text-xs text-slate-500">Đồng bộ đám mây</p>
              <p className="mt-0.5 font-semibold text-xs sm:text-sm flex items-center gap-1">
                <Cloud
                  className={`w-3.5 h-3.5 ${
                    attempt.syncedToDrive ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                />
                <span className={attempt.syncedToDrive ? 'text-emerald-800' : 'text-slate-600'}>
                  {attempt.syncedToDrive ? 'Đã lưu Google Drive' : 'Đã lưu trên thiết bị'}
                </span>
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
            <p className="font-bold text-slate-800">{attempt.school}</p>
            <p className="text-slate-600">
              {attempt.email} · <span className="tabular-nums">{attempt.phone}</span>
            </p>
            <p className="text-slate-500">
              Nộp lúc: {new Date(attempt.submittedAt).toLocaleString('vi-VN')} · Vi phạm: {attempt.violations} lần
            </p>
          </div>
        </div>

        {/* Chẩn đoán kiến thức & Tỉ lệ đúng theo bài */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Nhận xét &amp; Chẩn đoán chủ đề kiến thức
            </h3>
            <p
              className={`mt-2 p-3.5 rounded-lg border text-sm leading-relaxed ${
                attempt.weakTopics.length > 0
                  ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              }`}
            >
              {attempt.feedbackSummary}
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Mức độ nắm vững từng bài học trong đề thi
            </p>
            <div className="space-y-2">
              {attempt.lessonBreakdown.map((lb) => {
                const isWeak = lb.accuracyPct < 70;
                return (
                  <div key={lb.lessonId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold ${
                          isWeak ? 'text-rose-800' : 'text-slate-800'
                        }`}
                      >
                        {lb.lessonTitle}
                        {isWeak && ' (Cần củng cố)'}
                      </span>
                      <span className="font-mono font-bold tabular-nums text-slate-700">
                        {lb.earnedPoints.toFixed(2)}/{lb.maxPoints.toFixed(2)}đ ({lb.accuracyPct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isWeak
                            ? 'bg-rose-600'
                            : lb.accuracyPct >= 85
                              ? 'bg-emerald-600'
                              : 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(4, lb.accuracyPct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Chuyển nhanh giữa các lần làm bài của cùng học sinh */}
      {studentHistory.length > 1 && (
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <History className="w-4 h-4 text-blue-700" />
            <span>Xem lại các lần thi khác của thí sinh này ({studentHistory.length} lượt)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {studentHistory.map((item, idx) => {
              const active = item.id === attempt.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectHistoryAttempt(item)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                    active
                      ? 'bg-blue-700 border-blue-700 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Lần {studentHistory.length - idx}: {item.totalScore.toFixed(2)}đ ·{' '}
                  {new Date(item.submittedAt).toLocaleDateString('vi-VN')}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Detailed Question-by-Question Review */}
      <section className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Xem lại chi tiết bài làm &amp; Giải thích đáp án
            </h3>
            <p className="text-xs text-slate-500">
              Đối chiếu lựa chọn của bạn với đáp án chuẩn đã thẩm định từ Sở GD&amp;ĐT.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 border border-slate-200 self-start">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-2 mr-1" />
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                filterMode === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Tất cả câu hỏi
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('incorrect')}
              className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                filterMode === 'incorrect' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Chỉ câu sai / mất điểm
            </button>
          </div>
        </div>

        {/* Part I Review */}
        {attempt.exam.part1.map((q, idx) => {
          const userChoice = attempt.answers.part1[q.questionId];
          const correctOpt = q.options.find((o) => o.isCorrect)!;
          const isCorrect = userChoice === correctOpt.label;

          if (filterMode === 'incorrect' && isCorrect) return null;

          return (
            <article
              key={q.questionId}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-700" />
                  )}
                  <span className="font-bold text-slate-900">Phần I · Câu {idx + 1}</span>
                  <span
                    className={`font-semibold ${
                      isCorrect ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isCorrect ? '+0.25đ' : userChoice ? '0.00đ (Sai)' : '0.00đ (Chưa chọn)'}
                  </span>
                </div>
                <span className="text-slate-500">
                  {LESSON_MAP[q.lessonId]?.code} · {q.level}
                </span>
              </div>

              <div className="text-sm font-medium text-slate-900 leading-relaxed">
                <CodeSnippetText text={q.prompt} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {q.options.map((opt) => {
                  const isUserPick = userChoice === opt.label;
                  const isRight = opt.isCorrect;
                  let boxClass = 'bg-white border-slate-200 text-slate-700';
                  if (isRight) {
                    boxClass = 'bg-emerald-50 border-emerald-400 text-emerald-950 font-semibold';
                  } else if (isUserPick && !isRight) {
                    boxClass = 'bg-rose-50 border-rose-400 text-rose-950';
                  }

                  return (
                    <div
                      key={opt.label}
                      className={`p-2.5 rounded-lg border flex items-start gap-2 ${boxClass}`}
                    >
                      <span className="font-bold shrink-0">{opt.label}.</span>
                      <span className="flex-1">
                        <CodeSnippetText text={opt.text} />
                      </span>
                      {isRight && (
                        <span className="text-[11px] font-bold text-emerald-800 shrink-0">
                          Đáp án đúng
                        </span>
                      )}
                      {isUserPick && !isRight && (
                        <span className="text-[11px] font-bold text-rose-800 shrink-0">
                          Bạn chọn
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900">Giải thích: </strong>
                <CodeSnippetText text={q.explanation} />
              </div>
            </article>
          );
        })}

        {/* Part II Review */}
        {attempt.exam.part2.map((cluster, idx) => {
          const clusterAns = attempt.answers.part2[cluster.questionId] || {
            a: null,
            b: null,
            c: null,
            d: null,
          };
          const correctCount = cluster.items.filter(
            (sub) => clusterAns[sub.key] === sub.isTrue
          ).length;

          if (filterMode === 'incorrect' && correctCount === 4) return null;

          return (
            <article
              key={cluster.questionId}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-900">
                  Phần II · Câu {idx + 1} (Đúng {correctCount}/4 lệnh)
                </span>
                <span className="text-slate-500">{LESSON_MAP[cluster.lessonId]?.title}</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed">
                <CodeSnippetText text={cluster.context} />
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {cluster.items.map((item) => {
                  const userVal = clusterAns[item.key];
                  const itemCorrect = userVal === item.isTrue;
                  return (
                    <div
                      key={item.key}
                      className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm ${
                        itemCorrect ? 'bg-emerald-50/40' : 'bg-rose-50/40'
                      }`}
                    >
                      <div className="text-slate-900 flex-1">
                        <span className="font-bold mr-1.5">{item.key})</span>
                        <CodeSnippetText text={item.text} />
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-slate-600">
                          Bạn chọn:{' '}
                          <strong className={itemCorrect ? 'text-emerald-800' : 'text-rose-800'}>
                            {userVal === null ? 'Chưa chọn' : userVal ? 'Đúng' : 'Sai'}
                          </strong>
                        </span>
                        <span className="text-slate-600">
                          Đáp án:{' '}
                          <strong className="text-slate-900">
                            {item.isTrue ? 'Đúng' : 'Sai'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900">Giải thích: </strong>
                <CodeSnippetText text={cluster.explanation} />
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
};
