import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank';
import { SCHOOLS } from '../data/schools';
import { mergeAttempts } from '../services/storage';
import { AttemptRecord } from '../types/exam';
import { computeDashboardStats } from './analytics';
import { createEmptyAnswers, generateExam, gradeExam } from './examEngine';

// Helper to create deterministic synthetic AttemptRecord matching real schema
function makeAttempt(params: {
  id: string;
  sbd: string;
  school: string;
  phone?: string;
  email?: string;
  submittedAt: string;
  totalScore: number;
  lessonAccuracies: Record<number, number>;
}): AttemptRecord {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, () => 0.42);
  const base = gradeExam(exam, createEmptyAnswers(exam), {
    attemptId: params.id,
    sbd: params.sbd,
    school: params.school,
    phone: params.phone ?? '',
    email: params.email ?? '',
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

test('computeDashboardStats groups by 8-digit SBD and ranks students by average score descending', () => {
  const attempts: AttemptRecord[] = [
    // Student A (SBD 11111111): 2 attempts -> avg 8.5 (second attempt without optional email/phone)
    makeAttempt({
      id: 'A1',
      sbd: '11111111',
      school: SCHOOLS[0],
      phone: '0901111111',
      email: 'a@vl.edu.vn',
      submittedAt: '2026-10-01T08:00:00Z',
      totalScore: 8.0,
      lessonAccuracies: { 1: 100, 9: 50, 10: 90 },
    }),
    makeAttempt({
      id: 'A2',
      sbd: '11111111',
      school: SCHOOLS[0],
      phone: '',
      email: '',
      submittedAt: '2026-10-02T08:00:00Z',
      totalScore: 9.0,
      lessonAccuracies: { 1: 100, 9: 60, 10: 95 },
    }),
    // Student B (SBD 22222222): 1 attempt -> avg 9.25 (Rank 1)
    makeAttempt({
      id: 'B1',
      sbd: '22222222',
      school: SCHOOLS[1],
      submittedAt: '2026-10-02T09:00:00Z',
      totalScore: 9.25,
      lessonAccuracies: { 1: 95, 9: 90, 10: 92 },
    }),
    // Student C (SBD 33333333): 1 attempt -> avg 5.5 (Rank 3, weak in Lesson 10)
    makeAttempt({
      id: 'C1',
      sbd: '33333333',
      school: SCHOOLS[1],
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
    allStats.rankings.map((r) => [r.rank, r.sbd, r.avgScore, r.attemptCount]),
    [
      [1, '22222222', 9.25, 1],
      [2, '11111111', 8.5, 2],
      [3, '33333333', 5.5, 1],
    ]
  );

  // School checkbox scope filter (only SCHOOLS[1])
  const schoolStats = computeDashboardStats(attempts, [SCHOOLS[1]]);
  assert.equal(schoolStats.totalAttempts, 2);
  assert.equal(schoolStats.uniqueStudents, 2);
  assert.deepEqual(
    schoolStats.rankings.map((r) => r.sbd),
    ['22222222', '33333333']
  );

  // Search by SBD filter
  const sbdFiltered = computeDashboardStats(attempts, [], null, 'all', '11111111');
  assert.deepEqual(
    sbdFiltered.filteredRankings.map((r) => r.sbd),
    ['11111111']
  );

  // Chart click filter by topic (Lesson 9 -> only Student A has avg < 70% in Lesson 9)
  const topicFiltered = computeDashboardStats(attempts, [], 9, 'all', '');
  assert.deepEqual(
    topicFiltered.filteredRankings.map((r) => r.sbd),
    ['11111111']
  );

  // Tier filter ('average' 5.0-6.9 -> only Student C)
  const tierFiltered = computeDashboardStats(attempts, [], null, 'average', '');
  assert.deepEqual(
    tierFiltered.filteredRankings.map((r) => r.sbd),
    ['33333333']
  );

  // School summaries verification
  assert.equal(allStats.schoolSummaries.length, 2);
  const school0Summary = allStats.schoolSummaries.find((s) => s.school === SCHOOLS[0]);
  const school1Summary = allStats.schoolSummaries.find((s) => s.school === SCHOOLS[1]);
  assert.ok(school0Summary);
  assert.ok(school1Summary);
  assert.equal(school0Summary.studentCount, 1);
  assert.equal(school0Summary.attemptCount, 2);
  assert.equal(school0Summary.avgScore, 8.5);
  assert.equal(school1Summary.studentCount, 2);
  assert.equal(school1Summary.attemptCount, 2);
  assert.equal(school1Summary.avgScore, 7.38);
});

test('mergeAttempts reconciles cross-device attempts, preserves syncedToDrive flags, and sorts newest first', () => {
  const localAttempt = makeAttempt({
    id: 'DEV1-01',
    sbd: '44445555',
    school: SCHOOLS[0],
    submittedAt: '2026-10-20T08:00:00Z',
    totalScore: 8.25,
    lessonAccuracies: { 1: 100 },
  });
  localAttempt.syncedToDrive = false;
  localAttempt.isSeedData = false;

  const remoteDuplicateSynced: AttemptRecord = {
    ...localAttempt,
    syncedToDrive: true,
    isSeedData: false,
  };

  const remoteFromDevice2 = makeAttempt({
    id: 'DEV2-01',
    sbd: '66667777',
    school: SCHOOLS[2],
    submittedAt: '2026-10-20T09:30:00Z',
    totalScore: 9.5,
    lessonAccuracies: { 1: 95 },
  });
  remoteFromDevice2.syncedToDrive = false;
  remoteFromDevice2.isSeedData = false;

  const merged = mergeAttempts([localAttempt], [remoteDuplicateSynced, remoteFromDevice2]);
  assert.equal(merged.length, 2);
  // Newest first (DEV2-01 at 09:30 before DEV1-01 at 08:00)
  assert.equal(merged[0].id, 'DEV2-01');
  assert.equal(merged[0].syncedToDrive, false);
  assert.equal(merged[1].id, 'DEV1-01');
  // syncedToDrive upgraded from remote
  assert.equal(merged[1].syncedToDrive, true);
});
