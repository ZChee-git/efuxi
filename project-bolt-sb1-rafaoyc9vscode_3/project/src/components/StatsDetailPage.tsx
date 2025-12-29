import React from 'react';

interface StatsDetailPageProps {
  onBack: () => void;
  // 后续可加统计数据props
}

const StatsDetailPage: React.FC<StatsDetailPageProps> = ({ onBack }) => {
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
          学习统计明细
        </h2>
        {/* 统计明细内容后续补充 */}
        <div className="text-gray-700 mb-6">
          <p>这里将展示学习历史、进度、时间区间、各合辑/动画的集数与时长等明细。</p>
        </div>
        <div className="mt-8 text-center text-sm text-gray-400">
          建议截图保存此页面，记录你的学习历程。
        </div>
      </div>
    </div>
  );
};

export default StatsDetailPage;
