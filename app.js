/* Contratos SVSA — aplicação (Supabase) */
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const STATUSES = ["Vigente","Renovar","Indeterminado","Encerrado","Distratado"];
const ST_LABEL = {Vigente:"Vigente",Renovar:"Renovar",Indeterminado:"Prazo indeterminado",Encerrado:"Encerrado",Distratado:"Distratado"};
const ST_VAR = {Vigente:"--ok",Renovar:"--warn",Indeterminado:"--ind",Encerrado:"--bad",Distratado:"--dis"};
const UNITS = ["Ritápolis","Perdões","CD","Matriz","Sede BH"];
const SETORES = ["Manutenção","Captação","G&A","Comercial","Logística","Produção"];
const TODOS = "Todos os setores";
const FIELDS = [
  {sec:"Identificação"},
  {k:"num",l:"Nº do contrato",t:"text",req:1},
  {k:"tipo",l:"Tipo",t:"select",opts:["Recorrente","Específico"]},
  {k:"empresa",l:"Empresa / fornecedor",t:"text",full:1,req:1},
  {k:"objeto",l:"Objeto do contrato",t:"textarea",full:1},
  {k:"setores",l:"Setor(es)",t:"setores",full:1},
  {k:"unidades",l:"Unidade(s)",t:"units",full:1},
  {sec:"Prazos"},
  {k:"inicio",l:"Início",t:"date"},
  {k:"termino",l:"Término",t:"date",hint:"Deixe vazio se o prazo for indeterminado"},
  {k:"avisoDias",l:"Aviso de renovação (dias)",t:"int"},
  {k:"renovAuto",l:"Renovação automática",t:"select",opts:["Sim","Não"]},
  {k:"rescDias",l:"Aviso de rescisão (dias)",t:"int"},
  {k:"distrato",l:"Data do distrato",t:"date",hint:"Preenchida = contrato distratado"},
  {sec:"Valores"},
  {k:"valor",l:"Valor mensal (R$)",t:"money"},
  {k:"reaj",l:"% reajuste anual",t:"pct",hint:"Ex.: 5,5"},
  {k:"multa",l:"Possui multa?",t:"select",opts:["Sim","Não"]},
  {k:"valorMulta",l:"Valor da multa (R$)",t:"money"},
  {sec:"Gestão"},
  {k:"resp",l:"Responsável pelo contrato",t:"text"},
  {k:"validado",l:"Validado pela controladoria",t:"select",opts:["Sim","Não","Em processo de validação com diretoria"]},
  {k:"arquivo",l:"Arquivo (PDF) vinculado",t:"text",full:1},
  {k:"obs",l:"Observações",t:"textarea",full:1},
  {k:"obs2",l:"Observações da controladoria",t:"textarea",full:1},
];
const LABEL = Object.fromEntries(FIELDS.filter(f=>f.k).map(f=>[f.k,f.l]));
LABEL.pdfId = "PDF anexado";
const CONF_LABEL={ok:"confere",corrigido:"corrigido pela conferência",verificar:"precisa de verificação"};



const pd = s => s ? new Date(s+"T00:00:00") : null;
const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const days = (a,b) => Math.round((b-a)/864e5);
const fmtD = s => s ? String(s).slice(0,10).split("-").reverse().join("/") : "—";
const brl = v => v==null||v==="" ? "—" : Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const ago = t => { if(!t) return ""; const m=Math.round((Date.now()-new Date(t))/6e4);
  if(m<1) return "agora"; if(m<60) return `há ${m} min`; const h=Math.round(m/60); if(h<24) return `há ${h} h`;
  return new Date(t).toLocaleDateString("pt-BR"); };

let DATA=[], ALL=[], PERFIS=[], PERFIL_POR_EMAIL={}, ME=null, MEU_EMAIL="";
let isOwnerV=false, ALLOWED=null, view="contratos";
let openNum=null, editing=false;
const state={q:"",se:"",st:"",un:"",tipo:"",conf:"",sort:"num",dir:1};
try{Object.assign(state,JSON.parse(localStorage.getItem("contratos-svsa-f")||"{}"))}catch(e){}
const saveF=()=>{try{localStorage.setItem("contratos-svsa-f",JSON.stringify(state))}catch(e){}};
document.getElementById("today").textContent = TODAY.toLocaleDateString("pt-BR");

function toast(msg,bad){const t=document.getElementById("toast");t.textContent=msg;t.className="toast"+(bad?" bad":"");t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,bad?9000:3200);}

function derive(raw,id){
  const d={...raw,_id:id};
  const t=pd(d.termino), a=pd(d.dataAviso);
  d.rest = t ? days(TODAY,t) : null;
  d.avisoRest = a ? days(TODAY,a) : null;
  if (d.distrato) d.st="Distratado";
  else if (!t) d.st="Indeterminado";
  else if (t<TODAY) d.st="Encerrado";
  else if (a && TODAY>=a) d.st="Renovar";
  else d.st="Vigente";
  d.unitList = !d.unidades ? [] : String(d.unidades).split("/").map(s=>s.trim()).filter(Boolean);
  d.setorList = Array.isArray(d.setores) ? d.setores.filter(Boolean) : (d.setores ? String(d.setores).split("/").map(s=>s.trim()).filter(Boolean) : []);
  d.setorTxt = d.setorList.join(" / ");
  d._s = norm([d.num,d.empresa,d.objeto,d.obs,d.obs2,d.unidades,d.setorTxt,d.arquivo,d.resp,d.conf&&d.conf.nota].join(" "));
  return d;
}

function renderKpis(){
  const active = DATA.filter(d=>d.st==="Vigente"||d.st==="Renovar"||d.st==="Indeterminado");
  const monthly = active.reduce((s,d)=>s+(Number(d.valor)||0),0);
  const c = s => DATA.filter(d=>d.st===s).length;
  const items=[{k:"",label:"Total de contratos",v:DATA.length},...STATUSES.map(s=>({k:s,label:ST_LABEL[s],v:c(s),dot:ST_VAR[s]}))];
  const el=document.getElementById("kpis");
  el.innerHTML=items.map(i=>`<button class="kpi" type="button" data-k="${i.k}" aria-pressed="${state.st===i.k}">
    <span class="eyebrow">${i.dot?`<span class="dot" style="background:var(${i.dot})"></span>`:""}${i.label}</span>
    <span class="v">${i.v}</span></button>`).join("");
  el.querySelectorAll(".kpi").forEach(b=>b.onclick=()=>{state.st=b.dataset.k;sync();goList();});
  const last = DATA.map(d=>d.updatedAt).filter(Boolean).sort().pop();
  document.getElementById("sub").innerHTML = `Custo mensal dos contratos ativos: <b class="num">R$ ${brl(monthly)}</b> em ${active.filter(d=>d.valor).length} contratos com valor fixo.${last?` Última edição ${esc(ago(last))}.`:""}`;
}

