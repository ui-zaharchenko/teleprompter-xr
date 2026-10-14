/* Local, bounded alignment; tolerate one spelling error and a short omitted word. */
(function(root){
 'use strict';
 const tokens=text=>(text.toLowerCase().replace(/ё/g,'е').match(/[а-яa-z0-9]+/g)||[]);
 function similar(a,b){
  if(a===b)return true;if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,errors=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++errors>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return errors+(a.length-i)+(b.length-j)<=1;
 }
 const weak=new Set(['и','а','в','во','на','с','со','к','ко','у','о','же','бы']);
 function match(words,spoken,cursor){
  const heard=tokens(spoken);if(!heard.length)return null;
  for(let length=Math.min(10,heard.length);length>=Math.min(3,words.length);length--){
   const tail=heard.slice(-length);
   for(let start=Math.max(0,cursor-10);start<=Math.min(words.length-length,cursor+32);start++){
    let j=start,exact=0,errors=0;
    for(const word of tail){
     if(words[j]!==word&&weak.has(words[j])&&similar(words[j+1]||'',word)){j++;errors++;}
     if(words[j]===word)exact++;else if(similar(words[j]||'',word))errors++;else{errors=99;break;}j++;
    }
    if(j<=cursor||j-cursor>42||errors>(length>=7?2:length>=4?1:0)||exact<Math.min(3,words.length))continue;
    if(start>cursor+5&&(length<4||exact<4))continue;
    return {start,end:j};
   }
  }
  return null;
 }
 function resampler(rate,target=16000){
  const ratio=rate/target;let sum=0,used=0;
  return input=>{if(rate===target)return new Float32Array(input);const out=[];for(const value of input){let remaining=1;while(remaining>1e-9){const weight=Math.min(remaining,ratio-used);sum+=value*weight;used+=weight;remaining-=weight;if(used>=ratio-1e-9){out.push(sum/ratio);used=0;sum=0;}}}return Float32Array.from(out);};
 }
 const api={tokens,match,resampler};root.TeleVoiceAlign=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
