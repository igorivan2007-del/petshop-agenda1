const SERVICOS = {
  banho: { label: "Banho", duracao: 1 },
  banho_tosa: { label: "Banho e Tosa", duracao: 2 },
};

const configurado = Boolean(
  window.SUPABASE_URL &&
  window.SUPABASE_KEY &&
  !window.SUPABASE_URL.startsWith("COLE_") &&
  !window.SUPABASE_KEY.startsWith("COLE_") &&
  window.supabase
);

function criarApiSupabase() {
  const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  const ok = ({ data, error }) => {
    if (error) {
      throw new Error(error.code === "23505" ? "Já existe um cadastro com esse valor." : error.message);
    }
    return data || [];
  };
  return {
    listarTutores: async () => ok(await db.from("tutor").select("id_tutor,nome,cpf,telefone").order("nome")),
    criarTutor: async (t) => ok(await db.from("tutor").insert([t]).select()),
    listarPets: async () => ok(await db.from("pet").select("id_pet,nome,especie,raca,id_tutor,tutor(nome)").order("nome")),
    criarPet: async (p) => ok(await db.from("pet").insert([p]).select()),
    listarAgendamentos: async () => ok(await db.from("agendamento").select("id_agendamento,data_hora,status,servico,id_pet,pet(nome,especie,raca,tutor(nome))").order("data_hora")),
    criarAgendamento: async (a) => ok(await db.from("agendamento").insert([a]).select()),
    atualizarAgendamento: async (id, campos) => ok(await db.from("agendamento").update(campos).eq("id_agendamento", id).select()),
  };
}

function criarApiLocal() {
  const KEY = "petshop-agenda-local";
  const vazio = () => ({ tutor: [], pet: [], agendamento: [], seq: 0 });
  const ler = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || vazio(); }
    catch { return vazio(); }
  };
  const gravar = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  return {
    listarTutores: async () => ler().tutor.slice().sort((a,b) => a.nome.localeCompare(b.nome)),
    criarTutor: async (t) => { const d=ler(); d.tutor.push({id_tutor:++d.seq,...t}); gravar(d); },
    listarPets: async () => { const d=ler(); return d.pet.map(p => ({...p,tutor:d.tutor.find(t => t.id_tutor===p.id_tutor)})).sort((a,b)=>a.nome.localeCompare(b.nome)); },
    criarPet: async (p) => { const d=ler(); d.pet.push({id_pet:++d.seq,...p,id_tutor:Number(p.id_tutor)}); gravar(d); },
    listarAgendamentos: async () => { const d=ler(); return d.agendamento.map(a => { const p=d.pet.find(x=>x.id_pet===a.id_pet); return {...a,pet:p?{...p,tutor:d.tutor.find(t=>t.id_tutor===p.id_tutor)}:null}; }).sort((a,b)=>new Date(a.data_hora)-new Date(b.data_hora)); },
    criarAgendamento: async (a) => { const d=ler(); d.agendamento.push({id_agendamento:++d.seq,...a,id_pet:Number(a.id_pet),status:"agendado"}); gravar(d); },
    atualizarAgendamento: async (id, campos) => { const d=ler(); const a=d.agendamento.find(x=>x.id_agendamento===Number(id)); if(!a) throw new Error("Agendamento não encontrado."); Object.assign(a,campos); gravar(d); },
  };
}

const api = configurado ? criarApiSupabase() : criarApiLocal();
const $ = (id) => document.getElementById(id);
const formTutor = $("form-tutor");
const formPet = $("form-pet");
const formAgendamento = $("form-agendamento");
const formReagendar = $("form-reagendar");
const selectPetTutor = $("pet-tutor");
const selectAgendamentoPet = $("agendamento-pet");
const selectAgendamentoServico = $("agendamento-servico");
const tabelaAgendamentos = document.querySelector("#tabela-agendamentos tbody");
const filtroStatus = $("filtro-status");
const vazioAgenda = $("vazio");
const modal = $("modal");
let agendamentos = [], tutoresCache = [], petsCache = [], totalTutores = 0, totalPets = 0, idReagendando = null;

$("modo").textContent = configurado ? "" : "⚠️ Modo teste: dados salvos apenas neste navegador.";

document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  $("painel-cadastros").hidden = btn.dataset.tab !== "cadastros";
  $("painel-agenda").hidden = btn.dataset.tab !== "agenda";
}));

