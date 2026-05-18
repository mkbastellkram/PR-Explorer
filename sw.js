const CACHE='pr-explorer-v8.9';
const ASSETS=['./','./index.html?v=8.9','./style.css?v=8.9','./app.js?v=8.9','./manifest.webmanifest?v=8.9','./icon-180.png?v=8.9','./icon-192.png?v=8.9','./icon-512.png?v=8.9'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('./index.html?v=8.9')));return;} e.respondWith(fetch(r).then(res=>{const copy=res.clone(); if(r.url.startsWith(self.location.origin)) caches.open(CACHE).then(c=>c.put(r,copy)); return res;}).catch(()=>caches.match(r)));});
