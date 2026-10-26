// קריאת קבצים בדפדפן + קריאה ל‑AI (שרת פרוקסי) או AI מדומה במצב הדגמה
import * as pdfjs from './vendor/pdf.min.mjs';
import { toNum } from './formula.js';
pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
const b64 = buf => { let s='',u=new Uint8Array(buf); for(let i=0;i<u.length;i+=32768) s+=String.fromCharCode(...u.subarray(i,i+32768)); return btoa(s); };

async function pdfText(buf){
  const doc = await pdfjs.getDocument({data:new Uint8Array(buf)}).promise; const out=[]; const images=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p); const tc=await page.getTextContent(); const lines={};
    for(const it of tc.items){ if(!it.str.trim()) continue; const y=Math.round(it.transform[5]/3)*3; (lines[y]??=[]).push({x:it.transform[4],w:it.width,s:it.str.trim()}); }
    const pageHeb=tc.items.filter(i=>/[\u0590-\u05FF]/.test(i.str)).length>0; const ys=Object.keys(lines).map(Number).sort((a,b)=>b-a);
    for(const y of ys){ const its=lines[y]; const heb=pageHeb; its.sort((a,b)=>heb?b.x-a.x:a.x-b.x); const cells=[]; let prev=null;
      for(const it of its){ const gap=prev?Math.max(prev.x-(it.x+it.w), it.x-(prev.x+prev.w)):99;
        if(prev && gap<6){ cells[cells.length-1]+= (heb?' ':' ')+it.s; } else cells.push(it.s); prev=it; }
      out.push(cells.join('\t')); }
    if(tc.items.filter(i=>i.str.trim()).length<5 && p<=5){ // סרוק – נרנדר תמונה ל‑Gemini Vision
      const vp=page.getViewport({scale:1.6}); const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise; images.push(cv.toDataURL('image/jpeg',.8).split(',')[1]); }
  }
  return {text:out.join('\n'), images};
}
async function docxText(buf){ // DOCX = zip; נשתמש ב‑SheetJS CFB לפתיחת ה‑zip
  try{ const z=XLSX.CFB.read(new Uint8Array(buf),{type:'array'}); const f=XLSX.CFB.find(z,'word/document.xml'); const xml=new TextDecoder().decode(f.content);
    return xml.replace(/<\/w:p>/g,'\n').replace(/<w:tab\/>/g,'\t').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }catch(e){ return ''; }
}
export async function readFile(file){
  const buf=await file.arrayBuffer(); const n=file.name.toLowerCase(); const r={name:file.name, mime:file.type||'application/octet-stream'};
  if(n.endsWith('.pdf')){ const {text,images}=await pdfText(buf); r.text=text; if(text.trim().length<40){ r.images=images; if(buf.byteLength<15e6) r.data=b64(buf), r.mime='application/pdf'; } }
  else if(/\.(xlsx|xls|csv)$/.test(n)){ const wb=XLSX.read(buf,{type:'array'}); r.text=wb.SheetNames.map(s=>`### ${s}\n`+XLSX.utils.sheet_to_csv(wb.Sheets[s],{FS:'\t'})).join('\n'); r.table=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}); }
  else if(n.endsWith('.docx')) r.text=await docxText(buf);
  else if(/^image\//.test(file.type)) r.data=b64(buf);
  else r.text=new TextDecoder().decode(buf);
  if(r.text && r.text.length>60000) r.text=r.text.slice(0,60000)+'\n…(קוצר)';
  return r;
}
export const snapshot = sh => ({ name:sh.name, columns:sh.cols, rows:sh.rows.filter(r=>r.some(v=>v!=='')).slice(0,200), totalRows:sh.rows.length });