const pad = n => String(n).padStart(2,"0");
function dataParaStr(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function horaParaStr(d){ return `${pad(d.getHours())}:00`; }
function combinarDataHora(d,h){ return new Date(`${d}T${h}:00`).toISOString(); }
function parseData(v){ return new Date(v); }
function escapeHtml(v){ return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function emojiEspecie(v){ const e=(v||"").toLowerCase(); if(e.includes("cach")||e.includes("dog")||e.includes("cão"))return "🐶"; if(e.includes("gat")||e.includes("cat"))return "🐱"; if(e.includes("ave")||e.includes("pass"))return "🐦"; if(e.includes("coelho"))return "🐰"; return "🐾"; }
function cpfValido(v){ const c=(v||"").replace(/\D/g,""); if(c.length!==11||/^(\d)\1{10}$/.test(c))return false; let s=0; for(let i=0;i<9;i++)s+=Number(c[i])*(10-i); let r=(s*10)%11; if(r===10)r=0; if(r!==Number(c[9]))return false; s=0; for(let i=0;i<10;i++)s+=Number(c[i])*(11-i); r=(s*10)%11; if(r===10)r=0; return r===Number(c[10]); }
function formatarCpf(v){ const c=(v||"").replace(/\D/g,"").slice(0,11); return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4"); }

let toastTimer;
function aviso(msg,erro=false){ const t=$("toast"); t.textContent=msg; t.className="toast"+(erro?" erro":""); t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.hidden=true,3500); }
async function comBotao(form,fn){ const b=form.querySelector('button[type="submit"]'); b.disabled=true; try{await fn();}catch(e){console.error(e); aviso(e.message||"Erro inesperado.",true);}finally{b.disabled=false;} }
function preencherSelect(select,texto,itens,valor,rotulo){ select.innerHTML=""; select.appendChild(new Option(texto,"")); itens.forEach(i=>select.appendChild(new Option(rotulo(i),valor(i)))); }
function atualizarResumo(){ $("stat-tutores").textContent=totalTutores; $("stat-pets").textContent=totalPets; const hoje=dataParaStr(new Date()); $("stat-hoje").textContent=agendamentos.filter(a=>a.status==="agendado"&&dataParaStr(parseData(a.data_hora))===hoje).length; $("stat-agendados").textContent=agendamentos.filter(a=>a.status==="agendado").length; }

const HORA_ABERTURA=8, HORA_FECHAMENTO=18;
function horariosOcupados(dia,ignorarId){ const set=new Set(); agendamentos.filter(a=>a.status==="agendado"&&String(a.id_agendamento)!==String(ignorarId)).forEach(a=>{ const d=parseData(a.data_hora); if(dataParaStr(d)!==dia)return; const dur=SERVICOS[a.servico]?.duracao??1; for(let k=0;k<dur;k++)set.add(`${pad(d.getHours()+k)}:00`); }); return set; }
function gerarOpcoesHorario(select,dia,servico,ignorarId){ const atual=select.value; select.innerHTML='<option value="">Selecione o horário</option>'; if(!dia)return; const dur=SERVICOS[servico]?.duracao??1, ocupados=horariosOcupados(dia,ignorarId); for(let h=HORA_ABERTURA;h<=HORA_FECHAMENTO-dur;h++){ let livre=true; for(let k=0;k<dur;k++)if(ocupados.has(`${pad(h+k)}:00`))livre=false; if(livre)select.appendChild(new Option(`${pad(h)}:00`,`${pad(h)}:00`)); } if([...select.options].some(o=>o.value===atual))select.value=atual; }
function definirMinimoData(input){ input.min=dataParaStr(new Date()); }

async function carregarTutores(){ try{ const d=await api.listarTutores(); tutoresCache=Array.isArray(d)?d:[]; totalTutores=tutoresCache.length; preencherSelect(selectPetTutor,totalTutores?"Selecione o tutor":"Cadastre um tutor primeiro",tutoresCache,t=>t.id_tutor,t=>t.nome); atualizarResumo(); renderCadastros(); }catch(e){ console.error(e); preencherSelect(selectPetTutor,"Erro ao carregar tutores",[],x=>x,x=>x); aviso("Erro ao carregar tutores: "+e.message,true); } }
async function carregarPets(){ try{ const d=await api.listarPets(); const pets=Array.isArray(d)?d:[]; petsCache=pets; totalPets=pets.length; preencherSelect(selectAgendamentoPet,totalPets?"Selecione o pet":"Cadastre um pet primeiro",pets,p=>p.id_pet,p=>`${p.nome}${p.raca?" - "+p.raca:""} (tutor: ${p.tutor?.nome??"?"})`); atualizarResumo(); renderCadastros(); }catch(e){console.error(e); aviso("Erro ao carregar pets: "+e.message,true);} }
async function carregarAgendamentos(){ try{ const d=await api.listarAgendamentos(); agendamentos=Array.isArray(d)?d:[]; renderAgenda(); atualizarResumo(); if($("agendamento-dia").value)gerarOpcoesHorario($("agendamento-hora"),$("agendamento-dia").value,selectAgendamentoServico.value); }catch(e){console.error(e); aviso("Erro ao carregar agenda: "+e.message,true);} }

$("tutor-cpf").addEventListener("input",e=>e.target.value=formatarCpf(e.target.value));
formTutor.addEventListener("submit",e=>{ e.preventDefault(); const nome=$("tutor-nome").value.trim(), cpf=$("tutor-cpf").value.trim(), cpfLimpo=cpf.replace(/\D/g,""); if(nome.split(/\s+/).length<2)return aviso("Digite nome e sobrenome.",true); if(!cpfValido(cpf))return aviso("CPF inválido.",true); if(tutoresCache.some(t=>t.nome.trim().toLowerCase()===nome.toLowerCase()))return aviso("Já existe tutor com esse nome.",true); if(tutoresCache.some(t=>String(t.cpf||"").replace(/\D/g,"")===cpfLimpo))return aviso("Já existe tutor com esse CPF.",true); comBotao(formTutor,async()=>{ await api.criarTutor({nome,cpf:cpfLimpo,telefone:$("tutor-telefone").value.trim()||null}); formTutor.reset(); await carregarTutores(); aviso("Tutor cadastrado!"); }); });
formPet.addEventListener("submit",e=>{ e.preventDefault(); if(!selectPetTutor.value)return aviso("Selecione o tutor.",true); comBotao(formPet,async()=>{ await api.criarPet({id_tutor:Number(selectPetTutor.value),nome:$("pet-nome").value.trim(),especie:$("pet-especie").value.trim(),raca:$("pet-raca").value.trim()||null}); formPet.reset(); await carregarPets(); aviso("Pet cadastrado!"); }); });
formAgendamento.addEventListener("submit",e=>{ e.preventDefault(); const dia=$("agendamento-dia").value,hora=$("agendamento-hora").value,servico=selectAgendamentoServico.value; if(!selectAgendamentoPet.value||!dia||!hora)return aviso("Preencha pet, data e horário.",true); const iso=combinarDataHora(dia,hora); if(new Date(iso)<new Date())return aviso("Escolha data e hora futuras.",true); comBotao(formAgendamento,async()=>{ await api.criarAgendamento({id_pet:Number(selectAgendamentoPet.value),data_hora:iso,servico}); formAgendamento.reset(); await carregarAgendamentos(); aviso("Agendamento realizado!"); }); });

function renderAgenda(){ const lista=agendamentos.filter(a=>filtroStatus.value==="todos"||a.status===filtroStatus.value); tabelaAgendamentos.innerHTML=""; vazioAgenda.hidden=lista.length>0; lista.forEach(a=>{ const tr=document.createElement("tr"), ativo=a.status==="agendado"; tr.innerHTML=`<td data-label="Pet">${emojiEspecie(a.pet?.especie)} ${escapeHtml(a.pet?.nome??"?")}</td><td data-label="Tutor">${escapeHtml(a.pet?.tutor?.nome??"?")}</td><td data-label="Serviço">${escapeHtml(SERVICOS[a.servico]?.label??"Banho")}</td><td data-label="Data/Hora">${parseData(a.data_hora).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</td><td data-label="Status"><span class="badge badge-${escapeHtml(a.status)}">${escapeHtml(a.status)}</span></td><td class="acoes-cell"><div class="acoes">${ativo?`<button type="button" class="btn-reagendar" data-id="${a.id_agendamento}">Reagendar</button><button type="button" class="btn-concluir" data-id="${a.id_agendamento}">Concluir</button><button type="button" class="btn-cancelar" data-id="${a.id_agendamento}">Cancelar</button>`:""}</div></td>`; tabelaAgendamentos.appendChild(tr); }); document.querySelectorAll(".btn-concluir,.btn-cancelar").forEach(b=>b.addEventListener("click",async()=>{ const status=b.classList.contains("btn-cancelar")?"cancelado":"concluido"; if(status==="cancelado"&&!confirm("Cancelar este agendamento?"))return; try{await api.atualizarAgendamento(b.dataset.id,{status}); await carregarAgendamentos(); aviso(status==="cancelado"?"Agendamento cancelado.":"Serviço concluído!");}catch(e){aviso(e.message,true);} })); document.querySelectorAll(".btn-reagendar").forEach(b=>b.addEventListener("click",()=>abrirModal(agendamentos.find(a=>String(a.id_agendamento)===b.dataset.id)))); }
filtroStatus.addEventListener("change",renderAgenda);
function abrirModal(a){ if(!a)return; idReagendando=a.id_agendamento; $("reagendar-info").textContent=`${a.pet?.nome??"Pet"} - ${SERVICOS[a.servico]?.label??"Banho"} - atual: ${parseData(a.data_hora).toLocaleString("pt-BR")}`; const d=parseData(a.data_hora); $("reagendar-dia").value=dataParaStr(d); gerarOpcoesHorario($("reagendar-hora"),$("reagendar-dia").value,a.servico,a.id_agendamento); $("reagendar-hora").value=horaParaStr(d); definirMinimoData($("reagendar-dia")); modal.hidden=false; }
function fecharModal(){modal.hidden=true;idReagendando=null;}
$("reagendar-cancelar").addEventListener("click",fecharModal); modal.addEventListener("click",e=>{if(e.target===modal)fecharModal();}); document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)fecharModal();});
formReagendar.addEventListener("submit",e=>{ e.preventDefault(); const dia=$("reagendar-dia").value,hora=$("reagendar-hora").value; if(!dia||!hora)return aviso("Escolha data e horário.",true); const iso=combinarDataHora(dia,hora); if(new Date(iso)<new Date())return aviso("Escolha data e hora futuras.",true); comBotao(formReagendar,async()=>{await api.atualizarAgendamento(idReagendando,{data_hora:iso});fecharModal();await carregarAgendamentos();aviso("Agendamento reagendado!");}); });
function atualizarHorarios(){gerarOpcoesHorario($("agendamento-hora"),$("agendamento-dia").value,selectAgendamentoServico.value);}
$("agendamento-dia").addEventListener("change",atualizarHorarios); selectAgendamentoServico.addEventListener("change",atualizarHorarios); $("reagendar-dia").addEventListener("change",()=>{const a=agendamentos.find(x=>String(x.id_agendamento)===String(idReagendando));if(a)gerarOpcoesHorario($("reagendar-hora"),$("reagendar-dia").value,a.servico,idReagendando);});

