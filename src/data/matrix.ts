import { CognitiveLevel, LessonId, LessonMeta } from '../types/exam';

export const EXAM_DURATION_SECONDS = 45 * 60; // 45 phút
export const MAX_VIOLATIONS_ALLOWED = 5; // Cảnh báo tối đa 5 lần; vượt 5 lần (>5) tự thu bài

export const LESSONS: LessonMeta[] = [
  {
    id: 1,
    code: 'Bài 1',
    shortTitle: 'Làm quen với AI',
    title: 'Bài 1: Làm quen với Trí tuệ nhân tạo (AI)',
    topicGroup: 'A&D',
    topicGroupName: 'Chủ đề A & D: Trí tuệ nhân tạo & Đạo đức mạng',
  },
  {
    id: 2,
    code: 'Bài 2',
    shortTitle: 'AI và cuộc sống',
    title: 'Bài 2: Trí tuệ nhân tạo và cuộc sống',
    topicGroup: 'A&D',
    topicGroupName: 'Chủ đề A & D: Trí tuệ nhân tạo & Đạo đức mạng',
  },
  {
    id: 3,
    code: 'Bài 3',
    shortTitle: 'Giao tiếp & nhân văn mạng',
    title: 'Bài 3: Giao tiếp & tính nhân văn trên không gian mạng',
    topicGroup: 'A&D',
    topicGroupName: 'Chủ đề A & D: Trí tuệ nhân tạo & Đạo đức mạng',
  },
  {
    id: 4,
    code: 'Bài 4',
    shortTitle: 'HTML & cấu trúc trang web',
    title: 'Bài 4: HTML và cấu trúc trang web',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
  {
    id: 5,
    code: 'Bài 5',
    shortTitle: 'Định dạng văn bản HTML',
    title: 'Bài 5: Định dạng văn bản trong HTML',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
  {
    id: 6,
    code: 'Bài 6',
    shortTitle: 'Tạo danh sách, bảng',
    title: 'Bài 6: Tạo danh sách, bảng trong HTML',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
  {
    id: 7,
    code: 'Bài 7',
    shortTitle: 'Tạo liên kết (Hyperlinks)',
    title: 'Bài 7: Tạo liên kết (Hyperlinks)',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
  {
    id: 8,
    code: 'Bài 8',
    shortTitle: 'Đa phương tiện & Iframe',
    title: 'Bài 8: Đa phương tiện & Khung nội tuyến (Iframe)',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
  {
    id: 9,
    code: 'Bài 9',
    shortTitle: 'Tạo biểu mẫu (Form)',
    title: 'Bài 9: Tạo biểu mẫu (Form)',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
  {
    id: 10,
    code: 'Bài 10',
    shortTitle: 'Khái niệm & vai trò CSS',
    title: 'Bài 10: Khái niệm, vai trò của CSS',
    topicGroup: 'F',
    topicGroupName: 'Chủ đề F (ICT): Thiết kế trang web (HTML & CSS)',
  },
];

export const LESSON_MAP: Record<LessonId, LessonMeta> = LESSONS.reduce(
  (acc, lesson) => {
    acc[lesson.id] = lesson;
    return acc;
  },
  {} as Record<LessonId, LessonMeta>
);

export interface Part1MatrixSlot {
  lessonId: LessonId;
  counts: Record<CognitiveLevel, number>;
}

// Khung Ma trận Phần I (Dạng 1 - 24 câu, 0.25 điểm/câu = 6.0 điểm)
// 12 Biết + 7 Hiểu + 5 Vận dụng + 0 Vận dụng cao = 24 câu
export const PART1_MATRIX: Part1MatrixSlot[] = [
  { lessonId: 1, counts: { Biết: 2, Hiểu: 1, VD: 0, VDC: 0 } },
  { lessonId: 2, counts: { Biết: 1, Hiểu: 1, VD: 0, VDC: 0 } },
  { lessonId: 3, counts: { Biết: 1, Hiểu: 0, VD: 1, VDC: 0 } },
  { lessonId: 4, counts: { Biết: 2, Hiểu: 1, VD: 0, VDC: 0 } },
  { lessonId: 5, counts: { Biết: 1, Hiểu: 1, VD: 1, VDC: 0 } },
  { lessonId: 6, counts: { Biết: 1, Hiểu: 1, VD: 1, VDC: 0 } },
  { lessonId: 7, counts: { Biết: 1, Hiểu: 1, VD: 0, VDC: 0 } },
  { lessonId: 8, counts: { Biết: 1, Hiểu: 0, VD: 1, VDC: 0 } },
  { lessonId: 9, counts: { Biết: 1, Hiểu: 1, VD: 0, VDC: 0 } },
  { lessonId: 10, counts: { Biết: 1, Hiểu: 0, VD: 1, VDC: 0 } },
];

// Khung Ma trận Phần II (Dạng 2 - 4 câu chùm = 16 lệnh hỏi, 4.0 điểm tối đa)
// Theo bản đặc tả:
// - Tổng toàn Phần II: 6 Biết, 4 Hiểu, 4 VD, 2 VDC (tổng 16 lệnh)
// - Mỗi câu Dạng 2 giữ nguyên ngữ cảnh gốc và 4 lệnh a, b, c, d.
// - 1 câu từ Chủ đề A & D (Bài 1..3) và 3 câu từ Chủ đề F (Bài 5..10),
//   bảo đảm có lệnh VDC ở Bài 9/10 và tổng các mức độ đạt chuẩn 6B - 4H - 4VD - 2VDC.
export const PART2_TARGET_LEVELS: Record<CognitiveLevel, number> = {
  Biết: 6,
  Hiểu: 4,
  VD: 4,
  VDC: 2,
};

export const PART2_SCORE_BY_CORRECT_COUNT: Record<number, number> = {
  0: 0,
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1.0,
};
