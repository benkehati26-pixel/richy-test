import { evaluate, colLetter, toNum } from './formula.js';
import { newSheet, applyOps, describe, test } from './ops.js';
import { readFile, askAI } from './ai.js';
const $=s=>document.querySelector(s); const KEY='tavloni-state-v1';
let state = JSON.parse(localStorage.getItem(KEY)||'null') || { sheets:[newSheet('גיליון 1',['שם','כמות','מחיר','סה״כ'])], active:0 };
let undo=[], redo=[], sel={r:-1,c:-1}, attached=[], history=[];
const sh=()=>state.sheets[state.active];
const save=()=>{ try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){} };
const commit=()=>{ undo.push(JSON.stringify(state)); if(undo.length>100) undo.shift(); redo=[]; };
const doUndo=()=>{ if(!undo.length) return; redo.push(JSON.stringify(state)); state=JSON.parse(undo.pop()); render(); };
const doRedo=()=>{ if(!redo.length) return; undo.push(JSON.stringify(state)); state=JSON.parse(redo.pop()); render(); };
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function render(){
  const s=sh(); const g=$('#grid');
  let h='<tr><th class="rn">#</th>'+s.cols.map((c,i)=>`<th data-c="${i}" class="${sel.c===i?'selc':''}"><span class="l">${colLetter(i)}</span>${esc(c)}</th>`).join('')+'</tr>';
  s.rows.forEach((row,r)=>{
    if(s.view && !test(evaluate(s,r,s.view.col),s.view.op,s.view.value)) return;
    const rowRule=s.rules.find(R=>R.row && test(evaluate(s,r,R.col),R.op,R.value));
    h+=`<tr class="${sel.r===r?'selr':''}"><td class="rn" data-r="${r}">${r+1}</td>`+row.map((_,c)=>{
      const v=evaluate(s,r,c); const f=s.fmt[r+','+c]||{}; const rule=s.rules.find(R=>!R.row&&R.col===c&&test(v,R.op,R.value));
      const bg=f.bg||rule?.color||rowRule?.color||''; const n=v!==''&&!isNaN(toNum(v));
      return `<td contenteditable data-r="${r}" data-c="${c}" class="${n?'num':''}" style="${bg?'background:'+bg+';':''}${f.bold?'font-weight:700;':''}">${esc(v)}</td>`;}).join('')+'</tr>';
  });
  g.innerHTML=h;
  $('#filterNote').textContent=s.view?`🔎 מוצג סינון: ${s.cols[s.view.col]} ${s.view.op} ${s.view.value}`:'';
  $('#colLabel').textContent=sel.c>=0?`עמודה: ${s.cols[sel.c]}${sel.r>=0?` · שורה ${sel.r+1}`:''}`:'בחר עמודה/תא';
  $('#tabs').innerHTML=state.sheets.map((x,i)=>`<button data-t="${i}" class="${i===state.active?'on':''}">${esc(x.name)}</button>`).join('')+'<button data-t="new">+ גיליון</button><button data-t="ren">✏️</button><button data-t="del">🗑</button>';
  $('#undo').disabled=!undo.length; $('#redo').disabled=!redo.length; save();
}
const grid=$('#grid');
grid.addEventListener('focusin',e=>{ const td=e.target.closest('td[data-c]'); if(!td) return; sel={r:+td.dataset.r,c:+td.dataset.c};
  const raw=sh().rows[sel.r][sel.c]; td.textContent=raw??''; $('#colLabel').textContent=`עמודה: ${sh().cols[sel.c]} · שורה ${sel.r+1}`; });
grid.addEventListener('focusout',e=>{ const td=e.target.closest('td[data-c]'); if(!td) return; const r=+td.dataset.r,c=+td.dataset.c; let v=td.textContent.trim();
  if(v!==''&&!v.startsWith('=')&&!isNaN(Number(v))) v=Number(v);
  if(sh().rows[r][c]!==v){ commit(); sh().rows[r][c]=v; } setTimeout(()=>{ if(!grid.contains(document.activeElement)) render(); else { const a=document.activeElement; render(); grid.querySelector(`td[data-r="${a.dataset.r}"][data-c="${a.dataset.c}"]`)?.focus(); } }); });
grid.addEventListener('keydown',e=>{ const td=e.target.closest('td[data-c]'); if(!td) return;
  if(e.key==='Enter'){ e.preventDefault(); const r=+td.dataset.r+1,c=td.dataset.c; if(r>=sh().rows.length){ sh().rows.push(sh().cols.map(()=>'')); }
    td.blur(); setTimeout(()=>grid.querySelector(`td[data-r="${r}"][data-c="${c}"]`)?.focus(),0);} if(e.key==='Escape') td.blur(); });
