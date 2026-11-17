import {
  EXAM_DURATION_SECONDS,
  LESSON_MAP,
  PART1_MATRIX,
  PART2_SCORE_BY_CORRECT_COUNT,
  PART2_TARGET_LEVELS,
} from '../data/matrix';
import {
  AttemptRecord,
  CognitiveLevel,
  D1Question,
  D2Question,
  ExamD1Item,
  ExamD1Option,
  ExamD2Item,
  GeneratedExam,
  LessonId,
  LessonMastery,
  StudentAnswers,
} from '../types/exam';

export interface CandidateInfo {
  school: string;
  phone: string;
  email: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof CandidateInfo, string>>;
  normalized: CandidateInfo;
}

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.-]/g, '').trim();
}

export function validateCandidateForm(
  input: CandidateInfo,
  allowedSchools: string[]
): ValidationResult {
  const school = input.school.trim();
  const phone = normalizePhone(input.phone);
  const email = input.email.trim();
  const errors: Partial<Record<keyof CandidateInfo, string>> = {};

  if (!school) {
    errors.school = 'Vui lòng chọn trường THPT / Trung tâm của bạn.';
  } else if (!allowedSchools.includes(school)) {
    errors.school = 'Tên trường không nằm trong danh sách sở giáo dục.';
  }

  if (!phone) {
    errors.phone = 'Vui lòng nhập số điện thoại.';
  } else if (!/^(0|\+?84)[0-9]{8,10}$/.test(phone)) {
    errors.phone = 'Số điện thoại không hợp lệ (gồm 9–11 chữ số, bắt đầu bằng 0 hoặc +84).';
  }

  if (!email) {
    errors.email = 'Vui lòng nhập địa chỉ email.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = 'Địa chỉ email không đúng định dạng (ví dụ: hocsinh@gmail.com).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: { school, phone, email: email.toLowerCase() },
  };
}

export function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildD1ExamItem(q: D1Question, rng: () => number): ExamD1Item {
  const rawEntries: Array<{ text: string; isCorrect: boolean }> = [
    { text: q.options.A, isCorrect: q.correctOption === 'A' },
    { text: q.options.B, isCorrect: q.correctOption === 'B' },
    { text: q.options.C, isCorrect: q.correctOption === 'C' },
    { text: q.options.D, isCorrect: q.correctOption === 'D' },
  ];
  const shuffled = shuffleArray(rawEntries, rng);
  const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  const options: ExamD1Option[] = shuffled.map((entry, idx) => ({
    label: labels[idx],
    text: entry.text,
    isCorrect: entry.isCorrect,
  }));

  return {
    questionId: q.id,
    lessonId: q.lessonId,
    level: q.level,
    competency: q.competency,
    prompt: q.prompt,
    options,
    explanation: q.explanation,
  };
}

function countClusterLevels(q: D2Question): Record<CognitiveLevel, number> {
  const counts: Record<CognitiveLevel, number> = {
    Biết: 0,
    Hiểu: 0,
    VD: 0,
    VDC: 0,
  };
  for (const item of q.items) {
    counts[item.level] += 1;
  }
  return counts;
}

