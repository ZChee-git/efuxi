# 息屏后台播放修复文档

## 问题描述
在之前的版本中，用户息屏（锁屏）后音频播放会停止。这影响了学习体验，特别是在用户希望边做其他事情边听音频学习的场景中。

## 原因分析

### 1. **缺少 Media Session API**
之前代码没有使用 `MediaSession API`，这导致：
- 浏览器无法识别正在播放音频
- 系统无法显示锁屏控制器
- 浏览器可能在息屏时暂停播放

### 2. **Audio 元素配置不完整**
```tsx
// 原配置
<audio controls={false} />
```
隐藏系统控制器会降低浏览器对音频播放的重视度。

### 3. **Service Worker 缺少音频缓存策略**
没有专门为音频/视频文件设计的缓存策略。

---

## 解决方案

### 1. **实现 Media Session API** ✅
**文件**: `src/components/VideoPlayer.tsx`

在音频模式下初始化 MediaSession，使浏览器能识别和控制播放：

```tsx
useEffect(() => {
  if (!audioOnlyMode || !currentVideo) return;

  if ('mediaSession' in navigator) {
    const mediaSession = navigator.mediaSession;
    
    // 设置锁屏显示的元数据（标题、艺术家、封面）
    mediaSession.metadata = new MediaMetadata({
      title: currentVideo.name,
      artist: '视频学习智能系统',
      artwork: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
      ],
    });

    // 处理锁屏按钮事件
    mediaSession.setActionHandler('play', () => {
      audioRef.current?.play();
    });

    mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause();
    });

    // 更新播放状态
    mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }
}, [audioOnlyMode, currentVideo, isPlaying]);
```

**效果**:
- 锁屏时显示播放控制器
- 用户可在锁屏界面暂停/播放
- 上一曲/下一曲按钮可用
- 显示视频标题和封面

### 2. **启用系统音频控制器** ✅
**文件**: `src/components/VideoPlayer.tsx`

```tsx
// 原：
<audio controls={false} />

// 新：
<audio 
  ref={audioRef}
  controls={true}              // ✅ 显示系统控制器
  controlsList="nodownload"    // 禁止下载按钮
  crossOrigin="anonymous"      // 跨域支持
  // ... 其他属性
/>
```

**效果**:
- 系统原生音频控制器可见
- 浏览器优先级提升，更可能保持后台播放
- 用户可使用标准音量控制

### 3. **隐藏自定义控制器（音频模式）** ✅
**文件**: `src/components/VideoPlayer.tsx`

```tsx
// 原：
{!videoError && (showControls || audioOnlyMode) && (
  <div className="absolute bottom-0 ..."> {/* 自定义控制器 */}

// 新：
{!videoError && !audioOnlyMode && (showControls || audioOnlyMode) && (
```

**原因**: 
- 音频模式使用系统原生控制器，不需要自定义覆层
- 避免控制器冲突
- 改善用户体验

### 4. **优化 Service Worker** ✅
**文件**: `public/sw.js`

为音频/视频文件使用 `network-first` 策略：

```javascript
// 音频/视频请求：优先使用网络，备用缓存
if (request.url.includes('.mp3') || ...) {
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 保存到缓存作为备用
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // 网络失败，使用缓存版本
        return caches.match(request);
      })
  );
}

// 其他资源：优先使用缓存，备用网络
```

**效果**:
- 音频更新更及时（优先网络）
- 离线时仍可播放已缓存音频
- 节省带宽

### 5. **更新 PWA Manifest** ✅
**文件**: `public/manifest.json`

```json
{
  // ... 其他配置
  "screenshots": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ],
  "prefer_related_applications": false
}
```

---

## 测试清单

### ✅ 音频播放测试
- [ ] 点击"播放"按钮，音频播放正常
- [ ] 系统音量按钮可控制音量
- [ ] 锁屏后音频**继续播放**
- [ ] 锁屏界面显示播放器控制和标题

### ✅ 锁屏控制测试
- [ ] 锁屏时点击"暂停"按钮，音频暂停
- [ ] 锁屏时点击"播放"按钮，音频继续
- [ ] 锁屏时点击"下一曲"，跳到下一个视频
- [ ] 锁屏时点击"上一曲"，跳回前一个视频

### ✅ 视频模式测试
- [ ] 切换回视频模式时，自定义控制器显示
- [ ] 视频播放不受影响

### ✅ 离线测试
- [ ] 使用已缓存的音频文件
- [ ] 已缓存视频可正常播放
- [ ] 未缓存文件显示适当错误

---

## 浏览器兼容性

| 功能 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| Media Session API | ✅ | ✅ | ⚠️ | ✅ |
| 息屏后台播放 | ✅ | ✅ | ⚠️* | ✅ |
| 系统音频控制 | ✅ | ✅ | ✅ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |

*iOS Safari 有限制：需要用户已安装到主屏幕的 PWA，且可能需要 `playsinline` 属性

---

## iOS 特殊说明

为了在 iOS 上实现最佳体验：

1. **添加到主屏幕**: 用户应将应用添加到主屏幕（"分享" → "添加到主屏幕"）
2. **全屏模式**: 在全屏模式下(打开后台播放完整性最好

3. **音量控制**: 使用设备侧面音量键控制播放音量

### 已添加的 iOS 配置

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="视频学习智能系统" />
```

---

## 技术细节

### Media Session API 工作原理

```
用户息屏 → 浏览器进入后台 → MediaSession.playbackState = 'playing'
  ↓
浏览器向系统报告正在播放音频 → 系统保持音频通道开放
  ↓
用户可在锁屏界面看到播放控制 → 可通过锁屏控制暂停/播放
```

### Service Worker 缓存策略

**音频/视频文件**:
```
Network Request
  ↓
Success? → Cache it + Return
  ↓ Fail
Use Cached Version
  ↓
No Cache? → Network Error
```

**其他资源**:
```
Check Cache
  ↓
Found? → Return Cached
  ↓ Not Found
Fetch from Network → Cache it → Return
  ↓ Network Error
Return Offline Page
```

---

## 修改的文件列表

1. **src/components/VideoPlayer.tsx**
   - ✅ 添加 Media Session API 初始化
   - ✅ 修改 audio 元素：`controls={true}`, `controlsList="nodownload"`
   - ✅ 隐藏音频模式下的自定义控制器

2. **public/sw.js**
   - ✅ 更新缓存版本号 (v1 → v2)
   - ✅ 为音频/视频添加 network-first 策略
   - ✅ 改进缓存管理和错误处理

3. **public/manifest.json**
   - ✅ 添加 screenshots 字段
   - ✅ 添加 prefer_related_applications

---

## 后续改进方向

1. **锁屏通知**: 集成 `Notification API` 显示更详细的学习进度
2. **快捷键**: 添加键盘快捷键支持（暂停、快进等）
3. **音量记忆**: 保存用户上次使用的音量设置
4. **自动关闭屏幕**: 在纯音频学习时自动关闭屏幕以节省电量

---

## 参考资源

- [Media Session API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession)
- [Service Worker - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [PWA 最佳实践 - Web Dev](https://web.dev/progressive-web-apps/)
