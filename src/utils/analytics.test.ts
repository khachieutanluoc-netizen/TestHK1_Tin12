import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank';
import { SCHOOLS } from '../data/schools';
import { AttemptRecord } from '../types/exam';
import { computeDashboardStats } from './analytics';
import { createEmptyAnswers, generateExam, gradeExam } from './examEngine';

// Helper to create deterministic synthetic AttemptRecord matching real schema
function makeAttempt(params: {
  id: string;
  school: string;
  phone: string;
  email: string;
  submittedAt: string;
  totalScore: number;
  lessonAccuracies: Record<number, number>;
}): AttemptRecord {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, () => 0.42);
  const base = gradeExam(exam, createEmptyAnswers(exam), {
    attemptId: params.id,
    school: params.school,
    phone: params.phone,
    email: params.email,
    submittedAt: params.submittedAt,
    durationSpentSeconds: 1500,
    violations: 0,
    autoSubmittedReason: null,
  });

  const lessonBreakdown = base.lessonBreakdown.map((lb) => ({
    ...lb,
    accuracyPct: params.lessonAccuracies[lb.lessonId] ?? 80,
  }));

  return {
    ...base,
    totalScore: params.totalScore,
    part1Score: Math.min(6, params.totalScore),
    part2Score: Math.max(0, Math.round((params.totalScore - 6) * 100) / 100),
    lessonBreakdown,
    weakTopics: lessonBreakdown.filter((l) => l.accuracyPct < 70).map((l) => l.lessonId),
  };
}

test('computeDashboardStats ranks students by average score descending across multiple attempts', () => {
  const attempts: AttemptRecord[] = [
    // Student A: 2 attempts -> avg 8.5
    makeAttempt({
      id: 'A1',
      school: SCHOOLS[0],
      phone: '0901111111',
      email: 'a@vl.edu.vn',
      submittedAt: '2026-10-01T08:00:00Z',
      totalScore: 8.0,
      lessonAccuracies: { 1: 100, 9: 50, 10: 90 },
    }),
    makeAttempt({
      id: 'A2',
      school: SCHOOLS[0],
      phone: '0901111111',
      email: 'a@vl.edu.vn',
      submittedAt: '2026-10-02T08:00:00Z',
      totalScore: 9.0,
      lessonAccuracies: { 1: 100, 9: 60, 10: 95 },
    }),
    // Student B: 1 attempt -> avg 9.25 (Rank 1)
    makeAttempt({
      id: 'B1',
      school: SCHOOLS[1],
      phone: '0902222222',
      email: 'b@vl.edu.vn',
      submittedAt: '2026-10-02T09:00:00Z',
      totalScore: 9.25,
      lessonAccuracies: { 1: 95, 9: 90, 10: 92 },
    }),
    // Student C: 1 attempt -> avg 5.5 (Rank 3, weak in Lesson 10)
    makeAttempt({
      id: 'C1',
      school: SCHOOLS[1],
      phone: '0903333333',
      email: 'c@vl.edu.vn',
      submittedAt: '2026-10-02T10:00:00Z',
      totalScore: 5.5,
      lessonAccuracies: { 1: 80, 9: 75, 10: 30 },
    }),
  ];

  // Province-wide
  const allStats = computeDashboardStats(attempts, []);
  assert.equal(allStats.totalAttempts, 4);
  assert.equal(allStats.uniqueStudents, 3);
  assert.deepEqual(
    allStats.rankings.map((r) => [r.rank, r.email, r.avgScore, r.attemptCount]),
    [
      [1, 'b@vl.edu.vn', 9.25, 1],
      [2, 'a@vl.edu.vn', 8.5, 2],
      [3, 'c@vl.edu.vn', 5.5, 1],
    ]
  );

  // School checkbox scope filter (only SCHOOLS[1])
  const schoolStats = computeDashboardStats(attempts, [SCHOOLS[1]]);
  assert.equal(schoolStats.totalAttempts, 2);
  assert.equal(schoolStats.uniqueStudents, 2);
  assert.deepEqual(
    schoolStats.rankings.map((r) => r.email),
    ['b@vl.edu.vn', 'c@vl.edu.vn']
  );

  // Chart click filter by topic (Lesson 9 -> only Student A has avg < 70% in Lesson 9)
  const topicFiltered = computeDashboardStats(attempts, [], 9, 'all', '');
  assert.deepEqual(
    topicFiltered.filteredRankings.map((r) => r.email),
    ['a@vl.edu.vn']
  );

  // Tier filter ('average' 5.0-6.9 -> only Student C)
  const tierFiltered = computeDashboardStats(attempts, [], null, 'average', '');
  assert.deepEqual(
    tierFiltered.filteredRankings.map((r) => r.email),
    ['c@vl.edu.vn']
  );
});
