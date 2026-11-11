'use strict';
// Bluetooth pairing belongs to the OS. Only input actually exposed by the browser is used.
(() => {
 const dialog=$('remoteDialog');
 const actions={
  toggle:{label:'Старт / пауза'},
  back:{label:'Текст назад',repeat:true},
  forward:{label:'Текст вперёд',repeat:true},
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
  'key:ArrowUp':'back','key:ArrowDown':'forward','key:PageUp':'pageBack','key:PageDown':'pageForward',
  'key:ArrowLeft':'slower','key:ArrowRight':'faster','key:Home':'home','key:KeyR':'restart',
  'key:Minus':'smaller','key:Equal':'larger','key:KeyF':'panels',
  'pad:button:0':'toggle','pad:button:1':'home','pad:button:2':'restart','pad:button:3':'panels',
  'pad:button:12':'back','pad:button:13':'forward','pad:button:14':'slower','pad:button:15':'faster',
  'pad:axis:0:-':'slower','pad:axis:0:+':'faster','pad:axis:1:-':'back','pad:axis:1:+':'forward'
 };
 let bindings={...defaults},enabled=store.get('tp-remote-enabled')!=='false',learning=null,learnTimer=0;
 let padFrame=0,padStates=new Map(),lastDevices='',keyHeld=new Map(),capturedKeys=new Set();
 let suspended=false,skipNextPad=true,lastSignal='',lastSignalAt=0;
 try{const saved=JSON.parse(store.get('tp-remote-bindings'));if(saved&&saved.version===1&&saved.bindings&&typeof saved.bindings==='object'){
  bindings=Object.fromEntries(Object.entries(saved.bindings).filter(([signal,action])=>/^(key:[\w-]+|pad:button:\d+|pad:axis:\d+:[+-])$/.test(signal)&&(actions[action]||['pageBack','pageForward','none'].includes(action))));
 }}catch{}
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
   const signals=Object.entries(bindings).filter(([,a])=>a===id).map(([s])=>label(s));
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
  if(signal!==lastSignal||now-lastSignalAt>500){$('remoteSignal').textContent=bindRussian('Принято: '+label(signal));lastSignal=signal;lastSignalAt=now;}
  if(learning){
   const action=learning,previous=bindings[signal];
   // Replace this action's complete mapping; do not guess A/B/X/Y on generic remotes.
   for(const [s,a] of Object.entries(bindings))if(a===action)delete bindings[s];
   bindings[signal]=action;clearTimeout(learnTimer);learning=null;render();
   notice('Назначено: '+actions[action].label+(previous&&previous!==action?' · прежнее действие кнопки заменено.':'.'));save();return null;
  }
  return standard?bindings[signal]:null;
 }
 // Explicit learned mappings are allowed on non-standard pads, including default-numbered inputs.
 let learnedPads=new Set();
 try{const saved=JSON.parse(store.get('tp-remote-learned'));if(Array.isArray(saved))learnedPads=new Set(saved.filter(s=>typeof s==='string'&&s.startsWith('pad:')));}catch{}
 function rememberLearned(signal){learnedPads.add(signal);store.set('tp-remote-learned',JSON.stringify([...learnedPads]));}
 function blocked(){return document.hidden||suspended||!!document.querySelector('dialog[open]');}
 function adjust(id,delta){const input=$(id);input.value=String(Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)+delta)));input.dispatchEvent(new Event('input',{bubbles:true}));}
 function execute(action){
  if(!enabled||blocked()||!active||!action)return;
  if(action==='toggle'){play();return;}
  if(['back','forward','pageBack','pageForward','home','restart'].includes(action)){
   pause();
   const line=Number($('font').value)*1.5;
   const delta={back:-line,forward:line,pageBack:-viewport.clientHeight*.8,pageForward:viewport.clientHeight*.8}[action];
   viewport.scrollTop=delta===undefined?0:Math.max(0,viewport.scrollTop+delta);position=viewport.scrollTop;
   window.teleVoice?.layoutChanged();progress();
   if(action==='restart')play();return;
  }
  if(action==='slower'||action==='faster')adjust('speed',action==='slower'?-5:5);
  if(action==='smaller'||action==='larger')adjust('font',action==='smaller'?-2:2);
  if(action==='panels')setImmersive(!document.body.classList.contains('immersive'));
 }
 function editable(target){return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}
 function signalFor(e){const code=e.code||({ ' ':'Space',MediaPlayPause:'MediaPlayPause' }[e.key])||e.key;return /^[\w-]+$/.test(code)?'key:'+code:null;}
 document.addEventListener('keydown',e=>{
  if(document.hidden||suspended||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||editable(e.target))return;
  if(learning&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancelLearning();return;}
  const signal=signalFor(e);if(!signal||['key:Tab','key:ShiftLeft','key:ShiftRight','key:Escape'].includes(signal))return;
  if(blocked()&&!dialog.open)return;
  if(dialog.open){
   // Tab, Enter and Space still operate the setup buttons unless capture was explicitly armed.
   if(!learning){if(!e.repeat){$('remoteDevice').textContent='Браузер получает команды клавиатуры.';receive(signal);}return;}
  }else if(!enabled||e.target.closest('button,a,summary'))return;
  const wasLearning=!!learning,action=receive(signal);
  if(!wasLearning&&!action)return;
  e.preventDefault();e.stopImmediatePropagation();capturedKeys.add(signal);
  const now=performance.now(),held=keyHeld.get(signal);
  if(!held){if(e.repeat)return;keyHeld.set(signal,{start:now,last:now});}
  else if(wasLearning||!actions[action]?.repeat||now-held.start<350||now-held.last<110)return;
  if(held)held.last=now;
  if(!wasLearning)execute(action);
 },true);
 document.addEventListener('keyup',e=>{const signal=signalFor(e);keyHeld.delete(signal);if(capturedKeys.delete(signal)){e.preventDefault();e.stopImmediatePropagation();}},true);
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
     const action=receive(signal,pad.mapping==='standard'||learnedPads.has(signal));
     if(capturing){held.suppressed=true;continue;}
     if(!held.suppressed)execute(action);
    }else if(!held.suppressed&&time-held.start>=350&&time-held.last>=110){
     held.last=time;const action=(pad.mapping==='standard'||learnedPads.has(signal))?bindings[signal]:null;
     if(actions[action]?.repeat)execute(action);
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
 for(const node of dialog.querySelectorAll('p,h2,label,summary,.remote-actions button'))if(node.childElementCount===0)node.textContent=bindRussian(node.textContent);
 render();startPoll();
})();
