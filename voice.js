'use strict';
(()=>{
 const el=id=>document.getElementById(id),modelURL=new URL('models/ru-small-0.22.tar.gz',location.href).href,CACHE='tp-voice-ru-v1';
 let cached=false,downloading=false,generation=0,busy=false,model=null,recognizer=null,stream=null,context=null,source=null,processor=null,gain=null,watchdog=null,words=[],spans=[],cursor=0,loadingScript=null,cancelLoad=null,pendingAudio=0;
 const notice=(text,error=false)=>{el('voiceMessage').textContent=bindRussian(text);el('voiceMessage').classList.toggle('error',error);};
 const state=text=>{el('voiceState').textContent=bindRussian(text);};
 function buttons(){el('voiceDownload').disabled=downloading||cached||!isSecureContext||!('caches' in window)||!('serviceWorker' in navigator);el('voiceDownload').textContent=cached?'Модель сохранена':downloading?'Загрузка…':'Загрузить модель';el('voiceStart').disabled=!cached||!active||busy||!isSecureContext||!navigator.mediaDevices?.getUserMedia;}
 async function checkCache(){try{cached=!!await (await caches.open(CACHE)).match(modelURL);}catch{cached=false;}buttons();}
 function stop(){
  generation++;busy=false;pendingAudio=0;cancelLoad?.();cancelLoad=null;clearTimeout(watchdog);watchdog=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  if(processor){processor.onaudioprocess=null;processor.disconnect();}processor=null;
  source?.disconnect();source=null;gain?.disconnect();gain=null;
  if(context)context.close().catch(()=>{});context=null;
  try{recognizer?.remove();model?.terminate();model?.worker?.terminate();}catch{}recognizer=null;model=null;
  el('voiceState').hidden=true;el('openVoice').textContent='Голос';el('play').textContent='Старт';buttons();
 }
 window.teleVoice={stop,get busy(){return busy;}};
 function wrapWords(){
  // Unwrap a previous session; keep original rich-text elements and whitespace.
  el('script').querySelectorAll('[data-voice-word]').forEach(s=>s.replaceWith(document.createTextNode(s.textContent)));
  el('script').normalize();words=[];spans=[];
  const walker=document.createTreeWalker(el('script'),NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.list-marker')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){const text=node.textContent,re=/[а-яёa-z0-9]+/gi,fragment=document.createDocumentFragment();let last=0,m;
   while((m=re.exec(text))){fragment.append(text.slice(last,m.index));const span=document.createElement('span');span.dataset.voiceWord=String(spans.length);span.textContent=m[0];fragment.append(span);spans.push(span);words.push(TeleVoiceAlign.tokens(m[0])[0]);last=re.lastIndex;}
   fragment.append(text.slice(last));node.replaceWith(fragment);
  }
  const marker=viewport.getBoundingClientRect().top+viewport.clientHeight*.28;
  cursor=spans.findIndex(s=>s.getBoundingClientRect().bottom>=marker);if(cursor<0)cursor=0;
 }
 function heard(text){
  if(!busy)return;
  el('voiceHeard').textContent=bindRussian(text?'Услышано: '+text:'');
  const matched=TeleVoiceAlign.match(words,text,cursor);
  if(!matched){state('Пауза: ждём совпадения');return;}
  cursor=matched.end;
  // No timer-driven advance or lingering scroll animation after a mismatch.
  const next=spans[Math.min(cursor,spans.length-1)],rect=viewport.getBoundingClientRect();
  const delta=next.getBoundingClientRect().top-rect.top-viewport.clientHeight*.28;
  if(delta>2)viewport.scrollTop+=delta;
  progress();state('Голос: читаем сценарий');clearTimeout(watchdog);
  watchdog=setTimeout(()=>state('Пауза: ждём речь'),1500);
  if(cursor>=words.length){pause();notice('Сценарий прочитан. Микрофон выключен.');}
 }
 async function loadLibrary(){
  if(window.Vosk)return;
  if(!loadingScript)loadingScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/vosk.js';script.onload=resolve;script.onerror=()=>{script.remove();loadingScript=null;reject(new Error('Библиотека недоступна. Откройте приложение с интернетом.'));};document.head.append(script);});
  await loadingScript;
 }
 el('openVoice').onclick=async()=>{pause();el('voiceDialog').showModal();await checkCache();notice(!isSecureContext?'Микрофон доступен по HTTPS. Локальный адрес Mac на iPhone не подходит.':!active?'Сначала выберите и сохраните сценарий.':cached?'Модель готова. Можно включить микрофон.':'Сначала загрузите русскую модель.');};
 el('closeVoice').onclick=()=>{if(busy)pause();el('voiceDialog').close();};
 el('voiceDialog').addEventListener('cancel',()=>{if(busy)pause();});
 el('voiceDownload').onclick=async()=>{
  downloading=true;buttons();notice('Загружаем 46 МБ. Оставьте приложение открытым.');
  try{
   await navigator.serviceWorker.ready;
   const response=await fetch(modelURL);if(!response.ok)throw new Error('Не удалось загрузить модель. Проверьте интернет.');
   if(response.headers.get('Content-Length')&&Number(response.headers.get('Content-Length'))!==46105767)throw new Error('Получена неполная модель. Повторите загрузку.');
   const bytes=await response.arrayBuffer();if(bytes.byteLength!==46105767)throw new Error('Получена неполная модель. Повторите загрузку.');
   await (await caches.open(CACHE)).put(modelURL,new Response(bytes,{headers:{'Content-Type':'application/gzip'}}));
   cached=true;notice('Модель сохранена. Теперь можно работать без сети.');
  }catch(e){notice(e.message||'Не хватает места для модели. Освободите место и повторите загрузку.',true);}
  finally{downloading=false;buttons();}
 };
 el('voiceStart').onclick=async()=>{
  pause();busy=true;const session=++generation;buttons();notice('Подготавливаем распознавание…');
  let pendingModel=null;
  try{
   // Safari requires creating/resuming AudioContext inside the user's tap.
   context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();
   await loadLibrary();if(session!==generation)return;
   pendingModel=new Vosk.Model(modelURL,-1);model=pendingModel;
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('Модель не запустилась за 90 секунд. Попробуйте снова.')),90000);function finish(error){clearTimeout(timer);cancelLoad=null;error?reject(error):resolve();}cancelLoad=()=>finish(new Error('Запуск отменён.'));pendingModel.on('load',m=>finish(m.result?null:new Error('Не удалось открыть модель.')));pendingModel.on('error',()=>finish(new Error('Ошибка загрузки модели.')));pendingModel.worker.addEventListener('error',()=>finish(new Error('Движок распознавания не запустился. Повторите попытку.')));});
   if(session!==generation)return;
   notice('Разрешите доступ к микрофону.');const mic=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:true},video:false});
   if(session!==generation){mic.getTracks().forEach(t=>t.stop());return;}stream=mic;
   wrapWords();recognizer=new model.KaldiRecognizer(context.sampleRate);
   const receive=text=>{if(session!==generation)return;pendingAudio=Math.max(0,pendingAudio-1);heard(text);};recognizer.on('partialresult',m=>receive(m.result.partial));recognizer.on('result',m=>receive(m.result.text));recognizer.on('error',()=>{if(session===generation){pause();notice('Ошибка распознавания. Микрофон выключен.',true);}});
   model.on('error',()=>{if(session===generation){pause();notice('Ошибка распознавания. Микрофон выключен.',true);}});
   stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(session===generation){pause();notice('Микрофон отключён. Повторите запуск.',true);}}));
   source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(4096,1,1);gain=context.createGain();gain.gain.value=0;
   processor.onaudioprocess=e=>{if(session!==generation||!recognizer)return;if(pendingAudio>=8){pause();notice('Устройство не успевает распознавать речь. Микрофон выключен; используйте обычную прокрутку.',true);return;}try{pendingAudio++;recognizer.acceptWaveform(e.inputBuffer);}catch{pause();notice('Не удалось обработать звук. Микрофон выключен.',true);}};source.connect(processor);processor.connect(gain);gain.connect(context.destination);
   el('voiceState').hidden=false;state('Голос: ждём речь');el('openVoice').textContent='Микрофон';el('play').textContent='Пауза';keepAwake();el('voiceDialog').close();notice('Микрофон включён. Читайте выбранный сценарий.');
  }catch(e){if(session===generation){pause();notice(e.name==='NotAllowedError'?'Доступ к микрофону запрещён. Разрешите его в настройках Safari и повторите запуск.':e.message||'Распознавание не запустилось.',true);}}
 };
 checkCache();
})();
