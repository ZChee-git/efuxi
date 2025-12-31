import { useState, useEffect } from 'react';
import { VideoFile, DailyPlaylist, PlaylistItem, LearningStats, PlaylistPreview, Collection } from '../types';
import { 
  useLocalStorage, 
  serializeVideoFile, 
  deserializeVideoFile,
  serializeCollection,
  deserializeCollection,
  serializePlaylist,
  deserializePlaylist,
  fileStorage
} from './useLocalStorage';
import { getVideoPlayHistory } from '../utils/authUtils';

export const usePlaylistManager = () => {
  // 使用本地存储
  const [storedVideos, setStoredVideos] = useLocalStorage<any[]>('videos', []);
  const [storedPlaylists, setStoredPlaylists] = useLocalStorage<any[]>('playlists', []);
  const [storedCollections, setStoredCollections] = useLocalStorage<any[]>('collections', []);

  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [playlists, setPlaylists] = useState<DailyPlaylist[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 复习间隔：5次复习，分别在第4、8、15、30天后进行
  // 例如：12月7日第一次播放，12月11日进行第2次复习，12月15日进行第3次复习，12月22日进行第4次复习，1月6日进行第5次复习
  const REVIEW_INTERVALS = [4, 8, 15, 30];
  const MAX_NEW_PER_DAY = 4; // 每日新学习数量改为4集
  const MAX_REVIEW_PER_DAY = 600; // 每日最大复习数量，已由6改为600

  // 初始化数据
  useEffect(() => {
    const initializeData = async () => {
      try {
        // 初始化文件存储
        await fileStorage.init();
        
        // 恢复合辑数据
        const restoredCollections = storedCollections.map(deserializeCollection);
        setCollections(restoredCollections);

        // 恢复播放列表数据
        const restoredPlaylists = storedPlaylists.map(deserializePlaylist);
        setPlaylists(restoredPlaylists);

        // 恢复视频数据
        const restoredVideos = await Promise.all(
          storedVideos.map(async (video) => {
            const restored = deserializeVideoFile(video);
            // 从 IndexedDB 恢复文件URL
            try {
              const fileUrl = await fileStorage.getFile(video.id);
              if (fileUrl) {
                restored.fileUrl = fileUrl;
              }
            } catch (error) {
              console.error('Error restoring file for video:', video.id, error);
            }
            return restored;
          })
        );
        setVideos(restoredVideos);
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, []);

  // 保存数据到本地存储

  useEffect(() => {
    if (!isLoading) {
      const serializedVideos = videos.map(serializeVideoFile);
      setStoredVideos(serializedVideos);
    }
  }, [videos, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const serializedPlaylists = playlists.map(serializePlaylist);
      setStoredPlaylists(serializedPlaylists);
    }
  }, [playlists, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      const serializedCollections = collections.map(serializeCollection);
      setStoredCollections(serializedCollections);
    }
  }, [collections, isLoading]);

  // 生成随机颜色
  const generateRandomColor = () => {
    const colors = [
      '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', 
      '#EF4444', '#06B6D4', '#84CC16', '#F97316'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // 生成UUID的兼容函数
  const generateUUID = () => {
    // 检查是否支持crypto.randomUUID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // 降级方案
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const createCollection = (name: string, description?: string) => {
    console.log('Creating collection:', name, description); // 调试日志
    
    const newCollection: Collection = {
      id: generateUUID(),
      name,
      description,
      dateCreated: new Date(),
      isActive: true,
      totalVideos: 0,
      completedVideos: 0,
      color: generateRandomColor(),
    };

    console.log('New collection created:', newCollection); // 调试日志
    
    setCollections(prev => {
      const updated = [...prev, newCollection];
      console.log('Updated collections:', updated); // 调试日志
      return updated;
    });
    
    return newCollection.id;
  };

  const updateCollection = (collectionId: string, name: string, description?: string) => {
    setCollections(prev => prev.map(collection => 
      collection.id === collectionId 
        ? { ...collection, name, description }
        : collection
    ));
  };

  const deleteCollection = async (collectionId: string) => {
    // 删除合辑中的所有视频文件
    const collectionVideos = videos.filter(v => v.collectionId === collectionId);
    
    // 清理文件存储
    await Promise.all(
      collectionVideos.map(async (video) => {
        try {
          if (video.fileUrl) {
            URL.revokeObjectURL(video.fileUrl);
          }
          await fileStorage.deleteFile(video.id);
        } catch (error) {
          console.error('Error deleting file for video:', video.id, error);
        }
      })
    );
    
    setVideos(prev => prev.filter(v => v.collectionId !== collectionId));
    setCollections(prev => prev.filter(c => c.id !== collectionId));
  };

  const toggleCollection = (collectionId: string) => {
    setCollections(prev => prev.map(collection => 
      collection.id === collectionId 
        ? { ...collection, isActive: !collection.isActive }
        : collection
    ));
  };

  const addVideos = async (files: File[], collectionId: string) => {
    console.log('usePlaylistManager: addVideos 开始', { filesCount: files.length, collectionId });
    // 新增：为本批次生成唯一importBatchId
    const importBatchId = generateUUID();
    try {
      const newVideos: VideoFile[] = await Promise.all(
        files.map(async (file, index) => {
          console.log(`usePlaylistManager: 处理文件 ${index + 1}/${files.length}:`, file.name);
          
          const id = generateUUID(); // 使用我们的兼容函数
          
          try {
            // 保存文件到 IndexedDB 并获取 URL
            console.log(`usePlaylistManager: 开始保存文件到 IndexedDB:`, file.name);
            const fileUrl = await fileStorage.saveFile(id, file);
            console.log(`usePlaylistManager: 文件保存成功:`, { fileName: file.name, fileUrl });
            
            return {
              id,
              name: file.name.replace(/\.[^/.]+$/, ""),
              file,
              fileUrl,
              dateAdded: new Date(),
              reviewCount: 0,
              status: 'new' as const,
              collectionId,
              episodeNumber: index + 1,
              importBatchId,
            };
          } catch (error) {
            console.error('usePlaylistManager: 保存文件到 IndexedDB 失败:', file.name, error);
            // 如果保存失败，使用临时 URL
            const fallbackUrl = URL.createObjectURL(file);
            console.log(`usePlaylistManager: 使用临时 URL 作为后备:`, { fileName: file.name, fallbackUrl });
            
            return {
              id,
              name: file.name.replace(/\.[^/.]+$/, ""),
              file,
              fileUrl: fallbackUrl,
              dateAdded: new Date(),
              reviewCount: 0,
              status: 'new' as const,
              collectionId,
              episodeNumber: index + 1,
              importBatchId,
            };
          }
        })
      );

      console.log('usePlaylistManager: 所有文件处理完成，添加到视频列表', newVideos.length);
      setVideos(prev => [...prev, ...newVideos]);
      
      // 更新合辑统计
      console.log('usePlaylistManager: 更新合辑统计', { collectionId, videoCount: newVideos.length });
      setCollections(prev => prev.map(collection => 
        collection.id === collectionId 
          ? { 
              ...collection, 
              totalVideos: collection.totalVideos + newVideos.length 
            }
          : collection
      ));

      console.log('usePlaylistManager: addVideos 完成');
      return newVideos.map(v => v.id);
    } catch (error) {
      console.error('usePlaylistManager: addVideos 发生错误:', error);
      throw error; // 重新抛出错误以便上层处理
    }
  };

  const markVideoAsPlayed = (videoId: string) => {
    setVideos(prev => prev.map(video => {
      if (video.id === videoId) {
        const now = new Date();
        if (!video.firstPlayDate) {
          // 第一次播放，自然日：次日0点
          const nextReviewDate = new Date(now);
          nextReviewDate.setDate(nextReviewDate.getDate() + REVIEW_INTERVALS[0]);
          nextReviewDate.setHours(0, 0, 0, 0); // 设为次日0点
          return {
            ...video,
            firstPlayDate: now,
            reviewCount: 1,
            nextReviewDate,
            status: 'learning' as const,
          };
        } else {
          // 复习
          const newReviewCount = video.reviewCount + 1;
          let nextReviewDate: Date | undefined;
          let status: VideoFile['status'] = 'learning';

          if (newReviewCount < 5) {
            nextReviewDate = new Date(now);
            nextReviewDate.setDate(nextReviewDate.getDate() + REVIEW_INTERVALS[newReviewCount - 1]);
          } else {
            status = 'completed';
            // 更新合辑完成数
            setCollections(prev => prev.map(collection => 
              collection.id === video.collectionId 
                ? { ...collection, completedVideos: collection.completedVideos + 1 }
                : collection
            ));
          }

          return {
            ...video,
            reviewCount: newReviewCount,
            nextReviewDate,
            status,
          };
        }
      }
      return video;
    }));
  };

  // 计算距离第一次观看的天数
  const getDaysSinceFirstPlay = (firstPlayDate: Date): number => {
    const today = new Date();
    const diffTime = today.getTime() - firstPlayDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // 获取今日新学列表
  // 新学习内容轮流分配：从每个活跃专辑依次取1个，直到达到MAX_NEW_PER_DAY
  const getTodayNewVideos = (isExtraSession: boolean = false): PlaylistItem[] => {
    const activeCollectionIds = collections.filter(c => c.isActive).map(c => c.id);
    // 每个专辑的new视频分组
    const groupByCollection: Record<string, VideoFile[]> = {};
    activeCollectionIds.forEach(cid => {
      groupByCollection[cid] = videos.filter(v => v.collectionId === cid && v.status === 'new');
    });
    const result: VideoFile[] = [];
    let limit = isExtraSession ? MAX_NEW_PER_DAY + 2 : MAX_NEW_PER_DAY;
    let added = 0;
    let round = 0;
    while (added < limit) {
      let anyAdded = false;
      for (const cid of activeCollectionIds) {
        const group = groupByCollection[cid];
        if (group && group[round]) {
          result.push(group[round]);
          added++;
          anyAdded = true;
          if (added >= limit) break;
        }
      }
      if (!anyAdded) break; // 没有更多可选项
      round++;
    }
    return result.map(video => ({
      videoId: video.id,
      reviewType: 'new',
      reviewNumber: 1,
    }));
  };

  // 获取今日复习列表（所有应复习的视频，音频/视频方式均可）
  const getTodayReviews = (): PlaylistItem[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeCollectionIds = collections.filter(c => c.isActive).map(c => c.id);
    const activeVideos = videos.filter(v => activeCollectionIds.includes(v.collectionId));

    // 判断视频是否应该复习
    // 条件：
    //  1. 有 nextReviewDate（即已学习过）
    //  2. 状态不是 'completed'（未完全学完）
    //  3. nextReviewDate 的日期 <= 今天的日期（已到复习时间或逾期）
    const reviewVideos = activeVideos.filter(video => {
      // 排除没有复习日期或已完成的视频
      if (!video.nextReviewDate || video.status === 'completed') return false;
      
      // 比较日期（不比较时间部分）
      const reviewDate = new Date(video.nextReviewDate);
      reviewDate.setHours(0, 0, 0, 0);
      
      // 如果复习日期 <= 今天，则应该复习
      // 这包括：
      // - 昨天学习、今天复习的情况
      // - 前几天学习、今天复习的情况
      // - 逾期的情况
      const shouldReview = reviewDate.getTime() <= today.getTime();
      
      if (!shouldReview && video.reviewCount === 0) {
        // 首次学习后，通常 nextReviewDate 被设为明天，但由于时区或时差可能需要容错
        // 如果视频是刚学完的（reviewCount === 0），给予 48 小时容错窗口
        const now = new Date();
        const timeSinceNextReview = now.getTime() - (video.nextReviewDate?.getTime() || 0);
        if (Math.abs(timeSinceNextReview) < 48 * 60 * 60 * 1000) {
          // 在 48 小时内，容许显示
          return true;
        }
      }
      
      return shouldReview;
    });

    // 调试日志：帮助诊断为什么没有复习任务
    if (reviewVideos.length === 0 && activeVideos.some(v => v.nextReviewDate && v.status !== 'completed')) {
      console.debug('getTodayReviews 调试信息:', {
        todayTime: today.getTime(),
        todayDate: today.toISOString(),
        totalActiveVideos: activeVideos.length,
        videosWithNextReviewDate: activeVideos.filter(v => v.nextReviewDate && v.status !== 'completed').length,
        sampleVideoWithReview: activeVideos
          .filter(v => v.nextReviewDate && v.status !== 'completed')
          .slice(0, 3)
          .map(v => ({
            id: v.id,
            status: v.status,
            reviewCount: v.reviewCount,
            nextReviewDate: v.nextReviewDate?.toISOString(),
            reviewDateAtNoon: new Date(v.nextReviewDate || 0).setHours(0, 0, 0, 0),
            shouldReview: v.nextReviewDate ? new Date(v.nextReviewDate).setHours(0, 0, 0, 0) <= today.getTime() : false,
          })),
      });
    }

    // 复习内容轮流分配：从每个活跃专辑依次取1个，直到全部分配完
    const groupByCollection: Record<string, VideoFile[]> = {};
    activeCollectionIds.forEach(cid => {
      groupByCollection[cid] = reviewVideos.filter(v => v.collectionId === cid);
    });
    const result: VideoFile[] = [];
    let round = 0;
    let added = 0;
    const total = reviewVideos.length;
    while (added < total) {
      let anyAdded = false;
      for (const cid of activeCollectionIds) {
        const group = groupByCollection[cid];
        if (group && group[round]) {
          result.push(group[round]);
          added++;
          anyAdded = true;
          if (added >= total) break;
        }
      }
      if (!anyAdded) break;
      round++;
    }
    return result.map(video => ({
      videoId: video.id,
      reviewType: 'review',
      reviewNumber: video.reviewCount + 1,
      daysSinceFirstPlay: video.firstPlayDate ? getDaysSinceFirstPlay(video.firstPlayDate) : 0,
      isRecommendedForVideo: [3,4,5].includes(video.reviewCount), // 15/30/90天建议视频复习
    }));
  };

  const generateTodayPlaylist = (isExtraSession: boolean = false): PlaylistPreview => {
    const newVideos = getTodayNewVideos(isExtraSession);
    const reviews = getTodayReviews();
    return {
      newVideos,
      reviews,
      totalCount: newVideos.length + reviews.length,
      isExtraSession,
    };
  };

  const createTodayPlaylist = (playlistType: 'new' | 'review', isExtraSession: boolean = false, forceNew: boolean = false): DailyPlaylist => {
    let items: PlaylistItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 检查当天是否已有未完成的新学习任务，避免重复生成
    if (playlistType === 'new' && !forceNew) {
      const exist = playlists.find(p => {
        if (p.playlistType !== 'new' || p.isCompleted) return false;
        const pDate = new Date(p.date);
        pDate.setHours(0, 0, 0, 0);
        return pDate.getTime() === today.getTime();
      });
      if (exist) return exist;
      items = getTodayNewVideos(isExtraSession);
    } else if (playlistType === 'new' && forceNew) {
      // 强制重新获取所有新视频（包括新添加的），忽略已完成的 playlist
      items = getTodayNewVideos(isExtraSession);
    } else if (playlistType === 'review') {
      items = getTodayReviews();
    }
    const playlist: DailyPlaylist = {
      id: generateUUID(),
      date: new Date(),
      items,
      isCompleted: false,
      lastPlayedIndex: 0,
      isExtraSession,
      playlistType,
    };
    setPlaylists(prev => [playlist, ...prev]);
    return playlist;
  };

  const getLastPlaylist = (): DailyPlaylist | null => {
    // 只返回当天的未完成新学习任务
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return playlists.find(p => {
      if (p.isCompleted || p.playlistType !== 'new') return false;
      const pDate = new Date(p.date);
      pDate.setHours(0, 0, 0, 0);
      return pDate.getTime() === today.getTime();
    }) || null;
  };

  const updatePlaylistProgress = (playlistId: string, lastPlayedIndex: number, isCompleted: boolean = false) => {
    setPlaylists(prev => prev.map(playlist => {
      if (playlist.id === playlistId) {
        return {
          ...playlist,
          lastPlayedIndex,
          isCompleted,
        };
      }
      return playlist;
    }));

    if (isCompleted) {
      // 标记所有播放的视频为已完成
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        playlist.items.forEach(item => {
          markVideoAsPlayed(item.videoId);
        });
      }
    }
  };

  const getStats = (): LearningStats => {
    const activeCollectionIds = collections.filter(c => c.isActive).map(c => c.id);
    const activeVideos = videos.filter(v => activeCollectionIds.includes(v.collectionId));
    const totalVideos = activeVideos.length;
    const completedVideos = activeVideos.filter(v => v.status === 'completed').length;
    const newVideos = getTodayNewVideos();
    const reviews = getTodayReviews();
    const overallProgress = totalVideos > 0 
      ? Math.round((completedVideos / totalVideos) * 100) 
      : 0;

    // 统计待复习视频数量
    const pendingReviewCount = reviews.length;

    // 统计累计复习时长（小时，保留1位小数）
    // 统计所有历史播放记录，无论视频是否还在库中
    const playHistory = getVideoPlayHistory();
    const totalSeconds = playHistory.reduce((sum, h) => sum + (h.lastPlayedTime || 0), 0);
    const totalReviewHours = Math.round((totalSeconds / 3600) * 10) / 10;
    // 检查是否可以加餐（今日任务已完成）
    const canAddExtra = newVideos.length === 0 && activeVideos.some(v => v.status === 'new');
    
    // 调试日志：统计数据
    console.debug('getStats 统计数据:', {
      totalVideos,
      completedVideos,
      todayNewCount: newVideos.length,
      todayReviewCount: reviews.length,
      overallProgress,
      activeCollections: collections.filter(c => c.isActive).length,
      canAddExtra,
    });
    
    return {
      totalVideos,
      completedVideos,
      todayNewCount: newVideos.length,
      todayReviewCount: reviews.length,
      overallProgress,
      activeCollections: collections.filter(c => c.isActive).length,
      canAddExtra,
      totalReviewHours,
      pendingReviewCount,
    };
  };

  const deleteVideo = async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (video) {
      try {
        // 清理文件URL
        if (video.fileUrl) {
          URL.revokeObjectURL(video.fileUrl);
        }
        
        // 从 IndexedDB 删除文件
        await fileStorage.deleteFile(videoId);
        
        // 更新合辑统计
        setCollections(prevCollections => prevCollections.map(collection => 
          collection.id === video.collectionId 
            ? { 
                ...collection, 
                totalVideos: Math.max(0, collection.totalVideos - 1),
                completedVideos: video.status === 'completed' 
                  ? Math.max(0, collection.completedVideos - 1)
                  : collection.completedVideos
              }
            : collection
        ));
      } catch (error) {
        console.error('Error deleting video file:', error);
      }
    }
    
    setVideos(prev => prev.filter(v => v.id !== videoId));
  };

  const getVideoById = (id: string): VideoFile | undefined => {
    return videos.find(v => v.id === id);
  };

  // 清理对象URLs
  useEffect(() => {
    return () => {
      videos.forEach(video => {
        if (video.fileUrl) {
          URL.revokeObjectURL(video.fileUrl);
        }
      });
    };
  }, []);

  return {
    videos,
    playlists,
    collections,
    isLoading,
    addVideos,
    createCollection,
    updateCollection,
    deleteCollection,
    toggleCollection,
    generateTodayPlaylist,
    createTodayPlaylist,
    getLastPlaylist,
    updatePlaylistProgress,
    getStats,
    deleteVideo,
    getVideoById,
    getTodayNewVideos,
    getTodayReviews,
  };
};