'use strict';
// Bluetooth pairing belongs to the OS. Only input actually exposed by the browser is used.
(() => {
 const dialog=$('remoteDialog');
 const actions={
  toggle:{label:'Старт / пауза'},
  back:{label:'Текст назад'},
  forward:{label:'Текст вперёд'},
  slower:{label:'Медленнее',repeat:true},
  faster:{label:'Быстрее',repeat:true},
  home:{label:'К началу · пауза'},
  restart:{label:'С начала и пуск'},
  smaller:{label:'Шрифт меньше',repeat:true},
  larger:{label:'Шрифт больше',repeat:true},
  panels:{label:'Скрыть / вернуть панель'}
 };
 const defaults={
  'key:Space':'toggle','key:Enter':'toggle','key:MediaPlayPause':'toggle',
  'key:ArrowUp':'back','key:ArrowDown':'forward','key:PageUp':'back','key:PageDown':'forward',
  'key:ArrowLeft':'slower','key:ArrowRight':'faster','key:Home':'home','key:KeyR':'restart',
  'key:Minus':'smaller','key:Equal':'larger','key:KeyF':'panels',
  'pad:button:0':'toggle','pad:button:1':'home','pad:button:2':'restart','pad:button:3':'panels',
  'pad:button:12':'back','pad:button:13':'forward','pad:button:14':'slower','pad:button:15':'faster',
  'pad:axis:0:-':'slower','pad:axis:0:+':'faster','pad:axis:1:-':'back','pad:axis:1:+':'forward'
 };
 let bindings={...defaults},enabled=store.get('tp-remote-enabled')!=='false',learning=null,learnTimer=0;
 let padFrame=0,padStates=new Map(),lastDevices='',keyHeld=new Map(),capturedKeys=new Set();
 let suspended=false,skipNextPad=true,lastSignal='',lastSignalAt=0,lastCommandAt=-Infinity,keyboardNavigation=false;
 const inputEvents=[];
 function record(type,detail=''){
  inputEvents.push({at:Math.round(performance.now()),type,detail,immersive:document.body.classList.contains('immersive'),speed:Number($('speed').value)});
  if(inputEvents.length>40)inputEvents.shift();
  if(dialog.open&&$('remoteTrace')?.open)renderTrace();
 }
 function eventText(item){return `${item.at} ms · ${item.type} ${item.detail} · ${item.immersive?'только текст':'панель'} · ${item.speed} px/с`;}
 function renderTrace(){const list=$('remoteEvents');if(!list)return;list.replaceChildren();for(const item of inputEvents){const li=document.createElement('li');li.textContent=bindRussian(eventText(item));list.append(li);}}
 try{const saved=JSON.parse(store.get('tp-remote-bindings'));if(saved&&saved.version===1&&saved.bindings&&typeof saved.bindings==='object'){
  bindings=Object.fromEntries(Object.entries(saved.bindings).filter(([signal,action])=>/^(key:[\w-]+|pad:button:\d+|pad:axis:\d+:[+-])$/.test(signal)&&(actions[action]||['pageBack','pageForward','none'].includes(action))));
 }}catch{}
 // Old page-sized bindings retain their buttons and now use the same two-line step.
 for(const signal of Object.keys(bindings)){if(bindings[signal]==='pageBack')bindings[signal]='back';if(bindings[signal]==='pageForward')bindings[signal]='forward';}
 $('remoteEnabled').checked=enabled;
 function notice(text,error=false){$('remoteMessage').textContent=bindRussian(text);$('remoteMessage').classList.toggle('error',error);}
 function save(){if(!store.set('tp-remote-bindings',JSON.stringify({version:1,bindings})))notice('Не удалось сохранить кнопки. Они работают до закрытия приложения.',true);}
 function label(signal){
  const names={Space:'Пробел',Enter:'Enter',MediaPlayPause:'Медиа: пуск / пауза',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',PageUp:'Page Up',PageDown:'Page Down',Home:'Home',KeyR:'R',KeyF:'F',Minus:'−',Equal:'+'};
  if(signal.startsWith('key:'))return names[signal.slice(4)]||signal.slice(4).replace(/^Key/,'');
  const parts=signal.split(':');return parts[1]==='button'?`Кнопка ${Number(parts[2])+1}`:`Стик ${Number(parts[2])+1} ${parts[3]==='-'?'−':'+'}`;
 }
 function render(){
  const list=$('remoteBindings');list.replaceChildren();
  for(const [id,action] of Object.entries(actions)){
   const row=document.createElement('div');row.className='remote-row';
   const info=document.createElement('div'),name=document.createElement('span'),current=document.createElement('small');
   name.textContent=bindRussian(action.label);
   const signals=Object.entries(bindings).filter(([s,a])=>a===id&&effectiveAction(s)===id).map(([s])=>label(s));
   current.textContent=learning===id?'Нажмите кнопку пульта…':signals.length?signals.join(' · '):'Не назначено';
   info.append(name,current);
   const button=document.createElement('button');button.textContent=learning===id?'Отмена':'Назначить';button.dataset.action=id;
   button.setAttribute('aria-label',(learning===id?'Отменить назначение: ':'Назначить: ')+action.label);
   button.onclick=()=>learning===id?cancelLearning():learn(id);
   row.append(info,button);list.append(row);
  }
 }
 function cancelLearning(text='Назначение отменено.'){clearTimeout(learnTimer);learning=null;render();notice(text);}
 function learn(id){
  clearTimeout(learnTimer);learning=id;render();notice('Нажмите кнопку пульта для действия «'+actions[id].label+'». Escape отменяет назначение.');
  // A timeout leaves every browser control usable, even for an incompatible remote.
  learnTimer=setTimeout(()=>cancelLearning('Сигнал не получен. Проверьте Bluetooth и режим пульта.'),15000);
 }
 function receive(signal,standard=true){
  const now=performance.now();
  if(signal.startsWith('key:'))$('remoteDevice').textContent='Браузер получает команды клавиатуры.';
  if(signal!==lastSignal||now-lastSignalAt>500){const action=learning||effectiveAction(signal,standard);$('remoteSignal').textContent=bindRussian('Последний сигнал: '+label(signal)+' · '+(actions[action]?.label||'действие не назначено'));lastSignal=signal;lastSignalAt=now;}
  if(learning){
   const action=learning,previous=bindings[signal];
   // Replace this action's complete mapping; do not guess A/B/X/Y on generic remotes.
   for(const [s,a] of Object.entries(bindings))if(a===action)delete bindings[s];
   bindings[signal]=action;clearTimeout(learnTimer);learning=null;render();
   notice('Назначено: '+actions[action].label+(previous&&previous!==action?' · прежнее действие кнопки заменено.':'.'));save();return null;
  }
  return effectiveAction(signal,standard);
 }
 // Explicit learned mappings are allowed on non-standard pads, including default-numbered inputs.
 let learnedPads=new Set();
 try{const saved=JSON.parse(store.get('tp-remote-learned'));if(Array.isArray(saved))learnedPads=new Set(saved.filter(s=>typeof s==='string'&&s.startsWith('pad:')));}catch{}
 function rememberLearned(signal){learnedPads.add(signal);store.set('tp-remote-learned',JSON.stringify([...learnedPads]));}
 function customKeyboard(){return Object.entries(bindings).some(([signal,action])=>signal.startsWith('key:')&&defaults[signal]!==action);}
 function effectiveAction(signal,allowed=true){
  if(!allowed)return null;
  const action=bindings[signal];
  // Learning replaces the complete set. A complete factory pair for an unchosen panel,
  // home or restart command must not act on extra signals from a trained keyboard remote.
  if(['panels','home','restart'].includes(action)&&customKeyboard()){
   const untouched=Object.entries(defaults).filter(([,a])=>a===action).every(([s])=>bindings[s]===action);
   if(untouched)return null;
  }
  return action;
 }
 function padAllowed(signal,pad){return learnedPads.has(signal)||(pad.mapping==='standard'&&!customKeyboard());}
 function blocked(){return document.hidden||suspended||!!document.querySelector('dialog[open]');}
 function adjust(id,delta){const input=$(id);input.value=String(Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)+delta)));input.dispatchEvent(new Event('input',{bubbles:true}));}
 function execute(action){
  if(!enabled||blocked()||!active||!action)return;
  record('действие',action);
  if(action==='toggle'){play();return;}
  if(action==='back'||action==='forward'){scrollScriptLines(action==='back'?-1:1);return;}
  if(action==='home'||action==='restart'){
   pause();viewport.scrollTop=0;position=0;
   window.teleVoice?.layoutChanged();progress();
   if(action==='restart')play();return;
  }
  if(action==='slower'||action==='faster')adjust('speed',action==='slower'?-5:5);
  if(action==='smaller'||action==='larger')adjust('font',action==='smaller'?-2:2);
  if(action==='panels')setImmersive(!document.body.classList.contains('immersive'),'remote-panels');
 }
 function editable(target){return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}
 function signalFor(e){const code=(e.code!=='Unidentified'&&e.code)||({ ' ':'Space',MediaPlayPause:'MediaPlayPause' }[e.key])||e.key;return /^[\w-]+$/.test(code)?'key:'+code:null;}
 document.addEventListener('keydown',e=>{
  if(e.key==='Tab')keyboardNavigation=true;
  const immersive=document.body.classList.contains('immersive');
  if(document.hidden||suspended||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||(editable(e.target)&&!immersive))return;
  if(learning&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancelLearning();return;}
  const signal=signalFor(e);if(!signal||['key:Tab','key:ShiftLeft','key:ShiftRight','key:Escape'].includes(signal))return;
  if(blocked()&&!dialog.open)return;
  if(dialog.open){
   // Tab, Enter and Space still operate the setup buttons unless capture was explicitly armed.
   if(!learning){if(!e.repeat){$('remoteDevice').textContent='Браузер получает команды клавиатуры.';receive(signal);}return;}
  }else if(!enabled||(keyboardNavigation&&!immersive&&e.target.closest('button,a,summary')&&['Space','Enter'].includes(e.code)))return;
  const wasLearning=!!learning,action=receive(signal);
  record('keydown',signal+(e.repeat?' repeat':'')+' → '+(action||'без действия'));
  if(!wasLearning&&!action){if(bindings[signal]){e.preventDefault();e.stopImmediatePropagation();capturedKeys.add(signal);}if(customKeyboard()&&!e.repeat){keyHeld.clear();lastCommandAt=performance.now();}return;}
  e.preventDefault();e.stopImmediatePropagation();capturedKeys.add(signal);
  if(!wasLearning){lastCommandAt=performance.now();keyboardNavigation=false;}
  const now=performance.now(),held=keyHeld.get(signal);
  if(!held){if(e.repeat)return;keyHeld.set(signal,{start:now,last:now});}
  else if(wasLearning||!actions[action]?.repeat||now-held.start<350||now-held.last<110)return;
  if(held)held.last=now;
  if(!wasLearning)execute(action);
 },true);
 document.addEventListener('keyup',e=>{const signal=signalFor(e);keyHeld.delete(signal);if(capturedKeys.delete(signal)){record('keyup',signal);lastCommandAt=performance.now();e.preventDefault();e.stopImmediatePropagation();}},true);
 // Some remotes also emit mouse compatibility events for the same physical press.
 // A finger/pen keeps the original tap-to-reveal behavior; a remote mouse echo does not.
 function isRemotePointer(at=performance.now()){return enabled&&lastCommandAt>=at-450;}
 window.teleRemote={isRemotePointer,record,getEvents:()=>inputEvents.map(item=>({...item}))};
 document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.pointerType==='pen')keyboardNavigation=false;},true);
 for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','auxclick'])document.addEventListener(type,e=>{
  if(blocked()||!e.target.closest('#reader,.controls'))return;
  record(type,e.pointerType||'mouse');
  if(e.pointerType==='touch'||e.pointerType==='pen'||e.sourceCapabilities?.firesTouchEvents)return;
  if(isRemotePointer()){record('подавлено',type);e.preventDefault();e.stopImmediatePropagation();}
 },true);
 // Pointer interaction returns commands to the reader; Tab navigation retains normal button activation.
 document.querySelector('.controls').addEventListener('click',e=>{if(e.detail>0&&e.target.closest('button'))viewport.focus({preventScroll:true});});
 function resetInput(){keyHeld.clear();capturedKeys.clear();padStates.clear();skipNextPad=true;}
 function poll(time){
  padFrame=0;if(document.hidden||suspended||(!enabled&&!dialog.open))return;
  let pads=[];try{pads=Array.from(navigator.getGamepads?.()||[]).filter(p=>p&&p.connected);}catch{}
  const devices=pads.map(p=>p.index+':'+p.id).join('|');
  if(devices!==lastDevices){
   if(lastDevices&&lastDevices.split('|').some(id=>!devices.split('|').includes(id)))pause();
   lastDevices=devices;
   $('remoteDevice').textContent=bindRussian(pads.length?'Контроллер: '+pads.map(p=>p.id).join(', '):'Контроллер не виден. Нажмите кнопку; клавиатурный пульт определяется по нажатиям.');
  }
  const present=new Set();
  for(const pad of pads){
   const inputs=pad.buttons.map((b,i)=>['pad:button:'+i,typeof b==='number'?b>.5:b.pressed||b.value>.5]);
   pad.axes.forEach((value,i)=>{inputs.push([`pad:axis:${i}:-`,value<-.6],[`pad:axis:${i}:+`,value>.6]);});
   for(const [signal,pressed] of inputs){
    const id=pad.index+':'+signal;present.add(id);let held=padStates.get(id);
    if(!pressed){padStates.delete(id);continue;}
    if(skipNextPad){padStates.set(id,{start:time,last:time,suppressed:true});continue;}
    if(!held){
     held={start:time,last:time,suppressed:blocked()&&!learning};padStates.set(id,held);
     const capturing=!!learning;if(capturing)rememberLearned(signal);
     const allowed=padAllowed(signal,pad),action=receive(signal,allowed);
     if(capturing){held.suppressed=true;continue;}
     if(!held.suppressed&&action){lastCommandAt=time;keyboardNavigation=false;execute(action);}
    }else if(!held.suppressed&&time-held.start>=350&&time-held.last>=110){
     held.last=time;const action=effectiveAction(signal,padAllowed(signal,pad));
     if(actions[action]?.repeat){lastCommandAt=time;execute(action);}
    }
   }
  }
  for(const id of padStates.keys())if(!present.has(id))padStates.delete(id);
  skipNextPad=false;padFrame=requestAnimationFrame(poll);
 }
 function startPoll(){if(!padFrame&&!document.hidden&&!suspended&&(enabled||dialog.open))padFrame=requestAnimationFrame(poll);}
 function close(){dialog.close();viewport.focus({preventScroll:true});resetInput();}
 $('openRemote').onclick=()=>{pause();$('voiceDialog').close();dialog.showModal();resetInput();render();notice('Для чтения без микрофона выберите режим «По скорости».');startPoll();};
 $('closeRemote').onclick=close;$('remoteDone').onclick=close;
 dialog.addEventListener('close',()=>{if(learning)cancelLearning();resetInput();});
 dialog.addEventListener('cancel',()=>{viewport.focus({preventScroll:true});});
 $('remoteEnabled').onchange=()=>{enabled=$('remoteEnabled').checked;store.set('tp-remote-enabled',String(enabled));resetInput();notice(enabled?'Управление включено.':'Управление выключено. Назначение кнопок остаётся доступным.');startPoll();};
 $('remoteDefaults').onclick=()=>{if(learning)cancelLearning();bindings={...defaults};learnedPads.clear();store.remove('tp-remote-learned');save();render();notice('Стандартные кнопки восстановлены.');};
 window.addEventListener('gamepadconnected',startPoll);
 window.addEventListener('gamepaddisconnected',()=>{pause();resetInput();startPoll();});
 window.addEventListener('blur',()=>{suspended=true;pause();resetInput();if(learning)cancelLearning();cancelAnimationFrame(padFrame);padFrame=0;});
 window.addEventListener('focus',()=>{suspended=false;resetInput();startPoll();});
 document.addEventListener('visibilitychange',()=>{resetInput();if(document.hidden){if(learning)cancelLearning();cancelAnimationFrame(padFrame);padFrame=0;}else{suspended=false;startPoll();}});
 $('remoteTrace')?.addEventListener('toggle',()=>{if($('remoteTrace').open)renderTrace();});
 if($('copyRemoteEvents'))$('copyRemoteEvents').onclick=async()=>{try{await navigator.clipboard.writeText(inputEvents.map(eventText).join('\n'));$('remoteCopyStatus').textContent='События скопированы.';}catch{$('remoteCopyStatus').textContent=bindRussian('Не удалось скопировать автоматически. Можно выделить список ниже.');}};
 for(const node of dialog.querySelectorAll('p,h2,label,summary,.remote-actions button'))if(node.childElementCount===0)node.textContent=bindRussian(node.textContent);
 render();startPoll();
})();
