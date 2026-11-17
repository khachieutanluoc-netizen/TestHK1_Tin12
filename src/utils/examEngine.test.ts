import test from 'node:test';
import assert from 'node:assert/strict';
import { PART1_MATRIX, PART2_TARGET_LEVELS } from '../data/matrix';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank';
import { SCHOOLS } from '../data/schools';
import { CognitiveLevel, LessonId } from '../types/exam';
import {
  createEmptyAnswers,
  generateExam,
  gradeExam,
  validateCandidateForm,
} from './examEngine';

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('validateCandidateForm accepts valid school, Vietnamese phone, and email', () => {
  const res = validateCandidateForm(
    {
      school: SCHOOLS[0],
      phone: '0912 345 678',
      email: 'HocSinh@gmail.com ',
    },
    SCHOOLS
  );
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, {});
  assert.equal(res.normalized.phone, '0912345678');
  assert.equal(res.normalized.email, 'hocsinh@gmail.com');
});

test('validateCandidateForm rejects invalid school, phone, and email', () => {
  const res = validateCandidateForm(
    {
      school: 'Trường không tồn tại',
      phone: '12345',
      email: 'sai-dinh-dang',
    },
    SCHOOLS
  );
  assert.equal(res.valid, false);
  assert.ok(res.errors.school);
  assert.ok(res.errors.phone);
  assert.ok(res.errors.email);
});

test('generateExam strictly follows official Part I & Part II matrix across multiple runs', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const rng = createSeededRng(seed * 7919);
    const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, rng);

    assert.equal(exam.part1.length, 24);
    assert.equal(exam.part2.length, 4);
    assert.equal(exam.durationSeconds, 2700);

    // Check uniqueness
    const d1Ids = new Set(exam.part1.map((q) => q.questionId));
    const d2Ids = new Set(exam.part2.map((q) => q.questionId));
    assert.equal(d1Ids.size, 24);
    assert.equal(d2Ids.size, 4);

    // Check Part I exact slot matrix per lesson and level
    for (const slot of PART1_MATRIX) {
      for (const level of ['Biết', 'Hiểu', 'VD', 'VDC'] as CognitiveLevel[]) {
        const matched = exam.part1.filter(
          (q) => q.lessonId === slot.lessonId && q.level === level
        );
        assert.equal(
          matched.length,
          slot.counts[level],
          `Seed ${seed}: Lesson ${slot.lessonId} level ${level} mismatch`
        );
      }
    }

    // Check each D1 item has 4 labeled options and exactly 1 correct option
    for (const q of exam.part1) {
      assert.deepEqual(
        q.options.map((o) => o.label),
        ['A', 'B', 'C', 'D']
      );
      assert.equal(q.options.filter((o) => o.isCorrect).length, 1);
    }

    // Check Part II: 1 A&D + 3 F and exact 6B-4H-4VD-2VDC distribution
    const adClusters = exam.part2.filter((q) => q.lessonId <= 3);
    const fClusters = exam.part2.filter((q) => q.lessonId >= 4);
    assert.equal(adClusters.length, 1);
    assert.equal(fClusters.length, 3);

    const p2Levels: Record<CognitiveLevel, number> = { Biết: 0, Hiểu: 0, VD: 0, VDC: 0 };
    for (const cluster of exam.part2) {
      assert.equal(cluster.items.length, 4);
      for (const item of cluster.items) {
        p2Levels[item.level] += 1;
      }
    }
    assert.deepEqual(p2Levels, PART2_TARGET_LEVELS);
  }
});

test('gradeExam calculates exact MOET Part I + Part II partial scores and detects weak topics', () => {
  const exam = generateExam(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, createSeededRng(42));

  // Case 1: Perfect 10.0 score
  const perfectAnswers = createEmptyAnswers(exam);
  for (const q of exam.part1) {
    const correct = q.options.find((o) => o.isCorrect)!;
    perfectAnswers.part1[q.questionId] = correct.label;
  }
  for (const cluster of exam.part2) {
    for (const item of cluster.items) {
      perfectAnswers.part2[cluster.questionId][item.key] = item.isTrue;
    }
  }

  const perfectResult = gradeExam(exam, perfectAnswers, {
    school: SCHOOLS[0],
    phone: '0912345678',
    email: 'hs@vinhlong.edu.vn',
    durationSpentSeconds: 1200,
    violations: 0,
    autoSubmittedReason: null,
  });

  assert.equal(perfectResult.part1Score, 6);
  assert.equal(perfectResult.part2Score, 4);
  assert.equal(perfectResult.totalScore, 10);
  assert.deepEqual(perfectResult.weakTopics, []);

  // Case 2: Part II partial scoring (0, 1, 2, 3 correct across 4 clusters => 0 + 0.1 + 0.25 + 0.5 = 0.85)
  // Plus intentionally miss all Lesson 1 questions to verify weak topic detection
  const partialAnswers = createEmptyAnswers(exam);
  for (const q of exam.part1) {
    const pickCorrect = q.lessonId !== (1 as LessonId);
    const chosen = q.options.find((o) => (pickCorrect ? o.isCorrect : !o.isCorrect))!;
    partialAnswers.part1[q.questionId] = chosen.label;
  }

  const targetCorrectCounts = [0, 1, 2, 3];
  exam.part2.forEach((cluster, idx) => {
    const wantCorrect = targetCorrectCounts[idx];
    cluster.items.forEach((item, subIdx) => {
      partialAnswers.part2[cluster.questionId][item.key] =
        subIdx < wantCorrect ? item.isTrue : !item.isTrue;
    });
  });

  const partialResult = gradeExam(exam, partialAnswers, {
    school: SCHOOLS[1],
    phone: '0987654321',
    email: 'hs2@vinhlong.edu.vn',
    durationSpentSeconds: 900,
    violations: 6,
    autoSubmittedReason: 'violations',
  });

  assert.equal(partialResult.part2Score, 0.85);
  assert.ok(partialResult.part1Score < 6);
  assert.equal(partialResult.totalScore, Math.round((partialResult.part1Score + 0.85) * 100) / 100);
  assert.ok(partialResult.weakTopics.includes(1));
  assert.equal(partialResult.autoSubmittedReason, 'violations');
});
