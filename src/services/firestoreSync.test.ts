import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank.ts';
import { createEmptyAnswers, generateExam, gradeExam } from '../utils/examEngine.ts';
import { normalizeAttemptForFirestore } from './attemptNormalizer.ts';
import { pushAttemptsToFirestoreDetailed } from './firestoreSync.ts';
import {
  computeCloudSyncSummary,
  findAttemptsMissingOnRemote,
  haveAttemptsChanged,
} from './syncReconciler.ts';

function makeSampleAttempt(id: string, sbd: string, totalScore = 5.0) {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
  const answers = createEmptyAnswers(exam);
  const graded = gradeExam(exam, answers, {
    attemptId: id,
    sbd,
    school: 'Trường THPT Vĩnh Long',
    phone: '',
    email: '',
    durationSpentSeconds: 90,
    violations: 0,
    autoSubmittedReason: null,
  });
  return { ...graded, totalScore };
}

test('normalizeAttemptForFirestore produces exact 19 blueprint fields, preserves 8-digit SBD, and masks optional PII', () => {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
  const answers = createEmptyAnswers(exam);
  const graded = gradeExam(exam, answers, {
    sbd: '26481930',
    school: 'Trường THPT Vĩnh Long',
    phone: '0912345678',
    email: 'HocSinh@VinhLong.EDU.VN',
    durationSpentSeconds: 120.4,
    violations: 2,
    autoSubmittedReason: null,
  });

  const payload = normalizeAttemptForFirestore({
    ...graded,
    isSeedData: true,
    syncedToDrive: undefined,
  });

  const expectedKeys = [
    'id',
    'sbd',
    'school',
    'phone',
    'email',
    'submittedAt',
    'durationSpentSeconds',
    'violations',
    'autoSubmittedReason',
    'part1Score',
    'part2Score',
    'totalScore',
    'exam',
    'answers',
    'lessonBreakdown',
    'weakTopics',
    'feedbackSummary',
    'syncedToDrive',
    'isSeedData',
  ].sort();

  assert.deepEqual(Object.keys(payload).sort(), expectedKeys);
  assert.equal(payload.sbd, '26481930');
  assert.equal(payload.isSeedData, false);
  assert.equal(payload.syncedToDrive, false);
  assert.equal(payload.phone, '091***5678');
  assert.equal(payload.email, 'ho***@vinhlong.edu.vn');
  assert.equal(payload.durationSpentSeconds, 120);
  assert.equal(payload.autoSubmittedReason, null);
  assert.match(payload.id, /^[a-zA-Z0-9_\-]+$/);
});

test('normalizeAttemptForFirestore supports empty phone and email for strict privacy', () => {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
  const answers = createEmptyAnswers(exam);
  const graded = gradeExam(exam, answers, {
    sbd: '88123456',
    school: 'Trường THPT Vĩnh Long',
    phone: '',
    email: '',
    durationSpentSeconds: 60,
    violations: 0,
    autoSubmittedReason: null,
  });

  const payload = normalizeAttemptForFirestore(graded);
  assert.equal(payload.sbd, '88123456');
  assert.equal(payload.phone, '');
  assert.equal(payload.email, '');
});

test('pushAttemptsToFirestoreDetailed continues pushing valid attempts when one attempt fails', async () => {
  const a1 = makeSampleAttempt('ATT-OK-1', '11112222');
  const a2 = makeSampleAttempt('ATT-FAIL-2', '33334444');
  const a3 = makeSampleAttempt('ATT-EXISTS-3', '55556666');
  const a4 = makeSampleAttempt('ATT-OK-4', '77778888');

  const result = await pushAttemptsToFirestoreDetailed([a1, a2, a3, a4], async (att) => {
    if (att.id === 'ATT-FAIL-2') throw new Error('Simulated transient failure');
    if (att.id === 'ATT-EXISTS-3') return false;
    return true;
  });

  assert.deepEqual(result.pushedIds, ['ATT-OK-1', 'ATT-OK-4']);
  assert.deepEqual(result.alreadyRemoteIds, ['ATT-EXISTS-3']);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].id, 'ATT-FAIL-2');
});

test('syncReconciler accurately detects changes, missing remote attempts, and cloud sync summary', () => {
  const a1 = makeSampleAttempt('ATT-1', '12345678', 7.5);
  const a2 = makeSampleAttempt('ATT-2', '87654321', 8.25);

  assert.equal(haveAttemptsChanged([a1, a2], [a1, a2]), false);
  assert.equal(haveAttemptsChanged([a1, a2], [a1, { ...a2, syncedToDrive: true }]), true);
  assert.equal(haveAttemptsChanged([a1], [a1, a2]), true);

  const confirmed = new Set<string>(['ATT-1']);
  const missing = findAttemptsMissingOnRemote([a1, a2], confirmed);
  assert.deepEqual(
    missing.map((m) => m.id),
    ['ATT-2']
  );

  const summary = computeCloudSyncSummary([a1, a2], confirmed);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.confirmedCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.deepEqual(summary.pendingIds, ['ATT-2']);
});
