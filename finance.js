/* Regras de importação e cálculos, compartilhadas com os testes. */
(function(root){
'use strict';
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
function dateKey(v,date1904=false){
 if(typeof v==='number'){ const p=XLSX.SSF.parse_date_code(v,{date1904}); return p?valid(p.y,p.m,p.d):null; }
 if(v instanceof Date) return valid(v.getFullYear(),v.getMonth()+1,v.getDate());
 const s=String(v??'').trim(); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/); if(m)return valid(+m[1],+m[2],+m[3]);
 m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); return m?valid(+m[3],+m[2],+m[1]):null;
}
function valid(y,m,d){const t=new Date(Date.UTC(y,m-1,d));return y>=1900&&y<=9999&&t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;}
function amount(v){if(v==null||String(v).trim()==='')return null; if(typeof v==='number')return Number.isFinite(v)?Math.round(v*100):NaN;let s=String(v).replace(/R\$|\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return /^-?\d+(\.\d+)?$/.test(s)?Math.round(Number(s)*100):NaN;}
function importBook(w){const s=w.Sheets.CONTAS_A_PAGAR;if(!s)throw Error('A aba CONTAS_A_PAGAR não foi encontrada.');const rows=XLSX.utils.sheet_to_json(s,{header:1,defval:null,raw:true,blankrows:false});const names=['Vencimento','Categoria','Descrição','Valor (R$)','Status'];const h=rows.findIndex(r=>names.every(n=>r.some(v=>normalize(v)===normalize(n))));if(h<0)throw Error('Cabeçalhos obrigatórios: '+names.join(', ')+'.');const ix=names.map(n=>rows[h].findIndex(v=>normalize(v)===normalize(n)));if(names.some(n=>rows[h].filter(v=>normalize(v)===normalize(n)).length!==1))throw Error('Há cabeçalhos duplicados. Corrija a planilha.');const optionalIndex=aliases=>rows[h].findIndex(v=>aliases.some(a=>normalize(v)===normalize(a)));const titleIndex=optionalIndex(['Número do título','Numero do titulo','Nº do título','N° do título','Nº título','Título','Titulo']);const paymentIndex=optionalIndex(['Código de pagamento','Codigo de pagamento','Código pagamento','Codigo pagamento','Linha digitável','Linha digitavel','Código de barras','Codigo de barras','PIX','Pix copia e cola','Código de pagamento (barras ou Pix)','Codigo de pagamento (barras ou Pix)']);const cellText=v=>v==null?'':String(v).trim();const result=[];let blanks=0;for(let i=h+1;i<rows.length;i++){const r=rows[i];if(ix.every(j=>r[j]==null||String(r[j]).trim()===''))continue;const date=dateKey(r[ix[0]],!!w.Workbook?.WBProps?.date1904),cents=amount(r[ix[3]]);if(!date||Number.isNaN(cents))throw Error('Há vencimento ou valor inválido na linha de dados '+(i+1)+'. Corrija a planilha antes de importar.');if(cents===null)blanks++;result.push({date,category:String(r[ix[1]]??'').trim()||'Sem categoria',description:String(r[ix[2]]??'').trim()||'Sem descrição',cents,status:String(r[ix[4]]??'').trim()||'Não informado',title:titleIndex<0?'':cellText(r[titleIndex]),paymentCode:paymentIndex<0?'':cellText(r[paymentIndex])});}if(!result.length)throw Error('A aba não contém despesas.');return {rows:result.sort((a,b)=>a.date.localeCompare(b.date)),blanks};}
const sum=rows=>rows.reduce((n,r)=>n+(r.cents??0),0);
function group(rows,key){const m=new Map;for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return m;}
const filter=(rows,start,end)=>rows.filter(r=>r.date>=start&&r.date<=end);
root.ValeFinance={normalize,dateKey,amount,importBook,sum,group,filter};
})(typeof window!=='undefined'?window:globalThis);
