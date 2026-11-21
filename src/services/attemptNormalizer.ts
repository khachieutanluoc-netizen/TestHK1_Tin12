import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank';
import {
  AttemptRecord,
  D1Question,
  D2Question,
  ExamD1Item,
  ExamD1Option,
  ExamD2Item,
  GeneratedExam,
} from '../types/exam';
import { isValidSbdFormat, maskEmail, maskPhone, normalizeSbd } from '../utils/examEngine';

type OptionLabel = 'A' | 'B' | 'C' | 'D';
const OPTION_LABELS: OptionLabel[] = ['A', 'B', 'C', 'D'];

const D1_BY_ID = new Map<string, D1Question>(ALL_D1_QUESTIONS.map((q) => [q.id, q]));
const D2_BY_ID = new Map<string, D2Question>(ALL_D2_QUESTIONS.map((q) => [q.id, q]));

export interface CompactExamD1Ref {
  q: string;
  o: OptionLabel[];
}

export interface CompactExamD2Ref {
  q: string;
}

export type FirestoreStoredPart1Item = CompactExamD1Ref | ExamD1Item;
export type FirestoreStoredPart2Item = CompactExamD2Ref | ExamD2Item;

export type FirestoreAttemptPayload = Omit<AttemptRecord, 'exam'> & {
  exam: {
    examId: string;
    createdAt: string;
    durationSeconds: number;
    part1: FirestoreStoredPart1Item[];
    part2: FirestoreStoredPart2Item[];
  };
};

export function sanitizeAttemptDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length >= 3 ? cleaned : `ATT-${cleaned.padEnd(3, '0')}`;
}

export function sanitizeAttemptSbd(rawSbd: string): string {
  const norm = normalizeSbd(rawSbd ?? '');
  if (isValidSbdFormat(norm)) return norm;
  const digits = norm.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) return digits;
  return digits.padStart(8, '1');
}

function clampNumber(val: unknown, min: number, max: number, roundInt = false): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : Number(val);
  const safe = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  return roundInt ? Math.round(safe) : Math.round(safe * 100) / 100;
}

function encodePart1ItemCompact(q: ExamD1Item): FirestoreStoredPart1Item {
  const bankQ = D1_BY_ID.get(q.questionId);
  if (bankQ && Array.isArray(q.options) && q.options.length === 4) {
    const used = new Set<OptionLabel>();
    const order: OptionLabel[] = [];
    for (const opt of q.options) {
      const matched = OPTION_LABELS.find(
        (origKey) => !used.has(origKey) && bankQ.options[origKey] === opt.text
      );
      if (!matched) {
        order.length = 0;
        break;
      }
      used.add(matched);
      order.push(matched);
    }
    if (order.length === 4) {
      return { q: q.questionId, o: order };
    }
  }

  return {
    questionId: String(q.questionId),
    lessonId: q.lessonId,
    level: q.level,
    competency: q.competency,
    prompt: String(q.prompt),
    options: (q.options ?? []).map((opt) => ({
      label: opt.label,
      text: String(opt.text),
      isCorrect: Boolean(opt.isCorrect),
    })),
    explanation: String(q.explanation ?? ''),
  };
}

function encodePart2ItemCompact(cluster: ExamD2Item): FirestoreStoredPart2Item {
  if (D2_BY_ID.has(cluster.questionId)) {
    return { q: cluster.questionId };
  }
  return {
    questionId: String(cluster.questionId),
    lessonId: cluster.lessonId,
    competency: cluster.competency,
    context: String(cluster.context),
    items: (cluster.items ?? []).map((item) => ({
      key: item.key,
      text: String(item.text),
      isTrue: Boolean(item.isTrue),
      level: item.level,
    })),
    explanation: String(cluster.explanation ?? ''),
  };
}