function renderAlerts(){
  const ev=[];
  DATA.forEach(d=>{
    if (d.st==="Distratado") return;
    if (d.avisoRest!=null && d.avisoRest>=-30 && d.avisoRest<=120 && d.rest!=null && d.rest>=0) ev.push({d,n:d.avisoRest,what:"aviso",date:d.dataAviso});
    if (d.rest!=null && d.rest>=0 && d.rest<=120) ev.push({d,n:d.rest,what:"término",date:d.termino});
  });
  ev.sort((a,b)=>a.n-b.n);
  const el=document.getElementById("alerts");
  if(!ev.length){el.innerHTML='<div class="empty">Nenhum prazo nos próximos 120 dias.</div>';return;}
  el.innerHTML=ev.map(e=>`<button class="alert" type="button" data-n="${esc(e.d._id)}">
    <span class="d" style="color:${e.n<0?'var(--bad)':e.n<=30?'var(--warn)':'var(--ink)'}">${Math.abs(e.n)}<small>${e.n<0?'dias atrás':'dias'}</small></span>
    <span class="t"><b>${esc(e.d.empresa)}</b><span>${e.what==="término"?"Término":"Aviso de renovação"} em ${fmtD(e.date)} · Renov. automática: ${esc(e.d.renovAuto||"—")}</span></span>
    <span class="pill s-${e.d.st}">${ST_LABEL[e.d.st]}</span></button>`).join("");
  el.querySelectorAll(".alert").forEach(b=>b.onclick=()=>openDrawer(b.dataset.n));
}

function renderBars(){
  const rows=SETORES.map(u=>{const list=DATA.filter(d=>d.setorList.includes(u));return {u,total:list.length,by:STATUSES.map(s=>list.filter(d=>d.st===s).length)};}).filter(r=>r.total);
  const sem=DATA.filter(d=>!d.setorList.length).length;
  const max=Math.max(1,...rows.map(r=>r.total));
  const el=document.getElementById("bars");
  el.innerHTML=(rows.length?rows.map(r=>`<button class="bar" type="button" data-u="${esc(r.u)}" title="${esc(r.u)}" aria-pressed="${state.se===r.u}">
    <span class="lbl" style="${state.se===r.u?'color:var(--accent);font-weight:600':''}">${esc(r.u)}</span>
    <span class="track">${r.by.map((n,i)=>n?`<i style="width:${n/max*100}%;background:var(${ST_VAR[STATUSES[i]]})" title="${ST_LABEL[STATUSES[i]]}: ${n}"></i>`:"").join("")}</span>
    <span class="n">${r.total}</span></button>`).join(""):'<div class="empty">Nenhum contrato com setor definido.</div>')
    +(sem?`<button class="bar" type="button" data-u="__sem" aria-pressed="${state.se==='__sem'}"><span class="lbl" style="color:var(--warn)">Sem setor</span><span class="track"></span><span class="n">${sem}</span></button>`:"");
  el.querySelectorAll(".bar").forEach(b=>b.onclick=()=>{state.se=state.se===b.dataset.u?"":b.dataset.u;sync();goList();});
  document.getElementById("legend").innerHTML=STATUSES.map(s=>`<span style="--c:var(${ST_VAR[s]})">${ST_LABEL[s]}</span>`).join("");
}

function fillSelects(){
  const opt=(v,l,cur)=>`<option value="${esc(v)}"${v===cur?" selected":""}>${esc(l)}</option>`;
  document.getElementById("fStatus").innerHTML=opt("","Todas as situações",state.st)+STATUSES.map(s=>opt(s,ST_LABEL[s],state.st)).join("");
  const mySet=ALLOWED===null?SETORES:SETORES.filter(x=>ALLOWED.has(x));
  document.getElementById("fSetor").innerHTML=opt("","Todos os setores",state.se)+mySet.map(u=>opt(u,u,state.se)).join("")+(isOwnerV?opt("__sem","Sem setor definido",state.se):"");
  document.getElementById("fUnid").innerHTML=opt("","Todas as unidades",state.un)+UNITS.map(u=>opt(u,u,state.un)).join("")+opt("__rev","Unidade a revisar",state.un);
  const tipos=[...new Set(DATA.map(d=>d.tipo).filter(Boolean))];
  document.getElementById("fTipo").innerHTML=opt("","Todos os tipos",state.tipo)+tipos.map(t=>opt(t,t,state.tipo)).join("");
  document.getElementById("fConf").innerHTML=opt("","Toda conferência",state.conf)+[["verificar","Precisa de verificação"],["corrigido","Corrigido na conferência"],["ok","Confere com o PDF"],["sem","Sem conferência"]].map(([v,l])=>opt(v,l,state.conf)).join("");
  if(document.activeElement!==document.getElementById("q")) document.getElementById("q").value=state.q;
}

function filtered(){
  const q=norm(state.q).trim();
  const r=DATA.filter(d=>(!state.se||(state.se==='__sem'?!d.setorList.length:d.setorList.includes(state.se)))&&(!state.st||d.st===state.st)&&(!state.un||(state.un==='__rev'?!!d.unidadeRevisar:d.unitList.includes(state.un)))&&(!state.tipo||d.tipo===state.tipo)&&(!state.conf||(state.conf==='sem'?!d.conf:(d.conf&&d.conf.status===state.conf)))&&(!q||q.split(/\s+/).every(w=>d._s.includes(w))));
  const k=state.sort, dir=state.dir;
  r.sort((a,b)=>{let x=a[k],y=b[k];
    if(k==="st"){x=STATUSES.indexOf(x);y=STATUSES.indexOf(y);}
    if(x==null||x==="") return 1; if(y==null||y==="") return -1;
    if(typeof x==="number"&&typeof y==="number") return (x-y)*dir;
    return String(x).localeCompare(String(y),"pt-BR",{numeric:true})*dir;});
  return r;
}

function whoName(e){ if(!e) return ""; if(e===MEU_EMAIL) return "você"; const p=PERFIL_POR_EMAIL[e]; return (p&&p.nome)||e; }

function renderTable(){
  const r=filtered();
  document.getElementById("count").textContent=`${r.length} de ${DATA.length} contratos`+(ALLOWED!==null?" do seu setor":"");
  document.getElementById("tbody").innerHTML = r.length ? r.map(d=>{
    const rc=d.rest==null?'<span class="muted">—</span>':d.rest<0?`<span class="days-neg">${d.rest}</span>`:d.rest<=60?`<span class="days-warn">${d.rest}</span>`:d.rest;
    return `<tr data-n="${esc(d._id)}" tabindex="0">
      <td class="num">${esc(d.num)}</td>
      <td><div class="emp">${esc(d.empresa)}</div><div class="obj">${esc(d.objeto)}</div></td>
      <td>${d.setorList.length?esc(d.setorTxt):'<span class="muted">—</span>'}</td>
      <td>${esc(d.unidades||"—")}${d.unidadeRevisar?`<div class="flag">revisar unidade</div>`:""}</td>
      <td><span class="pill s-${d.st}">${ST_LABEL[d.st]}</span>${d.conf&&d.conf.status==="verificar"?`<div class="flag">verificar</div>`:""}</td>
      <td class="num">${fmtD(d.termino)}</td>
      <td class="num r">${rc}</td>
      <td class="num r">${brl(d.valor)}</td>
      <td class="edited">${d.updatedAt?`${esc(ago(d.updatedAt))}${d.updatedBy?`<br>${esc(whoName(d.updatedBy))}`:""}`:"planilha"}</td></tr>`;}).join("")
    : `<tr><td colspan="9" class="empty" style="text-align:center">${DATA.length?"Nenhum contrato com esses filtros. Use “Limpar filtros” para ver todos.":"Nenhum contrato cadastrado."}</td></tr>`;
  document.querySelectorAll("#tbody tr[data-n]").forEach(tr=>{tr.onclick=()=>openDrawer(tr.dataset.n);tr.onkeydown=e=>{if(e.key==="Enter")openDrawer(tr.dataset.n)};});
  document.querySelectorAll("th[data-sort]").forEach(th=>{th.querySelector(".arr").textContent=th.dataset.sort===state.sort?(state.dir>0?"↑":"↓"):"";});
}

