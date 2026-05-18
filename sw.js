const CACHE='pr-explorer-v7.3';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const req=e.request;if(req.mode==='navigate'||req.url.endsWith('/index.html')){e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put('./index.html',c));return r;}).catch(()=>caches.match('./index.html')));return;}e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(req.url.startsWith(self.location.origin)){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c));}return r;})).catch(()=>{}));});
