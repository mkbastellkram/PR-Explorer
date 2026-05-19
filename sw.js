const CACHE='pr-explorer-v9.0';
const ASSETS=['./','./index.html?v=9.0','./style.css?v=9.0','./app.js?v=9.0','./manifest.webmanifest?v=9.0','./icon-180.png?v=9.0','./icon-192.png?v=9.0','./icon-512.png?v=9.0'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('./index.html?v=9.0')));return;} e.respondWith(fetch(r).then(res=>{const copy=res.clone(); if(r.url.startsWith(self.location.origin)) caches.open(CACHE).then(c=>c.put(r,copy)); return res;}).catch(()=>caches.match(r)));});
