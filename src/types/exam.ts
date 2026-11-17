export type CognitiveLevel = 'Biết' | 'Hiểu' | 'VD' | 'VDC';

export type CompetencyCode = 'NLa' | 'NLb' | 'NLc' | 'NLd';

export type LessonId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LessonMeta {
  id: LessonId;
  code: string;
  shortTitle: string;
  title: string;
  topicGroup: 'A&D' | 'F';
  topicGroupName: string;
}

export interface D1Question {
  id: string;
  lessonId: LessonId;
  questionNumber: number;
  level: CognitiveLevel;
  competency: CompetencyCode;
  prompt: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface D2SubItem {
  key: 'a' | 'b' | 'c' | 'd';
  text: string;
  isTrue: boolean;
  level: CognitiveLevel;
}

export interface D2Question {
  id: string;
  lessonId: LessonId;
  questionNumber: number;
  competency: CompetencyCode;
  context: string;
  items: [D2SubItem, D2SubItem, D2SubItem, D2SubItem];
  explanation: string;
}

export interface ExamD1Option {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

export interface ExamD1Item {
  questionId: string;
  lessonId: LessonId;
  level: CognitiveLevel;
  competency: CompetencyCode;
  prompt: string;
  options: ExamD1Option[];
  explanation: string;
}

export interface ExamD2Item {
  questionId: string;
  lessonId: LessonId;
  competency: CompetencyCode;
  context: string;
  items: D2SubItem[];
  explanation: string;
}

export interface GeneratedExam {
  examId: string;
  createdAt: string;
  durationSeconds: number;
  part1: ExamD1Item[];
  part2: ExamD2Item[];
}

export interface StudentAnswers {
  part1: Record<string, 'A' | 'B' | 'C' | 'D' | null>;
  part2: Record<string, Record<'a' | 'b' | 'c' | 'd', boolean | null>>;
}

export interface LessonMastery {
  lessonId: LessonId;
  lessonTitle: string;
  earnedPoints: number;
  maxPoints: number;
  accuracyPct: number;
  correctCount: number;
  totalCount: number;
}

export interface AttemptRecord {
  id: string;
  school: string;
  phone: string;
  email: string;
  submittedAt: string;
  durationSpentSeconds: number;
  violations: number;
  autoSubmittedReason: 'timeout' | 'violations' | null;
  part1Score: number;
  part2Score: number;
  totalScore: number;
  exam: GeneratedExam;
  answers: StudentAnswers;
  lessonBreakdown: LessonMastery[];
  weakTopics: LessonId[];
  feedbackSummary: string;
  syncedToDrive?: boolean;
  isSeedData?: boolean;
}

export interface StudentRankingRow {
  rank: number;
  studentKey: string;
  phone: string;
  email: string;
  school: string;
  attemptCount: number;
  avgScore: number;
  bestScore: number;
  latestScore: number;
  weakestLessonId: LessonId | null;
  weakestLessonTitle: string;
  lastAttemptAt: string;
  attempts: AttemptRecord[];
}
