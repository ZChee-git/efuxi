// 授权相关工具函数
// 记录localStorage键名
const FIRST_USE_KEY = 'firstUseDate';
const AUTH_KEY = 'authInfo';

// 播放历史相关
const VIDEO_HISTORY_KEY = 'videoPlayHistory';

export interface VideoHistoryItem {
  videoId: string;
  title: string;
  lastPlayedTime: number; // 秒
  lastPlayedDate: number; // 时间戳
}

// 获取全部播放历史（按最近播放排序，最新在前）
export function getVideoPlayHistory(): VideoHistoryItem[] {
  const raw = localStorage.getItem(VIDEO_HISTORY_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr;
    }
    return [];
  } catch {
    return [];
  }
}

// 添加或更新某个视频的播放历史
export function saveVideoPlayHistory(item: VideoHistoryItem) {
  let history = getVideoPlayHistory();
  // 移除同id
  history = history.filter(h => h.videoId !== item.videoId);
  // 插入到最前
  history.unshift(item);
  // 限制最大条数（如100条）
  if (history.length > 100) history = history.slice(0, 100);
  localStorage.setItem(VIDEO_HISTORY_KEY, JSON.stringify(history));
}

// 获取单个视频的播放进度
export function getVideoPlayProgress(videoId: string): number {
  const history = getVideoPlayHistory();
  const item = history.find(h => h.videoId === videoId);
  const progress = item?.lastPlayedTime || 0;
  console.log(`[authUtils] 获取播放进度 - videoId: ${videoId}, progress: ${progress}秒`);
  return progress;
}

// 保存单个视频的播放进度
export function saveVideoPlayProgress(videoId: string, title: string, currentTime: number) {
  console.log(`[authUtils] 保存播放进度 - videoId: ${videoId}, title: ${title}, time: ${currentTime.toFixed(1)}秒`);
  saveVideoPlayHistory({
    videoId,
    title,
    lastPlayedTime: currentTime,
    lastPlayedDate: Date.now()
  });
}

// 清除单个视频的播放进度（播放完成时调用）
export function clearVideoPlayProgress(videoId: string) {
  console.log(`[authUtils] 清除播放进度 - videoId: ${videoId}`);
  let history = getVideoPlayHistory();
  history = history.filter(h => h.videoId !== videoId);
  localStorage.setItem(VIDEO_HISTORY_KEY, JSON.stringify(history));
}

// 清空播放历史
export function clearVideoPlayHistory() {
  localStorage.removeItem(VIDEO_HISTORY_KEY);
}

// 获取首次使用时间，没有则写入当前时间
export function getOrSetFirstUseDate(): number {
  let date = localStorage.getItem(FIRST_USE_KEY);
  if (!date) {
    date = Date.now().toString();
    localStorage.setItem(FIRST_USE_KEY, date);
  }
  return Number(date);
}

// 获取授权信息
export function getAuthInfo(): { code: string; date: number } | null {
  const info = localStorage.getItem(AUTH_KEY);
  if (!info) return null;
  try {
    return JSON.parse(info);
  } catch {
    return null;
  }
}

// 设置授权信息
export function setAuthInfo(code: string) {
  localStorage.setItem(
    AUTH_KEY,
    JSON.stringify({ code, date: Date.now() })
  );
}

// 清除授权信息
export function clearAuthInfo() {
  localStorage.removeItem(AUTH_KEY);
}

// 判断是否在试用期内（30天）
export function isTrialValid(): boolean {
  const first = getOrSetFirstUseDate();
  return Date.now() - first < 30 * 24 * 60 * 60 * 1000;
}

// 判断授权是否有效（一年）
export function isAuthValid(): boolean {
  const info = getAuthInfo();
  if (!info) return false;
  return Date.now() - info.date < 365 * 24 * 60 * 60 * 1000;
}

// 校验授权码（19位或28位数字）
export function isValidAuthCode(code: string): boolean {
  return /^\d{19}$|^\d{28}$/.test(code);
}
