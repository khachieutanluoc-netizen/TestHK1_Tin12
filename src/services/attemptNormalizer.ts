import { AttemptRecord } from '../types/exam';
import { isValidSbdFormat, maskEmail, maskPhone, normalizeSbd } from '../utils/examEngine';

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

/**
 * Chuẩn hóa bản ghi AttemptRecord khớp 100% với 19 trường trong firebase-blueprint.json & firestore.rules
 * (Loại bỏ mọi giá trị undefined để Firestore SDK không báo lỗi, bảo mật che giấu SĐT/Email nếu có).
 */
export function normalizeAttemptForFirestore(attempt: AttemptRecord): AttemptRecord {
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

  const safePart1Exam = (attempt.exam?.part1 ?? []).slice(0, 30).map((q) => ({
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
  }));

  const safePart2Exam = (attempt.exam?.part2 ?? []).slice(0, 10).map((cluster) => ({
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
  }));

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
