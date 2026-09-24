// ===================================================
// CAMADA DE DADOS
// Usa o Supabase se config.js estiver preenchido; senão usa localStorage (modo teste).
// ===================================================
const configurado =
  window.SUPABASE_URL && window.SUPABASE_KEY &&
  !window.SUPABASE_URL.startsWith("COLE_") && !window.SUPABASE_KEY.startsWith("COLE_") &&
  window.supabase;

function criarApiSupabase() {
  const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  const ok = ({ data, error }) => {
    if (error) {
      const e = new Error(
        error.code === "23505" ? "Já existe um banho agendado nesse horário." : error.message
      );
      throw e;
    }
    return data;
  };
  return {
    listarTutores: async () => ok(await db.from("tutor").select("id_tutor, nome").order("nome")),
    criarTutor: async (t) => ok(await db.from("tutor").insert(t)),
    listarPets: async () =>
      ok(await db.from("pet").select("id_pet, nome, tutor(nome)").order("nome")),
    criarPet: async (p) => ok(await db.from("pet").insert(p)),
    listarAgendamentos: async () =>
      ok(
        await db
          .from("agendamento")
          .select("id_agendamento, data_hora, status, pet(nome, especie, tutor(nome))")
          .order("data_hora")
      ),
    criarAgendamento: async (a) => ok(await db.from("agendamento").insert(a)),
    atualizarAgendamento: async (id, campos) =>
      ok(await db.from("agendamento").update(campos).eq("id_agendamento", id)),
  };
}

