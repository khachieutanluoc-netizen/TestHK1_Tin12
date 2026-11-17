import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank';
import { AttemptRecord } from '../types/exam';
import { CandidateInfo, createEmptyAnswers, generateExam, gradeExam } from '../utils/examEngine';

const CANDIDATE_STORAGE_KEY = 'vl_tinhoc_hk1_2026_candidate';
const ATTEMPTS_STORAGE_KEY = 'vl_tinhoc_hk1_2026_attempts';
const SEED_INITIALIZED_KEY = 'vl_tinhoc_hk1_2026_seed_v1';

export function loadSavedCandidate(): CandidateInfo | null {
  try {
    const raw = window.localStorage.getItem(CANDIDATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CandidateInfo>;
    if (
      typeof parsed.school === 'string' &&
      typeof parsed.phone === 'string' &&
      typeof parsed.email === 'string'
    ) {
      return {
        school: parsed.school,
        phone: parsed.phone,
        email: parsed.email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCandidate(candidate: CandidateInfo): void {
  try {
    window.localStorage.setItem(CANDIDATE_STORAGE_KEY, JSON.stringify(candidate));
  } catch {
    // Bỏ qua lỗi quota localStorage
  }
}

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

interface SeedSpec {
  id: string;
  school: string;
  phone: string;
  email: string;
  submittedAt: string;
  durationSpentSeconds: number;
  violations: number;
  seed: number;
  baseAccuracy: number;
  weakLessonIds: number[];
}

const SEED_SPECS: SeedSpec[] = [
  {
    id: 'SEED-01',
    school: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm',
    phone: '0913456101',
    email: 'minhanh.nbk@vinhlong.edu.vn',
    submittedAt: '2026-10-12T08:15:00.000Z',
    durationSpentSeconds: 1840,
    violations: 0,
    seed: 101,
    baseAccuracy: 0.94,
    weakLessonIds: [],
  },
  {
    id: 'SEED-02',
    school: 'Trường THPT chuyên Nguyễn Bỉnh Khiêm',
    phone: '0913456101',
    email: 'minhanh.nbk@vinhlong.edu.vn',
    submittedAt: '2026-10-14T14:20:00.000Z',
    durationSpentSeconds: 1620,
    violations: 0,
    seed: 102,
    baseAccuracy: 0.98,
    weakLessonIds: [],
  },
  {
    id: 'SEED-03',
    school: 'Trường THPT Vĩnh Long',
    phone: '0939224102',
    email: 'hoangnam.thptvl@gmail.com',
    submittedAt: '2026-10-13T09:30:00.000Z',
    durationSpentSeconds: 2110,
    violations: 1,
    seed: 103,
    baseAccuracy: 0.85,
    weakLessonIds: [9, 10],
  },
  {
    id: 'SEED-04',
    school: 'Trường THPT Vĩnh Long',
    phone: '0939224102',
    email: 'hoangnam.thptvl@gmail.com',
    submittedAt: '2026-10-15T19:05:00.000Z',
    durationSpentSeconds: 1945,
    violations: 0,
    seed: 104,
    baseAccuracy: 0.9,
    weakLessonIds: [10],
  },
  {
    id: 'SEED-05',
    school: 'Trường THPT Lưu Văn Liệt',
    phone: '0907812103',
    email: 'thao.vy.lvl@gmail.com',
    submittedAt: '2026-10-13T15:40:00.000Z',
    durationSpentSeconds: 2290,
    violations: 0,
    seed: 105,
    baseAccuracy: 0.78,
    weakLessonIds: [6, 9],
  },
  {
    id: 'SEED-06',
    school: 'Trường THPT Chuyên Nguyễn Thiện Thành',
    phone: '0984123104',
    email: 'quocbao.ntt@travinh.edu.vn',
    submittedAt: '2026-10-14T07:50:00.000Z',
    durationSpentSeconds: 1750,
    violations: 0,
    seed: 106,
    baseAccuracy: 0.92,
    weakLessonIds: [8],
  },
  {
    id: 'SEED-07',
    school: 'Trường THPT Trà Ôn',
    phone: '0918665105',
    email: 'ngoclan.traon@gmail.com',
    submittedAt: '2026-10-14T16:12:00.000Z',
    durationSpentSeconds: 2450,
    violations: 2,
    seed: 107,
    baseAccuracy: 0.65,
    weakLessonIds: [6, 9, 10],
  },
  {
    id: 'SEED-08',
    school: 'Trường THPT Bình Minh',
    phone: '0972551106',
    email: 'tuananh.binhminh@gmail.com',
    submittedAt: '2026-10-15T08:45:00.000Z',
    durationSpentSeconds: 2320,
    violations: 1,
    seed: 108,
    baseAccuracy: 0.72,
    weakLessonIds: [8, 9],
  },
  {
    id: 'SEED-09',
    school: 'Trường THPT Phạm Hùng',
    phone: '0909334107',
    email: 'khuongduy.ph@gmail.com',
    submittedAt: '2026-10-15T10:15:00.000Z',
    durationSpentSeconds: 2580,
    violations: 0,
    seed: 109,
    baseAccuracy: 0.56,
    weakLessonIds: [5, 6, 9, 10],
  },
  {
    id: 'SEED-10',
    school: 'Trường THPT Chuyên Bến Tre',
    phone: '0944118108',
    email: 'phuongnhi.cbt@bentre.edu.vn',
    submittedAt: '2026-10-15T13:20:00.000Z',
    durationSpentSeconds: 1690,
    violations: 0,
    seed: 110,
    baseAccuracy: 0.91,
    weakLessonIds: [9],
  },
  {
    id: 'SEED-11',
    school: 'Trường THPT Vĩnh Long',
    phone: '0933772109',
    email: 'anhkhoa12a3@gmail.com',
    submittedAt: '2026-10-16T07:35:00.000Z',
    durationSpentSeconds: 2410,
    violations: 3,
    seed: 111,
    baseAccuracy: 0.61,
    weakLessonIds: [6, 8, 9, 10],
  },
  {
    id: 'SEED-12',
    school: 'Trường THPT Lưu Văn Liệt',
    phone: '0916904110',
    email: 'giabao.lvl@gmail.com',
    submittedAt: '2026-10-16T09:10:00.000Z',
    durationSpentSeconds: 1990,
    violations: 0,
    seed: 112,
    baseAccuracy: 0.83,
    weakLessonIds: [10],
  },
  {
    id: 'SEED-13',
    school: 'Trường THPT Trà Ôn',
    phone: '0918665105',
    email: 'ngoclan.traon@gmail.com',
    submittedAt: '2026-10-16T11:25:00.000Z',
    durationSpentSeconds: 2150,
    violations: 0,
    seed: 113,
    baseAccuracy: 0.76,
    weakLessonIds: [9, 10],
  },
  {
    id: 'SEED-14',
    school: 'Trường THPT Nguyễn Thông',
    phone: '0965443111',
    email: 'thanhtruc.nt@gmail.com',
    submittedAt: '2026-10-16T14:55:00.000Z',
    durationSpentSeconds: 2040,
    violations: 1,
    seed: 114,
    baseAccuracy: 0.8,
    weakLessonIds: [6, 10],
  },
];

let cachedSeedAttempts: AttemptRecord[] | null = null;

export function getSeedAttempts(): AttemptRecord[] {
  if (cachedSeedAttempts) return cachedSeedAttempts;

  cachedSeedAttempts = SEED_SPECS.map((spec) => {
    const rng = createDeterministicRng(spec.seed * 104729);
    const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, rng);
    const answers = createEmptyAnswers(exam);

    for (const q of exam.part1) {
      const isWeakLesson = spec.weakLessonIds.includes(q.lessonId);
      const prob = isWeakLesson ? Math.max(0.28, spec.baseAccuracy - 0.35) : spec.baseAccuracy;
      const shouldBeRight = rng() < prob;
      const chosen = q.options.find((o) => (shouldBeRight ? o.isCorrect : !o.isCorrect));
      answers.part1[q.questionId] = chosen ? chosen.label : 'A';
    }

    for (const cluster of exam.part2) {
      const isWeakLesson = spec.weakLessonIds.includes(cluster.lessonId);
      const prob = isWeakLesson ? Math.max(0.4, spec.baseAccuracy - 0.25) : spec.baseAccuracy;
      for (const item of cluster.items) {
        const shouldBeRight = rng() < prob;
        answers.part2[cluster.questionId][item.key] = shouldBeRight ? item.isTrue : !item.isTrue;
      }
    }

    const graded = gradeExam(exam, answers, {
      attemptId: spec.id,
      school: spec.school,
      phone: spec.phone,
      email: spec.email,
      submittedAt: spec.submittedAt,
      durationSpentSeconds: spec.durationSpentSeconds,
      violations: spec.violations,
      autoSubmittedReason: null,
    });

    return {
      ...graded,
      syncedToDrive: true,
      isSeedData: true,
    };
  });

  return cachedSeedAttempts;
}

export function loadAttempts(): AttemptRecord[] {
  try {
    const raw = window.localStorage.getItem(ATTEMPTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AttemptRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    const alreadySeeded = window.localStorage.getItem(SEED_INITIALIZED_KEY);
    if (!alreadySeeded) {
      const seeds = getSeedAttempts();
      saveAttempts(seeds);
      window.localStorage.setItem(SEED_INITIALIZED_KEY, '1');
      return seeds;
    }
    return [];
  } catch {
    return getSeedAttempts();
  }
}

export function saveAttempts(attempts: AttemptRecord[]): void {
  try {
    window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  } catch {
    // Bỏ qua nếu đầy localStorage
  }
}

export function mergeAttempts(
  local: readonly AttemptRecord[],
  remote: readonly AttemptRecord[]
): AttemptRecord[] {
  const byId = new Map<string, AttemptRecord>();
  for (const item of local) {
    byId.set(item.id, item);
  }
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, { ...item, syncedToDrive: true });
    } else {
      byId.set(item.id, {
        ...existing,
        syncedToDrive: existing.syncedToDrive || item.syncedToDrive,
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}
