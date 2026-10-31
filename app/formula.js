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
FN.SUMPRODUCT=a=>{ const L=a.map(x=>(Array.isArray(x)?x.flat(Infinity):[x]).map(toNum)); const n=Math.min(...L.map(l=>l.length)); let t=0; for(let i=0;i<n;i++){ let p=1; for(const l of L) p*=isNaN(l[i])?0:l[i]; t+=p; } return t; };
FN.PRODUCT=a=>a.flat(Infinity).map(toNum).filter(n=>!isNaN(n)).reduce((x,y)=>x*y,1);
FN.AVERAGE=FN.AVG; FN['ממוצע']=FN.AVG; FN['סכום']=FN.SUM;
// מפרש בטוח (ללא eval/Function): מספרים, מחרוזות, הפניות, טווחים, + - * / ^ % &, השוואות, IF ופונקציות מהרשימה בלבד
function tokenize(src){
  const t=[]; let i=0; const re=/\s+|(\d+(?:\.\d+)?|\.\d+)|("(?:[^"]|"")*")|(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![A-Za-z\u0590-\u05FF(])|([A-Za-z\u0590-\u05FF_][A-Za-z0-9\u0590-\u05FF_.]*)(?=\s*\()|(<>|<=|>=|==|!=|[+\-*/^%&(),;<>=:])/y;
  while(i<src.length){ re.lastIndex=i; const m=re.exec(src); if(!m) throw 0; i=re.lastIndex;
    if(m[1]) t.push({k:'n',v:Number(m[1])}); else if(m[2]) t.push({k:'s',v:m[2].slice(1,-1).replace(/""/g,'"')});
    else if(m[3]) t.push({k:'r',v:m[3].replace(/\$/g,'').toUpperCase()}); else if(m[4]) t.push({k:'f',v:m[4]}); else if(m[5]) t.push({k:'o',v:m[5]}); }
  if(t.length>2000) throw 0; return t;
}
export function evaluate(sheet, r, c, depth=0){
  const raw = sheet.rows[r]?.[c];
  if(typeof raw!=='string' || !raw.startsWith('=')) return raw;
  if(depth>30) return '#מעגל';
  try{
    const val = (rr,cc)=>{ if(rr<0||cc<0||rr>=10000||cc>=1000) return 0; const v=evaluate(sheet,rr,cc,depth+1); if(typeof v==='string'&&v.startsWith('#')) throw 0; const n=toNum(v); return (v===''||v==null)?0:(isNaN(n)?String(v):n); };
    const ref = s=>{ const m=s.match(/^([A-Z]+)(\d+)$/); return [ +m[2]-1, colIndex(m[1]) ]; };
    const T=tokenize(raw.slice(1)); let p=0; let steps=0;
    const peek=()=>T[p], eat=v=>{ const x=T[p]; if(!x||(v&&x.v!==v)) throw 0; p++; return x; };
    const num=v=>{ if(Array.isArray(v)) v=v.flat(Infinity)[0]; const n=typeof v==='number'?v:toNum(v); if(isNaN(n)) throw 0; return n; };
    const cmp=()=>{ let a=cat(); while(peek()&&['=','==','<>','!=','<','>','<=','>='].includes(peek().v)){ const o=eat().v, b=cat();
        const an=typeof a==='number'&&typeof b==='number'; a = o==='='||o==='=='? (an?a===b:String(a)===String(b)) : o==='<>'||o==='!='? (an?a!==b:String(a)!==String(b)) : o==='<'?num(a)<num(b): o==='>'?num(a)>num(b): o==='<='?num(a)<=num(b): num(a)>=num(b); } return a; };
    const cat=()=>{ let a=add(); while(peek()?.v==='&'){ eat(); a=String(a)+String(add()); } return a; };
    const add=()=>{ let a=mul(); while(peek()&&(peek().v==='+'||peek().v==='-')){ const o=eat().v,b=mul(); a=o==='+'?num(a)+num(b):num(a)-num(b); } return a; };
    const mul=()=>{ let a=pow(); while(peek()&&(peek().v==='*'||peek().v==='/')){ const o=eat().v,b=pow(); a=o==='*'?num(a)*num(b):num(a)/num(b); } return a; };
    const pow=()=>{ let a=un(); while(peek()?.v==='^'){ eat(); a=Math.pow(num(a),num(un())); } return a; };
    const un=()=>{ if(peek()?.v==='-'){ eat(); return -num(un()); } if(peek()?.v==='+'){ eat(); return num(un()); } let a=atom(); while(peek()?.v==='%'){ eat(); a=num(a)/100; } return a; };
    const atom=()=>{ if(++steps>20000) throw 0; const x=eat();
      if(x.k==='n'||x.k==='s') return x.v;
      if(x.k==='r'){ if(x.v.includes(':')){ const [a,b]=x.v.split(':').map(ref); if((b[0]-a[0]+1)*(b[1]-a[1]+1)>200000) throw 0; const out=[]; for(let i=a[0];i<=b[0];i++){ const row=[]; for(let j=a[1];j<=b[1];j++) row.push(val(i,j)); out.push(row);} return out; } const [rr,cc]=ref(x.v); return val(rr,cc); }
      if(x.k==='o'&&x.v==='('){ const v=cmp(); eat(')'); return v; }
      if(x.k==='f'){ const name=x.v.toUpperCase(); const fn=Object.prototype.hasOwnProperty.call(FN,name)?FN[name]:Object.prototype.hasOwnProperty.call(FN,x.v)?FN[x.v]:null;
        if(name!=='IF'&&!fn) throw 0; eat('('); const args=[]; if(peek()?.v!==')'){ args.push(cmp()); while(peek()&&(peek().v===','||peek().v===';')){ eat(); args.push(cmp()); } } eat(')');
        if(name==='IF') return (args[0]&&args[0]!==0) ? (args[1]??true) : (args[2]??''); return fn(args); }
      throw 0; };
    const res=cmp(); if(p!==T.length) throw 0;
    if(typeof res==='number') return isFinite(res)? Math.round(res*1e10)/1e10 : '#שגיאה';
    if(Array.isArray(res)) return '#שגיאה'; return res;
  }catch(e){ return '#שגיאה'; }
}