function criarApiLocal() {
  const KEY = "petshop-agenda-local";
  const ler = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { tutor: [], pet: [], agendamento: [], seq: 0 };
    } catch {
      return { tutor: [], pet: [], agendamento: [], seq: 0 };
    }
  };
  const gravar = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const conflito = (d, iso, ignorarId) =>
    d.agendamento.some(
      (a) =>
        a.status === "agendado" &&
        a.id_agendamento !== ignorarId &&
        new Date(a.data_hora).getTime() === new Date(iso).getTime()
    );
  const erroHorario = () => new Error("Já existe um banho agendado nesse horário.");

  return {
    listarTutores: async () => ler().tutor.slice().sort((a, b) => a.nome.localeCompare(b.nome)),
    criarTutor: async (t) => {
      const d = ler();
      d.tutor.push({ id_tutor: ++d.seq, ...t });
      gravar(d);
    },
    listarPets: async () => {
      const d = ler();
      return d.pet
        .map((p) => ({ ...p, tutor: d.tutor.find((t) => t.id_tutor === p.id_tutor) }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
    criarPet: async (p) => {
      const d = ler();
      d.pet.push({ id_pet: ++d.seq, ...p, id_tutor: Number(p.id_tutor) });
      gravar(d);
    },
    listarAgendamentos: async () => {
      const d = ler();
      return d.agendamento
        .map((a) => {
          const pet = d.pet.find((p) => p.id_pet === a.id_pet);
          return { ...a, pet: pet && { ...pet, tutor: d.tutor.find((t) => t.id_tutor === pet.id_tutor) } };
        })
        .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
    },
    criarAgendamento: async (a) => {
      const d = ler();
      if (conflito(d, a.data_hora)) throw erroHorario();
      d.agendamento.push({ id_agendamento: ++d.seq, id_pet: Number(a.id_pet), data_hora: a.data_hora, status: "agendado" });
      gravar(d);
    },
    atualizarAgendamento: async (id, campos) => {
      const d = ler();
      const a = d.agendamento.find((x) => x.id_agendamento === Number(id));
      if (!a) return;
      const novoHorario = campos.data_hora ?? a.data_hora;
      const novoStatus = campos.status ?? a.status;
      if (novoStatus === "agendado" && conflito(d, novoHorario, a.id_agendamento)) throw erroHorario();
      Object.assign(a, campos);
      gravar(d);
    },
  };
}

const api = configurado ? criarApiSupabase() : criarApiLocal();

// ===================================================
// ELEMENTOS DA PÁGINA
// ===================================================
const $ = (id) => document.getElementById(id);
const formTutor = $("form-tutor");
const formPet = $("form-pet");
const formAgendamento = $("form-agendamento");
const selectPetTutor = $("pet-tutor");
const selectAgendamentoPet = $("agendamento-pet");
const tabelaAgendamentos = document.querySelector("#tabela-agendamentos tbody");
const filtroStatus = $("filtro-status");
const vazio = $("vazio");
const modal = $("modal");
const formReagendar = $("form-reagendar");

let agendamentos = [];
let idReagendando = null;
let totalTutores = 0;
let totalPets = 0;

$("modo").textContent = configurado
  ? ""
  : "⚠️ Modo teste: dados salvos apenas neste navegador (Supabase não configurado).";

// ===================================================
// UTILITÁRIOS
// ===================================================
function emojiEspecie(especie) {
  const e = (especie || "").toLowerCase();
  if (e.includes("cach") || e.includes("dog") || e.includes("cão")) return "🐶";
  if (e.includes("gat") || e.includes("cat")) return "🐱";
  if (e.includes("ave") || e.includes("pass") || e.includes("bird")) return "🐦";
  if (e.includes("coelho") || e.includes("rabbit")) return "🐰";
  return "🐾";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const pad = (n) => String(n).padStart(2, "0");

// O Postgres/Supabase às vezes devolve o horário sem indicar 'Z' (UTC) no final.
// Sem isso, o navegador interpretaria o valor como se já fosse horário local,
// causando um deslocamento de fuso (ex: 08:00 virando 11:00). Esta função
// garante que o valor seja sempre lido como UTC antes de converter pro fuso local.
function parseUTC(str) {
  if (!str) return new Date(NaN);
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  return new Date(str.replace(" ", "T") + "Z");
}

// Date -> "2026-09-25" (para o input type="date")
function dataParaStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Date -> "08:00" (para o select de horário)
function horaParaStr(d) {
  return `${pad(d.getHours())}:00`;
}

// "2026-09-25" + "08:00" -> ISO UTC, respeitando o horário local do navegador
function combinarDataHora(diaStr, horaStr) {
  return new Date(`${diaStr}T${horaStr}:00`).toISOString();
}

// HORÁRIO DE FUNCIONAMENTO: 08h às 18h, de hora em hora
const HORA_ABERTURA = 8;
const HORA_FECHAMENTO = 18;

function horariosOcupados(diaStr, ignorarId) {
  return new Set(
    agendamentos
      .filter((a) => a.status === "agendado" && a.id_agendamento !== ignorarId)
      .filter((a) => dataParaStr(parseUTC(a.data_hora)) === diaStr)
      .map((a) => horaParaStr(parseUTC(a.data_hora)))
  );
}

function gerarOpcoesHorario(select, diaStr, ignorarId) {
  const atual = select.value;
  select.innerHTML = '<option value="">Selecione o horário</option>';
  const ocupados = diaStr ? horariosOcupados(diaStr, ignorarId) : new Set();
  for (let h = HORA_ABERTURA; h <= HORA_FECHAMENTO; h++) {
    const v = `${pad(h)}:00`;
    if (ocupados.has(v)) continue;
    select.appendChild(new Option(v, v));
  }
  if ([...select.options].some((o) => o.value === atual)) select.value = atual;
}

// Impede escolher datas passadas no campo de data
function definirMinimoData(input) {
  input.min = dataParaStr(new Date());
}

let toastTimer;
function aviso(msg, erro = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (erro ? " erro" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

// Executa uma ação de formulário desabilitando o botão durante a chamada
async function comBotao(form, fn) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    aviso(e.message || "Erro inesperado", true);
  } finally {
    btn.disabled = false;
  }
}

function atualizarResumo() {
  $("stat-tutores").textContent = totalTutores;
  $("stat-pets").textContent = totalPets;
  const hojeStr = dataParaStr(new Date());
  const hoje = agendamentos.filter((a) => a.status === "agendado" && dataParaStr(parseUTC(a.data_hora)) === hojeStr).length;
  const agendados = agendamentos.filter((a) => a.status === "agendado").length;
  $("stat-hoje").textContent = hoje;
  $("stat-agendados").textContent = agendados;
}

// ===================================================
// CADASTRAR TUTOR
// ===================================================
formTutor.addEventListener("submit", (e) => {
  e.preventDefault();
  comBotao(formTutor, async () => {
    await api.criarTutor({
      nome: $("tutor-nome").value.trim(),
      telefone: $("tutor-telefone").value.trim() || null,
    });
    formTutor.reset();
    aviso("Tutor cadastrado!");
    await carregarTutores();
  });
});

// ===================================================
// CADASTRAR PET
// ===================================================
formPet.addEventListener("submit", (e) => {
  e.preventDefault();
  comBotao(formPet, async () => {
    await api.criarPet({
      id_tutor: selectPetTutor.value,
      nome: $("pet-nome").value.trim(),
      especie: $("pet-especie").value.trim(),
    });
    formPet.reset();
    aviso("Pet cadastrado!");
    await carregarPets();
  });
});

// ===================================================
// AGENDAR BANHO
// ===================================================
formAgendamento.addEventListener("submit", (e) => {
  e.preventDefault();
  const dia = $("agendamento-dia").value;
  const hora = $("agendamento-hora").value;
  if (!dia || !hora) return aviso("Escolha a data e o horário.", true);

  const iso = combinarDataHora(dia, hora);
  if (new Date(iso) < new Date()) return aviso("Escolha uma data/hora futura.", true);

  comBotao(formAgendamento, async () => {
    await api.criarAgendamento({ id_pet: selectAgendamentoPet.value, data_hora: iso });
    formAgendamento.reset();
    aviso("Banho agendado!");
    await carregarAgendamentos();
  });
});

// ===================================================
// CARREGAR SELECTS
// ===================================================
function preencherSelect(select, placeholder, itens, valor, rotulo) {
  select.innerHTML = "";
  const first = new Option(placeholder, "");
  select.appendChild(first);
  itens.forEach((i) => select.appendChild(new Option(rotulo(i), valor(i))));
}

async function carregarTutores() {
  try {
    const data = await api.listarTutores();
    totalTutores = data.length;
    preencherSelect(selectPetTutor, data.length ? "Selecione o tutor" : "Cadastre um tutor primeiro", data, (t) => t.id_tutor, (t) => t.nome);
    atualizarResumo();
  } catch (e) {
    aviso("Erro ao carregar tutores: " + e.message, true);
  }
}

async function carregarPets() {
  try {
    const data = await api.listarPets();
    totalPets = data.length;
    preencherSelect(selectAgendamentoPet, data.length ? "Selecione o pet" : "Cadastre um pet primeiro", data, (p) => p.id_pet, (p) => `${p.nome} (tutor: ${p.tutor?.nome ?? "?"})`);
    atualizarResumo();
  } catch (e) {
    aviso("Erro ao carregar pets: " + e.message, true);
  }
}

// ===================================================
// AGENDA (tabela)
// ===================================================
async function carregarAgendamentos() {
  try {
    agendamentos = await api.listarAgendamentos();
    renderAgenda();
    atualizarResumo();
    if ($("agendamento-dia").value) {
      gerarOpcoesHorario($("agendamento-hora"), $("agendamento-dia").value);
    }
  } catch (e) {
    aviso("Erro ao carregar agenda: " + e.message, true);
  }
}

function renderAgenda() {
  const filtro = filtroStatus.value;
  const lista = agendamentos.filter((a) => filtro === "todos" || a.status === filtro);

  tabelaAgendamentos.innerHTML = "";
  vazio.hidden = lista.length > 0;

  lista.forEach((a) => {
    const tr = document.createElement("tr");
    const ativo = a.status === "agendado";
    tr.innerHTML = `
      <td data-label="Pet">${emojiEspecie(a.pet?.especie)} ${escapeHtml(a.pet?.nome ?? "?")}</td>
      <td data-label="Tutor">${escapeHtml(a.pet?.tutor?.nome ?? "?")}</td>
      <td data-label="Data/Hora">${parseUTC(a.data_hora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
      <td data-label="Status"><span class="badge badge-${escapeHtml(a.status)}">${escapeHtml(a.status)}</span></td>
      <td class="acoes-cell">
        <div class="acoes">
          ${ativo ? `
            <button class="btn-reagendar" data-acao="reagendar" data-id="${a.id_agendamento}">Reagendar</button>
            <button class="btn-concluir" data-acao="concluir" data-id="${a.id_agendamento}">Concluir</button>
            <button class="btn-cancelar" data-acao="cancelar" data-id="${a.id_agendamento}">Cancelar</button>` : ""}
        </div>
      </td>`;
    tabelaAgendamentos.appendChild(tr);
  });

  document.querySelectorAll(".btn-cancelar, .btn-concluir").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.acao === "cancelar" ? "cancelado" : "concluido";
      if (status === "cancelado" && !confirm("Cancelar este agendamento?")) return;
      try {
        await api.atualizarAgendamento(id, { status });
        aviso(status === "cancelado" ? "Agendamento cancelado." : "Banho concluído!");
        await carregarAgendamentos();
      } catch (err) {
        aviso(err.message, true);
      }
    });
  });

  document.querySelectorAll(".btn-reagendar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ag = agendamentos.find((a) => String(a.id_agendamento) === btn.dataset.id);
      abrirModal(ag);
    });
  });
}

