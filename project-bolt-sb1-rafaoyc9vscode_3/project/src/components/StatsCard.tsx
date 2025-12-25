import React from 'react';
import { BarChart3, Target, Calendar, Zap, TrendingUp, Folder, Headphones } from 'lucide-react';
import { LearningStats } from '../types';

interface StatsCardProps {
  stats: LearningStats;
}

export const StatsCard: React.FC<StatsCardProps> = ({ stats }) => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg p-6 text-white mb-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center">
        <BarChart3 className="mr-3" size={28} />
        学习统计
      </h2>
      
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">总视频数</p>
              <p className="text-2xl font-bold">{stats.totalVideos}</p>
            </div>
            <Target className="text-white/60" size={24} />
          </div>
        </div>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">复习总时长</p>
              <p className="text-2xl font-bold">{stats.totalReviewHours}<span className="text-base ml-1">h</span></p>
            </div>
            <Zap className="text-white/60" size={24} />
          </div>
        </div>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">待开始</p>
              <p className="text-2xl font-bold">{stats.todayNewCount}</p>
            </div>
            <Calendar className="text-white/60" size={24} />
          </div>
        </div>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">待复习</p>
              <p className="text-2xl font-bold">{stats.pendingReviewCount ?? 0}</p>
            </div>
            <Headphones className="text-white/60" size={24} />
          </div>
        </div>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">活跃合辑</p>
              <p className="text-2xl font-bold">{stats.activeCollections}</p>
            </div>
            <Folder className="text-white/60" size={24} />
          </div>
        </div>

        <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm">完成数</p>
              <p className="text-2xl font-bold">{stats.completedVideos}</p>
            </div>
            <TrendingUp className="text-white/60" size={24} />
          </div>
        </div>
      </div>
    </div>
  );
};