function goList(){
  const el=document.getElementById("lista"); if(!el) return;
  const still=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({behavior:still?"auto":"smooth",block:"start"});
  const c=document.getElementById("count"); c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse");
}
function sync(){ saveF(); fillSelects(); renderKpis(); renderAlerts(); renderBars(); renderTable(); }
/* ---------- drawer: view ---------- */
function openDrawer(id){ openNum=id; editing=false; drawView(); }
function drawView(){
  const d=DATA.find(x=>x._id===openNum); if(!d){closeDrawer();return;}
  const s=pd(d.inicio), t=pd(d.termino);
  let tl="";
  if(s&&t&&t>s){const p=Math.max(0,Math.min(100,(TODAY-s)/(t-s)*100));
    tl=`<div><div class="eyebrow" style="margin-bottom:6px">Vigência · ${Math.round(p)}% decorrido</div><div class="timeline"><i style="width:${p}%"></i></div><div class="tl-l"><span>${fmtD(d.inicio)}</span><span>${fmtD(d.termino)}</span></div></div>`;}
  const f=(l,v,cls="")=>`<div class="${cls}"><dt>${l}</dt><dd>${v}</dd></div>`;
  const hist=(d.hist||[]).slice().reverse();
  const el=document.getElementById("drawer");
  el.innerHTML=`<div class="dhead"><div><div class="eyebrow">Contrato nº ${esc(d.num)} · ${esc(d.tipo||"tipo não informado")}</div>
    <h3 id="dTitle">${esc(d.empresa)}</h3><span class="pill s-${d.st}">${ST_LABEL[d.st]}</span></div>
    <button class="close" id="dClose" type="button" aria-label="Fechar">×</button></div>
    <div class="dbody">
      <p style="margin:0">${esc(d.objeto)}</p>
      ${(d.anexos||[]).length?`<div style="display:flex;flex-direction:column;gap:8px">${d.anexos.map((a,i)=>`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="pdfchip"><b style="color:var(--bad);font-size:11px;letter-spacing:.05em">${esc((String(a.nome).match(/\.([a-z0-9]{2,4})$/i)||[,"ARQ"])[1].toUpperCase())}</b><span>${esc(a.nome||"arquivo")}</span></span>
        ${a.path?`<button class="btn" type="button" data-fv="${i}">Abrir</button><button class="btn" type="button" data-fd="${i}">Baixar</button>${isOwnerV?`<button class="btn danger" type="button" data-fx="${i}">Remover</button>`:""}`
          :`<span class="flag" style="margin:0">arquivo ainda não enviado ao site</span>`}</div>`).join("")}</div>`
        : (writable()?`<div class="edited">Nenhum arquivo anexado. Use “Editar contrato” para anexar.</div>`:"")}
      ${d.conf?`<div class="conf conf-${esc(d.conf.status)}"><div class="eyebrow">Conferência com o PDF · ${esc(fmtD(d.conf.data))} · ${esc(CONF_LABEL[d.conf.status]||d.conf.status)}</div>
        ${d.conf.nota?`<div>${esc(d.conf.nota)}</div>`:""}
        ${d.conf.alterado&&d.conf.alterado.length?`<div class="edited">Campos ajustados: ${esc(d.conf.alterado.map(k=>LABEL[k]||k).join(", "))}</div>`:""}</div>`:""}
      ${tl}
      <dl>
        ${f("Início",`<span class="num">${fmtD(d.inicio)}</span>`)}
        ${f("Término",`<span class="num">${fmtD(d.termino)}</span>`)}
        ${f("Dias restantes",`<span class="num">${d.rest==null?"—":d.rest<0?"encerrado há "+Math.abs(d.rest):d.rest}</span>`)}
        ${f("Vigência (dias)",`<span class="num">${d.vig??"—"}</span>`)}
        ${f("Valor mensal",`<span class="num">R$ ${brl(d.valor)}</span>`)}
        ${f("Valor reajustado",`<span class="num">R$ ${brl(d.valorReaj)}</span>`)}
        ${f("% reajuste anual",d.reaj==null||d.reaj===""?"—":`<span class="num">${(d.reaj*100).toLocaleString("pt-BR",{maximumFractionDigits:2})}%</span>`)}
        ${f("Renovação automática",esc(d.renovAuto||"—"))}
        ${f("Aviso de renovação",d.avisoDias?`${d.avisoDias} dias · <span class="num">${fmtD(d.dataAviso)}</span>`:"—")}
        ${f("Aviso de rescisão",d.rescDias?`${d.rescDias} dias`:"—")}
        ${f("Possui multa?",esc(d.multa||"—"))}
        ${f("Valor da multa",d.valorMulta?`<span class="num">R$ ${brl(d.valorMulta)}</span>`:"—")}
        ${f("Setor(es)",d.setorList.length?esc(d.setorTxt):"—","full")}
        ${f("Unidade(s)",esc(d.unidades||"—")+(d.unidadeRevisar?` <span class="flag" style="display:inline">revisar · antes: ${esc(d.unidadeRevisar)}</span>`:""),"full")}
        ${f("Responsável",esc(d.resp||"—"))}
        ${f("Validado pela controladoria",esc(d.validado||"—"))}
        ${d.distrato?f("Data do distrato",`<span class="num">${fmtD(d.distrato)}</span>`):""}
        ${f("Arquivo vinculado",`<span class="file">${esc(d.arquivo||"—")}</span>`,"full")}
      </dl>
      ${d.obs?`<div><div class="eyebrow" style="margin-bottom:6px">Observações</div><div class="note">${esc(d.obs)}</div></div>`:""}
      ${d.obs2?`<div><div class="eyebrow" style="margin-bottom:6px">Observações da controladoria</div><div class="note">${esc(d.obs2)}</div></div>`:""}
      <div><div class="eyebrow" style="margin-bottom:6px">Histórico de alterações</div>
        <div class="hist">${hist.length?hist.map(h=>`<div><b>${esc(new Date(h.at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}))}</b> · ${h.action==="conferencia"?"Conferência com os PDFs · "+(h.fields&&h.fields.length?"ajustou "+esc(h.fields.map(k=>LABEL[k]||k).join(", ")):"anexou os documentos"):esc(whoName(h.by)||"alguém")+" · "+(h.action==="create"?"criou o contrato":"alterou "+esc((h.fields||[]).map(k=>LABEL[k]||k).join(", ")))}</div>`).join(""):"<div>Sem alterações desde a importação da planilha.</div>"}</div></div>
    </div>
    ${writable()?`<div class="dfoot" id="dfoot">
      ${isOwnerV?`<button class="btn danger" id="dDel" type="button">Excluir</button>`:""}<span class="spacer"></span>
      <button class="btn primary" id="dEdit" type="button">Editar contrato</button></div>`:""}`;
  showDrawer();
  document.getElementById("dClose").onclick=closeDrawer;
  const e=document.getElementById("dEdit"); if(e) e.onclick=()=>{editing=true;drawForm(d);};
  const del=document.getElementById("dDel"); if(del) del.onclick=()=>askDelete(d);
  el.querySelectorAll("[data-fv]").forEach(b=>b.onclick=()=>openFile(d,+b.dataset.fv,false,b));
  el.querySelectorAll("[data-fd]").forEach(b=>b.onclick=()=>openFile(d,+b.dataset.fd,true,b));
  el.querySelectorAll("[data-fx]").forEach(b=>b.onclick=()=>removeFile(d,+b.dataset.fx));
}

