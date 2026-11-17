import React from 'react';
import { User } from 'firebase/auth';
import { BarChart3, Cloud, CloudOff, FileSpreadsheet, GraduationCap, LogOut, RefreshCw } from 'lucide-react';
import { DRIVE_TARGET_FOLDER_URL } from '../services/driveSync';

export type AppTab = 'exam' | 'dashboard';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  driveUser: User | null;
  hasDriveToken: boolean;
  isSyncingDrive: boolean;
  unsyncedCount: number;
  onSignInDrive: () => void;
  onSignOutDrive: () => void;
  onSyncFromDrive: () => void;
  onBackupConsolidatedToDrive: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  driveUser,
  hasDriveToken,
  isSyncingDrive,
  unsyncedCount,
  onSignInDrive,
  onSignOutDrive,
  onSyncFromDrive,
  onBackupConsolidatedToDrive,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 py-3">
          {/* App Identity & Official Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Sở Giáo dục và Đào tạo Vĩnh Long · Tin học 12
              </p>
              <h1 className="text-[13px] sm:text-[15px] font-extrabold text-slate-900 leading-snug">
                Ứng dụng Ôn tập kiểm tra Giữa học Kỳ 1 năm học 2026-2027 Bộ môn Tin học Tỉnh Vĩnh Long
              </h1>
            </div>
          </div>

          {/* Primary Navigation Tabs + Google Drive Sync Control */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 shrink-0">
            <nav
              aria-label="Chuyển đổi chức năng chính"
              className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200"
            >
              <button
                type="button"
                onClick={() => onSelectTab('exam')}
                aria-current={activeTab === 'exam' ? 'page' : undefined}
                className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'exam'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Thẻ 1: Thi thử</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('dashboard')}
                aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Thẻ 2: Dashboard Thống kê</span>
              </button>
            </nav>

            {/* Google Drive OAuth & Cloud Sync Controls */}
            {driveUser && hasDriveToken ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onSyncFromDrive}
                  disabled={isSyncingDrive}
                  title="Tải và gộp dữ liệu từ thư mục Google Drive"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                  <span>{isSyncingDrive ? 'Đang đồng bộ...' : 'Đồng bộ Drive'}</span>
                </button>
                {unsyncedCount > 0 && (
                  <button
                    type="button"
                    onClick={onBackupConsolidatedToDrive}
                    disabled={isSyncingDrive}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span className="tabular-nums">Đẩy {unsyncedCount} bài</span>
                  </button>
                )}
                <a
                  href={DRIVE_TARGET_FOLDER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Đã kết nối: ${driveUser.email ?? 'Google Drive'} — Mở thư mục Drive`}
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:text-blue-700 hover:border-blue-300 transition-colors max-w-[160px] truncate"
                >
                  <Cloud className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="truncate">{driveUser.email}</span>
                </a>
                <button
                  type="button"
                  onClick={onSignOutDrive}
                  title="Ngắt kết nối Google Drive"
                  aria-label="Ngắt kết nối Google Drive"
                  className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {driveUser && !hasDriveToken && (
                  <span
                    className="hidden md:inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md"
                    title="Token phiên Drive cần cấp lại khi tải lại trang"
                  >
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>Cần kết nối lại Drive</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={onSignInDrive}
                  className="gsi-material-button"
                  aria-label="Kết nối Google Drive để đồng bộ kết quả"
                >
                  <span className="gsi-material-button-content-wrapper">
                    <svg
                      className="gsi-material-button-icon"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    <span>Kết nối Google Drive</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