grid.addEventListener('click',e=>{ const th=e.target.closest('th[data-c]'); if(th){ sel={r:-1,c:+th.dataset.c}; render(); }
  const rn=e.target.closest('td.rn'); if(rn){ sel={r:+rn.dataset.r,c:Math.max(sel.c,0)}; render(); } });
grid.addEventListener('dblclick',e=>{ const th=e.target.closest('th[data-c]'); if(th) colAction('rename'); });

function colAction(a){
  const s=sh(), c=sel.c; const needCol=!['delRow'].includes(a);
  if(needCol && c<0) return alert('קודם בוחרים עמודה (לחיצה על הכותרת)');
  const ops={ rename:()=>{const n=prompt('שם חדש לעמודה',s.cols[c]); return n&&[{type:'rename_column',column:c,to:n}];},
    sortAsc:()=>[{type:'sort',column:c,dir:'asc'}], sortDesc:()=>[{type:'sort',column:c,dir:'desc'}],
    filter:()=>{const x=prompt('סינון (לדוגמה: >5  או  =תל אביב  או  ~מילה)'); if(!x) return; const m=x.match(/^(>=|<=|!=|>|<|=|~)?\s*(.*)$/); commit(); s.view={col:c,op:m[1]==='~'?'contains':(m[1]||'contains'),value:m[2]}; render(); },
    clearFilter:()=>{commit(); s.view=null; render();},
    highlight:()=>{const x=prompt('להדגיש תאים ש… (לדוגמה: >5 או <0 או =כן)'); if(!x) return; const m=x.match(/^(>=|<=|!=|>|<|=)?\s*(.*)$/); return [{type:'highlight',column:c,op:m[1]||'=',value:m[2],color:$('#bgColor').value}];},
    total:()=>[{type:'add_total',columns:[c]}], delCol:()=>confirm(`למחוק את "${s.cols[c]}"?`)&&[{type:'delete_column',column:c}],
    delRow:()=>{ if(sel.r<0) return alert('בחר שורה'); commit(); s.rows.splice(sel.r,1); sel.r=-1; render(); },
    bold:()=>{ if(sel.r<0) return; commit(); const k=sel.r+','+c; s.fmt[k]={...s.fmt[k],bold:!s.fmt[k]?.bold}; render(); } };
  const res=ops[a](); if(Array.isArray(res)){ commit(); applyOps(state,res); render(); }
}
$('#coltools').addEventListener('click',e=>{ const b=e.target.closest('button[data-a]'); if(b) colAction(b.dataset.a); });
$('#bgColor').addEventListener('change',e=>{ if(sel.r<0||sel.c<0) return; commit(); const k=sel.r+','+sel.c; sh().fmt[k]={...sh().fmt[k],bg:e.target.value}; render(); });
$('#undo').onclick=doUndo; $('#redo').onclick=doRedo;
document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&!e.target.closest('td,textarea')){ if(e.key==='z'){e.preventDefault();doUndo();} if(e.key==='y'){e.preventDefault();doRedo();} } });
$('#addRow').onclick=()=>{ commit(); sh().rows.splice(sel.r>=0?sel.r+1:sh().rows.length,0,sh().cols.map(()=>'')); render(); };
$('#addCol').onclick=()=>{ const n=prompt('שם העמודה החדשה','עמודה '+(sh().cols.length+1)); if(!n) return; commit(); applyOps(state,[{type:'add_column',name:n,after:sel.c>=0?sel.c:null}]); render(); };
$('#tabs').addEventListener('click',e=>{ const t=e.target.closest('button')?.dataset.t; if(t==null) return; commit();
  if(t==='new') state.sheets.push(newSheet('גיליון '+(state.sheets.length+1))), state.active=state.sheets.length-1;
  else if(t==='ren'){ const n=prompt('שם הגיליון',sh().name); if(n) sh().name=n; }
  else if(t==='del'){ if(state.sheets.length>1&&confirm('למחוק את הגיליון?')){ state.sheets.splice(state.active,1); state.active=0; } }
  else state.active=+t; sel={r:-1,c:-1}; render(); });

// ייבוא / ייצוא
$('#importFile').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}); commit();
  for(const n of wb.SheetNames){ const a=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:''}); if(!a.length) continue;
    const cols=a[0].map((x,i)=>String(x||colLetter(i))); applyOps(state,[{type:'create_sheet',name:wb.SheetNames.length>1?n:f.name.replace(/\.[^.]+$/,''),columns:cols,rows:a.slice(1)}]); }
  e.target.value=''; render(); };