function selectPart2Clusters(
  d2Pool: readonly D2Question[],
  rng: () => number
): D2Question[] {
  const adPool = shuffleArray(
    d2Pool.filter((q) => q.lessonId <= 3),
    rng
  );
  const fPool = shuffleArray(
    d2Pool.filter((q) => q.lessonId >= 4),
    rng
  );

  const adWithLevels = adPool.map((q) => ({ q, counts: countClusterLevels(q) }));
  const fWithLevels = fPool.map((q) => ({ q, counts: countClusterLevels(q) }));

  const target = PART2_TARGET_LEVELS;

  const findCombo = (requireDistinctFLessons: boolean): D2Question[] | null => {
    for (const adEntry of adWithLevels) {
      const remAfterAd = {
        Biết: target.Biết - adEntry.counts.Biết,
        Hiểu: target.Hiểu - adEntry.counts.Hiểu,
        VD: target.VD - adEntry.counts.VD,
        VDC: target.VDC - adEntry.counts.VDC,
      };
      if (
        remAfterAd.Biết < 0 ||
        remAfterAd.Hiểu < 0 ||
        remAfterAd.VD < 0 ||
        remAfterAd.VDC < 0
      ) {
        continue;
      }

      for (let i = 0; i < fWithLevels.length; i++) {
        const f1 = fWithLevels[i];
        const r1 = {
          Biết: remAfterAd.Biết - f1.counts.Biết,
          Hiểu: remAfterAd.Hiểu - f1.counts.Hiểu,
          VD: remAfterAd.VD - f1.counts.VD,
          VDC: remAfterAd.VDC - f1.counts.VDC,
        };
        if (r1.Biết < 0 || r1.Hiểu < 0 || r1.VD < 0 || r1.VDC < 0) continue;

        for (let j = i + 1; j < fWithLevels.length; j++) {
          const f2 = fWithLevels[j];
          if (requireDistinctFLessons && f2.q.lessonId === f1.q.lessonId) continue;

          const r2 = {
            Biết: r1.Biết - f2.counts.Biết,
            Hiểu: r1.Hiểu - f2.counts.Hiểu,
            VD: r1.VD - f2.counts.VD,
            VDC: r1.VDC - f2.counts.VDC,
          };
          if (r2.Biết < 0 || r2.Hiểu < 0 || r2.VD < 0 || r2.VDC < 0) continue;

          for (let k = j + 1; k < fWithLevels.length; k++) {
            const f3 = fWithLevels[k];
            if (
              requireDistinctFLessons &&
              (f3.q.lessonId === f1.q.lessonId || f3.q.lessonId === f2.q.lessonId)
            ) {
              continue;
            }
            if (
              f3.counts.Biết === r2.Biết &&
              f3.counts.Hiểu === r2.Hiểu &&
              f3.counts.VD === r2.VD &&
              f3.counts.VDC === r2.VDC
            ) {
              return [adEntry.q, f1.q, f2.q, f3.q];
            }
          }
        }
      }
    }
    return null;
  };

  const exactDistinct = findCombo(true);
  if (exactDistinct) return exactDistinct;

  const exactAny = findCombo(false);
  if (exactAny) return exactAny;

  // Fallback safe: 1 A&D + 3 distinct F clusters
  if (adPool.length >= 1 && fPool.length >= 3) {
    const pickedF: D2Question[] = [];
    const usedLessons = new Set<LessonId>();
    for (const fq of fPool) {
      if (!usedLessons.has(fq.lessonId)) {
        pickedF.push(fq);
        usedLessons.add(fq.lessonId);
        if (pickedF.length === 3) break;
      }
    }
    while (pickedF.length < 3 && fPool.length > pickedF.length) {
      const next = fPool.find((q) => !pickedF.includes(q));
      if (!next) break;
      pickedF.push(next);
    }
    return [adPool[0], ...pickedF];
  }

  throw new Error('Ngân hàng câu hỏi Phần II không đủ câu để sinh đề theo ma trận.');
}

export function generateExam(
  d1Pool: readonly D1Question[],
  d2Pool: readonly D2Question[],
  rng: () => number = Math.random
): GeneratedExam {
  const part1Raw: ExamD1Item[] = [];
  const levels: CognitiveLevel[] = ['Biết', 'Hiểu', 'VD', 'VDC'];

  for (const slot of PART1_MATRIX) {
    for (const level of levels) {
      const required = slot.counts[level];
      if (required <= 0) continue;

      const candidates = shuffleArray(
        d1Pool.filter((q) => q.lessonId === slot.lessonId && q.level === level),
        rng
      );

      if (candidates.length < required) {
        throw new Error(
          `Thiếu câu hỏi Dạng 1 ở Bài ${slot.lessonId} mức độ ${level}: cần ${required}, có ${candidates.length}.`
        );
      }

      for (let i = 0; i < required; i++) {
        part1Raw.push(buildD1ExamItem(candidates[i], rng));
      }
    }
  }

  // Sắp xếp lại câu Phần I ngẫu nhiên nhưng vẫn đảm bảo đúng 24 câu theo ma trận
  const part1 = shuffleArray(part1Raw, rng);

  // Phần II: Giữ nguyên ngữ cảnh gốc từng câu, tổng 4 câu chùm (1 A&D + 3 F)
  const selectedClusters = selectPart2Clusters(d2Pool, rng);
  const part2: ExamD2Item[] = selectedClusters.map((q) => ({
    questionId: q.id,
    lessonId: q.lessonId,
    competency: q.competency,
    context: q.context,
    items: q.items.map((item) => ({ ...item })),
    explanation: q.explanation,
  }));

  const randomSuffix = Math.floor(rng() * 1_000_000)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');

  return {
    examId: `DE-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`,
    createdAt: new Date().toISOString(),
    durationSeconds: EXAM_DURATION_SECONDS,
    part1,
    part2,
  };
}

export function createEmptyAnswers(exam: GeneratedExam): StudentAnswers {
  const part1: StudentAnswers['part1'] = {};
  for (const q of exam.part1) {
    part1[q.questionId] = null;
  }

  const part2: StudentAnswers['part2'] = {};
  for (const q of exam.part2) {
    part2[q.questionId] = { a: null, b: null, c: null, d: null };
  }

  return { part1, part2 };
}

