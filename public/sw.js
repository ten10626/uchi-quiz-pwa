// Only cache a static navigation shell. Never cache Firebase/API requests or private game data.
const CACHE = 'uchi-quiz-shell-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => { for(const key of await caches.keys()) if(key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
 if(event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin || event.request.mode !== 'navigate') return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch{return (await cache.match(event.request)) || new Response('通信を確認して再読み込みしてください。',{headers:{'Content-Type':'text/plain;charset=utf-8'}});}})());
});
