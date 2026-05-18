const CACHE='pr-explorer-v7.0';
const ASSETS=['./','./index.html?v=7.0','./manifest.webmanifest?v=7.0','./icon-180.png?v=7.0','./icon-192.png?v=7.0','./icon-512.png?v=7.0'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(req.mode==='navigate'||url.pathname.endsWith('/index.html')){e.respondWith(fetch(req,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html?v=7.0',copy));return r;}).catch(()=>caches.match('./index.html?v=7.0').then(r=>r||caches.match('./'))));return;}e.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(r=>{if(url.origin===location.origin){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return r;})));});
