// החלת פעולות JSON שה‑AI מחזיר על מצב הטבלאות
import { colIndex, toNum } from './formula.js';
export const newSheet = (name='גיליון 1', cols=['A','B','C','D'], rows=null) =>
  ({ name, cols:[...cols], rows: rows || Array.from({length:20},()=>cols.map(()=>'')), fmt:{}, rules:[], view:null });
export function findCol(sh, col){
  if(typeof col==='number') return col;
  if(col==null) return -1;
  let i = sh.cols.findIndex(c=>c===col); if(i>=0) return i;
  i = sh.cols.findIndex(c=>String(c).trim().toLowerCase()===String(col).trim().toLowerCase()); if(i>=0) return i;
  i = sh.cols.findIndex(c=>String(c).includes(col)||String(col).includes(c)); if(i>=0) return i;
  if(/^[A-Z]{1,2}$/i.test(col)) return colIndex(col);
  return -1;
}
export const test = (v, op, x) => {
  const a=toNum(v), b=toNum(x), num=!isNaN(a)&&!isNaN(b);
  switch(op){ case '>':return num&&a>b; case '>=':return num&&a>=b; case '<':return num&&a<b; case '<=':return num&&a<=b;
    case '=':case '==':return num?a===b:String(v)===String(x); case '!=':return num?a!==b:String(v)!==String(x);
    case 'abs>':return num&&Math.abs(a)>b; case 'abs>=':return num&&Math.abs(a)>=b;
    case 'contains':return String(v??'').includes(x); case 'empty':return v===''||v==null; case 'notempty':return !(v===''||v==null);
    default:return false; }
};
const trimEmpty = sh => { while(sh.rows.length && sh.rows[sh.rows.length-1].every(v=>v===''||v==null)) sh.rows.pop(); };
export function describe(op){
  const t={create_sheet:`גיליון חדש "${op.name}" עם ${op.rows?.length||0} שורות`,set_cells:`עדכון ${op.cells?.length||0} תאים`,add_rows:`הוספת ${op.rows?.length||0} שורות`,
    add_column:`עמודה חדשה "${op.name}"`,delete_column:`מחיקת עמודה "${op.column}"`,rename_column:`שינוי שם "${op.column}" ← "${op.to}"`,
    filter_rows:`השארת רק שורות שבהן "${op.column}" ${op.op} ${op.value??''}`,delete_rows:`מחיקת שורות שבהן "${op.column}" ${op.op} ${op.value??''}`,
    sort:`מיון לפי "${op.column}" ${op.dir==='desc'?'מהגדול לקטן':'מהקטן לגדול'}`,highlight:`הדגשת "${op.column}" ${op.op} ${op.value??''}`,
    add_total:`שורת סיכום (${op.func||'SUM'}) ל‑${(op.columns||[]).join(', ')}`,select_sheet:`מעבר לגיליון "${op.name}"`,format_cells:`עיצוב תאים`,clear_sheet:'ניקוי הגיליון'};
  return t[op.type]||op.type;
}
export function applyOps(state, ops){
  for(const op of ops){
    let sh = state.sheets[state.active];
    switch(op.type){
      case 'create_sheet': {
        let name=op.name||'גיליון חדש'; while(state.sheets.some(s=>s.name===name)) name+=' (2)';
        const cols=op.columns||[]; const rows=(op.rows||[]).map(r=>Array.isArray(r)?cols.map((_,i)=>r[i]??''):cols.map(c=>r[c]??''));
        state.sheets.push(newSheet(name, cols, rows)); state.active=state.sheets.length-1; break; }
      case 'select_sheet': { const i=state.sheets.findIndex(s=>s.name===op.name); if(i>=0) state.active=i; break; }
      case 'clear_sheet': sh.rows=[]; sh.fmt={}; sh.rules=[]; break;
      case 'set_cells': for(const {row,col,value} of op.cells||[]){ const c=findCol(sh,col); if(c<0) continue;
          while(sh.rows.length<=row) sh.rows.push(sh.cols.map(()=>'')); sh.rows[row][c]=value; } break;
      case 'add_rows': trimEmpty(sh); for(const r of op.rows||[]) sh.rows.push(Array.isArray(r)?sh.cols.map((_,i)=>r[i]??''):sh.cols.map(c=>r[c]??'')); break;
      case 'add_column': { const at = op.after!=null ? findCol(sh,op.after)+1 : sh.cols.length;
          sh.cols.splice(at,0,op.name||'עמודה'); sh.rows.forEach((r,i)=>{ let v=op.values?.[i]??'';
            if(op.formula) v=op.formula.replace(/\{r\}/g,i+1); r.splice(at,0,v); }); sh.fmt={}; break; }
      case 'delete_column': { const c=findCol(sh,op.column); if(c<0) break; sh.cols.splice(c,1); sh.rows.forEach(r=>r.splice(c,1)); sh.rules=sh.rules.filter(x=>x.col!==c); break; }
      case 'rename_column': { const c=findCol(sh,op.column); if(c>=0) sh.cols[c]=op.to; break; }
      case 'filter_rows': case 'delete_rows': { const c=findCol(sh,op.column); if(c<0) break; trimEmpty(sh);
          sh.rows=sh.rows.filter(r=>{ const t=test(r[c],op.op,op.value); return op.type==='filter_rows'?t:!t; }); sh.fmt={}; break; }
      case 'sort': { const c=findCol(sh,op.column); if(c<0) break; trimEmpty(sh); const d=op.dir==='desc'?-1:1;
          const key=v=>{ const n=toNum(v); if(!isNaN(n)) return n; const m=String(v).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); if(m) return new Date(+(m[3].length===2?'20'+m[3]:m[3]),m[2]-1,+m[1]).getTime(); return String(v??''); };
          sh.rows.sort((a,b)=>{ const x=key(a[c]),y=key(b[c]); return (typeof x===typeof y ? (x>y?1:x<y?-1:0) : (typeof x==='number'?-1:1))*d; }); sh.fmt={}; break; }
      case 'highlight': { const c=findCol(sh,op.column); if(c>=0) sh.rules.push({col:c,op:op.op,value:op.value,color:op.color||'#ffd6d6',row:!!op.whole_row}); break; }
      case 'format_cells': for(const {row,col,bold,bg,color} of op.cells||[]){ const c=findCol(sh,col); if(c>=0) sh.fmt[row+','+c]={bold,bg,color}; } break;
      case 'add_total': { trimEmpty(sh); const n=sh.rows.length; const f=(op.func||'SUM').toUpperCase(); const L=i=>{let s='',x=i+1;while(x>0){const m=(x-1)%26;s=String.fromCharCode(65+m)+s;x=Math.floor((x-1)/26);}return s;};
          const row=sh.cols.map(()=> ''); row[0]=op.label||'סה״כ';
          for(const col of op.columns||[]){ const c=findCol(sh,col); if(c>=0) row[c]=`=${f}(${L(c)}1:${L(c)}${n})`; }
          sh.rows.push(row); sh.fmt[n+',0']={bold:true}; break; }
    }
  }
  return state;
}