export async function askAI({prompt, files, state, history, demo}){
  const payload={prompt, files, sheet:snapshot(state.sheets[state.active]), sheets:state.sheets.map(s=>s.name), history:history.slice(-6)};
  if(!demo){
    try{ const res=await fetch('api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const j=await res.json(); if(res.ok) return j; if(res.status!==503) throw new Error(j.error||res.statusText);
      const m=mockAI(payload); m.explanation='(אין מפתח Gemini בשרת – עניתי במצב הדגמה)\n'+m.explanation; return m;
    }catch(e){ if(String(e).includes('Failed to fetch')){ const m=mockAI(payload); m.explanation='(השרת לא זמין – מצב הדגמה)\n'+m.explanation; return m; } throw e; }
  }
  return mockAI(payload);
}

// ===== AI מדומה: מבין בקשות נפוצות בעברית בלי מפתח =====
function tableFromText(text){
  const lines=text.split('\n').map(l=>l.split('\t').map(s=>s.trim()).filter(Boolean)).filter(l=>l.length>=2);
  const counts={}; lines.forEach(l=>counts[l.length]=(counts[l.length]||0)+1);
  const n=+Object.entries(counts).filter(([k])=>k>=3).sort((a,b)=>b[1]-a[1])[0]?.[0]; if(!n) return null;
  const rows=lines.filter(l=>l.length===n); const header=rows[0].filter(v=>isNaN(toNum(v))).length===n ? rows.shift() : rows[0].map((_,i)=>'עמודה '+(i+1));
  return {columns:header, rows:rows.map(r=>r.map(v=>{const x=toNum(v);return isNaN(x)||/^0\d/.test(v)?v:x;}))};
}
function mockAI({prompt, files, sheet}){
  const p=prompt||''; const ops=[]; const said=[];
  const num = (p.match(/(?:מעל|יותר מ|גדול מ|מעבר ל|>)\s*-?\s*(\d+(?:\.\d+)?)/)||[])[1];
  const under = (p.match(/(?:מתחת ל|פחות מ|קטן מ|<)\s*-?\s*(\d+(?:\.\d+)?)/)||[])[1];
  let cols=sheet.columns, rows=sheet.rows;
  const f=files.find(f=>f.table||f.text);
  if(f){ const t=f.table? {columns:f.table[0].map(String), rows:f.table.slice(1)} : tableFromText(f.text);
    if(!t) return {explanation:'לא הצלחתי למצוא טבלה בקובץ 🙁 במצב הדגמה אני מזהה רק טבלאות טקסט פשוטות. עם מפתח Gemini זה יעבוד הרבה יותר טוב.',operations:[]};
    cols=t.columns; rows=t.rows; ops.push({type:'create_sheet',name:f.name.replace(/\.[^.]+$/,'').slice(0,25),columns:cols,rows});
    said.push(`חילצתי מהקובץ "${f.name}" טבלה עם ${rows.length} שורות ו‑${cols.length} עמודות.`); }
  const pickCol = () => { const words=p.split(/[\s,.״"']+/).filter(w=>w.length>1);
    let i=cols.findIndex(c=>words.some(w=>String(c).includes(w.replace(/^[בלהמו]/,''))&&w.length>2));
    if(/סטי/.test(p)){ const ds=cols.map((c,i)=>[c,i]).filter(([c])=>/סטי/.test(c)); const tot=ds.find(([c])=>/כולל|סה|מקס|total/i.test(c)); if(tot) i=tot[1]; else if(ds.length) i=ds[ds.length-1][1]; }
    if(i<0) i=cols.map((c,i)=>i).reverse().find(i=>rows.some(r=>!isNaN(toNum(r[i])))) ?? -1; return cols[i]; };
  if(num||under){ const col=pickCol(); const v=+(num||under); const op=num?'abs>':'<';
    if(/הדגש|תדגיש|צבע|סמן|תסמן/.test(p) && !/רק|תשאיר|סנן|תסנן/.test(p)){ ops.push({type:'highlight',column:col,op,value:v,color:'#ffd6d6',whole_row:true}); said.push(`הדגשתי באדום שורות שבהן "${col}" ${num?'מעל':'מתחת ל‑'} ${v}.`); }
    else { const kept=rows.filter(r=>{const x=toNum(r[cols.indexOf(col)]);return num?Math.abs(x)>v:x<v;}).length;
      ops.push({type:'filter_rows',column:col,op,value:v}); said.push(`השארתי רק ${kept} שורות שבהן "${col}" ${num?'מעל':'מתחת ל‑'} ${v} (בערך מוחלט).`);
      ops.push({type:'highlight',column:col,op:'abs>',value:v*2,color:'#ffb3b3'}); } }
  if(/מיין|תמיין|מיון|לסדר לפי|תסדר לפי/.test(p)){ let col=cols.find(c=>p.includes(c)) || (/תאריך/.test(p)?cols.find(c=>/תאריך/.test(c)):null) || pickCol();
    const dir=/גדול לקטן|יורד|הכי גבוה|desc/.test(p)?'desc':'asc'; ops.push({type:'sort',column:col,dir}); said.push(`מיינתי לפי "${col}" ${dir==='desc'?'מהגדול לקטן':'מהקטן לגדול'}.`); }
  if(/סה.?כ|סכום|סיכום|total/i.test(p)){ const numCols=cols.filter((c,i)=>rows.some(r=>!isNaN(toNum(r[i])))&&!/מס|תאריך|קומה|id/i.test(c));
    const func=/ממוצע/.test(p)?'AVG':'SUM'; ops.push({type:'add_total',columns:numCols,func,label:func==='AVG'?'ממוצע':'סה״כ'}); said.push(`הוספתי שורת ${func==='AVG'?'ממוצע':'סה״כ'} לעמודות המספריות.`); }
  if(!ops.length) return {explanation:'במצב הדגמה אני מבין בקשות כמו: "רק מעל 5", "מיין לפי תאריך", "תוסיף סה״כ", "תדגיש מעל 100" ומצרף קובץ. עם מפתח Gemini אפשר לבקש כמעט הכל 🙂', operations:[]};
  return {explanation:said.join('\n'), operations:ops};
}
