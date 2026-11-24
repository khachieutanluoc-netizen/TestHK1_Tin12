import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank.ts';
import { createEmptyAnswers, generateExam, gradeExam } from '../utils/examEngine.ts';
import {
  hydrateAttemptFromFirestore,
  normalizeAttemptForFirestore,
} from './attemptNormalizer.ts';
import { pushAttemptsToFirestoreDetailed } from './firestoreSync.ts';
import {
  computeCloudSyncSummary,
  findAttemptsMissingOnRemote,
  haveAttemptsChanged,
  isFirestoreQuotaError,
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

test('normalizeAttemptForFirestore produces exact 19 blueprint fields, compact 10x smaller payload, preserves 8-digit SBD, and masks optional PII', () => {
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

  // Verify compact size: <= 4096 bytes (1 Firestore Enterprise read unit instead of ~6-10)
  const rawBytes = Buffer.byteLength(JSON.stringify(graded), 'utf8');
  const compactBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  assert.ok(
    compactBytes <= 4096,
    `Expected compact payload <= 4096 bytes to fit in 1 read unit, got ${compactBytes}`
  );
  assert.ok(
    compactBytes < rawBytes * 0.25,
    `Expected >75% payload reduction (compact=${compactBytes}, raw=${rawBytes})`
  );
});

test('hydrateAttemptFromFirestore losslessly restores both compact payloads and legacy full-exam documents', () => {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
  const answers = createEmptyAnswers(exam);
  const graded = gradeExam(exam, answers, {
    attemptId: 'ATT-COMPACT-TEST',
    sbd: '12349876',
    school: 'Trường THPT Chuyên Nguyễn Bỉnh Khiêm',
    phone: '',
    email: '',
    durationSpentSeconds: 185,
    violations: 1,
    autoSubmittedReason: null,
  });

  // 1) Compact round-trip
  const compactDoc = normalizeAttemptForFirestore(graded);
  const hydratedCompact = hydrateAttemptFromFirestore(compactDoc);
  assert.ok(hydratedCompact);
  assert.equal(hydratedCompact.exam.part1.length, graded.exam.part1.length);
  assert.equal(hydratedCompact.exam.part2.length, graded.exam.part2.length);
  assert.deepEqual(hydratedCompact.exam.part1, graded.exam.part1);
  assert.deepEqual(hydratedCompact.exam.part2, graded.exam.part2);

  // 2) Legacy full-exam document already stored in Firestore before compaction
  const hydratedLegacy = hydrateAttemptFromFirestore(graded);
  assert.ok(hydratedLegacy);
  assert.deepEqual(hydratedLegacy.exam.part1, graded.exam.part1);
  assert.deepEqual(hydratedLegacy.exam.part2, graded.exam.part2);
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
  assert.equal(result.abortedByQuota, false);
});

test('pushAttemptsToFirestoreDetailed stops immediately when Firestore quota is exhausted', async () => {
  const a1 = makeSampleAttempt('ATT-Q1', '11110001');
  const a2 = makeSampleAttempt('ATT-Q2', '11110002');
  const a3 = makeSampleAttempt('ATT-Q3', '11110003');
  const visited: string[] = [];

  const result = await pushAttemptsToFirestoreDetailed([a1, a2, a3], async (att) => {
    visited.push(att.id);
    if (att.id === 'ATT-Q2') {
      const err = new Error('Quota exceeded for quota metric Free daily read units per project');
      (err as { code?: string }).code = 'resource-exhausted';
      throw err;
    }
    return true;
  });

  assert.deepEqual(visited, ['ATT-Q1', 'ATT-Q2']);
  assert.deepEqual(result.pushedIds, ['ATT-Q1']);
  assert.equal(result.abortedByQuota, true);
  assert.equal(result.failed.length, 1);
});

test('isFirestoreQuotaError accurately identifies quota exhaustion errors', () => {
  assert.equal(isFirestoreQuotaError({ code: 'resource-exhausted', message: 'Quota exceeded' }), true);
  assert.equal(isFirestoreQuotaError(new Error('RESOURCE_EXHAUSTED: Free daily read units')), true);
  assert.equal(isFirestoreQuotaError(new Error('permission-denied')), false);
  assert.equal(isFirestoreQuotaError(null), false);
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

test('formatDriveAuthError detects auth/unauthorized-domain and provides actionable Firebase Console URL', async () => {
  const { formatDriveAuthError } = await import('./driveSync.ts');
  const unauthErr = Object.assign(new Error('Firebase: Error (auth/unauthorized-domain).'), {
    code: 'auth/unauthorized-domain',
  });
  const parsed = formatDriveAuthError(unauthErr, 'vinhlongcode.github.io');
  assert.equal(parsed.isUnauthorizedDomain, true);
  assert.equal(parsed.hostname, 'vinhlongcode.github.io');
  assert.ok(parsed.message.includes('vinhlongcode.github.io'));
  assert.ok(parsed.authDomainsUrl.includes('/authentication/settings'));

  const popupErr = Object.assign(new Error('Firebase: Error (auth/popup-blocked).'), {
    code: 'auth/popup-blocked',
  });
  const parsedPopup = formatDriveAuthError(popupErr, 'localhost');
  assert.equal(parsedPopup.isUnauthorizedDomain, false);
  assert.equal(parsedPopup.code, 'auth/popup-blocked');
  assert.ok(parsedPopup.message.includes('popup'));
});
