import React, { useState } from 'react';
import { BookOpen, Trash2, Calendar, BarChart3, Filter, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { VideoFile, Collection } from '../types';

interface VideoLibraryProps {
  videos: VideoFile[];
  collections: Collection[];
  onDelete: (videoId: string) => void;
}

export const VideoLibrary: React.FC<VideoLibraryProps> = ({ videos, collections, onDelete }) => {
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  const getStatusColor = (status: VideoFile['status']) => {
    switch (status) {
      case 'new': return 'bg-gray-100 text-gray-700';
      case 'learning': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: VideoFile['status']) => {
    switch (status) {
      case 'new': return '未开始';
      case 'learning': return '学习中';
      case 'completed': return '已完成';
      default: return '未知';
    }
  };

  const getProgressText = (video: VideoFile) => {
    if (video.status === 'completed') return '5/5';
    return `${video.reviewCount}/5`;
  };

  const getCollectionName = (collectionId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    return collection?.name || '未知合辑';
  };

  const getCollectionColor = (collectionId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    return collection?.color || '#6B7280';
  };

  const toggleCollectionExpansion = (collectionId: string) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(collectionId)) {
      newExpanded.delete(collectionId);
    } else {
      newExpanded.add(collectionId);
    }
    setExpandedCollections(newExpanded);
  };

  // 过滤视频
  const filteredVideos = videos.filter(video => {
    const matchesCollection = selectedCollection === 'all' || video.collectionId === selectedCollection;
    const matchesSearch = video.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         getCollectionName(video.collectionId).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCollection && matchesSearch;
  });

  // 按合辑分组
  const groupedVideos = filteredVideos.reduce((groups, video) => {
    const collectionId = video.collectionId;
    if (!groups[collectionId]) {
      groups[collectionId] = [];
    }
    groups[collectionId].push(video);
    return groups;
  }, {} as Record<string, VideoFile[]>);

  if (videos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          <BookOpen className="mr-3 text-blue-600" size={28} />
          视频库
        </h2>
        
        <div className="text-center py-12">
          <BookOpen size={64} className="mx-auto text-gray-400 mb-4" />
          <p className="text-xl text-gray-600 mb-2">媒体库为空</p>
          <p className="text-gray-500">请先上传一些音视频文件开始学习</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
        <BookOpen className="mr-3 text-blue-600" size={28} />
        视频库
        <span className="ml-3 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
          {videos.length} 个视频
        </span>
      </h2>

      {/* 过滤器 */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="搜索视频或合辑..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="text-gray-500" size={20} />
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">所有合辑</option>
            {collections.map(collection => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {/* 视频列表 */}
      {Object.keys(groupedVideos).length === 0 ? (
        <div className="text-center py-12">
          <Search size={64} className="mx-auto text-gray-400 mb-4" />
          <p className="text-xl text-gray-600 mb-2">没有找到匹配的视频</p>
          <p className="text-gray-500">尝试调整搜索条件或过滤器</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedVideos).map(([collectionId, collectionVideos]) => {
            const isExpanded = expandedCollections.has(collectionId);
            const displayVideos = isExpanded ? collectionVideos : collectionVideos.slice(0, 6);
            const hasMore = collectionVideos.length > 6;
            
            return (
              <div key={collectionId} className="border border-gray-200 rounded-lg overflow-hidden">
                <div 
                  className="bg-gray-50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => hasMore && toggleCollectionExpansion(collectionId)}
                >
                  <div className="flex items-center">
                    <div
                      className="w-4 h-4 rounded-full mr-3"
                      style={{ backgroundColor: getCollectionColor(collectionId) }}
                    />
                    <h3 className="text-lg font-semibold text-gray-800">
                      {getCollectionName(collectionId)}
                    </h3>
                    <span className="ml-3 bg-gray-200 text-gray-600 px-2 py-1 rounded-full text-sm">
                      {collectionVideos.length} 个视频
                    </span>
                  </div>
                  {hasMore && (
                    <button className="text-gray-500 hover:text-gray-700">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  )}
                </div>
                
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayVideos.map(video => (
                      <div key={video.id} className="bg-gray-50 rounded-lg p-4 border">
                        <div className="flex justify-between items-start mb-3">
                          <h4 className="font-semibold text-gray-800 flex-1 mr-2 truncate" title={video.name}>
                            {video.name}
                          </h4>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(video.status)}`}>
                              {getStatusText(video.status)}
                            </span>
                            <button
                              onClick={() => onDelete(video.id)}
                              className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
                              title="删除视频"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Calendar size={14} className="mr-2 text-blue-500" />
                            <span>添加: {video.dateAdded.toLocaleDateString('zh-CN')}</span>
                          </div>
                          
                          <div className="flex items-center">
                            <BarChart3 size={14} className="mr-2 text-green-500" />
                            <span>进度: {getProgressText(video)}</span>
                          </div>

                          {video.firstPlayDate && (
                            <div className="flex items-center">
                              <Calendar size={14} className="mr-2 text-purple-500" />
                              <span>首播: {video.firstPlayDate.toLocaleDateString('zh-CN')}</span>
                            </div>
                          )}

                          {video.nextReviewDate && video.status === 'learning' && (
                            <div className="flex items-center">
                              <Calendar size={14} className="mr-2 text-orange-500" />
                              <span>下次复习: {video.nextReviewDate.toLocaleDateString('zh-CN')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {hasMore && !isExpanded && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={() => toggleCollectionExpansion(collectionId)}
                        className="text-blue-600 hover:text-blue-800 font-medium flex items-center mx-auto"
                      >
                        显示更多 ({collectionVideos.length - 6} 个)
                        <ChevronDown size={16} className="ml-1" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};