function roundScore(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GradeExamMeta {
  attemptId?: string;
  school: string;
  phone: string;
  email: string;
  submittedAt?: string;
  durationSpentSeconds: number;
  violations: number;
  autoSubmittedReason: 'timeout' | 'violations' | null;
}

export function gradeExam(
  exam: GeneratedExam,
  answers: StudentAnswers,
  meta: GradeExamMeta
): AttemptRecord {
  const lessonAcc = new Map<
    LessonId,
    { earnedPoints: number; maxPoints: number; correctCount: number; totalCount: number }
  >();

  const ensureLesson = (lessonId: LessonId) => {
    let entry = lessonAcc.get(lessonId);
    if (!entry) {
      entry = { earnedPoints: 0, maxPoints: 0, correctCount: 0, totalCount: 0 };
      lessonAcc.set(lessonId, entry);
    }
    return entry;
  };

  let part1Score = 0;
  for (const q of exam.part1) {
    const selectedLabel = answers.part1[q.questionId] ?? null;
    const correctOption = q.options.find((opt) => opt.isCorrect);
    const isCorrect = Boolean(selectedLabel && correctOption && selectedLabel === correctOption.label);
    const earned = isCorrect ? 0.25 : 0;
    part1Score += earned;

    const bucket = ensureLesson(q.lessonId);
    bucket.maxPoints += 0.25;
    bucket.earnedPoints += earned;
    bucket.totalCount += 1;
    if (isCorrect) bucket.correctCount += 1;
  }

  let part2Score = 0;
  for (const cluster of exam.part2) {
    const clusterAns = answers.part2[cluster.questionId] || {
      a: null,
      b: null,
      c: null,
      d: null,
    };
    let correctInCluster = 0;
    for (const sub of cluster.items) {
      const userBool = clusterAns[sub.key];
      if (userBool !== null && userBool !== undefined && userBool === sub.isTrue) {
        correctInCluster += 1;
      }
    }

    const earnedCluster = PART2_SCORE_BY_CORRECT_COUNT[correctInCluster] ?? 0;
    part2Score += earnedCluster;

    const bucket = ensureLesson(cluster.lessonId);
    bucket.maxPoints += 1.0;
    bucket.earnedPoints += earnedCluster;
    bucket.totalCount += cluster.items.length;
    bucket.correctCount += correctInCluster;
  }

  part1Score = roundScore(part1Score);
  part2Score = roundScore(part2Score);
  const totalScore = roundScore(part1Score + part2Score);

  const lessonBreakdown: LessonMastery[] = Array.from(lessonAcc.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([lessonId, stats]) => {
      const metaLesson = LESSON_MAP[lessonId];
      const accuracyPct =
        stats.maxPoints > 0
          ? Math.round((stats.earnedPoints / stats.maxPoints) * 1000) / 10
          : 0;
      return {
        lessonId,
        lessonTitle: metaLesson?.title ?? `Bài ${lessonId}`,
        earnedPoints: roundScore(stats.earnedPoints),
        maxPoints: roundScore(stats.maxPoints),
        accuracyPct,
        correctCount: stats.correctCount,
        totalCount: stats.totalCount,
      };
    });

  const sortedByWeakness = [...lessonBreakdown].sort((a, b) => a.accuracyPct - b.accuracyPct);
  const weakLessons = sortedByWeakness.filter((l) => l.accuracyPct < 70);
  const weakTopics = weakLessons.map((l) => l.lessonId);

  let feedbackSummary = '';
  if (totalScore >= 9.0 && weakTopics.length === 0) {
    feedbackSummary =
      'Kết quả xuất sắc! Bạn nắm rất vững toàn bộ kiến thức từ AI, Đạo đức mạng đến HTML & CSS cơ bản.';
  } else if (weakTopics.length === 0) {
    const lowest = sortedByWeakness[0];
    feedbackSummary = lowest
      ? `Bài làm tốt (${totalScore}/10 điểm). Bạn có thể ôn kỹ thêm ${lowest.lessonTitle} (${lowest.accuracyPct}%) để đạt điểm tối đa.`
      : `Bài làm tốt (${totalScore}/10 điểm). Tiếp tục duy trì phong độ ôn tập.`;
  } else {
    const topWeakNames = weakLessons
      .slice(0, 3)
      .map((l) => `${LESSON_MAP[l.lessonId]?.code ?? `Bài ${l.lessonId}`} (${l.accuracyPct}%)`)
      .join(', ');
    feedbackSummary = `Cần củng cố kiến thức ở các chủ đề: ${topWeakNames}. Hãy xem lại lời giải chi tiết từng câu sai ở bên dưới trước khi thi lại.`;
  }

  const submittedAt = meta.submittedAt ?? new Date().toISOString();
  const attemptId =
    meta.attemptId ?? `ATT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  return {
    id: attemptId,
    school: meta.school.trim(),
    phone: normalizePhone(meta.phone),
    email: meta.email.trim().toLowerCase(),
    submittedAt,
    durationSpentSeconds: Math.max(0, Math.round(meta.durationSpentSeconds)),
    violations: meta.violations,
    autoSubmittedReason: meta.autoSubmittedReason,
    part1Score,
    part2Score,
    totalScore,
    exam,
    answers,
    lessonBreakdown,
    weakTopics,
    feedbackSummary,
    syncedToDrive: false,
    isSeedData: false,
  };
}
