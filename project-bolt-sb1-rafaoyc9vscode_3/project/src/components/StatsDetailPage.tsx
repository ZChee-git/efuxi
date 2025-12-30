import React from 'react';

import { LearningStats, Collection } from '../types';

interface StatsDetailPageProps {
  onBack: () => void;
  stats: LearningStats;
  collections: Collection[];
}

const StatsDetailPage: React.FC<StatsDetailPageProps> = ({ onBack, stats, collections }) => {
  // 计算日均学习时长（小时，分母为自然日）
  const firstUseDate = window.localStorage.getItem('firstUseDate');
  const start = firstUseDate ? Number(firstUseDate) : Date.now();
  const now = Date.now();
  const days = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
  const avgHours = Math.round((stats.totalReviewHours / days) * 100) / 100;

  // 计算本周日均学习时长（最近7天播放历史均值）
  let weekAvgHours = 0;
  try {
    const playHistoryRaw = window.localStorage.getItem('videoPlayHistory');
    if (playHistoryRaw) {
      const playHistory = JSON.parse(playHistoryRaw);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const weekHistory = playHistory.filter((h: any) => h.lastPlayedDate >= sevenDaysAgo);
      const weekSeconds = weekHistory.reduce((sum: number, h: any) => sum + (h.lastPlayedTime || 0), 0);
  weekAvgHours = Math.round((weekSeconds / 3600 / 7) * 100) / 100;
    }
  } catch {}
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full relative">
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-blue-600 text-lg font-bold"
          onClick={onBack}
        >
          ×
        </button>
        <h2 className="text-2xl font-bold mb-4 text-blue-700 flex items-center">
          <svg width="28" height="28" viewBox="0 0 20 20" fill="none" className="mr-2"><rect x="3" y="5" width="14" height="2.5" rx="1.2" fill="#2563eb"/><rect x="3" y="9" width="14" height="2.5" rx="1.2" fill="#2563eb"/><rect x="3" y="13" width="14" height="2.5" rx="1.2" fill="#2563eb"/></svg>
         后排座·统计明细
        </h2>
        {/* 统计明细表格 */}
        <div className="text-gray-700 mb-6">
          <table className="w-full text-left border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2">统计项</th>
                <th className="px-4 py-2">数值</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2">学习（复习）总时长</td>
                <td className="px-4 py-2">{(Math.round(stats.totalReviewHours * 100) / 100).toFixed(2)} 小时</td>
              </tr>
              <tr>
                <td className="px-4 py-2">日均学习时长</td>
                <td className="px-4 py-2">{avgHours.toFixed(2)} 小时</td>
              </tr>
              <tr>
                <td className="px-4 py-2">本周日均学习时长</td>
                <td className="px-4 py-2">{weekAvgHours.toFixed(2)} 小时</td>
              </tr>
              <tr>
                <td className="px-4 py-2 align-top">所有合辑及集数</td>
                <td className="px-4 py-2">
                  <ul className="list-disc pl-4">
                    {collections.map(c => (
                      <li key={c.id}>
                        <span className="font-semibold text-blue-700">{c.name}</span>：{c.totalVideos} 集
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-8 text-center text-sm text-gray-400">
          建议截图保存此页面，记录你的学习历程。
        </div>
      </div>
    </div>
  );
};

export default StatsDetailPage;
