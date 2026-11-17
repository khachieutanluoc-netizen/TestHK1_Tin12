import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  CheckSquare,
  Download,
  Eye,
  FilterX,
  Search,
  Square,
  TrendingDown,
  Users,
} from 'lucide-react';
import { SCHOOLS } from '../data/schools';
import { AttemptRecord, LessonId } from '../types/exam';
import { computeDashboardStats, ScoreTierFilter } from '../utils/analytics';
import { exportDashboardToExcel } from '../utils/excelExport';

interface DashboardViewProps {
  attempts: AttemptRecord[];
  onInspectAttempt: (attempt: AttemptRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  attempts,
  onInspectAttempt,
}) => {
  const [scopeMode, setScopeMode] = useState<'province' | 'schools'>('province');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState<LessonId | null>(null);
  const [tierFilter, setTierFilter] = useState<ScoreTierFilter>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [includeSampleData, setIncludeSampleData] = useState(true);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const activeAttempts = useMemo(() => {
    if (includeSampleData) return attempts;
    return attempts.filter((a) => !a.isSeedData);
  }, [attempts, includeSampleData]);

  // Đếm số lượt thi theo từng trường để giáo viên dễ chọn trường có dữ liệu
  const attemptCountBySchool = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activeAttempts) {
      map.set(a.school, (map.get(a.school) ?? 0) + 1);
    }
    return map;
  }, [activeAttempts]);

  const effectiveSelectedSchools = useMemo(() => {
    return scopeMode === 'province' ? [] : selectedSchools;
  }, [scopeMode, selectedSchools]);

  const stats = useMemo(
    () =>
      computeDashboardStats(
        activeAttempts,
        effectiveSelectedSchools,
        topicFilter,
        tierFilter,
        studentSearch
      ),
    [activeAttempts, effectiveSelectedSchools, topicFilter, tierFilter, studentSearch]
  );

  const scopedAttempts = useMemo(() => {
    if (effectiveSelectedSchools.length === 0) return activeAttempts;
    const set = new Set(effectiveSelectedSchools);
    return activeAttempts.filter((a) => set.has(a.school));
  }, [activeAttempts, effectiveSelectedSchools]);

  const sortedAndFilteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    const list = q
      ? SCHOOLS.filter((s) => s.toLowerCase().includes(q))
      : [...SCHOOLS];
    // Đưa các trường đã có lượt thi lên đầu danh sách checkbox để thao tác nhanh
    return list.sort((a, b) => {
      const ca = attemptCountBySchool.get(a) ?? 0;
      const cb = attemptCountBySchool.get(b) ?? 0;
      if (cb !== ca) return cb - ca;
      return a.localeCompare(b, 'vi');
    });
  }, [schoolSearch, attemptCountBySchool]);

  const toggleSchoolCheckbox = (schoolName: string) => {
    setScopeMode('schools');
    setSelectedSchools((prev) =>
      prev.includes(schoolName)
        ? prev.filter((s) => s !== schoolName)
        : [...prev, schoolName]
    );
  };

  const handleSelectAllSchoolsWithData = () => {
    setScopeMode('schools');
    const withData = SCHOOLS.filter((s) => (attemptCountBySchool.get(s) ?? 0) > 0);
    setSelectedSchools(withData);
  };

  const handleExportExcel = () => {
    const label =
      scopeMode === 'province'
        ? 'toan-tinh'
        : selectedSchools.length === 1
          ? selectedSchools[0]
          : `${selectedSchools.length}-truong`;
    const fileName = exportDashboardToExcel(stats, scopedAttempts, label);
    setExportMessage(`Đã tải xuống tệp Excel: ${fileName}`);
    window.setTimeout(() => setExportMessage(null), 5000);
  };

  const hasChartFilter = topicFilter !== null || tierFilter !== 'all' || studentSearch.trim() !== '';

  return (
    <div className="space-y-6">
      {/* Header Control Bar: Scope Selection + Export Excel */}
      <section
        aria-labelledby="dashboard-scope-heading"
        className="bg-white rounded-xl border border-slate-200 p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 id="dashboard-scope-heading" className="text-lg font-bold text-slate-900">
              Dashboard Thống kê &amp; Phân tích năng lực học sinh
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Phạm vi: Chọn thống kê toàn tỉnh Vĩnh Long hoặc đánh dấu chọn từng trường để phát hiện lỗ hổng kiến thức.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSampleData}
                onChange={(e) => setIncludeSampleData(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>Bao gồm dữ liệu mẫu toàn tỉnh</span>
            </label>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={stats.totalAttempts === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div
            role="status"
            className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs sm:text-sm font-medium text-emerald-900"
          >
            {exportMessage}
          </div>
        )}

        {/* Phạm vi: Toàn tỉnh vs Check chọn từng trường */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setScopeMode('province')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors cursor-pointer ${
                scopeMode === 'province'
                  ? 'bg-blue-700 border-blue-700 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Toàn tỉnh ({SCHOOLS.length} trường)</span>
            </button>

            <button
              type="button"
              onClick={() => setScopeMode('schools')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-colors cursor-pointer ${
                scopeMode === 'schools'
                  ? 'bg-blue-700 border-blue-700 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>
                Check chọn theo trường
                {scopeMode === 'schools' ? ` (${selectedSchools.length} đã chọn)` : ''}
              </span>
            </button>

            {scopeMode === 'schools' && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleSelectAllSchoolsWithData}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  Chọn các trường có dữ liệu
                </button>
                {selectedSchools.length > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSchools([])}
                      className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {scopeMode === 'schools' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  placeholder="Tìm kiếm tên trường để đánh dấu chọn..."
                  aria-label="Tìm trường trong bộ lọc"
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pr-1">
                {sortedAndFilteredSchools.map((schoolName) => {
                  const checked = selectedSchools.includes(schoolName);
                  const count = attemptCountBySchool.get(schoolName) ?? 0;
                  return (
                    <button
                      key={schoolName}
                      type="button"
                      onClick={() => toggleSchoolCheckbox(schoolName)}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-left text-xs transition-colors cursor-pointer ${
                        checked
                          ? 'bg-blue-50 border-blue-500 text-blue-950 font-semibold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {checked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{schoolName}</span>
                      </span>
                      {count > 0 && (
                        <span className="font-mono text-[11px] font-bold text-slate-500 tabular-nums shrink-0">
                          {count} lượt
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedSchools.length === 0 && (
                <p className="text-xs text-amber-800 font-medium">
                  Chưa đánh dấu trường nào — đang hiển thị dữ liệu toàn tỉnh cho đến khi bạn chọn ít nhất 1 trường.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 4 KPI Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Tổng lượt làm bài</span>
            <BarChart3 className="w-4 h-4 text-blue-700" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
            {stats.totalAttempts}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Trong {stats.schoolSummaries.length} đơn vị trường học
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Thí sinh tham gia</span>
            <Users className="w-4 h-4 text-blue-700" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 tabular-nums">
            {stats.uniqueStudents}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Xếp hạng theo điểm bình quân
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Điểm bình quân</span>
            <Award className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-blue-700 tabular-nums">
            {stats.overallAvgScore.toFixed(2)}
            <span className="text-sm font-semibold text-slate-400"> / 10</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Điểm cao nhất: {stats.highestScore.toFixed(2)}đ
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Chủ đề yếu nhất</span>
            <TrendingDown className="w-4 h-4 text-rose-700" />
          </div>
          <p className="mt-2 text-lg font-extrabold text-rose-700 leading-tight">
            {stats.weakestTopic
              ? `${stats.weakestTopic.code}: ${stats.weakestTopic.avgAccuracyPct}%`
              : 'Chưa có dữ liệu'}
          </p>
          <p className="mt-1 text-xs text-slate-600 truncate">
            {stats.weakestTopic ? stats.weakestTopic.shortTitle : '—'}
          </p>
        </div>
      </section>

      {/* Interactive Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Biểu đồ 1: Tỉ lệ đạt theo chủ đề bài học (Click để lọc danh sách học sinh yếu chủ đề đó) */}
        <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Biểu đồ tỉ lệ nắm vững theo 10 chủ đề bài học
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Nhấn vào một cột bài học để lọc danh sách học sinh còn hạn chế ở chủ đề đó.
              </p>
            </div>
            {topicFilter !== null && (
              <button
                type="button"
                onClick={() => setTopicFilter(null)}
                className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Bỏ lọc chủ đề
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {stats.topicStats.map((topic) => {
              const isSelected = topicFilter === topic.lessonId;
              const isWeak = topic.attemptSampleCount > 0 && topic.avgAccuracyPct < 70;
              return (
                <button
                  key={topic.lessonId}
                  type="button"
                  onClick={() =>
                    setTopicFilter((prev) =>
                      prev === topic.lessonId ? null : topic.lessonId
                    )
                  }
                  className={`w-full text-left p-2 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border-blue-500'
                      : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1 gap-2">
                    <span className="font-semibold text-slate-800 truncate">
                      <span className="font-mono text-slate-500 mr-1.5">{topic.code}</span>
                      {topic.shortTitle}
                    </span>
                    <span className="font-mono font-bold tabular-nums shrink-0 text-slate-700">
                      {topic.attemptSampleCount > 0
                        ? `${topic.avgAccuracyPct}% (${topic.weakOccurrenceCount} lượt <70%)`
                        : 'Chưa có lượt'}
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-sm bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isSelected
                          ? 'bg-blue-700'
                          : isWeak
                            ? 'bg-rose-600'
                            : topic.avgAccuracyPct >= 82
                              ? 'bg-emerald-600'
                              : 'bg-blue-600'
                      }`}
                      style={{
                        width: `${
                          topic.attemptSampleCount > 0
                            ? Math.max(4, topic.avgAccuracyPct)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Biểu đồ 2: Phân bố học lực & Điểm yếu cần giáo viên lưu ý */}
        <section className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Phân bố xếp loại theo Điểm bình quân
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhấn vào nhóm mức điểm để lọc danh sách thí sinh.
                </p>
              </div>
              {tierFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setTierFilter('all')}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  Xem tất cả
                </button>
              )}
            </div>

            <div className="space-y-3">
              {stats.scoreTiers.map((tier) => {
                const isSelected = tierFilter === tier.id;
                const barColor =
                  tier.id === 'excellent'
                    ? 'bg-emerald-600'
                    : tier.id === 'good'
                      ? 'bg-blue-600'
                      : tier.id === 'average'
                        ? 'bg-amber-600'
                        : 'bg-rose-600';
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() =>
                      setTierFilter((prev) => (prev === tier.id ? 'all' : tier.id))
                    }
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-800">
                        {tier.label}{' '}
                        <span className="font-normal text-slate-500">({tier.rangeLabel})</span>
                      </span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {tier.count} HS ({tier.pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-sm bg-slate-200/70 overflow-hidden">
                      <div
                        className={`h-full ${barColor}`}
                        style={{ width: `${tier.count > 0 ? Math.max(4, tier.pct) : 0}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gợi ý chuyên môn dành cho giáo viên */}
          <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <h3 className="text-sm font-bold">Tổng hợp điểm yếu cần ôn tập trọng tâm</h3>
            </div>
            {stats.topicStats.filter((t) => t.attemptSampleCount > 0).length === 0 ? (
              <p className="text-xs text-amber-900">Chưa có dữ liệu làm bài trong phạm vi đã chọn.</p>
            ) : (
              <ul className="space-y-1.5 text-xs text-amber-950 leading-relaxed">
                {[...stats.topicStats]
                  .filter((t) => t.attemptSampleCount > 0)
                  .sort((a, b) => a.avgAccuracyPct - b.avgAccuracyPct)
                  .slice(0, 3)
                  .map((weak) => (
                    <li key={weak.lessonId}>
                      <strong>{weak.title}:</strong> Đạt TB {weak.avgAccuracyPct}% —{' '}
                      {weak.weakRatePct}% lượt thi đạt dưới 70%. Nên tăng cường bài tập thực hành phần này.
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Bảng Xếp Hạng Học Sinh Theo Điểm Bình Quân */}
      <section
        aria-labelledby="ranking-table-heading"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 id="ranking-table-heading" className="text-base font-bold text-slate-900">
              Bảng xếp hạng thí sinh theo Điểm bình quân các lần làm bài
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Hiển thị {stats.filteredRankings.length} / {stats.rankings.length} thí sinh trong phạm vi lọc
              {topicFilter !== null ? ` · Đang lọc HS hạn chế Bài ${topicFilter}` : ''}
              {tierFilter !== 'all' ? ` · Đang lọc nhóm học lực` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasChartFilter && (
              <button
                type="button"
                onClick={() => {
                  setTopicFilter(null);
                  setTierFilter('all');
                  setStudentSearch('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Xóa bộ lọc biểu đồ</span>
              </button>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Tìm email, SĐT, trường..."
                aria-label="Tìm kiếm thí sinh trong bảng xếp hạng"
                className="pl-8 pr-3 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {stats.filteredRankings.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Không có học sinh nào khớp với phạm vi trường và bộ lọc biểu đồ hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-16 text-center">Hạng</th>
                  <th className="py-3 px-4">Trường THPT / Trung tâm</th>
                  <th className="py-3 px-4">Thí sinh (Email · SĐT)</th>
                  <th className="py-3 px-4 text-right">Số lượt</th>
                  <th className="py-3 px-4 text-right">Điểm TB</th>
                  <th className="py-3 px-4 text-right">Cao nhất</th>
                  <th className="py-3 px-4">Chủ đề hạn chế</th>
                  <th className="py-3 px-4 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {stats.filteredRankings.map((row) => (
                  <tr key={row.studentKey} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-mono font-bold tabular-nums text-slate-800">
                      #{row.rank}
                    </td>
                    <td className="py-3 px-4 text-xs sm:text-sm font-medium text-slate-800 max-w-[240px]">
                      {row.school}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900">{row.email}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{row.phone}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {row.attemptCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-700 tabular-nums">
                      {row.avgScore.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {row.bestScore.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">
                      <span
                        className={
                          row.weakestLessonId ? 'text-rose-700 font-semibold' : 'text-emerald-700'
                        }
                      >
                        {row.weakestLessonTitle}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onInspectAttempt(row.attempts[0])}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem bài</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