/* ---------- arquivos: abrir e baixar ---------- */
async function signedUrl(a,download){
  const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(a.path,600,download?{download:a.nome||true}:undefined);
  if(error) throw error; return data.signedUrl;
}
async function openFile(d,i,download,btn){
  const a=(d.anexos||[])[i]; if(!a||!a.path){toast("Este arquivo ainda não foi enviado para o site.",true);return;}
  const w=download?null:window.open("about:blank","_blank");
  const t=btn&&btn.textContent; if(btn){btn.disabled=true;btn.textContent="Abrindo…";}
  try{ const url=await signedUrl(a,download);
    if(download){const l=document.createElement("a");l.href=url;l.rel="noopener";document.body.appendChild(l);l.click();l.remove();}
    else if(w) w.location=url; else location.href=url;
  }catch(e){ if(w) w.close(); toast("Não foi possível abrir o arquivo agora. Tente de novo.",true); console.warn(e); }
  finally{ if(btn){btn.disabled=false;btn.textContent=t;} }
}
async function removeFile(d,i){
  const a=(d.anexos||[])[i]; if(!a) return;
  if(!confirmInline(`Remover o arquivo “${a.nome}” deste contrato?`)) return;
  try{
    if(a.path){ const {error}=await sb.storage.from(BUCKET).remove([a.path]); if(error) throw error; }
    const anexos=d.anexos.filter((_,k)=>k!==i);
    const {error}=await sb.from("contratos").update({anexos}).eq("id",d._id); if(error) throw error;
    toast("Arquivo removido"); await loadContratos(); drawView();
  }catch(e){ toast("Não foi possível remover o arquivo.",true); console.warn(e); }
}
function confirmInline(msg){ return window.confirm(msg); }

const safeName=n=>String(n||"arquivo").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9._-]+/g,"_").replace(/_+/g,"_").slice(-120);
async function uploadTo(id,file){
  const path=`${id}/${Date.now().toString(36)}-${safeName(file.name)}`;
  const {error}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
  if(error) throw error; return path;
}

function askDelete(d){
  const foot=document.getElementById("dfoot");
  foot.innerHTML=`<div class="confirm">Excluir o contrato nº ${esc(d.num)} de vez? Essa ação não pode ser desfeita.</div><span class="spacer"></span>
    <button class="btn" id="cNo" type="button">Cancelar</button><button class="btn danger" id="cYes" type="button" style="border-color:var(--bad)">Excluir contrato</button>`;
  document.getElementById("cNo").onclick=drawView;
  document.getElementById("cYes").onclick=async()=>{
    try{
      const paths=(d.anexos||[]).map(a=>a.path).filter(Boolean);
      if(paths.length) await sb.storage.from(BUCKET).remove(paths);
      const {error}=await sb.from("contratos").delete().eq("id",d._id); if(error) throw error;
      toast("Contrato excluído"); closeDrawer(); await loadContratos();
    }catch(e){ toast("Não foi possível excluir. Só administradores excluem contratos.",true); }
  };
}

/* ---------- drawer: form ---------- */
let pendingFiles=[];
function drawForm(d){
  const isNew=!d;
  const v=d||{tipo:"Recorrente",renovAuto:"Não",multa:"Não",num:nextNum(),setores:ALLOWED&&ALLOWED.size===1?[...ALLOWED]:[]};
  const input=f=>{
    const id="f_"+f.k, val=v[f.k];
    if(f.t==="textarea") return `<textarea id="${id}">${esc(val)}</textarea>`;
    if(f.t==="select") return `<select id="${id}"><option value="">—</option>${f.opts.map(o=>`<option${o===val?" selected":""}>${esc(o)}</option>`).join("")}</select>`;
    if(f.t==="units"){const cur=String(val||"").split("/").map(s=>s.trim());
      return `<div class="checks" id="${id}">${UNITS.map((u,i)=>`<label><input type="checkbox" value="${esc(u)}" id="${id}_${i}"${cur.includes(u)?" checked":""}>${esc(u)}</label>`).join("")}</div>`;}
    if(f.t==="setores"){const cur=Array.isArray(val)?val:String(val||"").split("/").map(s=>s.trim());
      const opts=ALLOWED===null?SETORES:SETORES.filter(x=>ALLOWED.has(x));
      return `<div class="checks" id="${id}">${opts.map((u,i)=>`<label><input type="checkbox" value="${esc(u)}" id="${id}_${i}"${cur.includes(u)?" checked":""}>${esc(u)}</label>`).join("")}</div>`;}
    if(f.t==="date") return `<input id="${id}" type="date" value="${esc(val?String(val).slice(0,10):"")}">`;
    if(f.t==="int") return `<input id="${id}" type="number" inputmode="numeric" step="1" min="0" value="${val??""}">`;
    if(f.t==="money") return `<input id="${id}" type="number" inputmode="decimal" step="0.01" min="0" value="${val??""}">`;
    if(f.t==="pct") return `<input id="${id}" type="number" inputmode="decimal" step="0.01" value="${val==null||val===""?"":+(val*100).toFixed(4)}">`;
    return `<input id="${id}" type="text" value="${esc(val)}">`;
  };
  const el=document.getElementById("drawer");
  el.innerHTML=`<div class="dhead"><div><div class="eyebrow">${isNew?"Novo contrato":"Editando contrato nº "+esc(v.num)}</div>
    <h3 id="dTitle">${isNew?"Cadastrar contrato":esc(v.empresa)}</h3></div>
    <button class="close" id="dClose" type="button" aria-label="Fechar">×</button></div>
    <form class="dbody form" id="form" novalidate>
      <div class="drop" id="drop">
        <div class="row"><button class="btn" type="button" id="pickPdf">Anexar arquivo</button>
          <span class="h">ou arraste aqui · PDF, Word, Excel ou imagem, até 50 MB</span></div>
        <div class="h">O arquivo fica guardado junto com o contrato quando você salvar.</div>
        ${(v.anexos||[]).length?`<div class="h">Já anexados: ${esc(v.anexos.map(a=>a.nome).join(" · "))}</div>`:""}
        <div class="aistat" id="aiStat" aria-live="polite"></div>
        <input type="file" id="fPdf" multiple hidden>
      </div>
      <div class="fgrid">
      ${FIELDS.map(f=>f.sec?`<div class="fsec">${f.sec}</div>`:`<div class="field${f.full?" full":""}" data-k="${f.k}">
        ${(f.t==="units"||f.t==="setores")?`<span class="lab">${f.l}</span>`:`<label for="f_${f.k}">${f.l}${f.req?" *":""}</label>`}${input(f)}
        ${f.hint?`<span class="hint">${f.hint}</span>`:""}<span class="errmsg" hidden></span></div>`).join("")}
      <div class="fsec">Calculado automaticamente</div>
      <div class="field full"><span class="hint" id="calc"></span></div>
    </div></form>
    <div class="dfoot"><span class="edited" id="fMsg"></span><span class="spacer"></span>
      <button class="btn" id="fCancel" type="button">Cancelar</button>
      <button class="btn primary" id="fSave" type="button">${isNew?"Cadastrar contrato":"Salvar alterações"}</button></div>`;
  showDrawer();
  const form=document.getElementById("form");
  const upd=()=>{const b=readForm();document.getElementById("calc").textContent=
    `Vigência: ${b.vig??"—"} dias · Data do aviso de renovação: ${fmtD(b.dataAviso)} · Valor reajustado: R$ ${brl(b.valorReaj)}`;};
  form.addEventListener("input",upd); upd();
  form.addEventListener("submit",e=>e.preventDefault());
  document.getElementById("dClose").onclick=closeDrawer;
  document.getElementById("fCancel").onclick=()=>isNew?closeDrawer():drawView();
  document.getElementById("fSave").onclick=()=>saveForm(d);
  document.getElementById("f_empresa").focus();
  pendingFiles=[];
  const drop=document.getElementById("drop"), fi=document.getElementById("fPdf");
  document.getElementById("pickPdf").onclick=()=>fi.click();
  fi.onchange=()=>{ addFiles([...fi.files]); fi.value=""; };
  drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("over");});
  drop.addEventListener("dragleave",()=>drop.classList.remove("over"));
  drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("over");addFiles([...e.dataTransfer.files]);});
}
function aiStat(html,cls){const el=document.getElementById("aiStat");if(el){el.className="aistat "+(cls||"");el.innerHTML=html;}}
function addFiles(list){
  const big=list.filter(f=>f.size>50*1024*1024);
  pendingFiles.push(...list.filter(f=>f.size<=50*1024*1024));
  const arq=document.getElementById("f_arquivo"); if(arq&&!arq.value.trim()&&pendingFiles[0]) arq.value=pendingFiles[0].name;
  aiStat((pendingFiles.length?`Pronto para anexar ao salvar: <b>${esc(pendingFiles.map(f=>f.name).join(", "))}</b>.`:"")+(big.length?` <span style="color:var(--bad)">Passa de 50 MB e não será anexado: ${esc(big.map(f=>f.name).join(", "))}.</span>`:""),big.length&&!pendingFiles.length?"bad":"ok");
}
function readForm(){
  const b={};
  FIELDS.filter(f=>f.k).forEach(f=>{
    const el=document.getElementById("f_"+f.k);
    if(f.t==="units"){b[f.k]=[...el.querySelectorAll("input:checked")].map(i=>i.value).join(" / ")||null;return;}
    if(f.t==="setores"){b[f.k]=[...el.querySelectorAll("input:checked")].map(i=>i.value);return;}
    let v=el.value.trim();
    if(v===""){b[f.k]=null;return;}
    if(f.t==="int") v=parseInt(v,10);
    else if(f.t==="money") v=Math.round(parseFloat(v.replace(",","."))*100)/100;
    else if(f.t==="pct") v=parseFloat(v.replace(",","."))/100;
    b[f.k]=(typeof v==="number"&&isNaN(v))?null:v;
  });
  const s=pd(b.inicio), t=pd(b.termino);
  b.vig = s&&t ? days(s,t) : null;
  if(t && b.avisoDias!=null){const a=new Date(t);a.setDate(a.getDate()-b.avisoDias);b.dataAviso=iso(a);} else b.dataAviso=null;
  b.valorReaj = b.valor!=null ? Math.round(b.valor*(1+(b.reaj||0))*100)/100 : null;
  return b;
}
function nextNum(){ const m=Math.max(0,...ALL.map(d=>parseInt(d.num,10)||0)); return String(m+1).padStart(3,"0"); }
function fieldErr(k,msg){const f=document.querySelector(`.field[data-k="${k}"]`);f.classList.add("err");const m=f.querySelector(".errmsg");m.textContent=msg;m.hidden=false;}

