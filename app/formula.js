// מנוע נוסחאות קטן: SUM/AVG(AVERAGE)/COUNT/MIN/MAX/IF, הפניות A1 וטווחים A1:B3, אריתמטיקה והשוואות
export const colLetter = i => { let s=''; i++; while(i>0){const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26);} return s; };
export const colIndex = L => { let n=0; for(const ch of L.toUpperCase()) n=n*26+ch.charCodeAt(0)-64; return n-1; };
export const toNum = v => { if(typeof v==='number') return v; if(v==null||v==='') return NaN; let t=String(v).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069,\s₪%]/g,'').replace(/[−–]/g,'-'); if(/^\d+(\.\d+)?-$/.test(t)) t='-'+t.slice(0,-1); return t===''?NaN:Number(t); };
const FN = {
  SUM:a=>a.flat(Infinity).map(toNum).filter(n=>!isNaN(n)).reduce((x,y)=>x+y,0),
  AVG:a=>{const n=a.flat(Infinity).map(toNum).filter(n=>!isNaN(n));return n.length?n.reduce((x,y)=>x+y,0)/n.length:0},
  COUNT:a=>a.flat(Infinity).map(toNum).filter(n=>!isNaN(n)).length,
  COUNTA:a=>a.flat(Infinity).filter(v=>v!==''&&v!=null).length,
  MIN:a=>Math.min(...a.flat(Infinity).map(toNum).filter(n=>!isNaN(n))),
  MAX:a=>Math.max(...a.flat(Infinity).map(toNum).filter(n=>!isNaN(n))),
  ROUND:a=>{const[x,d=0]=a.flat(Infinity);return Math.round(toNum(x)*10**d)/10**d},
  ABS:a=>Math.abs(toNum(a.flat(Infinity)[0])),
};
FN.AVERAGE=FN.AVG; FN['ממוצע']=FN.AVG; FN['סכום']=FN.SUM;
export function evaluate(sheet, r, c, depth=0){
  const raw = sheet.rows[r]?.[c];
  if(typeof raw!=='string' || !raw.startsWith('=')) return raw;
  if(depth>30) return '#מעגל';
  try{
    const val = (rr,cc)=>{ const v=evaluate(sheet,rr,cc,depth+1); const n=toNum(v); return (v===''||v==null)?0:(isNaN(n)?String(v):n); };
    let ex = raw.slice(1).replace(/<>/g,'!=').replace(/(^|[^<>!=])=(?!=)/g,'$1==');
    ex = ex.replace(/\$?([A-Z]{1,2})\$?(\d+):\$?([A-Z]{1,2})\$?(\d+)/gi,(m,a,b,c2,d)=>{
      const out=[]; for(let i=+b-1;i<=+d-1;i++){const row=[];for(let j=colIndex(a);j<=colIndex(c2);j++)row.push(val(i,j));out.push(row);} return JSON.stringify(out);
    });
    ex = ex.replace(/(^|[^A-Za-z"])\$?([A-Z]{1,2})\$?(\d+)(?![\d(])/gi,(m,p,a,b)=>p+JSON.stringify(val(+b-1,colIndex(a))));
    ex = ex.replace(/\bIF\s*\(/gi,'__IF(').replace(/([A-Zא-ת]+)\s*\(/g,(m,n)=> n==='__IF'?m : (FN[n.toUpperCase()]||FN[n]) ? `__F("${n.toUpperCase()in FN?n.toUpperCase():n}",`:m);
    if(/[^\d\s+\-*/().,<>=!"\[\]_A-Za-z\u0590-\u05FF%&|:?]/.test(ex)) return '#שגיאה';
    // eslint-disable-next-line no-new-func
    const res = Function('__F','__IF',`"use strict";return (${ex});`)((n,...a)=>FN[n](a),(c,a,b)=>c?a:(b??''));
    return typeof res==='number' ? Math.round(res*1e10)/1e10 : res;
  }catch(e){ return '#שגיאה'; }
}
