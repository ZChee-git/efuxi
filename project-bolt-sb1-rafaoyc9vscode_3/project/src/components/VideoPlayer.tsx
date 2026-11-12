import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, AlertCircle } from 'lucide-react';
import type { PlaylistItem, VideoFile } from '../types';
import { getVideoPlayProgress, saveVideoPlayProgress, clearVideoPlayProgress, addTodayPlaySeconds } from '../utils/authUtils';

interface VideoPlayerProps {
  playlist: PlaylistItem[];
  videos: VideoFile[];
  onClose: () => void;
  onPlaylistComplete: () => void;
  initialIndex?: number;
  isAudioMode?: boolean; // 新增：是否为音频模式
  onProgressUpdate?: (index: number) => void; // 新增：断点续播进度回传
  onFileMissing?: (videoId: string) => void;
  onPlaybackStalled?: () => void; // 当播放在指定时间内未能开始时回调
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playlist,
  videos,
  onClose,
  onPlaylistComplete,
  initialIndex = 0,
  isAudioMode = false,
  onProgressUpdate,
  onFileMissing,
  onPlaybackStalled,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // 每次currentIndex变化时，回传进度
  useEffect(() => {
    if (onProgressUpdate) {
      onProgressUpdate(currentIndex);
    }
  }, [currentIndex, onProgressUpdate]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const startTimeoutRef = useRef<number | null>(null);
  const currentItem = playlist[currentIndex];
  const currentVideo = videos.find(v => v.id === currentItem?.videoId);

  // 复习进度和计划日期显示
  let reviewProgressText = '';
  let firstPlayDateText = '';
  if (currentItem) {
    if (currentItem.reviewType === 'review' && typeof currentItem.reviewNumber === 'number') {
      reviewProgressText = `第${currentItem.reviewNumber}/5次复习`;
    } else if (currentItem.reviewType === 'new') {
      reviewProgressText = '第1/5次复习';
    }
    if (currentVideo && currentVideo.firstPlayDate) {
      const d = new Date(currentVideo.firstPlayDate);
      firstPlayDateText = `首播日期 ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
  }
  const derivedAudioMode = currentVideo?.mediaType === 'audio';
  const [audioOnlyMode] = useState(isAudioMode || derivedAudioMode);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState(5);
  const resumeTimerRef = useRef<number | null>(null);
  // 清理定时器，防止内存泄漏
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearInterval(resumeTimerRef.current!);
    };
  }, []);
  const [resumeTime, setResumeTime] = useState(0);
  const [missingNotice, setMissingNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const lastGlobalPlaySecondsRef = useRef<number>(0); // 新增：累计本次视频已统计的秒数
  // 锁屏续播修复：用 timeupdate 预判结束，避免依赖锁屏下不可靠的 ended / setTimeout
  const advancingRef = useRef(false); // 防止同一集被重复切走
  const mediaSessionInitRef = useRef(false); // MediaSession 只初始化一次

  // 使用 useRef 来避免 autoPlay 状态导致的重新渲染
  const autoPlayRef = useRef(true);

  // 检测设备和浏览器
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  // 监听用户交互
  useEffect(() => {
    const handleUserInteraction = () => {
      setUserInteracted(true);
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };

    document.addEventListener('touchstart', handleUserInteraction);
    document.addEventListener('click', handleUserInteraction);

    return () => {
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };
  }, []);
  useEffect(() => {
    // unified media setup for audio or video element
    const media: HTMLMediaElement | null = (audioOnlyMode ? audioRef.current : videoRef.current);
    if (!media || !currentVideo) return;

    setVideoError(false);
    setIsLoading(true);
    setRetryCount(0);

    try { media.src = ''; media.load(); } catch (e) { /* ignore */ }
    media.src = currentVideo.fileUrl;

    if (!audioOnlyMode && videoRef.current) {
      const v = videoRef.current;
      if (isIOS && isSafari) {
        v.playsInline = true;
        v.muted = false;
        v.preload = 'auto';
      } else {
        v.preload = 'metadata';
      }
      v.style.display = 'block';
    }
    if (audioOnlyMode && audioRef.current) {
      audioRef.current.preload = 'auto';
    }

    const handleLoadedMetadata = () => {
      setIsLoading(false);
      setDuration(media.duration || 0);
      lastSaveTimeRef.current = 0;

      const savedProgress = getVideoPlayProgress(currentVideo.id);
      if (savedProgress > 10 && savedProgress < (media.duration || 0) - 10) {
        setResumeTime(savedProgress);
        setShowResumePrompt(true);
  setResumeCountdown(5);
        if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
        resumeTimerRef.current = setInterval(() => {
          setResumeCountdown(prev => {
            if (prev <= 1) {
              setShowResumePrompt(false);
              if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        // 自动跳转到断点并自动播放
        try {
          media.currentTime = savedProgress;
          const playPromise = media.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
        } catch (e) { /* ignore */ }
      } else {
        setShowResumePrompt(false);
        setResumeTime(0);
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setVideoError(false);
      if (autoPlayRef.current && currentIndex >= initialIndex && userInteracted) {
        // 锁屏续播修复：canplay 里同步直接 play()，不再用 setTimeout（锁屏下定时器会被冻结）
        if (media.readyState >= 2) {
          const playPromise = media.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log('Auto-play successful');
              if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
            }).catch(error => {
              console.log('Auto-play failed, user interaction required:', error);
              if (!isIOS) setIsLoading(false);
            });
          }
        }
      } else {
        setIsLoading(false);
      }
    };

    const handleError = (e: any) => {
      console.error('Media error:', e);
      setIsLoading(false);
      if (currentVideo) {
        try { onFileMissing && onFileMissing(currentVideo.id); } catch (err) { console.error(err); }
        // 文件缺失（用户删除）时，无声地跳过到下一个视频，不显示提示
        setTimeout(() => { goToNext(); }, 100);
      } else { setVideoError(true); }
    };

    // 全局累计播放时长
  // let lastGlobalTime = 0;
    const handleTimeUpdateLocal = () => {
      if (!media || !currentVideo) return;
      const t = media.currentTime;
      setCurrentTime(t);

      // 锁屏续播修复：用 timeupdate 预判「快播完」，提前切下一集。
      // iOS 锁屏下 ended 可能不派发、setTimeout 冻结，但 timeupdate 只要在播就持续触发，
      // 因此在这里提前接下一集，能让音频从头到尾不断链，无需向系统申请全新的无手势 play()。
      const dur = media.duration;
      if (
        !advancingRef.current &&
        dur &&
        dur > 0 &&
        t >= dur - 0.5 &&
        currentIndex < playlist.length - 1
      ) {
        advancingRef.current = true;
        // 同步结束统计与清理，再切换
        const played = Math.floor(dur);
        if (played > 0 && played > lastGlobalPlaySecondsRef.current) {
          let total = parseInt(localStorage.getItem('globalTotalPlaySeconds') || '0', 10);
          total += played - lastGlobalPlaySecondsRef.current;
          localStorage.setItem('globalTotalPlaySeconds', total.toString());
          lastGlobalPlaySecondsRef.current = played;
        }
        saveVideoPlayProgress(currentVideo.id, currentVideo.name, played);
        clearVideoPlayProgress(currentVideo.id);
        goToNext();
        return;
      }

      const now = Date.now();
      // 每5秒保存断点并累计播放时长
      if (!lastSaveTimeRef.current || now - lastSaveTimeRef.current >= 5000) {
        if (t > 0) {
          saveVideoPlayProgress(currentVideo.id, currentVideo.name, t);
          lastSaveTimeRef.current = now;
          // 只累计本次新增的播放时长
          const delta = Math.floor(t - lastGlobalPlaySecondsRef.current);
          if (delta > 0) {
            let total = parseInt(localStorage.getItem('globalTotalPlaySeconds') || '0', 10);
            total += delta;
            localStorage.setItem('globalTotalPlaySeconds', total.toString());
            lastGlobalPlaySecondsRef.current = Math.floor(t);
            // 累加到今日学习时长
            addTodayPlaySeconds(delta);
          }
        }
      }
    };

    // 播放完成时累加全局播放时长
    const handleEnded = () => {
      if (!media || !currentVideo) return;
      // 锁屏续播修复：若已由 timeupdate 预判推进，则不重复统计
      if (advancingRef.current) return;
      const played = Math.floor(media.currentTime || 0);
      // 补充统计最后一次 timeupdate 到结束之间的时长
      if (played > 0 && played > lastGlobalPlaySecondsRef.current) {
        let total = parseInt(localStorage.getItem('globalTotalPlaySeconds') || '0', 10);
        total += played - lastGlobalPlaySecondsRef.current;
        localStorage.setItem('globalTotalPlaySeconds', total.toString());
        lastGlobalPlaySecondsRef.current = played;
      }
      // 修复：播放结束时补充保存完整播放进度到 videoPlayHistory
      saveVideoPlayProgress(currentVideo.id, currentVideo.name, played);
      // 补充：播放结束时累加最后一次播放时长到今日学习时长
      const delta = played - lastGlobalPlaySecondsRef.current;
      if (delta > 0) {
        addTodayPlaySeconds(delta);
      }
    };

    media.addEventListener('loadedmetadata', handleLoadedMetadata);
  media.addEventListener('canplay', handleCanPlay);
  media.addEventListener('error', handleError);
  media.addEventListener('timeupdate', handleTimeUpdateLocal);
  media.addEventListener('ended', handleEnded);

    // 锁屏续播修复：每次切集后复位「推进中」标记，让下一集又能正常预判结束
    advancingRef.current = false;
    // 锁屏续播修复：更新 MediaSession metadata，让锁屏界面显示当前条目与封面
    try {
      const ms = (navigator as any).mediaSession;
      if (ms && currentVideo) {
        ms.metadata = new (window as any).MediaMetadata({
          title: currentVideo.name,
          artist: '后排座复习系统',
          album: reviewProgressText || '复习',
        });
      }
    } catch (e) { /* ignore */ }

    const START_WAIT_MS = 30000;
    if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); }
    startTimeoutRef.current = window.setTimeout(() => {
      if (!media || !isPlaying) {
        console.warn('Playback did not start within timeout');
        try { onPlaybackStalled && onPlaybackStalled(); } catch (e) { console.error(e); }
      }
    }, START_WAIT_MS);

    return () => {
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('canplay', handleCanPlay);
      media.removeEventListener('error', handleError);
      media.removeEventListener('timeupdate', handleTimeUpdateLocal);
      if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
    };
  }, [currentIndex, currentVideo, audioOnlyMode, userInteracted]);

  const showControlsTemporarily = () => {
    setShowControls(true);
    // reuse hideControlsAfterDelay defined later
    hideControlsAfterDelay();
  };

  const hideControlsAfterDelay = () => {
    // 在音频模式下常显控制，直接保持显示
    if (audioOnlyMode) {
      if (controlsTimeout) { clearTimeout(controlsTimeout); }
      setShowControls(true);
      return;
    }
    if (controlsTimeout) { clearTimeout(controlsTimeout); }
    const timeout = window.setTimeout(() => { setShowControls(false); }, 3000);
    setControlsTimeout(timeout);
  };
  const getActiveMedia = () => (audioOnlyMode ? audioRef.current : videoRef.current);

  const togglePlay = () => {
    const m = getActiveMedia();
    if (!m) return;
    if (isPlaying) {
      m.pause();
    } else {
      const playPromise = m.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
      if (startTimeoutRef.current) { clearTimeout(startTimeoutRef.current); startTimeoutRef.current = null; }
    }
    showControlsTemporarily();
  };

  const handleTimeUpdate = () => {
    const m = getActiveMedia();
    if (!m || !currentVideo) return;
    const currentTime = m.currentTime;
    setCurrentTime(currentTime);
    const now = Date.now();
    if (!lastSaveTimeRef.current || now - lastSaveTimeRef.current >= 5000) {
      if (currentTime > 0) { saveVideoPlayProgress(currentVideo.id, currentVideo.name, currentTime); lastSaveTimeRef.current = now; }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const m = getActiveMedia();
    if (m) { m.currentTime = time; setCurrentTime(time); }
  };

  // 恢复前进/后退与时间格式化函数
  const goToNext = () => {
    // 清除当前视频的播放进度
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlaying(false);
      setVideoError(false);
    } else {
      onPlaylistComplete();
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(false);
      setVideoError(false);
    }
  };

  // 锁屏续播修复：MediaSession 保活 —— 挂上系统级播控与 metadata，让媒体会话在锁屏后不散
  useEffect(() => {
    if (mediaSessionInitRef.current || !('mediaSession' in navigator)) return;
    mediaSessionInitRef.current = true;
    try {
      const ms = (navigator as any).mediaSession;
      if (!ms) return;
      ms.setActionHandler('play', () => {
        const m = getActiveMedia();
        if (m) { const p = m.play(); if (p !== undefined) p.catch(() => {}); }
      });
      ms.setActionHandler('pause', () => {
        const m = getActiveMedia();
        if (m) m.pause();
      });
      ms.setActionHandler('nexttrack', () => goToNext());
      ms.setActionHandler('previoustrack', () => goToPrevious());
      ms.setActionHandler('seekto', (details: any) => {
        const m = getActiveMedia();
        if (m && details && typeof details.seekTime === 'number') {
          m.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      });
    } catch (e) { /* ignore */ }
  }, []); // 仅挂载时初始化一次；回调通过闭包引用最新渲染的函数引用

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const resumePlayback = () => {
    const m = getActiveMedia();
    if (m && resumeTime > 0) { m.currentTime = resumeTime; setCurrentTime(resumeTime); }
    setShowResumePrompt(false);
    if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
    showControlsTemporarily();
  };

  const startFromBeginning = () => {
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    setShowResumePrompt(false);
    if (resumeTimerRef.current) clearInterval(resumeTimerRef.current);
    const m = getActiveMedia();
    if (m) { m.currentTime = 0; setCurrentTime(0); }
    showControlsTemporarily();
  };

  const handleVideoEnded = () => {
    // 锁屏续播修复：若已由 timeupdate 预判推进，则不重复处理
    if (advancingRef.current) return;
    advancingRef.current = true;
    // 清除当前视频的播放进度（播放完成）
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    
    if (autoPlayRef.current && currentIndex < playlist.length - 1) {
      goToNext();
    } else if (currentIndex >= playlist.length - 1) {
      onPlaylistComplete();
    }
  };

  const retryVideo = () => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      setVideoError(false);
      setIsLoading(true);
      
      const m = getActiveMedia();
      if (m && currentVideo) {
        m.src = '';
        m.load();
        m.src = currentVideo.fileUrl;
        setTimeout(() => {
          if (m.readyState >= 2) {
            const playPromise = m.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error('Retry play failed:', error);
                setVideoError(true);
                setIsLoading(false);
              });
            }
          }
        }, 1000);
      }
    } else {
      alert('视频加载失败次数过多，请检查文件是否损坏');
    }
  };

  // 监听浏览器返回按钮
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      onClose();
    };

    // 只在组件挂载时推送历史状态
    window.history.pushState({ modal: 'video-player' }, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []); // 移除 onClose 依赖，避免循环

  // 当 currentVideo 不存在（例如用户已删除该视频）时，做非阻塞的提示并自动跳过
  useEffect(() => {
    if (currentVideo) return; // 有视频则无事

    const missingId = currentItem?.videoId;
    // 通知上层该文件缺失（上层可用于清理 playlist）
    try { onFileMissing && onFileMissing(missingId as string); } catch (e) { console.error(e); }

    // 显示短暂通知并自动跳过到下一条或结束播放列表
    setMissingNotice('视频文件未找到，已跳过');
    const t = window.setTimeout(() => {
      setMissingNotice(null);
      if (currentIndex < playlist.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setIsPlaying(false);
        setVideoError(false);
      } else {
        onPlaylistComplete();
      }
    }, 1200);

    return () => { clearTimeout(t); };
  }, [currentVideo]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="relative w-full h-full">
        {/* 复习进度和原计划复习日期合并一行显示 */}
        {(reviewProgressText || firstPlayDateText) && (
          <div style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 12,
            padding: '12px 28px',
            fontWeight: 600,
            fontSize: '1.1rem',
            color: '#1e293b',
            boxShadow: '0 2px 8px rgba(30,41,59,0.08)',
            zIndex: 50,
            minWidth: 220,
            textAlign: 'center',
            lineHeight: 1.6
          }}>
            <div>{reviewProgressText}</div>
            {firstPlayDateText && <div style={{color: '#64748b', fontWeight: 400, fontSize: '1rem'}}>{firstPlayDateText}</div>}
          </div>
        )}
        {/* Video/Audio Display */}
        {videoError ? (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <div className="text-center text-white p-4">
              <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
              <p className="text-lg mb-2">视频加载失败</p>
              <p className="text-sm text-gray-300 mb-4">
                重试次数: {retryCount}/3
              </p>
              <div className="space-y-2">
                <button
                  onClick={retryVideo}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg mr-2"
                  disabled={retryCount >= 3}
                >
                  {retryCount >= 3 ? '重试次数已用完' : '重试'}
                </button>
                <button
                  onClick={goToNext}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                  disabled={currentIndex >= playlist.length - 1}
                >
                  跳过此视频
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {isLoading && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p>正在加载视频...</p>
                </div>
              </div>
            )}
            {/* transient missing-file notice */}
            {missingNotice && (
              <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-400 text-black px-4 py-2 rounded shadow">
                {missingNotice}
              </div>
            )}
            
            {/* 断点续播提示 */}
            {showResumePrompt && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-20">
                <div className="bg-white rounded-lg p-6 max-w-md mx-4 text-center">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800">断点续播</h3>
                  <p className="text-gray-600 mb-4">
                    检测到上次播放进度：{formatTime(resumeTime)}
                  </p>
                  <p className="text-sm text-gray-400 mb-6">{resumeCountdown} 秒后自动消失，视频已自动续播</p>
                  <div className="flex space-x-4">
                    <button
                      onClick={startFromBeginning}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      从头开始
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* 音频模式显示 */}
            {audioOnlyMode && (
              <div
                className="w-full h-full bg-gradient-to-br from-yellow-900 to-yellow-700 flex items-center justify-center"
                onClick={showControlsTemporarily}
                onTouchStart={showControlsTemporarily}
              >
                <div
                  className="text-center text-white p-8"
                  onClick={showControlsTemporarily}
                  onTouchStart={showControlsTemporarily}
                >
                  <div className="text-6xl mb-6">🎵</div>
                  <h2 className="text-2xl font-bold mb-2" style={{
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    position: 'relative',
                    width: '100%',
                    display: 'block',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      minWidth: '100%',
                      animation: 'marquee 8s linear infinite',
                    }}>{currentVideo?.name}</span>
                  </h2>
                  <p className="text-yellow-200 mb-4">音频复习模式</p>
                </div>
              </div>
            )}
            
            <audio
              ref={audioRef}
              className={`w-full ${audioOnlyMode ? 'block' : 'hidden'}`}
              onPlay={() => { setIsPlaying(true); hideControlsAfterDelay(); }}
              onPause={() => { setIsPlaying(false); setShowControls(true); if (controlsTimeout) { clearTimeout(controlsTimeout); } }}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
              onClick={showControlsTemporarily}
              onTouchStart={showControlsTemporarily}
              controls={false}
            />

            <video
              ref={videoRef}
              className={`w-full h-full bg-black ${audioOnlyMode ? 'hidden' : 'block'}`}
              onPlay={() => { setIsPlaying(true); hideControlsAfterDelay(); }}
              onPause={() => { setIsPlaying(false); setShowControls(true); if (controlsTimeout) { clearTimeout(controlsTimeout); } }}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleTimeUpdate}
              onClick={showControlsTemporarily}
              onTouchStart={showControlsTemporarily}
              playsInline={true}
              controls={false}
              style={{ objectFit: 'contain' }}
            />
          </>
        )}

        {/* Controls Overlay - 音频模式下常显 */}
        {!videoError && (showControls || audioOnlyMode) && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
            {/* Progress Bar */}
            <div className="mb-6">
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-white text-sm mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
            
            {/* Control Buttons - 3倍大小 */}
            <div className="flex items-center justify-center space-x-8 controls-bar">
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipBack size={54} />
              </button>
              
              <button
                onClick={togglePlay}
                className="bg-white/20 text-white p-6 rounded-full hover:bg-white/30 transition-all"
                disabled={isLoading}
              >
                {isPlaying ? <Pause size={60} /> : <Play size={60} />}
              </button>
              
              <button
                onClick={goToNext}
                disabled={currentIndex === playlist.length - 1}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SkipForward size={54} />
              </button>
              
              <button
                onClick={onClose}
                className="text-white p-4 rounded-full hover:bg-white/20 transition-all"
              >
                <X size={54} />
              </button>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .controls-bar {
          padding-left: max(16px, env(safe-area-inset-left));
          padding-right: max(16px, env(safe-area-inset-right));
          padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
          box-sizing: border-box;
        }
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};