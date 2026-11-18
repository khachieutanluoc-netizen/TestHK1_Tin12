import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  HelpCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { LESSON_MAP, LESSONS } from '../data/matrix';
import { D1Question, D2Question, LessonId } from '../types/exam';
import {
  computeLessonPracticeSummary,
  createEmptyPracticeD2Answer,
  evaluatePracticeQuestion,
  getLessonQuestionCounts,
  getQuestionsByLesson,
  PracticeAnswerValue,
  PracticeTypeFilter,
} from '../utils/lessonPractice';
import { CodeSnippetText } from './CodeSnippetText';

interface LessonPracticeViewProps {
  d1Questions: readonly D1Question[];
  d2Questions: readonly D2Question[];
}

export const LessonPracticeView: React.FC<LessonPracticeViewProps> = ({
  d1Questions,
  d2Questions,
}) => {
  const [selectedLessonId, setSelectedLessonId] = useState<LessonId>(1);
  const [typeFilter, setTypeFilter] = useState<PracticeTypeFilter>('all');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answersMap, setAnswersMap] = useState<Record<string, PracticeAnswerValue>>({});
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [validationNotice, setValidationNotice] = useState<string | null>(null);

  const lessonCounts = useMemo(
    () => getLessonQuestionCounts(d1Questions, d2Questions),
    [d1Questions, d2Questions]
  );

  const countByLesson = useMemo(() => {
    const map = new Map<LessonId, { d1Count: number; d2Count: number; totalCount: number }>();
    for (const c of lessonCounts) {
      map.set(c.lessonId, c);
    }
    return map;
  }, [lessonCounts]);

  const lessonQuestions = useMemo(
    () => getQuestionsByLesson(selectedLessonId, d1Questions, d2Questions, typeFilter),
    [selectedLessonId, d1Questions, d2Questions, typeFilter]
  );

  const safeIndex =
    lessonQuestions.length > 0 ? Math.min(currentIndex, lessonQuestions.length - 1) : 0;
  const currentItem = lessonQuestions[safeIndex] ?? null;

  const summary = useMemo(
    () => computeLessonPracticeSummary(lessonQuestions, answersMap, checkedMap),
    [lessonQuestions, answersMap, checkedMap]
  );

  const currentMeta = LESSON_MAP[selectedLessonId];
  const isCurrentChecked = currentItem ? Boolean(checkedMap[currentItem.uid]) : false;
  const currentEvaluation = useMemo(
    () => (currentItem ? evaluatePracticeQuestion(currentItem, answersMap[currentItem.uid]) : null),
    [currentItem, answersMap]
  );

  const handleSelectLesson = (lessonId: LessonId) => {
    setSelectedLessonId(lessonId);
    setCurrentIndex(0);
    setValidationNotice(null);
  };

  const handleChangeFilter = (nextFilter: PracticeTypeFilter) => {
    setTypeFilter(nextFilter);
    setCurrentIndex(0);
    setValidationNotice(null);
  };

  const handleSelectD1 = (uid: string, option: 'A' | 'B' | 'C' | 'D') => {
    if (checkedMap[uid]) return;
    setValidationNotice(null);
    setAnswersMap((prev) => ({
      ...prev,
      [uid]: option,
    }));
  };

  const handleSelectD2 = (uid: string, subKey: 'a' | 'b' | 'c' | 'd', value: boolean) => {
    if (checkedMap[uid]) return;
    setValidationNotice(null);
    setAnswersMap((prev) => {
      const existing =
        prev[uid] && typeof prev[uid] === 'object'
          ? (prev[uid] as Record<'a' | 'b' | 'c' | 'd', boolean | null>)
          : createEmptyPracticeD2Answer();
      return {
        ...prev,
        [uid]: {
          ...existing,
          [subKey]: value,
        },
      };
    });
  };

  const handleCheckCurrent = () => {
    if (!currentItem || !currentEvaluation) return;
    if (!currentEvaluation.isAnswered) {
      setValidationNotice(
        currentItem.kind === 'D1'
          ? 'Vui lòng chọn một phương án (A, B, C hoặc D) trước khi kiểm tra kết quả.'
          : 'Vui lòng chọn Đúng hoặc Sai cho ít nhất một lệnh hỏi trước khi kiểm tra kết quả.'
      );
      return;
    }
    setValidationNotice(null);
    setCheckedMap((prev) => ({
      ...prev,
      [currentItem.uid]: true,
    }));
  };

  const handleRevealCurrentAnswer = () => {
    if (!currentItem) return;
    setValidationNotice(null);
    setCheckedMap((prev) => ({
      ...prev,
      [currentItem.uid]: true,
    }));
  };

  const handleResetCurrent = () => {
    if (!currentItem) return;
    setValidationNotice(null);
    setAnswersMap((prev) => {
      const next = { ...prev };
      delete next[currentItem.uid];
      return next;
    });
    setCheckedMap((prev) => {
      const next = { ...prev };
      delete next[currentItem.uid];
      return next;
    });
  };

  const handleResetLesson = () => {
    setValidationNotice(null);
    const uidsInLesson = new Set(lessonQuestions.map((q) => q.uid));
    setAnswersMap((prev) => {
      const next: Record<string, PracticeAnswerValue> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!uidsInLesson.has(k)) next[k] = v;
      }
      return next;
    });
    setCheckedMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!uidsInLesson.has(k)) next[k] = v;
      }
      return next;
    });
    setCurrentIndex(0);
  };

  const handleJumpTo = (idx: number) => {
    setCurrentIndex(idx);
    setValidationNotice(null);
  };

  const adLessons = LESSONS.filter((l) => l.topicGroup === 'A&D');
  const fLessons = LESSONS.filter((l) => l.topicGroup === 'F');

  return (
    <div className="space-y-6">
      {/* Lesson Picker & Topic Controls */}
      <section
        aria-labelledby="lesson-practice-heading"
        className="bg-white rounded-xl border border-slate-200 p-5 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 id="lesson-practice-heading" className="text-lg font-bold text-slate-900">
              Ôn tập kiến thức theo từng Bài học
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Chọn bài học cần ôn, thực hành từng câu, kiểm tra kết quả ngay và xem đáp án kèm lời giải chi tiết.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => handleChangeFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  typeFilter === 'all'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả câu
              </button>
              <button
                type="button"
                onClick={() => handleChangeFilter('D1')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  typeFilter === 'D1'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dạng 1 (Trắc nghiệm)
              </button>
              <button
                type="button"
                onClick={() => handleChangeFilter('D2')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  typeFilter === 'D2'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dạng 2 (Đúng / Sai)
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetLesson}
              disabled={summary.answeredCount === 0 && summary.checkedCount === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Làm lại {currentMeta.code}</span>
            </button>
          </div>
        </div>

        {/* 10 Lesson Selector Buttons */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            <div className="xl:col-span-4 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Chủ đề A &amp; D — AI &amp; Đạo đức mạng
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {adLessons.map((lesson) => {
                  const counts = countByLesson.get(lesson.id);
                  const active = selectedLessonId === lesson.id;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => handleSelectLesson(lesson.id)}
                      aria-pressed={active}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-slate-50/70 border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-xs font-bold">
                        <span>{lesson.code}</span>
                        <span
                          className={`text-[11px] tabular-nums ${
                            active ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          <span className="font-mono">{counts?.totalCount ?? 0}</span>
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 text-[11px] font-medium line-clamp-1 ${
                          active ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {lesson.shortTitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="xl:col-span-8 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Chủ đề F (ICT) — Thiết kế trang web với HTML &amp; CSS
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                {fLessons.map((lesson) => {
                  const counts = countByLesson.get(lesson.id);
                  const active = selectedLessonId === lesson.id;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => handleSelectLesson(lesson.id)}
                      aria-pressed={active}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-slate-50/70 border-slate-200 text-slate-800 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-xs font-bold">
                        <span>{lesson.code}</span>
                        <span
                          className={`text-[11px] tabular-nums ${
                            active ? 'text-blue-100' : 'text-slate-500'
                          }`}
                        >
                          <span className="font-mono">{counts?.totalCount ?? 0}</span>
                        </span>
                      </div>
                      <p
                        className={`mt-0.5 text-[11px] font-medium line-clamp-1 ${
                          active ? 'text-white' : 'text-slate-600'
                        }`}
                      >
                        {lesson.shortTitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split Practice Stage (8 cols Question + 4 cols Question Navigator) */}
      {currentItem && currentEvaluation ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Question Stage */}
          <section
            aria-labelledby="practice-question-heading"
            className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-5"
          >
            {/* Quiet Unboxed Question Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {currentMeta.title} ·{' '}
                  {currentItem.kind === 'D1'
                    ? `Dạng 1 (Trắc nghiệm 4 lựa chọn) · Mức ${currentItem.question.level}`
                    : 'Dạng 2 (Đúng / Sai — 4 lệnh hỏi)'}{' '}
                  · Năng lực {currentItem.question.competency}
                </p>
                <h3
                  id="practice-question-heading"
                  className="mt-1 text-base sm:text-lg font-bold text-slate-900 tabular-nums"
                >
                  Câu {safeIndex + 1} / {lessonQuestions.length}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                <span>
                  Đã kiểm tra:{' '}
                  <strong className="text-slate-900">
                    {summary.checkedCount}/{summary.totalQuestions}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Đúng hoàn toàn:{' '}
                  <strong className="text-emerald-700">{summary.correctCount}</strong>
                </span>
              </div>
            </div>

            {/* Question Body: D1 or D2 */}
            {currentItem.kind === 'D1' ? (
              <div className="space-y-4">
                <div className="text-sm sm:text-base font-medium text-slate-900 leading-relaxed">
                  <CodeSnippetText text={currentItem.question.prompt} />
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {(['A', 'B', 'C', 'D'] as const).map((label) => {
                    const optionText = currentItem.question.options[label];
                    const selected =
                      currentEvaluation.kind === 'D1' &&
                      currentEvaluation.selectedOption === label;
                    const isRightOption = label === currentItem.question.correctOption;

                    let cardStyle =
                      'bg-white border-slate-200 hover:bg-slate-50 text-slate-800';
                    if (isCurrentChecked) {
                      if (isRightOption) {
                        cardStyle =
                          'bg-emerald-50 border-emerald-500 text-emerald-950 font-semibold';
                      } else if (selected && !isRightOption) {
                        cardStyle = 'bg-rose-50 border-rose-400 text-rose-950';
                      } else {
                        cardStyle = 'bg-slate-50/50 border-slate-200 text-slate-500';
                      }
                    } else if (selected) {
                      cardStyle = 'bg-blue-50/80 border-blue-600 text-slate-900';
                    }

                    return (
                      <label
                        key={label}
                        className={`flex items-start gap-3 p-3.5 rounded-lg border text-sm transition-colors ${
                          isCurrentChecked ? 'cursor-default' : 'cursor-pointer'
                        } ${cardStyle}`}
                      >
                        <input
                          type="radio"
                          name={`practice-d1-${currentItem.uid}`}
                          checked={selected}
                          disabled={isCurrentChecked}
                          onChange={() => handleSelectD1(currentItem.uid, label)}
                          className="mt-0.5 h-4 w-4 text-blue-700 border-slate-300 focus:ring-blue-600 shrink-0"
                        />
                        <span className="font-bold shrink-0">{label}.</span>
                        <span className="flex-1 leading-relaxed">
                          <CodeSnippetText text={optionText} />
                        </span>
                        {isCurrentChecked && isRightOption && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Đáp án đúng</span>
                          </span>
                        )}
                        {isCurrentChecked && selected && !isRightOption && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 shrink-0">
                            <XCircle className="w-4 h-4" />
                            <span>Bạn chọn</span>
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed">
                  <CodeSnippetText text={currentItem.question.context} />
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {currentItem.question.items.map((sub) => {
                    const ansObj =
                      answersMap[currentItem.uid] &&
                      typeof answersMap[currentItem.uid] === 'object'
                        ? (answersMap[currentItem.uid] as Record<
                            'a' | 'b' | 'c' | 'd',
                            boolean | null
                          >)
                        : createEmptyPracticeD2Answer();
                    const picked = ansObj[sub.key];
                    const subEval =
                      currentEvaluation.kind === 'D2'
                        ? currentEvaluation.subResults.find((r) => r.key === sub.key)
                        : undefined;

                    return (
                      <div
                        key={sub.key}
                        className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isCurrentChecked && subEval
                            ? subEval.isCorrect
                              ? 'bg-emerald-50/40'
                              : 'bg-rose-50/40'
                            : 'bg-white'
                        }`}
                      >
                        <div className="text-sm text-slate-900 leading-relaxed flex-1">
                          <span className="font-bold mr-1.5">{sub.key})</span>
                          <CodeSnippetText text={sub.text} />
                          <span className="ml-2 text-xs text-slate-500">({sub.level})</span>
                          {isCurrentChecked && subEval && (
                            <p
                              className={`mt-1.5 text-xs font-semibold flex items-center gap-1.5 ${
                                subEval.isCorrect ? 'text-emerald-800' : 'text-rose-800'
                              }`}
                            >
                              {subEval.isCorrect ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>
                                {subEval.isCorrect
                                  ? `Chính xác (${sub.isTrue ? 'Đúng' : 'Sai'})`
                                  : `Đáp án đúng: ${sub.isTrue ? 'Đúng' : 'Sai'} · Bạn chọn: ${
                                      subEval.actual === null
                                        ? 'Chưa chọn'
                                        : subEval.actual
                                          ? 'Đúng'
                                          : 'Sai'
                                    }`}
                              </span>
                            </p>
                          )}
                        </div>

                        <div className="inline-flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isCurrentChecked}
                            onClick={() => handleSelectD2(currentItem.uid, sub.key, true)}
                            aria-pressed={picked === true}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-md border transition-colors ${
                              isCurrentChecked ? 'cursor-default opacity-80' : 'cursor-pointer'
                            } ${
                              picked === true
                                ? 'bg-blue-700 border-blue-700 text-white'
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            Đúng
                          </button>
                          <button
                            type="button"
                            disabled={isCurrentChecked}
                            onClick={() => handleSelectD2(currentItem.uid, sub.key, false)}
                            aria-pressed={picked === false}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-md border transition-colors ${
                              isCurrentChecked ? 'cursor-default opacity-80' : 'cursor-pointer'
                            } ${
                              picked === false
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
              </div>
            )}

            {/* Gentle prompt if user clicked Check with nothing selected */}
            {validationNotice && (
              <div
                role="status"
                className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 font-medium flex items-center gap-2"
              >
                <HelpCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{validationNotice}</span>
              </div>
            )}

            {/* Revealed Result & Detailed Explanation */}
            {isCurrentChecked && (
              <div
                data-testid="practice-explanation-panel"
                className={`rounded-xl border p-4 space-y-2.5 ${
                  currentEvaluation.isCorrect
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : currentEvaluation.isAnswered
                      ? 'bg-rose-50/60 border-rose-200'
                      : 'bg-blue-50/70 border-blue-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {currentEvaluation.isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                    ) : currentEvaluation.isAnswered ? (
                      <XCircle className="w-5 h-5 text-rose-700 shrink-0" />
                    ) : (
                      <Eye className="w-5 h-5 text-blue-700 shrink-0" />
                    )}
                    <span
                      className={`text-sm font-bold ${
                        currentEvaluation.isCorrect
                          ? 'text-emerald-900'
                          : currentEvaluation.isAnswered
                            ? 'text-rose-900'
                            : 'text-blue-900'
                      }`}
                    >
                      {currentItem.kind === 'D1'
                        ? currentEvaluation.isCorrect
                          ? `Chính xác! Đáp án đúng là phương án ${currentItem.question.correctOption}.`
                          : currentEvaluation.isAnswered
                            ? `Chưa chính xác. Đáp án đúng là phương án ${currentItem.question.correctOption}.`
                            : `Đáp án đúng là phương án ${currentItem.question.correctOption}.`
                        : currentEvaluation.kind === 'D2'
                          ? currentEvaluation.isCorrect
                            ? 'Xuất sắc! Bạn trả lời đúng cả 4/4 lệnh hỏi.'
                            : `Bạn đúng ${currentEvaluation.correctCount}/${currentEvaluation.totalCount} lệnh hỏi.`
                          : null}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-white border border-slate-200/80 text-xs sm:text-sm text-slate-800 leading-relaxed">
                  <p className="font-bold text-slate-900 mb-1">Giải thích phương án lựa chọn:</p>
                  <CodeSnippetText text={currentItem.question.explanation} />
                </div>
              </div>
            )}

            {/* Action Bar: Check / Reveal / Retry + Prev / Next */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {!isCurrentChecked ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCheckCurrent}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Kiểm tra kết quả</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRevealCurrentAnswer}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Xem đáp án &amp; giải thích</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetCurrent}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Làm lại câu này</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={safeIndex === 0}
                  onClick={() => handleJumpTo(Math.max(0, safeIndex - 1))}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Câu trước</span>
                </button>
                <button
                  type="button"
                  disabled={safeIndex >= lessonQuestions.length - 1}
                  onClick={() =>
                    handleJumpTo(Math.min(lessonQuestions.length - 1, safeIndex + 1))
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  <span>Câu tiếp theo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Right Sidebar: Lesson Question Map & Progress */}
          <aside className="lg:col-span-4 lg:sticky lg:top-20 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Danh sách câu · {currentMeta.code}
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-blue-700 tabular-nums">
                  {summary.checkedCount}/{summary.totalQuestions}
                </span>
              </div>

              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5">
                {lessonQuestions.map((item, idx) => {
                  const isCurrent = idx === safeIndex;
                  const checked = Boolean(checkedMap[item.uid]);
                  const ev = evaluatePracticeQuestion(item, answersMap[item.uid]);

                  let btnClass =
                    'bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-400';
                  if (checked) {
                    btnClass = ev.isCorrect
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-rose-600 border-rose-600 text-white';
                  } else if (ev.isAnswered) {
                    btnClass = 'bg-blue-50 border-blue-400 text-blue-800';
                  }

                  return (
                    <button
                      key={item.uid}
                      type="button"
                      onClick={() => handleJumpTo(idx)}
                      title={`Câu ${idx + 1} (${item.kind === 'D1' ? 'Dạng 1' : 'Dạng 2'})`}
                      className={`py-2 text-xs font-mono font-bold rounded-md border transition-colors cursor-pointer tabular-nums ${btnClass} ${
                        isCurrent ? 'ring-2 ring-blue-700 ring-offset-1' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Clean Legend */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-emerald-600 inline-block shrink-0" />
                  <span>Đã kiểm tra · Đúng</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-rose-600 inline-block shrink-0" />
                  <span>Đã kiểm tra · Sai</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-blue-50 border border-blue-400 inline-block shrink-0" />
                  <span>Đã chọn · Chưa kiểm tra</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm bg-slate-50 border border-slate-200 inline-block shrink-0" />
                  <span>Chưa làm</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-600">
          Không có câu hỏi nào thuộc loại đã chọn trong {currentMeta.title}. Vui lòng chọn &ldquo;Tất cả câu&rdquo;.
        </div>
      )}
    </div>
  );
};
