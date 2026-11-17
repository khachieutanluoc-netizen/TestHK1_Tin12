import { LESSON_MAP, LESSONS } from '../data/matrix';
import {
  AttemptRecord,
  LessonId,
  StudentRankingRow,
} from '../types/exam';

export interface TopicAggregateStat {
  lessonId: LessonId;
  code: string;
  shortTitle: string;
  title: string;
  topicGroup: 'A&D' | 'F';
  attemptSampleCount: number;
  avgAccuracyPct: number;
  weakOccurrenceCount: number;
  weakRatePct: number;
}

export interface ScoreTierStat {
  id: 'excellent' | 'good' | 'average' | 'weak';
  label: string;
  rangeLabel: string;
  count: number;
  pct: number;
}

export interface SchoolSummaryStat {
  school: string;
  attemptCount: number;
  studentCount: number;
  avgScore: number;
  weakestLessonTitle: string;
}

export interface DashboardStatsResult {
  totalAttempts: number;
  uniqueStudents: number;
  overallAvgScore: number;
  highestScore: number;
  weakestTopic: TopicAggregateStat | null;
  topicStats: TopicAggregateStat[];
  scoreTiers: ScoreTierStat[];
  schoolSummaries: SchoolSummaryStat[];
  rankings: StudentRankingRow[];
  filteredRankings: StudentRankingRow[];
}

export type ScoreTierFilter = 'all' | 'excellent' | 'good' | 'average' | 'weak';

export function getScoreTierId(score: number): Exclude<ScoreTierFilter, 'all'> {
  if (score >= 8.5) return 'excellent';
  if (score >= 7.0) return 'good';
  if (score >= 5.0) return 'average';
  return 'weak';
}

export function getStudentKey(attempt: Pick<AttemptRecord, 'school' | 'phone' | 'email'>): string {
  return `${attempt.school.trim()}||${attempt.phone.trim()}||${attempt.email.trim().toLowerCase()}`;
}

