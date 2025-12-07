const CACHE_NAME = 'ebbinghaus-video-v2';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // 对于音频/视频请求，使用 network-first 策略确保最新内容
  if (request.url.includes('.mp3') || 
      request.url.includes('.wav') || 
      request.url.includes('.m4a') ||
      request.url.includes('.mp4') ||
      request.url.includes('.webm')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 响应成功，缓存备用
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // 网络失败，使用缓存
          return caches.match(request);
        })
    );
  } else {
    // 其他资源使用 cache-first 策略
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(request)
            .then((response) => {
              // 只缓存成功的响应
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
              return response;
            });
        })
        .catch(() => {
          // 离线回退
          return caches.match('/');
        })
    );
  }
});

// 更新 Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});