'use strict';
const CACHE='teleprompter-shell-v5';
const BASE=self.registration.scope;
const SHELL=['./','style.css','app.js','manifest.webmanifest','icon.svg','runtime.json','icon-180.png','icon-192.png','icon-512.png','docx.js','vendor/jszip.min.js','vendor/JSZip-LICENSE.txt'].map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('teleprompter-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 const canonical=new URL(url.pathname,url.origin).href;
 if(!SHELL.includes(canonical))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(canonical,copy)));}return response;}).catch(()=>caches.match(canonical)));
});