const DADOS_FORA=["num","setores","anexos","_id","rest","avisoRest","st","unitList","setorList","setorTxt","_s","createdAt","updatedAt","updatedBy"];
let saving=false;
async function saveForm(orig){
  if(saving) return;
  document.querySelectorAll(".field.err").forEach(f=>{f.classList.remove("err");f.querySelector(".errmsg").hidden=true;});
  const b=readForm();
  let bad=false;
  if(!b.num){fieldErr("num","Informe o número do contrato.");bad=true;}
  else if(ALL.some(d=>d.num===b.num && (!orig||d._id!==orig._id))){fieldErr("num","Já existe um contrato com esse número.");bad=true;}
  if(!b.empresa){fieldErr("empresa","Informe o fornecedor.");bad=true;}
  if(ALLOWED!==null && !b.setores.some(x=>ALLOWED.has(x))){fieldErr("setores","Marque pelo menos um setor.");bad=true;}
  if(b.inicio&&b.termino&&pd(b.termino)<pd(b.inicio)){fieldErr("termino","O término não pode ser antes do início.");bad=true;}
  if(bad){document.getElementById("fMsg").textContent="Corrija os campos marcados.";return;}
  const now=new Date().toISOString();
  const changed=orig?Object.keys(b).filter(k=>JSON.stringify(orig[k]??null)!==JSON.stringify(b[k]??null)&&LABEL[k]):[];
  if(orig && !changed.length && !pendingFiles.length){toast("Nenhuma alteração para salvar");drawView();return;}
  if(orig && ALLOWED!==null){ const keep=(orig.setorList||[]).filter(x=>!ALLOWED.has(x)); b.setores=[...new Set([...keep,...b.setores])]; }
  const hist=[...((orig&&orig.hist)||[]),{at:now,by:MEU_EMAIL,action:orig?"edit":"create",fields:pendingFiles.length?[...changed,"anexos"]:changed}].slice(-30);
  const dados={};
  if(orig) Object.keys(orig).forEach(k=>{ if(!DADOS_FORA.includes(k)) dados[k]=orig[k]; });
  Object.assign(dados,b,{hist});
  if(orig && orig.unidadeRevisar && b.unidades===orig.unidades) dados.unidadeRevisar=orig.unidadeRevisar; else dados.unidadeRevisar=null;
  DADOS_FORA.forEach(k=>delete dados[k]);
  const id=orig?orig._id:(crypto.randomUUID?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));
  const row={num:b.num,setores:b.setores,dados,anexos:(orig&&orig.anexos)||[]};
  saving=true; const btn=document.getElementById("fSave"); btn.disabled=true; btn.textContent="Salvando…";
  try{
    const r=orig?await sb.from("contratos").update(row).eq("id",id).select("id"):await sb.from("contratos").insert({id,...row}).select("id");
    if(r.error) throw r.error;
    if(!r.data||!r.data.length) throw {code:"42501"};
    let falhou=[];
    if(pendingFiles.length){
      btn.textContent="Enviando arquivos…";
      const anexos=[...row.anexos];
      for(const f of pendingFiles){ try{ anexos.push({nome:f.name,path:await uploadTo(id,f)}); }catch(e){ console.warn(e); falhou.push(f.name); } }
      if(anexos.length!==row.anexos.length){ const u=await sb.from("contratos").update({anexos}).eq("id",id); if(u.error) throw u.error; }
    }
    pendingFiles=[];
    toast((orig?"Alterações salvas":"Contrato cadastrado")+(falhou.length?`, mas não foi possível enviar: ${falhou.join(", ")}. Tente anexar de novo.`:""),!!falhou.length);
    await loadContratos(); openNum=id; editing=false; drawView();
  }catch(e){
    console.warn(e);
    const msg=e&&e.code==="23505"?"Já existe um contrato com esse número.":e&&e.code==="42501"?"Você não tem permissão para salvar contratos deste setor.":"Não foi possível salvar agora. Verifique a conexão e tente de novo.";
    toast(msg,true); btn.disabled=false; btn.textContent="Tentar salvar de novo";
  }
  finally{ saving=false; }
}

