import assert from 'node:assert/strict';
import test from 'node:test';
import { LESSONS } from '../data/matrix';
import { ALL_D1_QUESTIONS, ALL_D2_QUESTIONS } from '../data/questionBank';
import {
  computeLessonPracticeSummary,
  evaluatePracticeQuestion,
  getLessonQuestionCounts,
  getQuestionsByLesson,
} from './lessonPractice';

test('getLessonQuestionCounts accounts for all 10 lessons matching the question bank', () => {
  const counts = getLessonQuestionCounts(ALL_D1_QUESTIONS, ALL_D2_QUESTIONS);
  assert.equal(counts.length, LESSONS.length);

  const totalD1 = counts.reduce((sum, c) => sum + c.d1Count, 0);
  const totalD2 = counts.reduce((sum, c) => sum + c.d2Count, 0);
  assert.equal(totalD1, ALL_D1_QUESTIONS.length);
  assert.equal(totalD2, ALL_D2_QUESTIONS.length);

  for (const row of counts) {
    assert.ok(row.totalCount > 0, `Lesson ${row.lessonId} should have questions`);
  }
});

test('getQuestionsByLesson filters properly by lesson and question type', () => {
  const allL1 = getQuestionsByLesson(1, ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, 'all');
  const d1L1 = getQuestionsByLesson(1, ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, 'D1');
  const d2L1 = getQuestionsByLesson(1, ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, 'D2');

  assert.equal(allL1.length, d1L1.length + d2L1.length);
  assert.ok(d1L1.every((item) => item.kind === 'D1' && item.question.lessonId === 1));
  assert.ok(d2L1.every((item) => item.kind === 'D2' && item.question.lessonId === 1));
  assert.deepEqual(
    allL1.map((q) => q.indexInLesson),
    allL1.map((_, idx) => idx + 1)
  );
});

test('evaluatePracticeQuestion evaluates both D1 single-choice and D2 true/false questions accurately', () => {
  const l1Questions = getQuestionsByLesson(1, ALL_D1_QUESTIONS, ALL_D2_QUESTIONS, 'all');
  const firstD1 = l1Questions.find((q) => q.kind === 'D1')!;
  const firstD2 = l1Questions.find((q) => q.kind === 'D2')!;

  assert.ok(firstD1 && firstD1.kind === 'D1');
  assert.ok(firstD2 && firstD2.kind === 'D2');

  const unansD1 = evaluatePracticeQuestion(firstD1, null);
  assert.equal(unansD1.isAnswered, false);
  assert.equal(unansD1.isCorrect, false);

  const rightD1 = evaluatePracticeQuestion(firstD1, firstD1.question.correctOption);
  assert.equal(rightD1.isAnswered, true);
  assert.equal(rightD1.isCorrect, true);

  const wrongOpt = (['A', 'B', 'C', 'D'] as const).find(
    (opt) => opt !== firstD1.question.correctOption
  )!;
  const wrongD1 = evaluatePracticeQuestion(firstD1, wrongOpt);
  assert.equal(wrongD1.isAnswered, true);
  assert.equal(wrongD1.isCorrect, false);

  const d2AllRightAns = {
    a: firstD2.question.items[0].isTrue,
    b: firstD2.question.items[1].isTrue,
    c: firstD2.question.items[2].isTrue,
    d: firstD2.question.items[3].isTrue,
  };
  const evalD2Right = evaluatePracticeQuestion(firstD2, d2AllRightAns);
  assert.equal(evalD2Right.kind, 'D2');
  if (evalD2Right.kind === 'D2') {
    assert.equal(evalD2Right.isComplete, true);
    assert.equal(evalD2Right.isCorrect, true);
    assert.equal(evalD2Right.correctCount, 4);
  }

  const evalD2Partial = evaluatePracticeQuestion(firstD2, {
    ...d2AllRightAns,
    d: !firstD2.question.items[3].isTrue,
  });
  if (evalD2Partial.kind === 'D2') {
    assert.equal(evalD2Partial.isComplete, true);
    assert.equal(evalD2Partial.isCorrect, false);
    assert.equal(evalD2Partial.correctCount, 3);
  }

  const summary = computeLessonPracticeSummary(
    [firstD1, firstD2],
    {
      [firstD1.uid]: firstD1.question.correctOption,
      [firstD2.uid]: d2AllRightAns,
    },
    {
      [firstD1.uid]: true,
      [firstD2.uid]: false,
    }
  );
  assert.deepEqual(summary, {
    totalQuestions: 2,
    answeredCount: 2,
    checkedCount: 1,
    correctCount: 1,
  });
});
