import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, AlertCircle } from 'lucide-react';
import type { PlaylistItem, VideoFile } from '../types';
import { getVideoPlayProgress, saveVideoPlayProgress, clearVideoPlayProgress } from '../utils/authUtils';

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
  const [missingNotice, setMissingNotice] = useState<string | null>(null);
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
  const derivedAudioMode = currentVideo?.mediaType === 'audio';
  const [audioOnlyMode] = useState(isAudioMode || derivedAudioMode);
  const [userInteracted, setUserInteracted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeTime, setResumeTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSaveTimeRef = useRef<number>(0);

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
      } else {
        setShowResumePrompt(false);
        setResumeTime(0);
      }
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setVideoError(false);
      if (autoPlayRef.current && currentIndex >= initialIndex && userInteracted) {
        setTimeout(() => {
          if (!videoError && media.readyState >= 2) {
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
        }, isIOS ? 100 : 500);
      } else {
        setIsLoading(false);
      }
    };

    const handleError = (e: any) => {
      console.error('Media error:', e);
      setIsLoading(false);
      if (currentVideo) {
        try { onFileMissing && onFileMissing(currentVideo.id); } catch (err) { console.error(err); }
        setMissingNotice('媒体文件未找到，已跳过');
        setTimeout(() => { setMissingNotice(null); goToNext(); }, 1400);
      } else { setVideoError(true); }
    };

    const handleTimeUpdateLocal = () => {
      if (!media || !currentVideo) return;
      const t = media.currentTime;
      setCurrentTime(t);
      const now = Date.now();
      if (!lastSaveTimeRef.current || now - lastSaveTimeRef.current >= 5000) {
        if (t > 0) { saveVideoPlayProgress(currentVideo.id, currentVideo.name, t); lastSaveTimeRef.current = now; }
      }
    };

    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('canplay', handleCanPlay);
    media.addEventListener('error', handleError);
    media.addEventListener('timeupdate', handleTimeUpdateLocal);

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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const resumePlayback = () => {
    const m = getActiveMedia();
    if (m && resumeTime > 0) { m.currentTime = resumeTime; setCurrentTime(resumeTime); }
    setShowResumePrompt(false);
    showControlsTemporarily();
  };

  const startFromBeginning = () => {
    if (currentVideo) {
      clearVideoPlayProgress(currentVideo.id);
    }
    setShowResumePrompt(false);
    showControlsTemporarily();
  };

  const handleVideoEnded = () => {
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

  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.pushState(null, '', window.location.href);
    }
    onClose();
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

  if (!currentVideo) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 text-center max-w-sm mx-4">
          <p className="text-xl text-gray-800 mb-4">视频文件未找到</p>
          <button
            onClick={handleClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="relative w-full h-full">
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
            
            {/* 断点续播提示 */}
            {showResumePrompt && (
              <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-20">
                <div className="bg-white rounded-lg p-6 max-w-md mx-4 text-center">
                  <h3 className="text-lg font-semibold mb-4 text-gray-800">断点续播</h3>
                  <p className="text-gray-600 mb-6">
                    检测到上次播放进度：{formatTime(resumeTime)}
                  </p>
                  <div className="flex space-x-4">
                    <button
                      onClick={resumePlayback}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      继续播放
                    </button>
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
                  <h2 className="text-2xl font-bold mb-2">{currentVideo.name}</h2>
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
        
        {/* Transient missing-file notice (non-blocking) */}
        {missingNotice && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-400 text-black px-4 py-2 rounded shadow">
            {missingNotice}
          </div>
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
            <div className="flex items-center justify-center space-x-8">
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