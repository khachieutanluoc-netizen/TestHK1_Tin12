import { LESSONS } from '../data/matrix';
import { D1Question, D2Question, LessonId } from '../types/exam';

export type PracticeTypeFilter = 'all' | 'D1' | 'D2';

export type PracticeQuestionItem =
  | {
      kind: 'D1';
      uid: string;
      indexInLesson: number;
      question: D1Question;
    }
  | {
      kind: 'D2';
      uid: string;
      indexInLesson: number;
      question: D2Question;
    };

export type PracticeAnswerValue =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | null
  | Record<'a' | 'b' | 'c' | 'd', boolean | null>;

export interface D1PracticeEvaluation {
  kind: 'D1';
  isAnswered: boolean;
  isComplete: boolean;
  isCorrect: boolean;
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  correctOption: 'A' | 'B' | 'C' | 'D';
}

export interface D2SubEvaluation {
  key: 'a' | 'b' | 'c' | 'd';
  actual: boolean | null;
  expected: boolean;
  isAnswered: boolean;
  isCorrect: boolean;
}

export interface D2PracticeEvaluation {
  kind: 'D2';
  isAnswered: boolean;
  isComplete: boolean;
  isCorrect: boolean;
  correctCount: number;
  totalCount: number;
  subResults: D2SubEvaluation[];
}

export type PracticeEvaluation = D1PracticeEvaluation | D2PracticeEvaluation;

export interface LessonQuestionCount {
  lessonId: LessonId;
  d1Count: number;
  d2Count: number;
  totalCount: number;
}

export function getLessonQuestionCounts(
  d1Pool: readonly D1Question[],
  d2Pool: readonly D2Question[]
): LessonQuestionCount[] {
  return LESSONS.map((lesson) => {
    const d1Count = d1Pool.filter((q) => q.lessonId === lesson.id).length;
    const d2Count = d2Pool.filter((q) => q.lessonId === lesson.id).length;
    return {
      lessonId: lesson.id,
      d1Count,
      d2Count,
      totalCount: d1Count + d2Count,
    };
  });
}

export function getQuestionsByLesson(
  lessonId: LessonId,
  d1Pool: readonly D1Question[],
  d2Pool: readonly D2Question[],
  filterType: PracticeTypeFilter = 'all'
): PracticeQuestionItem[] {
  const result: PracticeQuestionItem[] = [];

  if (filterType === 'all' || filterType === 'D1') {
    const d1List = d1Pool
      .filter((q) => q.lessonId === lessonId)
      .sort((a, b) => a.questionNumber - b.questionNumber);
    for (const q of d1List) {
      result.push({
        kind: 'D1',
        uid: `D1:${q.id}`,
        indexInLesson: result.length + 1,
        question: q,
      });
    }
  }

  if (filterType === 'all' || filterType === 'D2') {
    const d2List = d2Pool
      .filter((q) => q.lessonId === lessonId)
      .sort((a, b) => a.questionNumber - b.questionNumber);
    for (const q of d2List) {
      result.push({
        kind: 'D2',
        uid: `D2:${q.id}`,
        indexInLesson: result.length + 1,
        question: q,
      });
    }
  }

  return result;
}

export function createEmptyPracticeD2Answer(): Record<'a' | 'b' | 'c' | 'd', boolean | null> {
  return { a: null, b: null, c: null, d: null };
}

export function evaluatePracticeQuestion(
  item: PracticeQuestionItem,
  rawAnswer: PracticeAnswerValue | undefined
): PracticeEvaluation {
  if (item.kind === 'D1') {
    const selectedOption =
      rawAnswer === 'A' || rawAnswer === 'B' || rawAnswer === 'C' || rawAnswer === 'D'
        ? rawAnswer
        : null;
    const isAnswered = selectedOption !== null;
    const isCorrect = isAnswered && selectedOption === item.question.correctOption;
    return {
      kind: 'D1',
      isAnswered,
      isComplete: isAnswered,
      isCorrect,
      selectedOption,
      correctOption: item.question.correctOption,
    };
  }

  const record =
    rawAnswer && typeof rawAnswer === 'object'
      ? rawAnswer
      : createEmptyPracticeD2Answer();

  const subResults: D2SubEvaluation[] = item.question.items.map((sub) => {
    const actual = record[sub.key] ?? null;
    const isAnswered = actual !== null;
    return {
      key: sub.key,
      actual,
      expected: sub.isTrue,
      isAnswered,
      isCorrect: isAnswered && actual === sub.isTrue,
    };
  });

  const answeredCount = subResults.filter((s) => s.isAnswered).length;
  const correctCount = subResults.filter((s) => s.isCorrect).length;

  return {
    kind: 'D2',
    isAnswered: answeredCount > 0,
    isComplete: answeredCount === subResults.length,
    isCorrect: correctCount === subResults.length,
    correctCount,
    totalCount: subResults.length,
    subResults,
  };
}

export function computeLessonPracticeSummary(
  items: readonly PracticeQuestionItem[],
  answersMap: Readonly<Record<string, PracticeAnswerValue>>,
  checkedMap: Readonly<Record<string, boolean>>
): {
  totalQuestions: number;
  answeredCount: number;
  checkedCount: number;
  correctCount: number;
} {
  let answeredCount = 0;
  let checkedCount = 0;
  let correctCount = 0;

  for (const item of items) {
    const evalRes = evaluatePracticeQuestion(item, answersMap[item.uid]);
    if (evalRes.isAnswered) answeredCount += 1;
    if (checkedMap[item.uid]) {
      checkedCount += 1;
      if (evalRes.isCorrect) {
        correctCount += 1;
      }
    }
  }

  return {
    totalQuestions: items.length,
    answeredCount,
    checkedCount,
    correctCount,
  };
}
