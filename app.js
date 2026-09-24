// ===================================================
// SERVIÇOS OFERECIDOS
// ===================================================
const SERVICOS = {
  banho: {
    label: "Banho",
    duracao: 1,
  },
  banho_tosa: {
    label: "Banho e Tosa",
    duracao: 2,
  },
};

// ===================================================
// CAMADA DE DADOS
// Usa Supabase se config.js estiver preenchido.
// Caso contrário, usa localStorage no modo de teste.
// ===================================================
const configurado =
  window.SUPABASE_URL &&
  window.SUPABASE_KEY &&
  !window.SUPABASE_URL.startsWith("COLE_") &&
  !window.SUPABASE_KEY.startsWith("COLE_") &&
  window.supabase;

function criarApiSupabase() {
  const db = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_KEY
  );

  const ok = ({ data, error }) => {
    if (error) {
      const mensagem =
        error.code === "23505"
          ? "Já existe um cadastro com esse valor único."
          : error.message;

      throw new Error(mensagem);
    }

    return data;
  };

  return {
    listarTutores: async () =>
      ok(
        await db
          .from("tutor")
          .select("id_tutor, nome, cpf")
          .order("nome")
      ),

    criarTutor: async (tutor) =>
      ok(await db.from("tutor").insert(tutor)),

    listarPets: async () =>
      ok(
        await db
          .from("pet")
          .select("id_pet, nome, especie, raca, tutor(nome)")
          .order("nome")
      ),

    criarPet: async (pet) =>
      ok(await db.from("pet").insert(pet)),

    listarAgendamentos: async () =>
      ok(
        await db
          .from("agendamento")
          .select(
            "id_agendamento, data_hora, status, servico, pet(nome, especie, raca, tutor(nome))"
          )
          .order("data_hora")
      ),

    criarAgendamento: async (agendamento) =>
      ok(await db.from("agendamento").insert(agendamento)),

    atualizarAgendamento: async (id, campos) =>
      ok(
        await db
          .from("agendamento")
          .update(campos)
          .eq("id_agendamento", id)
      ),
  };
}

function criarApiLocal() {
  const KEY = "petshop-agenda-local";

  const ler = () => {
    try {
      return (
        JSON.parse(localStorage.getItem(KEY)) || {
          tutor: [],
          pet: [],
          agendamento: [],
          seq: 0,
        }
      );
    } catch {
      return {
        tutor: [],
        pet: [],
        agendamento: [],
        seq: 0,
      };
    }
  };

  const gravar = (dados) => {
    localStorage.setItem(KEY, JSON.stringify(dados));
  };

  return {
    listarTutores: async () =>
      ler()
        .tutor
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome)),

    criarTutor: async (tutor) => {
      const dados = ler();

      dados.tutor.push({
        id_tutor: ++dados.seq,
        ...tutor,
      });

      gravar(dados);
    },

    listarPets: async () => {
      const dados = ler();

      return dados.pet
        .map((pet) => ({
          ...pet,
          tutor: dados.tutor.find(
            (tutor) => tutor.id_tutor === pet.id_tutor
          ),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },

    criarPet: async (pet) => {
      const dados = ler();

      dados.pet.push({
        id_pet: ++dados.seq,
        ...pet,
        id_tutor: Number(pet.id_tutor),
      });

      gravar(dados);
    },

    listarAgendamentos: async () => {
      const dados = ler();

      return dados.agendamento
        .map((agendamento) => {
          const pet = dados.pet.find(
            (item) => item.id_pet === agendamento.id_pet
          );

          return {
            ...agendamento,
            pet: pet
              ? {
                  ...pet,
                  tutor: dados.tutor.find(
                    (tutor) => tutor.id_tutor === pet.id_tutor
                  ),
                }
              : null,
          };
        })
        .sort(
          (a, b) =>
            new Date(a.data_hora) - new Date(b.data_hora)
        );
    },

    criarAgendamento: async (agendamento) => {
      const dados = ler();

      dados.agendamento.push({
        id_agendamento: ++dados.seq,
        id_pet: Number(agendamento.id_pet),
        data_hora: agendamento.data_hora,
        servico: agendamento.servico,
        status: "agendado",
      });

      gravar(dados);
    },

    atualizarAgendamento: async (id, campos) => {
      const dados = ler();

      const agendamento = dados.agendamento.find(
        (item) => item.id_agendamento === Number(id)
      );

      if (!agendamento) {
        throw new Error("Agendamento não encontrado.");
      }

      Object.assign(agendamento, campos);
      gravar(dados);
    },
  };
}

const api = configurado
  ? criarApiSupabase()
  : criarApiLocal();

// ===================================================
// ELEMENTOS DA PÁGINA
// ===================================================
const $ = (id) => document.getElementById(id);

const formTutor = $("form-tutor");
const formPet = $("form-pet");
const formAgendamento = $("form-agendamento");
const formReagendar = $("form-reagendar");

const selectPetTutor = $("pet-tutor");
const selectAgendamentoPet = $("agendamento-pet");
const selectAgendamentoServico = $("
