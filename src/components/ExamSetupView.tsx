import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Clock,
  Eye,
  History,
  Mail,
  Phone,
  Play,
  School,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { SCHOOLS } from '../data/schools';
import { AttemptRecord } from '../types/exam';
import { CandidateInfo, validateCandidateForm } from '../utils/examEngine';

interface ExamSetupViewProps {
  initialCandidate: CandidateInfo;
  attempts: AttemptRecord[];
  onStartExam: (candidate: CandidateInfo) => void;
  onReviewAttempt: (attempt: AttemptRecord) => void;
}

export const ExamSetupView: React.FC<ExamSetupViewProps> = ({
  initialCandidate,
  attempts,
  onStartExam,
  onReviewAttempt,
}) => {
  const [school, setSchool] = useState(initialCandidate.school);
  const [phone, setPhone] = useState(initialCandidate.phone);
  const [email, setEmail] = useState(initialCandidate.email);
  const [schoolFilter, setSchoolFilter] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof CandidateInfo, string>>>({});
  const [historyScope, setHistoryScope] = useState<'mine' | 'device'>('mine');

  const filteredSchools = useMemo(() => {
    const q = schoolFilter.trim().toLowerCase();
    if (!q) return SCHOOLS;
    return SCHOOLS.filter((s) => s.toLowerCase().includes(q));
  }, [schoolFilter]);

  const myAndDeviceAttempts = useMemo(() => {
    const nonSeed = attempts.filter((a) => !a.isSeedData);
    const base = nonSeed.length > 0 ? nonSeed : attempts;

    if (historyScope === 'device') {
      return base.slice(0, 20);
    }

    const normEmail = email.trim().toLowerCase();
    const normPhone = phone.replace(/[\s.-]/g, '').trim();
    if (!normEmail && !normPhone) {
      return nonSeed.slice(0, 10);
    }
    return attempts
      .filter(
        (a) =>
          (normEmail && a.email.toLowerCase() === normEmail) ||
          (normPhone && a.phone === normPhone)
      )
      .slice(0, 20);
  }, [attempts, email, phone, historyScope]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateCandidateForm({ school, phone, email }, SCHOOLS);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onStartExam(result.normalized);
  };

  return (
    <div className="space-y-6">
      {/* Main Grid: Candidate Form + Exam Blueprint */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Form Đăng ký thi thử */}
        <section
          aria-labelledby="exam-setup-heading"
          className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/70">
            <h2 id="exam-setup-heading" className="text-lg font-bold text-slate-900">
              Thông tin thí sinh & Lấy đề ngẫu nhiên
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Chọn trường đang theo học, nhập số điện thoại và email để bắt đầu làm bài ôn tập chuẩn ma trận Sở GD&amp;ĐT.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
            {/* School Selection with quick search filter */}
            <div>
              <label
                htmlFor="candidate-school"
                className="block text-sm font-semibold text-slate-800 mb-1.5"
              >
                Trường THPT / Trung tâm GDTX <span className="text-rose-700">*</span>
              </label>

              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                  placeholder="Tìm nhanh tên trường (ví dụ: Nguyễn Bỉnh Khiêm, Vĩnh Long, Trà Ôn...)"
                  aria-label="Lọc nhanh tên trường"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>

              <div className="relative">
                <School className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="candidate-school"
                  value={school}
                  onChange={(e) => {
                    setSchool(e.target.value);
                    if (errors.school) setErrors((prev) => ({ ...prev, school: undefined }));
                  }}
                  aria-invalid={Boolean(errors.school)}
                  className={`w-full pl-9 pr-3 py-2.5 text-sm bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                    errors.school ? 'border-rose-500' : 'border-slate-300'
                  }`}
                >
                  <option value="">-- Chọn trường của bạn ({filteredSchools.length} đơn vị) --</option>
                  {filteredSchools.map((schoolName) => (
                    <option key={schoolName} value={schoolName}>
                      {schoolName}
                    </option>
                  ))}
                </select>
              </div>
              {errors.school && (
                <p className="mt-1.5 text-xs font-medium text-rose-700 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.school}</span>
                </p>
              )}
            </div>

            {/* Phone + Email 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="candidate-phone"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Số điện thoại <span className="text-rose-700">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="candidate-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="0912345678"
                    aria-invalid={Boolean(errors.phone)}
                    className={`w-full pl-9 pr-3 py-2.5 text-sm bg-white border rounded-lg text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                      errors.phone ? 'border-rose-500' : 'border-slate-300'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="mt-1.5 text-xs font-medium text-rose-700 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="candidate-email"
                  className="block text-sm font-semibold text-slate-800 mb-1.5"
                >
                  Địa chỉ email <span className="text-rose-700">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="candidate-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="hocsinh@gmail.com"
                    aria-invalid={Boolean(errors.email)}
                    className={`w-full pl-9 pr-3 py-2.5 text-sm bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                      errors.email ? 'border-rose-500' : 'border-slate-300'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs font-medium text-rose-700 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.email}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Thí sinh được thi thử không giới hạn số lần. Hệ thống tự lưu lịch sử bài làm.
              </p>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Lấy đề ngẫu nhiên</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right: Cấu trúc đề & Quy chế giám sát */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Cấu trúc đề theo Ma trận Đặc tả
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <p className="text-xs font-medium text-slate-500">Thời gian làm bài</p>
                <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-700" />
                  <span>45 phút</span>
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                <p className="text-xs font-medium text-slate-500">Thang điểm chuẩn</p>
                <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
                  10.0 điểm
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100">
                <span>
                  <strong className="text-slate-900">Phần I (Dạng 1):</strong> 24 câu trắc nghiệm 4 lựa chọn (12 Biết, 7 Hiểu, 5 Vận dụng)
                </span>
                <span className="font-mono font-bold text-blue-700 tabular-nums shrink-0">6.0đ</span>
              </li>
              <li className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100">
                <span>
                  <strong className="text-slate-900">Phần II (Dạng 2):</strong> 4 câu chùm Đúng/Sai (16 lệnh hỏi: 6 Biết, 4 Hiểu, 4 VD, 2 VDC)
                </span>
                <span className="font-mono font-bold text-blue-700 tabular-nums shrink-0">4.0đ</span>
              </li>
              <li className="text-xs text-slate-500 pt-1">
                Phạm vi kiến thức: Bài 1 – Bài 3 (AI &amp; Đạo đức mạng) và Bài 4 – Bài 10 (HTML &amp; CSS cơ bản).
              </li>
            </ul>
          </div>

          <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-5 space-y-2">
            <div className="flex items-center gap-2 text-amber-900">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <h3 className="text-sm font-bold">Chế độ giám sát thi nghiêm túc</h3>
            </div>
            <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
              Trong suốt thời gian làm bài, hệ thống ghi nhận hành vi <strong>chuyển tab trình duyệt, thu nhỏ cửa sổ hoặc rời khỏi trang thi</strong>. Tối đa <strong>5 lần cảnh báo</strong>; từ lần vi phạm thứ 6 hệ thống sẽ <strong>tự động thu bài và công bố kết quả</strong>.
            </p>
          </div>
        </aside>
      </div>

      {/* Lịch sử các lần làm bài để học sinh xem lại */}
      <section
        aria-labelledby="attempt-history-heading"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-blue-700" />
            <h3 id="attempt-history-heading" className="text-base font-bold text-slate-900">
              Lịch sử bài thi &amp; Xem lại đáp án
            </h3>
          </div>

          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 self-start">
            <button
              type="button"
              onClick={() => setHistoryScope('mine')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                historyScope === 'mine'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theo SĐT / Email đang nhập
            </button>
            <button
              type="button"
              onClick={() => setHistoryScope('device')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                historyScope === 'device'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả bài trên thiết bị / Cloud
            </button>
          </div>
        </div>

        {myAndDeviceAttempts.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            Chưa có lượt làm bài nào khớp với thông tin hiện tại. Hãy chọn trường, nhập SĐT, email và nhấn &ldquo;Lấy đề ngẫu nhiên&rdquo; để bắt đầu.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Thời điểm nộp</th>
                  <th className="py-3 px-4">Thí sinh / Trường</th>
                  <th className="py-3 px-4 text-right">Phần I</th>
                  <th className="py-3 px-4 text-right">Phần II</th>
                  <th className="py-3 px-4 text-right">Tổng điểm</th>
                  <th className="py-3 px-4">Chủ đề cần ôn</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {myAndDeviceAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {new Date(att.submittedAt).toLocaleString('vi-VN')}
                      {att.autoSubmittedReason === 'violations' && (
                        <span className="block text-[11px] font-semibold text-rose-700">
                          Thu bài tự động (vi phạm {att.violations} lần)
                        </span>
                      )}
                      {att.autoSubmittedReason === 'timeout' && (
                        <span className="block text-[11px] font-semibold text-amber-700">
                          Hết giờ tự động nộp
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                        {att.email} · <span className="tabular-nums">{att.phone}</span>
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-[260px]">{att.school}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {att.part1Score.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {att.part2Score.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-blue-700 tabular-nums">
                      {att.totalScore.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-[220px]">
                      {att.weakTopics.length > 0
                        ? att.weakTopics.map((id) => `Bài ${id}`).join(', ')
                        : 'Nắm vững'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onReviewAttempt(att)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem chi tiết</span>
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
