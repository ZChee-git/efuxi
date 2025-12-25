import { useState, useCallback, useEffect } from 'react';
import InfoPage from './components/InfoPage';
import AuthCodeModal from './components/AuthCodeModal';
import { isTrialValid, isAuthValid } from './utils/authUtils';
import { Brain, Play, History, BookOpen, Loader } from 'lucide-react';
import { usePlaylistManager } from './hooks/usePlaylistManager';
import { VideoUpload } from './components/VideoUpload';
import { StatsCard } from './components/StatsCard';
import { PlaylistPreview } from './components/PlaylistPreview';
import { PlaylistHistory } from './components/PlaylistHistory';
import { VideoLibrary } from './components/VideoLibrary';
import { VideoPlayer } from './components/VideoPlayer';
import { InstallPrompt } from './components/InstallPrompt';
import { CollectionManager } from './components/CollectionManager';


function App() {
  // ...existing code...
  // 添加视频处理函数，防止未定义报错
  const handleVideoAdd = async (files: File[], collectionId: string) => {
    try {
      await addVideos(files, collectionId);
      setCurrentPreview(generateTodayPlaylist());
    } catch (e) {
      console.error('添加视频失败', e);
    }
  };
  // 全局授权拦截状态
  const [showAuthModal, setShowAuthModal] = useState(() => !isTrialValid() && !isAuthValid());
  const {
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
    getStats,
    deleteVideo,
    updatePlaylistProgress,
  // getTodayNewVideos,
  // getTodayReviews,
  } = usePlaylistManager();

  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [currentPreview, setCurrentPreview] = useState(generateTodayPlaylist());
  const [currentPlaylist, setCurrentPlaylist] = useState<any>(null);
  const [previewType, setPreviewType] = useState<'new' | 'review'>('new');
  // 当通过单一播放按钮触发新学习时，标记该次新学习使用音频输出并需要链式触发复习
  const [playAsAudioForNew, setPlayAsAudioForNew] = useState(false);
  const [chainToReview, setChainToReview] = useState(false);
  // 新增：单个视频点播
  const [singlePlayVideoId, setSinglePlayVideoId] = useState<string|null>(null);
  // 已移除 singlePlayVideo 状态，回退到原始状态
  const [showInfo, setShowInfo] = useState(false);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);

  // 保证预览进度实时刷新：lastPlayedIndex变化时自动刷新currentPreview
  useEffect(() => {
    if (showPreview && currentPlaylist && previewType === 'new') {
      // 重新生成预览，带最新lastPlayedIndex
      const validItems = currentPlaylist.items
        .map((item: any, idx: number) => ({ ...item, originalIndex: idx }))
        .filter((item: any) => videos.find((v: any) => v.id === item.videoId));
      setCurrentPreview({
        newVideos: validItems,
        reviews: [],
        totalCount: validItems.length,
        isExtraSession: currentPlaylist.isExtraSession,
        lastPlayedIndex: currentPlaylist.lastPlayedIndex,
      });
    }
  }, [showPreview, currentPlaylist?.lastPlayedIndex, previewType, videos]);
  // 防止无限循环：只有lastPlayedIndex变化才更新
  const handleProgressUpdate = useCallback(
    (idx: number) => {
      if (currentPlaylist && currentPlaylist.lastPlayedIndex !== idx) {
        updatePlaylistProgress(currentPlaylist.id, idx);
      }
    },
    [currentPlaylist, updatePlaylistProgress]
  );

  // 新增：复习预览显示所有未完成和今日新任务
  const handleShowPreview = (type: 'new' | 'review', isExtraSession: boolean = false) => {
    setPreviewType(type);
    // 优先查找本地未完成playlist
    let previewPlaylist = null;
    if (type === 'review') {
      previewPlaylist = playlists.find(p =>
        !p.isCompleted &&
        p.playlistType === 'review' &&
        p.lastPlayedIndex < p.items.length
      );
      if (previewPlaylist) {
        // 修正：传递全部items，并加originalIndex和lastPlayedIndex，保证“已学”可判断
        const validItems = previewPlaylist.items
          .map((item, idx) => ({ ...item, originalIndex: idx }))
          .filter(item => videos.find(v => v.id === item.videoId));
        setCurrentPreview({
          newVideos: previewPlaylist.playlistType === 'new' ? validItems : [],
          reviews: previewPlaylist.playlistType === 'review' ? validItems : [],
          totalCount: validItems.length,
          isExtraSession: previewPlaylist.isExtraSession,
          lastPlayedIndex: previewPlaylist.lastPlayedIndex,
        });
        setShowPreview(true);
        return;
      }
      // 没有未完成复习任务，走原有逻辑
      const unfinished = playlists.filter(p =>
        !p.isCompleted &&
        p.playlistType === 'review' &&
        p.lastPlayedIndex < p.items.length
      );
  const todayReviews = playlists && playlists.length > 0 ? playlists.flatMap(p => p.items.filter(item => item.type === 'review')) : [];
      const allReviewItems = [
        ...unfinished.flatMap(p => p.items.slice(p.lastPlayedIndex)),
        ...todayReviews
      ];
      const validReviewItems = allReviewItems.filter(item => videos.find(v => v.id === item.videoId));
      const seen = new Set();
      const mergedReviews = validReviewItems.filter(item => {
        if (seen.has(item.videoId)) return false;
        seen.add(item.videoId);
        return true;
      });
      setCurrentPreview({
        newVideos: [],
        reviews: mergedReviews,
        totalCount: mergedReviews.length,
        isExtraSession: false,
      });
      setShowPreview(true);
    } else {
      previewPlaylist = playlists.find(p =>
        !p.isCompleted &&
        p.playlistType === 'new' &&
        p.lastPlayedIndex < p.items.length &&
        p.isExtraSession === isExtraSession
      );
      if (previewPlaylist) {
        // 传递全部items，并加originalIndex，lastPlayedIndex
        const validItems = previewPlaylist.items
          .map((item, idx) => ({ ...item, originalIndex: idx }))
          .filter(item => videos.find(v => v.id === item.videoId));
        setCurrentPreview({
          newVideos: validItems,
          reviews: [],
          totalCount: validItems.length,
          isExtraSession: previewPlaylist.isExtraSession,
          lastPlayedIndex: previewPlaylist.lastPlayedIndex,
        });
        setShowPreview(true);
        return;
      }
      // 没有未完成新学习任务，走原有逻辑
      const preview = generateTodayPlaylist(isExtraSession);
      const validNewVideos = preview.newVideos ? preview.newVideos.filter(item => videos.find(v => v.id === item.videoId)) : [];
      // 兜底：无未完成playlist时，lastPlayedIndex为0
      const validItems = validNewVideos.map((item, idx) => ({ ...item, originalIndex: idx }));
      setCurrentPreview({
        newVideos: validItems,
        reviews: [],
        totalCount: validItems.length,
        isExtraSession: preview.isExtraSession,
        lastPlayedIndex: 0,
      });
      setShowPreview(true);
    }
  };

  const handleStartPlaylist = () => {
    // 优先复用未完成playlist
    let playlist = null;
    if (previewType === 'review') {
      playlist = playlists.find(p =>
        !p.isCompleted &&
        p.playlistType === 'review' &&
        p.lastPlayedIndex < p.items.length
      );
    } else {
      playlist = playlists.find(p =>
        !p.isCompleted &&
        p.playlistType === 'new' &&
        p.lastPlayedIndex < p.items.length &&
        p.isExtraSession === currentPreview.isExtraSession
      );
    }
    if (!playlist) {
      playlist = createTodayPlaylist(previewType, currentPreview.isExtraSession);
    }
    setCurrentPlaylist(playlist);
    setShowPreview(false);
    setShowPlayer(true);
  };

  const handleNewLearning = () => {
    // 检查是否有未完成的新学习播放列表
    const lastNewPlaylist = playlists.find(p => 
      !p.isCompleted && 
      p.playlistType === 'new' && 
      p.lastPlayedIndex < p.items.length
    );

    if (lastNewPlaylist) {
      // 过滤掉已被删除的视频
      const validItems = lastNewPlaylist.items.filter(item => videos.find(v => v.id === item.videoId));
      if (validItems.length === 0) {
        // 如果全部被删光，清除本地未完成新学习记录
        try {
          const playlistsRaw = window.localStorage.getItem('playlists');
          if (playlistsRaw) {
            const playlistsArr = JSON.parse(playlistsRaw);
            const filtered = playlistsArr.filter((p: any) => p.isCompleted || p.playlistType !== 'new');
            window.localStorage.setItem('playlists', JSON.stringify(filtered));
          }
        } catch (e) { /* ignore */ }
        alert('未完成的新学习视频已全部被删除，相关学习记录已自动清除。');
        window.location.reload();
        return;
      }
      // 继续上次的新学习也弹出预览窗口（只包含存在的视频）
      setCurrentPreview({
        ...currentPreview,
        newVideos: validItems,
        reviews: [],
        totalCount: validItems.length,
        isExtraSession: lastNewPlaylist.isExtraSession || false,
      });
      setPreviewType('new');
      setShowPreview(true);
    } else {
      // 开始新的学习
      const stats = getStats();
      handleShowPreview('new', stats.canAddExtra);
    }
  };

  // 单一“播放”按钮的处理：先触发新学习并以音频模式播放，完成后尝试自动衔接复习
  const handlePlaySequence = () => {
    const stats = getStats();

    // 每次点击 Play 按钮时，强制重新获取最新的新视频（包括新添加的）
    // 使用 forceNew=true 参数，忽略已完成的 playlist 缓存，确保新添加的视频也能播放
    const playlist = createTodayPlaylist('new', stats.canAddExtra, true);

    if (!playlist || !playlist.items || playlist.items.length === 0) {
      // 如果没有新学习项，无声地切换到复习（不显示 alert 打扰用户）
      console.log('handlePlaySequence: 无新学习任务，自动切换到复习');
      setPlayAsAudioForNew(false);
      setChainToReview(false);

      // 尝试获取或创建复习列表并直接播放
      // 优先复用未完成的复习 playlist，避免重复生成
      let reviewPlaylist = playlists.find(p =>
        !p.isCompleted && p.playlistType === 'review' && p.lastPlayedIndex < p.items.length
      );

      // 如果没有未完成的复习 playlist，强制创建新的
      if (!reviewPlaylist) {
        reviewPlaylist = createTodayPlaylist('review', false);
        console.log('handlePlaySequence: 创建新的复习列表', {
          itemCount: reviewPlaylist?.items?.length || 0,
          playlistId: reviewPlaylist?.id,
        });
      }

      if (reviewPlaylist && reviewPlaylist.items && reviewPlaylist.items.length > 0) {
        console.log('handlePlaySequence: 开始复习，项数=' + reviewPlaylist.items.length);
        setCurrentPlaylist(reviewPlaylist);
        setShowPreview(false);
        setShowPlayer(true);
      } else {
        console.warn('handlePlaySequence: 既无新学习也无复习任务');
        alert('恭喜！已完成所有复习任务。');
      }

      return;
    }

    // 设置为音频模式播放并在完成后链式触发复习
    console.log('handlePlaySequence: 开始新学习，项数=' + playlist.items.length);
    setPlayAsAudioForNew(true);
    setChainToReview(true);
    setCurrentPlaylist(playlist);
    setShowPreview(false);
    setShowPlayer(true);
  };



  const handlePlayerClose = () => {
    setShowPlayer(false);
    setCurrentPlaylist(null);
  };

  // Called when a player reports a missing/unavailable file. Non-destructive: notify and continue.
  const handleFileMissing = (videoId: string) => {
    console.warn('File missing reported for', videoId);
    setGlobalNotice('检测到视频文件缺失，已跳过该视频');
    setTimeout(() => setGlobalNotice(null), 1800);
  };

  // 当播放器在启动一定时间内无法开始播放时的回退处理（用于 single Play -> new-learning -> chain to review 场景）
  const handlePlaybackStalled = () => {
    console.warn('Playback stalled reported');
    if (chainToReview && currentPlaylist && currentPlaylist.playlistType === 'new') {
      // 取消链式标志并尝试进入复习
      setChainToReview(false);
      setPlayAsAudioForNew(false);
      setShowPlayer(false);

      const reviewPlaylist = playlists.find(p =>
        !p.isCompleted && p.playlistType === 'review' && p.lastPlayedIndex < p.items.length
      ) || createTodayPlaylist('review', false);

      if (reviewPlaylist && reviewPlaylist.items && reviewPlaylist.items.length > 0) {
        setCurrentPlaylist(reviewPlaylist);
        setShowPlayer(true);
      } else {
        alert('恭喜！已完成所有复习任务。');
      }
    } else {
      alert('播放无法开始，请尝试手动播放或检查文件。');
    }
  };

  const handlePlaylistComplete = () => {
    if (currentPlaylist) {
      updatePlaylistProgress(currentPlaylist.id, currentPlaylist.items.length, true);
      // --- 新增：同步本地playlists，确保未完成新学习被标记为已完成 ---
      try {
        const playlistsRaw = window.localStorage.getItem('playlists');
        if (playlistsRaw) {
          const playlistsArr = JSON.parse(playlistsRaw);
          const updated = playlistsArr.map((p: any) => {
            if (p.id === currentPlaylist.id) {
              return { ...p, isCompleted: true };
            }
            return p;
          });
          window.localStorage.setItem('playlists', JSON.stringify(updated));
        }
      } catch (e) { /* ignore */ }
      // --- END ---
      const message = currentPlaylist.isExtraSession 
        ? '恭喜！加餐学习任务已完成！' 
        : '恭喜！学习任务已完成！';
      alert(message);
    }
    setShowPlayer(false);
    setCurrentPlaylist(null);

    // 如果本次播放是通过单一播放按钮触发的新学习，并且需要链式复习，则直接创建并播放复习列表（音频模式）
    if (chainToReview && currentPlaylist && currentPlaylist.playlistType === 'new') {
      setChainToReview(false);
      setPlayAsAudioForNew(false);

      // 生成或获取复习playlist
      const reviewPlaylist = createTodayPlaylist('review', false);
      if (reviewPlaylist && reviewPlaylist.items && reviewPlaylist.items.length > 0) {
        // 直接开始复习播放（以音频模式）
        setCurrentPlaylist(reviewPlaylist);
        setPlayAsAudioForNew(false);
        setShowPlayer(true);
        return;
      }
    }

    // 自动衔接到新复习任务（如有），保留原有行为（显示预览）
    setTimeout(() => {
      // 检查是否还有未完成的复习任务
      const unfinishedReview = playlists.find(p =>
        !p.isCompleted &&
        p.playlistType === 'review' &&
        p.lastPlayedIndex < p.items.length
      );
      if (!unfinishedReview) {
        // 没有未完成的复习任务，尝试生成新复习任务
  const newReviews = playlists && playlists.length > 0 ? playlists.flatMap(p => p.items.filter(item => item.type === 'review')) : [];
        if (newReviews && newReviews.length > 0) {
          const preview = generateTodayPlaylist(false);
          setCurrentPreview(preview);
          setPreviewType('review');
          setShowPreview(true);
        }
      }
    }, 300);
  };

  // 如果正在加载，显示加载界面
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin text-blue-600 mx-auto mb-4" size={48} />
          <p className="text-xl text-gray-600">正在加载应用数据...</p>
        </div>
      </div>
    );
  }

  // 全局拦截：试用和授权都无效时，强制弹窗，主功能区不可用
  if (showAuthModal) {
    return (
      <>
        <AuthCodeModal
          onSuccess={() => {
            setShowAuthModal(false);
            window.location.reload();
          }}
          onClose={() => {}}
          onInfo={() => setShowInfo(true)}
        />
        {showInfo && <InfoPage onBack={() => setShowInfo(false)} />}
      </>
    );
  }

  const stats = getStats();
  // 已移除 newVideos 和 reviews 变量（不再用于学习控制栏显示）

  // 调试日志：传入 StatsCard 的数据
  console.debug('App.tsx StatsCard props:', stats);

  // （已隐藏旧入口）

  // 将内部调试入口暴露到 window，避免因未直接在 UI 中使用旧处理器而触发 lint 错误
  try {
    (window as any).__debugHandlers = { handleNewLearning, handleShowPreview };
  } catch (e) { /* ignore server-side or restricted environments */ }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12 relative">
          <div className="flex items-center justify-center mb-4">
            <Brain className="text-blue-600 mr-4" size={48} />
            <h1 className="text-4xl font-bold text-gray-800">
              智能复习系统
            </h1>
          </div>
          <p
            className="text-xl text-gray-600 max-w-3xl mx-auto"
            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif" }}
          >
            根据艾宾浩斯遗忘曲线，规划出30天内的五次复习计划，助力高效学习。
          </p>
          <button
            className="absolute right-0 top-0 flex items-center justify-center bg-blue-500 hover:bg-blue-700 text-white rounded-full shadow transition-colors"
            onClick={() => setShowInfo(true)}
            style={{ width: '2.4rem', height: '2.4rem', fontSize: '1.6rem', marginRight: 0, transform: 'scale(0.8)' }}
            aria-label="信息"
          >
            <span style={{fontWeight: 'bold'}}>i</span>
          </button>
        </div>


        {/* Main Control Panel */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            <Play className="mr-3 text-green-600" size={28} />
            学习控制
          </h2>
          <div className="flex items-center justify-center">
            <button
              onClick={handlePlaySequence}
              className="bg-indigo-600 hover:bg-indigo-700 text-white w-full md:w-2/3 px-6 py-8 rounded-xl font-semibold text-xl flex flex-col items-center transition-colors shadow-md hover:shadow-lg"
              title="播放（先新学习，完成后自动复习，均为音频输出）"
            >
              <Play size={36} className="mb-3" />
              播放
            </button>
          </div>
          {/* 播放历史 */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowHistory(true)}
              className="text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg font-medium flex items-center mx-auto transition-colors"
            >
              <History size={18} className="mr-2" />
              查看播放历史
            </button>
          </div>
        </div>

        {/* Statistics */}
        <StatsCard stats={stats} />


        {/* Collection Manager */}
        <CollectionManager
          collections={collections}
          videos={videos}
          onCreateCollection={createCollection}
          onToggleCollection={toggleCollection}
          onDeleteCollection={deleteCollection}
          onUpdateCollection={updateCollection}
        />

        {/* Video Upload */}
        <VideoUpload 
          collections={collections}
          onVideoAdd={handleVideoAdd}
          onCreateCollection={createCollection}
        />

        {/* Video Library */}
        <VideoLibrary 
          videos={videos} 
          collections={collections}
          onDelete={deleteVideo} 
        />

        {/* Empty State */}
        {videos.length === 0 && (
          <div className="text-center py-16">
            <BookOpen size={80} className="mx-auto text-gray-400 mb-6" />
            <h3 className="text-2xl font-semibold text-gray-600 mb-4">
              开始您的学习之旅
            </h3>
            <p className="text-gray-500 text-lg">
              创建合辑并上传您的第一个音视频文件，开始使用艾宾浩斯遗忘曲线进行高效学习。
            </p>
          </div>
        )}
      </div>

      {/* Playlist Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="bg-gray-800 px-6 py-4 flex justify-between items-center">
              <h3 className="text-white font-semibold text-xl">
                {previewType === 'new' && (currentPreview.isExtraSession ? '加餐学习预览' : '新学习预览')}
                {previewType === 'review' && '复习预览'}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-white hover:text-gray-300 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              <PlaylistPreview
                preview={currentPreview}
                videos={videos}
                onStartPlaylist={handleStartPlaylist}
                previewType={previewType as 'new' | 'review'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Playlist History Modal */}
      {/* 单个视频点播优先级高于历史弹窗 */}
      {/* 只显示一个弹窗，点击历史后先关闭历史再显示播放器，彻底避免遮挡 */}
      {singlePlayVideoId ? (
        <VideoPlayer
          playlist={[
            {
              videoId: singlePlayVideoId,
              reviewType: 'review',
              reviewNumber: 1,
            },
          ]}
          videos={videos}
          onClose={() => {
            setSinglePlayVideoId(null);
            setTimeout(() => setShowHistory(true), 100); // 延迟显示历史，避免重叠
          }}
          onPlaylistComplete={() => {
            setSinglePlayVideoId(null);
            setTimeout(() => setShowHistory(true), 100);
          }}
          initialIndex={0}
          isAudioMode={false}
          onFileMissing={handleFileMissing}
          onPlaybackStalled={handlePlaybackStalled}
        />
      ) : (
        showHistory && !singlePlayVideoId && (
          <PlaylistHistory
            playlists={playlists}
            videos={videos}
            onClose={() => setShowHistory(false)}
            onSinglePlay={(videoId) => {
              setShowHistory(false);
              setTimeout(() => setSinglePlayVideoId(videoId), 100); // 先关闭历史再显示播放器
            }}
          />
        )
      )}
      {/* Video Player（仅用于学习/复习流程） */}
      {showPlayer && currentPlaylist && !singlePlayVideoId && (
        <VideoPlayer
          playlist={currentPlaylist.items}
          videos={videos}
          onClose={handlePlayerClose}
          onPlaylistComplete={handlePlaylistComplete}
          initialIndex={currentPlaylist.lastPlayedIndex}
          isAudioMode={currentPlaylist.playlistType === 'review' || (currentPlaylist.playlistType === 'new' && playAsAudioForNew)}
          onProgressUpdate={handleProgressUpdate}
          onFileMissing={handleFileMissing}
          onPlaybackStalled={handlePlaybackStalled}
        />
      )}
      {/* 已移除单独播放逻辑，回退到原始状态 */}

      {/* Install Prompt */}
      <InstallPrompt />

      {/* Global transient notice for missing files */}
      {globalNotice && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-400 text-black px-4 py-2 rounded shadow">
          {globalNotice}
        </div>
      )}

      {/* Info Page Modal */}
      {showInfo && <InfoPage onBack={() => setShowInfo(false)} />}
    </div>
  );
}

export default App;