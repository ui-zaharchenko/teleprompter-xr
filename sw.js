'use strict';
const CACHE='teleprompter-shell-v10';
const BASE=self.registration.scope;
const SHELL=['./','style.css','app.js','voice.js','voice-align.js','vendor/vosk.js','vendor/vosk-worker.js','vendor/Vosk-LICENSE.txt','vendor/Vosk-NOTICE.txt','manifest.webmanifest','icon.svg','runtime.json','icon-180.png','icon-192.png','icon-512.png','docx.js','vendor/jszip.min.js','vendor/JSZip-LICENSE.txt'].map(path=>new URL(path,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('teleprompter-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 const canonical=new URL(url.pathname,url.origin).href;
 if(canonical===new URL('models/ru-small-0.22.tar.gz',BASE).href){event.respondWith(caches.open('tp-voice-ru-v1').then(cache=>cache.match(canonical)).then(cached=>cached||fetch(event.request)));return;}
 if(!SHELL.includes(canonical))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(canonical,copy)));}return response;}).catch(()=>caches.match(canonical)));
});
