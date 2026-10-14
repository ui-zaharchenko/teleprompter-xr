/* Speech advances only on a consecutive suffix near the current position. */
(function(root){
 'use strict';
 const tokens=text=>(text.toLowerCase().replace(/ё/g,'е').match(/[а-яa-z0-9]+/g)||[]);
 function match(words,spoken,cursor){
  const heard=tokens(spoken),need=Math.min(3,words.length-cursor);
  if(need<1||heard.length<need)return null;
  for(let length=Math.min(8,heard.length);length>=Math.max(need,Math.min(3,words.length));length--){
   const tail=heard.slice(-length);
   for(let start=Math.max(0,cursor-8);start<=Math.min(words.length-length,cursor+5);start++){
    const end=start+length;
    if(end<=cursor||end-cursor>10)continue;
    if(tail.every((word,i)=>word===words[start+i]))return {start,end};
   }
  }
  return null;
 }
 const api={tokens,match};root.TeleVoiceAlign=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
