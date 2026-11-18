import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank.ts';
import { createEmptyAnswers, generateExam, gradeExam } from '../utils/examEngine.ts';
import { normalizeAttemptForFirestore } from './attemptNormalizer.ts';

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
