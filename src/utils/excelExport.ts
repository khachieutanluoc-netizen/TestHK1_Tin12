import * as XLSX from 'xlsx';
import { DashboardStatsResult } from './analytics';
import { AttemptRecord } from '../types/exam';

export function exportDashboardToExcel(
  stats: DashboardStatsResult,
  scopedAttempts: readonly AttemptRecord[],
  scopeLabel: string
): string {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Danh sách học sinh xếp hạng theo điểm bình quân (theo bộ lọc hiện tại)
  const rankingRows = stats.filteredRankings.map((row) => ({
    'Hạng toàn bảng': row.rank,
    'Trường': row.school,
    'Số điện thoại': row.phone,
    'Email': row.email,
    'Số lượt làm bài': row.attemptCount,
    'Điểm bình quân': row.avgScore,
    'Điểm cao nhất': row.bestScore,
    'Điểm gần nhất': row.latestScore,
    'Chủ đề cần cải thiện': row.weakestLessonTitle,
    'Lần thi gần nhất': new Date(row.lastAttemptAt).toLocaleString('vi-VN'),
  }));
  const wsRankings = XLSX.utils.json_to_sheet(
    rankingRows.length > 0
      ? rankingRows
      : [{ 'Thông báo': 'Không có dữ liệu phù hợp bộ lọc hiện tại' }]
  );
  wsRankings['!cols'] = [
    { wch: 14 },
    { wch: 38 },
    { wch: 15 },
    { wch: 28 },
    { wch: 16 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 28 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRankings, 'Xep hang hoc sinh');

  // Sheet 2: Thống kê theo chủ đề bài học
  const topicRows = stats.topicStats.map((t) => ({
    'Bài học': t.code,
    'Tên chủ đề': t.title,
    'Nhóm chủ đề': t.topicGroup === 'A&D' ? 'Chủ đề A & D' : 'Chủ đề F (HTML & CSS)',
    'Số lượt đánh giá': t.attemptSampleCount,
    'Tỉ lệ đạt trung bình (%)': t.avgAccuracyPct,
    'Số lượt dưới 70%': t.weakOccurrenceCount,
    'Tỉ lệ học sinh còn yếu (%)': t.weakRatePct,
  }));
  const wsTopics = XLSX.utils.json_to_sheet(topicRows);
  wsTopics['!cols'] = [
    { wch: 10 },
    { wch: 46 },
    { wch: 24 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTopics, 'Thong ke chu de');

  // Sheet 3: Thống kê theo trường
  const schoolRows = stats.schoolSummaries.map((s, idx) => ({
    'STT': idx + 1,
    'Tên trường': s.school,
    'Số thí sinh': s.studentCount,
    'Tổng lượt làm bài': s.attemptCount,
    'Điểm bình quân': s.avgScore,
    'Chủ đề yếu nhất': s.weakestLessonTitle,
  }));
  const wsSchools = XLSX.utils.json_to_sheet(
    schoolRows.length > 0 ? schoolRows : [{ 'Thông báo': 'Chưa có dữ liệu trường' }]
  );
  wsSchools['!cols'] = [
    { wch: 6 },
    { wch: 40 },
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSchools, 'Thong ke theo truong');

  // Sheet 4: Chi tiết tất cả lượt làm bài trong phạm vi lọc
  const attemptRows = scopedAttempts.map((a, idx) => ({
    'STT': idx + 1,
    'Mã lượt thi': a.id,
    'Trường': a.school,
    'Số điện thoại': a.phone,
    'Email': a.email,
    'Điểm Phần I': a.part1Score,
    'Điểm Phần II': a.part2Score,
    'Tổng điểm': a.totalScore,
    'Thời gian làm (giây)': a.durationSpentSeconds,
    'Vi phạm chuyển tab': a.violations,
    'Lý do nộp tự động':
      a.autoSubmittedReason === 'violations'
        ? 'Vượt quá 5 lần vi phạm'
        : a.autoSubmittedReason === 'timeout'
          ? 'Hết giờ 45 phút'
          : 'Học sinh tự nộp',
    'Thời điểm nộp': new Date(a.submittedAt).toLocaleString('vi-VN'),
  }));
  const wsAttempts = XLSX.utils.json_to_sheet(
    attemptRows.length > 0 ? attemptRows : [{ 'Thông báo': 'Chưa có lượt làm bài' }]
  );
  wsAttempts['!cols'] = [
    { wch: 6 },
    { wch: 20 },
    { wch: 36 },
    { wch: 15 },
    { wch: 26 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAttempts, 'Chi tiet luot thi');

  const safeSlug = scopeLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);

  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `thong-ke-tin-hoc-12-${safeSlug || 'vinh-long'}-${dateTag}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}
