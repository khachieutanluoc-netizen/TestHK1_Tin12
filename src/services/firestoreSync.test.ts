import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank.ts';
import { createEmptyAnswers, generateExam, gradeExam } from '../utils/examEngine.ts';
import { normalizeAttemptForFirestore } from './attemptNormalizer.ts';

test('normalizeAttemptForFirestore produces exact 18 blueprint fields without undefined values', () => {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
  const answers = createEmptyAnswers(exam);
  const graded = gradeExam(exam, answers, {
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
  assert.equal(payload.isSeedData, false);
  assert.equal(payload.syncedToDrive, false);
  assert.equal(payload.email, 'hocsinh@vinhlong.edu.vn');
  assert.equal(payload.durationSpentSeconds, 120);
  assert.equal(payload.autoSubmittedReason, null);
  assert.match(payload.id, /^[a-zA-Z0-9_\-]+$/);
});