function hydratePart1Item(raw: unknown): ExamD1Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // Bản ghi đầy đủ cũ (tương thích ngược 100% với dữ liệu đã lưu trước đó)
  if (typeof obj.questionId === 'string' && typeof obj.prompt === 'string' && Array.isArray(obj.options)) {
    return raw as ExamD1Item;
  }

  // Bản ghi nén mới { q, o } -> tái tạo nguyên vẹn 100% từ ngân hàng câu hỏi cục bộ
  const qId = typeof obj.q === 'string' ? obj.q : typeof obj.questionId === 'string' ? obj.questionId : '';
  const bankQ = D1_BY_ID.get(qId);
  if (!bankQ) return null;

  const rawOrder = Array.isArray(obj.o) ? obj.o : OPTION_LABELS;
  const validOrder: OptionLabel[] =
    rawOrder.length === 4 && rawOrder.every((k) => OPTION_LABELS.includes(k as OptionLabel))
      ? (rawOrder as OptionLabel[])
      : OPTION_LABELS;

  const options: ExamD1Option[] = validOrder.map((origKey, idx) => ({
    label: OPTION_LABELS[idx],
    text: bankQ.options[origKey],
    isCorrect: origKey === bankQ.correctOption,
  }));

  return {
    questionId: bankQ.id,
    lessonId: bankQ.lessonId,
    level: bankQ.level,
    competency: bankQ.competency,
    prompt: bankQ.prompt,
    options,
    explanation: bankQ.explanation,
  };
}

function hydratePart2Item(raw: unknown): ExamD2Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // Bản ghi đầy đủ cũ (tương thích ngược 100%)
  if (typeof obj.questionId === 'string' && typeof obj.context === 'string' && Array.isArray(obj.items)) {
    return raw as ExamD2Item;
  }

  // Bản ghi nén mới { q } -> tái tạo nguyên vẹn 100% từ ngân hàng câu hỏi cục bộ
  const qId = typeof obj.q === 'string' ? obj.q : typeof obj.questionId === 'string' ? obj.questionId : '';
  const bankQ = D2_BY_ID.get(qId);
  if (!bankQ) return null;

  return {
    questionId: bankQ.id,
    lessonId: bankQ.lessonId,
    competency: bankQ.competency,
    context: bankQ.context,
    items: bankQ.items.map((item) => ({ ...item })),
    explanation: bankQ.explanation,
  };
}

/**
 * Tái tạo đầy đủ AttemptRecord từ tài liệu đọc từ Firestore (hỗ trợ cả định dạng đầy đủ cũ và định dạng nén tiết kiệm 10x read units mới).
 */
export function hydrateAttemptFromFirestore(raw: unknown): AttemptRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Partial<AttemptRecord> & { exam?: Partial<GeneratedExam> };
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

  const part1 = Array.isArray(rec.exam.part1)
    ? rec.exam.part1.map(hydratePart1Item).filter((q): q is ExamD1Item => q !== null)
    : [];
  const part2 = Array.isArray(rec.exam.part2)
    ? rec.exam.part2.map(hydratePart2Item).filter((q): q is ExamD2Item => q !== null)
    : [];

  return {
    ...(rec as AttemptRecord),
    phone: typeof rec.phone === 'string' ? rec.phone : '',
    email: typeof rec.email === 'string' ? rec.email : '',
    exam: {
      examId: String(rec.exam.examId || `DE-${rec.id}`),
      createdAt: String(rec.exam.createdAt || rec.submittedAt || new Date().toISOString()),
      durationSeconds: clampNumber(rec.exam.durationSeconds ?? 2700, 0, 7200, true),
      part1,
      part2,
    },
    syncedToDrive: Boolean(rec.syncedToDrive),
    isSeedData: false,
  };
}

/**
 * Chuẩn hóa và nén gọn bản ghi AttemptRecord khớp 100% với 19 trường trong firebase-blueprint.json & firestore.rules.
 * Giảm kích thước tài liệu từ ~36 KB (~10 read units) xuống ~2.4 KB (1 read unit) để tránh vượt hạn mức Firestore Enterprise.
 */
