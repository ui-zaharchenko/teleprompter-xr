/* Local, bounded alignment; tolerate one spelling error and a short omitted word. */
(function(root){
 'use strict';
 const parts=text=>(text.toLowerCase().replace(/ё/g,'е').match(/[а-яa-z]+[0-9]+|[0-9]+(?:[,.][0-9]+)?|[а-яa-z]+/g)||[]);
 const numbers={ноль:0,нуль:0,один:1,одна:1,одно:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,одиннадцать:11,двенадцать:12,тринадцать:13,четырнадцать:14,пятнадцать:15,шестнадцать:16,семнадцать:17,восемнадцать:18,девятнадцать:19,двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90,сто:100,двести:200,триста:300,четыреста:400,пятьсот:500,шестьсот:600,семьсот:700,восемьсот:800,девятьсот:900};
 function numberAt(raw,start){let end=start,value=numbers[raw[start]];if(value===undefined)return null;end++;if(value>=100&&numbers[raw[end]]>0&&numbers[raw[end]]<100){value+=numbers[raw[end++]];}if(value>=20&&value%10===0&&numbers[raw[end]]>0&&numbers[raw[end]]<10)value+=numbers[raw[end++]];return {value,end};}
 function compile(raw){
  const words=[],starts=[],ends=[];
  for(let i=0;i<raw.length;){const start=i;let word=raw[i],end=i+1;
   if(/^[aа]0*[0-9]+$/.test(word))word='а'+Number(word.slice(1));
   else if(['а','a','эй'].includes(word)){
    let at=i+1;while(['ноль','нуль','0'].includes(raw[at]))at++;
    const n=numberAt(raw,at);if(n){word='а'+n.value;end=n.end;}
    else if(/^[0-9]+$/.test(raw[at]||'')){word='а'+Number(raw[at]);end=at+1;}
   }else if(['полтора','полторы'].includes(word))word='1.5';
   else if(/^[0-9]+(?:[,.][0-9]+)?$/.test(word))word=String(Number(word.replace(',','.')));
   else{const n=numberAt(raw,i);if(n){word=String(n.value);end=n.end;if(['целая','целых'].includes(raw[end])){const fraction=numberAt(raw,end+1);if(fraction&&raw[fraction.end]==='десятых'){word=String(n.value+fraction.value/10);end=fraction.end+1;}}else if(raw[end]==='с'&&raw[end+1]==='половиной'){word=String(n.value+.5);end+=2;}}}
   words.push(word);starts.push(start);ends.push(end);i=end;
  }
  return {words,starts,ends,raw};
 }
 const tokens=text=>compile(parts(text)).words;
 function similar(a,b){
  if(a===b)return true;if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,errors=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++errors>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return errors+(a.length-i)+(b.length-j)<=1;
 }
 const weak=new Set(['и','а','в','во','на','с','со','к','ко','у','о','же','бы']);
 function match(input,spoken,rawCursor,options={}){
  const source=Array.isArray(input)?compile(input):input,words=source.words,heard=tokens(spoken);
  if(!heard.length)return null;
  let cursor=0;while(cursor<words.length&&source.ends[cursor]<=rawCursor)cursor++;
  // A completed one/two-word heading is safe only right beside the cursor.
  if(options.final&&heard.length<=2){
   const distinctive=heard.some(word=>/^[а-яa-z]{5,}$/.test(word));
   if(distinctive)for(let start=cursor;start<=Math.min(words.length-heard.length,cursor+2);start++){
    if(heard.every((word,i)=>word===words[start+i]))return {start:source.starts[start],end:source.ends[start+heard.length-1]};
   }
  }
  for(let length=Math.min(10,heard.length);length>=Math.min(3,words.length);length--){
   const tail=heard.slice(-length);
   for(let start=Math.max(0,cursor-10);start<=Math.min(words.length-length,cursor+32);start++){
    let j=start,exact=0,errors=0;
    for(const word of tail){
     if(words[j]!==word&&weak.has(words[j])&&similar(words[j+1]||'',word)){j++;errors++;}
     if(words[j]===word)exact++;else if(similar(words[j]||'',word))errors++;else{errors=99;break;}j++;
    }
    if(j<=cursor||source.ends[j-1]-rawCursor>42||errors>(length>=7?2:length>=4?1:0)||exact<Math.min(3,words.length))continue;
    if(start>cursor+5&&(length<4||exact<4))continue;
    return {start:source.starts[start],end:source.ends[j-1]};
   }
  }
  return null;
 }
 function resampler(rate,target=16000){
  const ratio=rate/target;let sum=0,used=0;
  return input=>{if(rate===target)return new Float32Array(input);const out=[];for(const value of input){let remaining=1;while(remaining>1e-9){const weight=Math.min(remaining,ratio-used);sum+=value*weight;used+=weight;remaining-=weight;if(used>=ratio-1e-9){out.push(sum/ratio);used=0;sum=0;}}}return Float32Array.from(out);};
 }
 const api={parts,tokens,compile,match,resampler};root.TeleVoiceAlign=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