function normalizarTexto(valor){ return String(valor??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function formatarCpfExibicao(cpf){ const v=String(cpf??"").replace(/\D/g,""); return v.length===11?v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4"):v; }
function renderCadastros(){
  const campo=$("pesquisa-cadastros"), tipoCampo=$("tipo-cadastro"), lista=$("lista-cadastros"); if(!campo||!tipoCampo||!lista)return;
  const termo=normalizarTexto(campo.value.trim()), tipo=tipoCampo.value, resultados=[];
  if(tipo==="todos"||tipo==="tutores") tutoresCache.forEach(t=>{ const texto=normalizarTexto(`${t.nome} ${t.cpf??""} ${t.telefone??""}`); if(!termo||texto.includes(termo)) resultados.push({tipo:"Tutor",nome:t.nome,detalhe:`CPF: ${formatarCpfExibicao(t.cpf)||"não informado"} | Telefone: ${t.telefone||"não informado"}`}); });
  if(tipo==="todos"||tipo==="pets") petsCache.forEach(p=>{ const texto=normalizarTexto(`${p.nome} ${p.especie} ${p.raca??""} ${p.tutor?.nome??""}`); if(!termo||texto.includes(termo)) resultados.push({tipo:"Pet",nome:p.nome,detalhe:`${p.especie}${p.raca?" | Raça: "+p.raca:""} | Tutor: ${p.tutor?.nome??"não encontrado"}`}); });
  lista.innerHTML=resultados.map(r=>`<div class="item-cadastro"><strong>${escapeHtml(r.tipo)}: ${escapeHtml(r.nome)}</strong><small>${escapeHtml(r.detalhe)}</small></div>`).join("");
  $("resultado-contagem").textContent=`${resultados.length} cadastro(s) encontrado(s)`; $("cadastros-vazio").hidden=resultados.length>0;
}
$("pesquisa-cadastros").addEventListener("input",renderCadastros); $("tipo-cadastro").addEventListener("change",renderCadastros);
async function iniciar(){ definirMinimoData($("agendamento-dia")); await carregarTutores(); await carregarPets(); await carregarAgendamentos(); renderCadastros(); }
iniciar();