filtroStatus.addEventListener("change", renderAgenda);

// ===================================================
// REAGENDAR
// ===================================================
function abrirModal(ag) {
  idReagendando = ag.id_agendamento;
  $("reagendar-info").textContent = `${ag.pet?.nome ?? "Pet"} — atual: ${parseUTC(ag.data_hora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;

  const d = parseUTC(ag.data_hora);
  const diaInput = $("reagendar-dia");
  const horaSelect = $("reagendar-hora");

  diaInput.value = dataParaStr(d);
  gerarOpcoesHorario(horaSelect, diaInput.value, ag.id_agendamento);
  horaSelect.value = horaParaStr(d);
  definirMinimoData(diaInput);

  modal.hidden = false;
  diaInput.focus();
}

function fecharModal() {
  modal.hidden = true;
  idReagendando = null;
}

$("reagendar-cancelar").addEventListener("click", fecharModal);
modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) fecharModal(); });

formReagendar.addEventListener("submit", (e) => {
  e.preventDefault();
  const dia = $("reagendar-dia").value;
  const hora = $("reagendar-hora").value;
  if (!dia || !hora) return aviso("Escolha a data e o horário.", true);

  const iso = combinarDataHora(dia, hora);
  if (new Date(iso) < new Date()) return aviso("Escolha uma data/hora futura.", true);

  comBotao(formReagendar, async () => {
    await api.atualizarAgendamento(idReagendando, { data_hora: iso });
    fecharModal();
    aviso("Banho reagendado!");
    await carregarAgendamentos();
  });
});

// ===================================================
// INICIALIZAÇÃO
// ===================================================
$("agendamento-dia").addEventListener("change", () => {
  gerarOpcoesHorario($("agendamento-hora"), $("agendamento-dia").value);
});
$("reagendar-dia").addEventListener("change", () => {
  gerarOpcoesHorario($("reagendar-hora"), $("reagendar-dia").value, idReagendando);
});

gerarOpcoesHorario($("agendamento-hora"));
definirMinimoData($("agendamento-dia"));
carregarTutores();
carregarPets();
carregarAgendamentos();
