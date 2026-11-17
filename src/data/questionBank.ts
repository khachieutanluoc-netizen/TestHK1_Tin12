import { D1Question, D2Question } from '../types/exam';
import { GROUP_AD_D1, GROUP_AD_D2 } from './questions/groupAD';
import { LESSON4_5_D1, LESSON4_5_D2 } from './questions/lesson4_5';
import { LESSON6_7_D1, LESSON6_7_D2 } from './questions/lesson6_7';
import { LESSON8_9_10_D1, LESSON8_9_10_D2 } from './questions/lesson8_9_10';

export const ALL_D1_QUESTIONS: D1Question[] = [
  ...GROUP_AD_D1,
  ...LESSON4_5_D1,
  ...LESSON6_7_D1,
  ...LESSON8_9_10_D1,
];

export const ALL_D2_QUESTIONS: D2Question[] = [
  ...GROUP_AD_D2,
  ...LESSON4_5_D2,
  ...LESSON6_7_D2,
  ...LESSON8_9_10_D2,
];