const values=s=>[s.cols,...s.rows.map((r,i)=>r.map((_,c)=>evaluate(s,i,c)))];
$('#expXlsx').onclick=()=>{ const wb=XLSX.utils.book_new(); state.sheets.forEach(s=>{ const ws=XLSX.utils.aoa_to_sheet([s.cols,...s.rows.map((r,i)=>r.map((v,c)=>typeof v==='string'&&v.startsWith('=')?{f:v.slice(1),v:evaluate(s,i,c)}:v))]); ws['!views']=[{RTL:true}]; XLSX.utils.book_append_sheet(wb,ws,s.name.slice(0,31)); }); wb.Workbook={Views:[{RTL:true}]}; XLSX.writeFile(wb,'ריצ׳י.xlsx'); };
$('#expCsv').onclick=()=>{ const csv='\ufeff'+XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(values(sh()))); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=sh().name+'.csv'; a.click(); };

// צ׳אט AI
$('#toggleChat').onclick=()=>$('#chat').classList.toggle('hide');
const demoBox=$('#demoMode'); demoBox.checked=localStorage.getItem('tavloni-demo')==='1'||new URLSearchParams(location.search).has('demo'); demoBox.onchange=()=>localStorage.setItem('tavloni-demo',demoBox.checked?'1':'0');
function msg(cls,html){ const d=document.createElement('div'); d.className='m '+cls; d.innerHTML=html; $('#msgs').append(d); $('#msgs').scrollTop=1e9; return d; }
msg('a','היי! 👋 אני העוזר של ריצ׳י. אפשר לצרף קובץ (PDF, תמונה, אקסל, CSV, Word) ולכתוב מה לעשות, למשל:\n• "תעשה טבלה רק של עמודים עם סטייה מעל 5 ס״מ"\n• "תמיין לפי תאריך ותוסיף סה״כ"\n• "תדגיש באדום מעל 100"');
$('#chatFile').onchange=async e=>{ for(const f of e.target.files){ const tag=document.createElement('span'); tag.textContent='⏳ '+f.name; $('#attached').append(tag);
    try{ attached.push(await readFile(f)); tag.textContent='📄 '+f.name+' ✖'; tag.onclick=()=>{ attached=attached.filter(a=>a.name!==f.name); tag.remove(); }; }catch(err){ tag.textContent='⚠️ '+f.name; console.error(err); } } e.target.value=''; };
$('#prompt').addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); $('#chatForm').requestSubmit(); } });
$('#chatForm').onsubmit=async e=>{ e.preventDefault(); const prompt=$('#prompt').value.trim(); if(!prompt&&!attached.length) return;
  msg('u',esc(prompt)+(attached.length?'\n📎 '+attached.map(a=>esc(a.name)).join(', '):'')); $('#prompt').value=''; const files=attached; attached=[]; $('#attached').innerHTML='';
  const wait=msg('a','חושב… 🤔'); $('#send').disabled=true;
  try{ const res=await askAI({prompt,files,state,history,demo:demoBox.checked}); history.push({role:'user',text:prompt},{role:'assistant',text:res.explanation||res.question||''});
    const ops=res.operations||[]; wait.innerHTML=esc(res.question?('❓ '+res.question):(res.explanation||'בוצע'));
    if(ops.length){ wait.innerHTML+=`<ol class="ops">${ops.map(o=>`<li>${esc(describe(o))}</li>`).join('')}</ol><div class="row"><button class="accent apply">✔ החל</button><button class="skip">דלג</button></div>`;
      const ap=wait.querySelector('.apply'); ap.onclick=()=>{ commit(); const before=undo.length; applyOps(state,ops); sel={r:-1,c:-1}; render();
        wait.querySelector('.row').innerHTML='<span>✅ הוחל</span> <button class="undoit">↶ בטל</button>';
        wait.querySelector('.undoit').onclick=()=>{ if(undo.length>=before){ doUndo(); wait.querySelector('.row').innerHTML='<span>↶ בוטל</span>'; } }; };
      wait.querySelector('.skip').onclick=()=>wait.querySelector('.row').innerHTML='<span>דילגתי</span>'; }
  }catch(err){ wait.textContent='אופס, משהו השתבש: '+err.message; } $('#send').disabled=false; };
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__tavloni={get state(){return state}};
render();