function showDrawer(){document.getElementById("drawer").hidden=false;document.getElementById("scrim").hidden=false;}
function closeDrawer(){pendingFiles=[];document.getElementById("drawer").hidden=true;document.getElementById("scrim").hidden=true;openNum=null;editing=false;}
document.getElementById("scrim").onclick=()=>{ if(!editing) closeDrawer(); };
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return; if(!document.getElementById("modal").hidden){closeModal();return;} if(!editing)closeDrawer();});

/* ---------- controles ---------- */
document.getElementById("q").oninput=e=>{state.q=e.target.value;saveF();renderTable();};
document.getElementById("fSetor").onchange=e=>{state.se=e.target.value;sync();};
document.getElementById("fStatus").onchange=e=>{state.st=e.target.value;sync();};
document.getElementById("fUnid").onchange=e=>{state.un=e.target.value;sync();};
document.getElementById("fTipo").onchange=e=>{state.tipo=e.target.value;sync();};
document.getElementById("fConf").onchange=e=>{state.conf=e.target.value;sync();};
document.getElementById("clear").onclick=()=>{Object.assign(state,{q:"",se:"",st:"",un:"",tipo:"",conf:""});sync();};
document.querySelectorAll("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(state.sort===k)state.dir*=-1;else{state.sort=k;state.dir=1;}saveF();renderTable();});
document.getElementById("new").onclick=()=>{openNum=null;editing=true;drawForm(null);};
const writable=()=>!!ME&&(isOwnerV||(ALLOWED&&ALLOWED.size>0));
function applyWriteUI(){ document.getElementById("new").hidden=!writable(); }

/* ---------- exportar Excel ---------- */
document.getElementById("export").onclick=()=>{
  if(!window.XLSX){toast("Exportação indisponível agora. Recarregue a página.",true);return;}
  const head=["Nº Contrato","Empresa / Fornecedor","Objeto do Contrato","Tipo Contrato","Início Contrato","Término Contrato","Vigência (dias)","Dias Restantes","Status","Valor Mensal (R$)","% Reajuste Anual","Valor Reajustado (R$)","Aviso Renovação (dias)","Data Aviso Renovação","Renovação Automática","Observações","Prazo Aviso Rescisão (dias)","Possui Multa?","Valor da Multa (R$)","Responsável pelo Contrato","Setor(es)","Unidade(s)","Validado pela controladoria","Observações (controladoria)","Data do Distrato","Arquivo vinculado","Arquivos no site","Última edição","Editado por"];
  const dt=s=>s?pd(String(s).slice(0,10)):null;
  const rows=DATA.slice().sort((a,b)=>String(a.num).localeCompare(String(b.num),"pt-BR",{numeric:true})).map(d=>[
    d.num,d.empresa,d.objeto,d.tipo,dt(d.inicio),dt(d.termino),d.vig,d.rest!=null&&d.rest<0?0:d.rest,ST_LABEL[d.st],d.valor,d.reaj,d.valorReaj,d.avisoDias,dt(d.dataAviso),d.renovAuto,d.obs,d.rescDias,d.multa,d.valorMulta,d.resp,d.setorTxt,d.unidades,d.validado,d.obs2,dt(d.distrato),d.arquivo,(d.anexos||[]).filter(a=>a.path).length,d.updatedAt?new Date(d.updatedAt).toLocaleString("pt-BR"):"",d.updatedBy||""
  ].map(v=>v??""));
  const ws=XLSX.utils.aoa_to_sheet([head,...rows],{cellDates:true,dateNF:"dd/mm/yyyy"});
  ws["!cols"]=head.map((h,i)=>({wch:[6,34,50,11,11,11,9,9,12,13,9,13,9,11,9,60,9,8,12,18,22,26,16,40,11,40,9,18,26][i]}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Contratos");
  XLSX.writeFile(wb,`CONTROLE DE CONTRATOS${ALLOWED!==null?' - '+[...ALLOWED].join(' '):''} - ${iso(TODAY)}.xlsx`);
};

/* ---------- carregar dados ---------- */
function fromRow(r){
  return derive({...(r.dados||{}),num:r.num,setores:r.setores||[],anexos:r.anexos||[],createdAt:r.criado_em,updatedAt:r.atualizado_em,updatedBy:r.atualizado_por},r.id);
}
async function loadContratos(){
  const out=[]; let from=0;
  for(;;){
    const {data,error}=await sb.from("contratos").select("*").order("num").range(from,from+999);
    if(error){ setSync(false); toast("Não foi possível carregar os contratos. Verifique a conexão.",true); return; }
    out.push(...data); if(data.length<1000) break; from+=1000;
  }
  ALL=out.map(fromRow); DATA=ALL; setSync(true); sync();
  if(openNum&&!editing) drawView();
  if(view==="arquivos") renderArquivos();
}
async function loadPerfis(){
  const {data}=await sb.from("perfis").select("*").order("nome");
  PERFIS=data||[]; PERFIL_POR_EMAIL=Object.fromEntries(PERFIS.map(p=>[p.email,p]));
}
function setSync(ok){const s=document.getElementById("sync");s.className="sync "+(ok?"on":"off");s.textContent=ok?"Conectado":"Sem conexão";}
let rtTimer=null;
function realtime(){
  sb.channel("contratos-svsa")
    .on("postgres_changes",{event:"*",schema:"public",table:"contratos"},()=>{clearTimeout(rtTimer);rtTimer=setTimeout(()=>{ if(!saving) loadContratos(); },600);})
    .on("postgres_changes",{event:"*",schema:"public",table:"perfis"},async()=>{await loadPerfis(); applyPerfil(); if(view==="gestores") renderGestores();})
    .subscribe(st=>{ if(st==="CHANNEL_ERROR"||st==="TIMED_OUT") setSync(false); });
}

/* ---------- acesso ---------- */
function applyPerfil(){
  const p=PERFIL_POR_EMAIL[MEU_EMAIL];
  ME=p&&p.ativo?p:null;
  isOwnerV=!!(ME&&ME.admin);
  const todos=ME&&(ME.setores||[]).includes(TODOS);
  ALLOWED=!ME?new Set():(isOwnerV||todos)?null:new Set(ME.setores||[]);
  document.getElementById("tabs").hidden=!isOwnerV;
  const sc=document.getElementById("scope");
  if(!ME){ sc.hidden=false; sc.className="scope warn"; sc.innerHTML=`Seu login (<b>${esc(MEU_EMAIL)}</b>) ainda não está cadastrado como gestor. Peça a um administrador do site para incluir você na aba “Gestores e acessos”.`; }
  else if(ALLOWED!==null){ sc.hidden=false; sc.className="scope"; sc.innerHTML=`Você vê os contratos de: <b>${esc([...ALLOWED].join(", ")||"nenhum setor")}</b>.`; }
  else sc.hidden=true;
  document.getElementById("who").textContent=(ME&&ME.nome?ME.nome+" · ":"")+MEU_EMAIL+(isOwnerV?" · administrador":"");
  applyWriteUI();
}
function setView(v){
  view=v;
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-pressed",String(t.dataset.view===v)));
  document.getElementById("viewContratos").hidden=v!=="contratos";
  document.getElementById("viewGestores").hidden=v!=="gestores";
  document.getElementById("viewArquivos").hidden=v!=="arquivos";
  if(v==="gestores") renderGestores();
  if(v==="arquivos") renderArquivos();
}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>setView(t.dataset.view));

/* ---------- gestores (administradores) ---------- */
let LOGINS={}, gEditing=null;
async function loadLogins(){
  const {data,error}=await sb.rpc("admin_logins");
  LOGINS={}; if(!error&&data) data.forEach(u=>LOGINS[u.email]=u);
}
async function renderGestores(){
  await loadLogins();
  const rows=PERFIS.map(p=>{
    if(gEditing===p.email) return gRowEdit(p);
    const lg=LOGINS[p.email];
    const st=!p.ativo?'<span class="pill s-Encerrado">Desativado</span>':lg?(lg.ultimo_acesso?`<span class="pill s-Vigente">Ativo</span><div class="edited">último acesso ${esc(ago(lg.ultimo_acesso))}</div>`:'<span class="pill s-Renovar">Login criado, nunca entrou</span>'):'<span class="pill s-Indeterminado">Falta criar o login</span>';
    return `<tr><td><b>${esc(p.nome)}</b>${p.admin?' <span class="chip">administrador</span>':""}</td><td class="num" style="font-size:12.5px">${esc(p.email)}</td>
      <td>${(p.setores||[]).map(s=>`<span class="chip">${esc(s)}</span>`).join(" ")||'<span class="muted">—</span>'}</td><td>${st}</td>
      <td style="white-space:nowrap;text-align:right"><button class="btn" type="button" data-g="edit" data-e="${esc(p.email)}">Editar</button>
      ${lg?`<button class="btn" type="button" data-g="senha" data-e="${esc(p.email)}">Senha provisória</button>`:""}</td></tr>`;
  });
  if(gEditing==="__novo") rows.push(gRowEdit({email:"",nome:"",setores:[],admin:false,ativo:true},true));
  document.getElementById("gbody").innerHTML=rows.join("")||'<tr><td colspan="5" class="empty">Nenhum gestor cadastrado.</td></tr>';
  document.querySelectorAll("#gbody [data-g]").forEach(b=>b.onclick=()=>gAction(b.dataset.g,b.dataset.e,b));
}
function gRowEdit(p,isNew){
  const opts=[TODOS,...SETORES];
  return `<tr class="gedit"><td><input type="text" id="gNome" value="${esc(p.nome)}" placeholder="Nome"></td>
    <td><input type="email" id="gEmail" value="${esc(p.email)}" placeholder="email@svsa.com.br"${isNew?"":" disabled"}></td>
    <td><div class="checks" id="gSet">${opts.map(s=>`<label><input type="checkbox" value="${esc(s)}"${(p.setores||[]).includes(s)?" checked":""}>${esc(s)}</label>`).join("")}</div></td>
    <td><div class="checks"><label><input type="checkbox" id="gAdm"${p.admin?" checked":""}>Administrador</label><label><input type="checkbox" id="gAtivo"${p.ativo!==false?" checked":""}>Ativo</label></div></td>
    <td style="white-space:nowrap;text-align:right">${isNew?"":`<button class="btn danger" type="button" data-g="del" data-e="${esc(p.email)}">Remover</button>`}
      <button class="btn" type="button" data-g="cancel">Cancelar</button><button class="btn primary" type="button" data-g="save" data-e="${esc(p.email)}">Salvar</button></td></tr>`;
}
async function gAction(act,email,btn){
  if(act==="edit"){gEditing=email;renderGestores();return;}
  if(act==="cancel"){gEditing=null;renderGestores();return;}
  if(act==="senha"){ openSenhaProvisoria(email); return; }
  if(act==="del"){
    if(email===MEU_EMAIL){toast("Você não pode remover o seu próprio cadastro.",true);return;}
    if(!window.confirm(`Remover ${email} da lista de gestores? Ele deixa de ver os contratos. (O login no Supabase continua existindo; exclua lá se quiser.)`)) return;
    const {error}=await sb.from("perfis").delete().eq("email",email);
    if(error){toast("Não foi possível remover.",true);return;}
    toast("Gestor removido"); gEditing=null; await loadPerfis(); renderGestores(); return;
  }
  if(act==="save"){
    const nome=document.getElementById("gNome").value.trim();
    const em=(document.getElementById("gEmail").value||email).trim().toLowerCase();
    const setores=[...document.querySelectorAll("#gSet input:checked")].map(i=>i.value);
    const admin=document.getElementById("gAdm").checked, ativo=document.getElementById("gAtivo").checked;
    if(!nome||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){toast("Preencha nome e um e-mail válido.",true);return;}
    if(!setores.length&&!admin){toast("Marque pelo menos um setor.",true);return;}
    if(em===MEU_EMAIL&&(!admin||!ativo)){toast("Você não pode tirar o seu próprio acesso de administrador.",true);return;}
    btn.disabled=true;
    const {error}=await sb.from("perfis").upsert({email:em,nome,setores,admin,ativo});
    btn.disabled=false;
    if(error){toast("Não foi possível salvar o gestor.",true);console.warn(error);return;}
    const novo=gEditing==="__novo"; gEditing=null; await loadPerfis(); renderGestores();
    if(novo&&!LOGINS[em]) openModal(`<h3 style="margin:0">Falta criar o login de ${esc(nome)}</h3>
      <p>O cadastro foi salvo. Agora crie o login no Supabase:</p>
      <ol style="padding-left:20px;line-height:1.7"><li>Abra o painel do Supabase → <b>Authentication</b> → <b>Users</b>.</li>
      <li>Clique em <b>Add user</b> → <b>Create new user</b>.</li>
      <li>E-mail: <b>${esc(em)}</b> · Senha: invente uma senha provisória · deixe marcado <b>Auto Confirm User</b>.</li>
      <li>Envie ao gestor o endereço do site, o e-mail e a senha provisória. No primeiro acesso o site pede para ele criar a senha dele.</li></ol>`);
    else toast("Gestor salvo");
  }
}
document.getElementById("gAdd").onclick=()=>{gEditing="__novo";renderGestores();};

function openSenhaProvisoria(email){
  openModal(`<h3 style="margin:0">Senha provisória</h3>
    <p>Defina uma senha provisória para <b>${esc(email)}</b>. No próximo acesso o site pede para ele criar uma senha nova.</p>
    <div class="field"><label for="spSenha">Senha provisória (mínimo 8 caracteres)</label><input id="spSenha" type="text" autocomplete="off" value="${esc(senhaAleatoria())}"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" type="button" id="spCancel">Cancelar</button><button class="btn primary" type="button" id="spOk">Definir senha</button></div>`);
  document.getElementById("spCancel").onclick=closeModal;
  document.getElementById("spOk").onclick=async e=>{
    const s=document.getElementById("spSenha").value.trim(); e.currentTarget.disabled=true;
    const {error}=await sb.rpc("admin_redefinir_senha",{p_email:email,p_senha:s});
    if(error){e.currentTarget.disabled=false;toast(error.message||"Não foi possível definir a senha.",true);return;}
    closeModal(); copiar(`Acesso ao site de contratos SVSA\nEndereço: ${location.origin+location.pathname}\nE-mail: ${email}\nSenha provisória: ${s}\nNo primeiro acesso o site pede para você criar a sua senha.`);
    toast("Senha definida. A mensagem com os dados de acesso foi copiada — cole no e-mail ou Teams do gestor.");
  };
}
function senhaAleatoria(){const A="ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";return [...crypto.getRandomValues(new Uint8Array(10))].map(x=>A[x%A.length]).join("");}
function copiar(t){ try{navigator.clipboard.writeText(t);}catch(e){} }

/* ---------- arquivos: importação em lote (administradores) ---------- */
function pendentes(){ const l=[]; ALL.forEach(d=>(d.anexos||[]).forEach((a,i)=>{ if(!a.path) l.push({d,i,a}); })); return l; }
function renderArquivos(){
  const p=pendentes(); const tot=ALL.reduce((s,d)=>s+(d.anexos||[]).length,0);
  document.getElementById("arqResumo").innerHTML=`<b>${tot-p.length}</b> de <b>${tot}</b> arquivos já estão no site.${p.length?` Faltam <b>${p.length}</b>.`:" Todos os arquivos foram enviados."}`;
  document.getElementById("arqLista").innerHTML=p.length?p.slice(0,400).map(x=>`<div><span class="num">${esc(x.d.num)}</span> · ${esc(x.d.empresa)} — <span class="file">${esc(x.a.nome)}</span></div>`).join(""):"";
}
const chave=n=>norm(String(n||"").normalize("NFC")).replace(/\.pdf$/i,"").replace(/[^a-z0-9]+/g,"");
async function importarArquivos(files){
  const p=pendentes(); const mapa={}; p.forEach(x=>{(mapa[chave(x.a.nome)]=mapa[chave(x.a.nome)]||[]).push(x);});
  const out=document.getElementById("arqLog"); let ok=0, sem=[], erro=[];
  out.innerHTML=`<div class="aistat work"><span class="spin"></span>Enviando…</div>`;
  const porContrato={};
  for(const f of files){
    const alvo=(mapa[chave(f.name)]||[]).shift();
    if(!alvo){ sem.push(f.name); continue; }
    try{ const path=await uploadTo(alvo.d._id,f); (porContrato[alvo.d._id]=porContrato[alvo.d._id]||{d:alvo.d,set:{}}).set[alvo.i]=path; ok++;
      out.innerHTML=`<div class="aistat work"><span class="spin"></span>Enviados ${ok} de ${files.length}…</div>`; }
    catch(e){ console.warn(e); erro.push(f.name); }
  }
  for(const id in porContrato){
    const {d,set}=porContrato[id]; const anexos=(d.anexos||[]).map((a,i)=>set[i]?{...a,path:set[i]}:a);
    const {error}=await sb.from("contratos").update({anexos}).eq("id",id); if(error){ console.warn(error); erro.push("contrato "+d.num); }
  }
  out.innerHTML=`<div class="aistat ${erro.length?"bad":"ok"}">${ok} arquivo(s) enviados e vinculados.${erro.length?` Falharam: ${esc(erro.join(", "))}.`:""}</div>${sem.length?`<div class="edited">Não reconhecidos (nenhum contrato espera esse nome, ou já foi enviado): ${esc(sem.join(" · "))}</div>`:""}`;
  await loadContratos(); renderArquivos();
}
document.getElementById("arqPick").onclick=()=>document.getElementById("arqFiles").click();
document.getElementById("arqFolder").onclick=()=>document.getElementById("arqDir").click();
document.getElementById("arqFiles").onchange=e=>{importarArquivos([...e.target.files]);e.target.value="";};
document.getElementById("arqDir").onchange=e=>{importarArquivos([...e.target.files]);e.target.value="";};

/* ---------- janela (modal) ---------- */
function openModal(html){const m=document.getElementById("modal");document.getElementById("modalBox").innerHTML=html+(html.includes("spCancel")?"":`<div style="display:flex;justify-content:flex-end"><button class="btn primary" type="button" id="mOk">Entendi</button></div>`);m.hidden=false;const ok=document.getElementById("mOk");if(ok)ok.onclick=closeModal;}
function closeModal(){document.getElementById("modal").hidden=true;}

/* ---------- login ---------- */
const $=id=>document.getElementById(id);
function showLogin(msg,bad){ $("app").hidden=true; $("login").hidden=false; $("loginForm").hidden=false; $("novaSenhaForm").hidden=true; $("lMsg").textContent=msg||""; $("lMsg").className="lmsg"+(bad?" bad":""); }
function showNovaSenha(primeira){ $("app").hidden=true; $("login").hidden=false; $("loginForm").hidden=true; $("novaSenhaForm").hidden=false;
  $("nsTitulo").textContent=primeira?"Crie a sua senha":"Alterar senha"; $("nsTexto").textContent=primeira?"Este é o seu primeiro acesso (ou sua senha foi redefinida). Crie uma senha pessoal para continuar.":"Digite a nova senha.";
  $("nsCancel").hidden=!!primeira; $("nsMsg").textContent=""; $("ns1").value=""; $("ns2").value=""; $("ns1").focus(); }
$("loginForm").onsubmit=async e=>{
  e.preventDefault(); const b=$("lBtn"); b.disabled=true; $("lMsg").textContent="";
  const {error}=await sb.auth.signInWithPassword({email:$("lEmail").value.trim().toLowerCase(),password:$("lSenha").value});
  b.disabled=false;
  if(error){ showLogin(/invalid/i.test(error.message)?"E-mail ou senha incorretos.":"Não foi possível entrar: "+error.message,true); return; }
  $("lSenha").value=""; start();
};
$("lEsqueci").onclick=()=>openModal(`<h3 style="margin:0">Esqueceu a senha?</h3><p>Peça a um administrador do site (Simone, Marcos ou Farley) para definir uma <b>senha provisória</b> para você na aba “Gestores e acessos”. No próximo acesso você cria uma senha nova.</p>`);
$("novaSenhaForm").onsubmit=async e=>{
  e.preventDefault(); const a=$("ns1").value, c=$("ns2").value;
  if(a.length<8){$("nsMsg").textContent="A senha precisa ter pelo menos 8 caracteres.";return;}
  if(a!==c){$("nsMsg").textContent="As duas senhas não são iguais.";return;}
  $("nsBtn").disabled=true;
  const {error}=await sb.auth.updateUser({password:a,data:{senha_definida:true}});
  $("nsBtn").disabled=false;
  if(error){$("nsMsg").textContent=/different|same/i.test(error.message)?"Escolha uma senha diferente da provisória.":"Não foi possível salvar: "+error.message;return;}
  toast("Senha salva"); start();
};
$("nsCancel").onclick=()=>start();
$("trocarSenha").onclick=()=>showNovaSenha(false);
$("sair").onclick=async()=>{ await sb.auth.signOut(); location.reload(); };

let started=false;
async function start(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ showLogin(); return; }
  const u=session.user;
  if(!(u.user_metadata&&u.user_metadata.senha_definida)){ showNovaSenha(true); return; }
  MEU_EMAIL=String(u.email||"").toLowerCase();
  $("login").hidden=true; $("app").hidden=false;
  await loadPerfis(); applyPerfil();
  await loadContratos();
  if(!started){ started=true; realtime(); }
}

/* ---------- início ---------- */
const BUCKET="contratos";
let sb=null;
(function boot(){
  const cfg=window.SITE_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||/COLE_AQUI/.test(cfg.SUPABASE_URL+cfg.SUPABASE_ANON_KEY)){
    $("login").hidden=false; $("loginForm").hidden=true;
    $("lMsg").innerHTML="O site ainda não foi configurado: preencha o arquivo <b>config.js</b> com o endereço e a chave do Supabase (veja o guia).";
    $("lMsg").className="lmsg bad"; return;
  }
  sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  sb.auth.onAuthStateChange((ev)=>{ if(ev==="SIGNED_OUT") showLogin(); });
  start();
})();