export function normalizeAttemptForFirestore(attempt: AttemptRecord): FirestoreAttemptPayload {
  const safeId = sanitizeAttemptDocId(attempt.id);
  const safeSbd = sanitizeAttemptSbd(attempt.sbd);
  const safeSchool = (attempt.school || 'Trường THPT Tỉnh Vĩnh Long').trim().slice(0, 200);
  const safePhone = maskPhone(attempt.phone).slice(0, 20);
  const safeEmail = maskEmail(attempt.email).slice(0, 160);
  const safeSubmittedAt = (attempt.submittedAt || new Date().toISOString()).slice(0, 64);

  const safePart1Answers: Record<string, 'A' | 'B' | 'C' | 'D' | null> = {};
  for (const [k, v] of Object.entries(attempt.answers?.part1 ?? {})) {
    safePart1Answers[k] = v ?? null;
  }

  const safePart2Answers: Record<string, Record<'a' | 'b' | 'c' | 'd', boolean | null>> = {};
  for (const [k, v] of Object.entries(attempt.answers?.part2 ?? {})) {
    safePart2Answers[k] = {
      a: v?.a ?? null,
      b: v?.b ?? null,
      c: v?.c ?? null,
      d: v?.d ?? null,
    };
  }

  const safePart1Exam = (attempt.exam?.part1 ?? []).slice(0, 30).map(encodePart1ItemCompact);
  const safePart2Exam = (attempt.exam?.part2 ?? []).slice(0, 10).map(encodePart2ItemCompact);

  const safeBreakdown = (attempt.lessonBreakdown ?? []).slice(0, 12).map((lb) => ({
    lessonId: lb.lessonId,
    lessonTitle: String(lb.lessonTitle),
    earnedPoints: clampNumber(lb.earnedPoints, 0, 10),
    maxPoints: clampNumber(lb.maxPoints, 0, 10),
    accuracyPct: clampNumber(lb.accuracyPct, 0, 100),
    correctCount: clampNumber(lb.correctCount, 0, 100, true),
    totalCount: clampNumber(lb.totalCount, 0, 100, true),
  }));

  const safeWeakTopics = (attempt.weakTopics ?? [])
    .slice(0, 12)
    .map((id) => clampNumber(id, 1, 10, true) as AttemptRecord['weakTopics'][number]);

  const autoReason =
    attempt.autoSubmittedReason === 'timeout' || attempt.autoSubmittedReason === 'violations'
      ? attempt.autoSubmittedReason
      : null;

  return {
    id: safeId,
    sbd: safeSbd,
    school: safeSchool.length >= 3 ? safeSchool : 'THPT Vĩnh Long',
    phone: safePhone,
    email: safeEmail,
    submittedAt: safeSubmittedAt.length >= 10 ? safeSubmittedAt : new Date().toISOString(),
    durationSpentSeconds: clampNumber(attempt.durationSpentSeconds, 0, 7200, true),
    violations: clampNumber(attempt.violations, 0, 50, true),
    autoSubmittedReason: autoReason,
    part1Score: clampNumber(attempt.part1Score, 0, 6),
    part2Score: clampNumber(attempt.part2Score, 0, 4),
    totalScore: clampNumber(attempt.totalScore, 0, 10),
    exam: {
      examId: String(attempt.exam?.examId || `DE-${safeId}`).slice(0, 64),
      createdAt: String(attempt.exam?.createdAt || safeSubmittedAt),
      durationSeconds: clampNumber(attempt.exam?.durationSeconds ?? 2700, 0, 7200, true),
      part1: safePart1Exam,
      part2: safePart2Exam,
    },
    answers: {
      part1: safePart1Answers,
      part2: safePart2Answers,
    },
    lessonBreakdown: safeBreakdown,
    weakTopics: safeWeakTopics,
    feedbackSummary: String(attempt.feedbackSummary ?? '').slice(0, 2000),
    syncedToDrive: Boolean(attempt.syncedToDrive),
    isSeedData: false,
  };
}