export function computeDashboardStats(
  allAttempts: readonly AttemptRecord[],
  selectedSchools: readonly string[],
  topicFilter: LessonId | null = null,
  tierFilter: ScoreTierFilter = 'all',
  searchQuery: string = ''
): DashboardStatsResult {
  const schoolSet = new Set(selectedSchools);
  const scopedAttempts =
    selectedSchools.length === 0
      ? [...allAttempts]
      : allAttempts.filter((a) => schoolSet.has(a.school));

  const totalAttempts = scopedAttempts.length;
  const overallAvgScore =
    totalAttempts > 0
      ? Math.round(
          (scopedAttempts.reduce((sum, a) => sum + a.totalScore, 0) / totalAttempts) * 100
        ) / 100
      : 0;
  const highestScore =
    totalAttempts > 0
      ? Math.max(...scopedAttempts.map((a) => a.totalScore))
      : 0;

  // Topic stats across scoped attempts
  const topicBuckets = new Map<
    LessonId,
    { sumAccuracy: number; count: number; weakCount: number }
  >();
  for (const lesson of LESSONS) {
    topicBuckets.set(lesson.id, { sumAccuracy: 0, count: 0, weakCount: 0 });
  }

  for (const att of scopedAttempts) {
    for (const lb of att.lessonBreakdown) {
      const bucket = topicBuckets.get(lb.lessonId);
      if (!bucket) continue;
      bucket.sumAccuracy += lb.accuracyPct;
      bucket.count += 1;
      if (lb.accuracyPct < 70) {
        bucket.weakCount += 1;
      }
    }
  }

  const topicStats: TopicAggregateStat[] = LESSONS.map((lesson) => {
    const b = topicBuckets.get(lesson.id)!;
    const avgAccuracyPct = b.count > 0 ? Math.round((b.sumAccuracy / b.count) * 10) / 10 : 0;
    const weakRatePct = b.count > 0 ? Math.round((b.weakCount / b.count) * 1000) / 10 : 0;
    return {
      lessonId: lesson.id,
      code: lesson.code,
      shortTitle: lesson.shortTitle,
      title: lesson.title,
      topicGroup: lesson.topicGroup,
      attemptSampleCount: b.count,
      avgAccuracyPct,
      weakOccurrenceCount: b.weakCount,
      weakRatePct,
    };
  });

  const populatedTopics = topicStats.filter((t) => t.attemptSampleCount > 0);
  const weakestTopic =
    populatedTopics.length > 0
      ? [...populatedTopics].sort((a, b) => a.avgAccuracyPct - b.avgAccuracyPct)[0]
      : null;

  // Group attempts by unique student (school + phone + email)
  const studentMap = new Map<string, AttemptRecord[]>();
  for (const att of scopedAttempts) {
    const key = getStudentKey(att);
    const list = studentMap.get(key) ?? [];
    list.push(att);
    studentMap.set(key, list);
  }

  const rawRows: Array<Omit<StudentRankingRow, 'rank'>> = [];

  for (const [studentKey, attempts] of studentMap.entries()) {
    const sortedAttempts = [...attempts].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    const latest = sortedAttempts[0];
    const avgScore =
      Math.round(
        (attempts.reduce((sum, a) => sum + a.totalScore, 0) / attempts.length) * 100
      ) / 100;
    const bestScore = Math.max(...attempts.map((a) => a.totalScore));

    // Tính chủ đề yếu nhất trung bình qua tất cả các lần thi của thí sinh
    const perLessonAvg = new Map<LessonId, { sum: number; count: number }>();
    for (const att of attempts) {
      for (const lb of att.lessonBreakdown) {
        const cur = perLessonAvg.get(lb.lessonId) ?? { sum: 0, count: 0 };
        cur.sum += lb.accuracyPct;
        cur.count += 1;
        perLessonAvg.set(lb.lessonId, cur);
      }
    }

    let weakestLessonId: LessonId | null = null;
    let lowestPct = Infinity;
    for (const [lid, val] of perLessonAvg.entries()) {
      const pct = val.sum / val.count;
      if (pct < lowestPct) {
        lowestPct = pct;
        weakestLessonId = lid;
      }
    }

    const weakestLessonTitle =
      weakestLessonId && lowestPct < 85
        ? `${LESSON_MAP[weakestLessonId]?.code ?? `Bài ${weakestLessonId}`} (${Math.round(lowestPct)}%)`
        : weakestLessonId
          ? `Vững (${LESSON_MAP[weakestLessonId]?.code}: ${Math.round(lowestPct)}%)`
          : 'Chưa có dữ liệu';

    rawRows.push({
      studentKey,
      phone: latest.phone,
      email: latest.email,
      school: latest.school,
      attemptCount: attempts.length,
      avgScore,
      bestScore,
      latestScore: latest.totalScore,
      weakestLessonId: weakestLessonId && lowestPct < 85 ? weakestLessonId : null,
      weakestLessonTitle,
      lastAttemptAt: latest.submittedAt,
      attempts: sortedAttempts,
    });
  }

  // Sắp xếp thứ hạng theo Điểm bình quân giảm dần, sau đó Điểm cao nhất, sau đó Số lượt làm bài
  rawRows.sort((a, b) => {
    if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    if (b.attemptCount !== a.attemptCount) return b.attemptCount - a.attemptCount;
    return a.email.localeCompare(b.email);
  });

  const rankings: StudentRankingRow[] = rawRows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  // Score tier distribution across ranked students (by their avgScore)
  const tierCounts = {
    excellent: 0,
    good: 0,
    average: 0,
    weak: 0,
  };
  for (const row of rankings) {
    tierCounts[getScoreTierId(row.avgScore)] += 1;
  }

  const totalStudents = rankings.length;
  const toPct = (c: number) => (totalStudents > 0 ? Math.round((c / totalStudents) * 1000) / 10 : 0);

  const scoreTiers: ScoreTierStat[] = [
    {
      id: 'excellent',
      label: 'Giỏi / Xuất sắc',
      rangeLabel: '8.5 – 10.0 điểm',
      count: tierCounts.excellent,
      pct: toPct(tierCounts.excellent),
    },
    {
      id: 'good',
      label: 'Khá',
      rangeLabel: '7.0 – 8.4 điểm',
      count: tierCounts.good,
      pct: toPct(tierCounts.good),
    },
    {
      id: 'average',
      label: 'Trung bình',
      rangeLabel: '5.0 – 6.9 điểm',
      count: tierCounts.average,
      pct: toPct(tierCounts.average),
    },
    {
      id: 'weak',
      label: 'Cần củng cố',
      rangeLabel: '< 5.0 điểm',
      count: tierCounts.weak,
      pct: toPct(tierCounts.weak),
    },
  ];

  // Per-school summary
  const schoolMap = new Map<string, AttemptRecord[]>();
  for (const att of scopedAttempts) {
    const arr = schoolMap.get(att.school) ?? [];
    arr.push(att);
    schoolMap.set(att.school, arr);
  }
  const schoolSummaries: SchoolSummaryStat[] = Array.from(schoolMap.entries())
    .map(([school, atts]) => {
      const students = new Set(atts.map((a) => getStudentKey(a))).size;
      const avg =
        Math.round((atts.reduce((s, a) => s + a.totalScore, 0) / atts.length) * 100) / 100;
      const lessonAgg = new Map<LessonId, { sum: number; count: number }>();
      for (const a of atts) {
        for (const lb of a.lessonBreakdown) {
          const cur = lessonAgg.get(lb.lessonId) ?? { sum: 0, count: 0 };
          cur.sum += lb.accuracyPct;
          cur.count += 1;
          lessonAgg.set(lb.lessonId, cur);
        }
      }
      let weakId: LessonId | null = null;
      let minPct = Infinity;
      for (const [lid, val] of lessonAgg.entries()) {
        const pct = val.sum / val.count;
        if (pct < minPct) {
          minPct = pct;
          weakId = lid;
        }
      }
      return {
        school,
        attemptCount: atts.length,
        studentCount: students,
        avgScore: avg,
        weakestLessonTitle: weakId
          ? `${LESSON_MAP[weakId]?.code}: ${Math.round(minPct)}%`
          : '—',
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  // Interactive chart + search filtering for listed students
  const qNorm = searchQuery.trim().toLowerCase();
  const filteredRankings = rankings.filter((row) => {
    if (tierFilter !== 'all' && getScoreTierId(row.avgScore) !== tierFilter) {
      return false;
    }
    if (topicFilter !== null) {
      // Lọc học sinh còn hạn chế ở chủ đề được click trên biểu đồ (điểm TB chủ đề đó < 75% hoặc yếu nhất là chủ đề đó)
      const topicScores: number[] = [];
      for (const att of row.attempts) {
        const found = att.lessonBreakdown.find((lb) => lb.lessonId === topicFilter);
        if (found) topicScores.push(found.accuracyPct);
      }
      if (topicScores.length === 0) return false;
      const topicAvg = topicScores.reduce((s, v) => s + v, 0) / topicScores.length;
      const isWeakInTopic = topicAvg < 70 || row.weakestLessonId === topicFilter;
      if (!isWeakInTopic) return false;
    }
    if (qNorm) {
      const hay = `${row.school} ${row.phone} ${row.email} ${row.weakestLessonTitle}`.toLowerCase();
      if (!hay.includes(qNorm)) return false;
    }
    return true;
  });

  return {
    totalAttempts,
    uniqueStudents: rankings.length,
    overallAvgScore,
    highestScore,
    weakestTopic,
    topicStats,
    scoreTiers,
    schoolSummaries,
    rankings,
    filteredRankings,
  };
}
