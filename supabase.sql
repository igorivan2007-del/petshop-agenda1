-- ===================================================
-- AGENDA PET SHOP - Script do banco (Supabase / PostgreSQL)
-- Cole tudo no SQL Editor do Supabase e clique em RUN.
-- ===================================================

create table if not exists public.tutor (
  id_tutor    bigint generated always as identity primary key,
  nome        text not null,
  telefone    text,
  criado_em   timestamptz not null default now()
);

create table if not exists public.pet (
  id_pet      bigint generated always as identity primary key,
  id_tutor    bigint not null references public.tutor(id_tutor) on delete cascade,
  nome        text not null,
  especie     text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists public.agendamento (
  id_agendamento bigint generated always as identity primary key,
  id_pet         bigint not null references public.pet(id_pet) on delete cascade,
  data_hora      timestamptz not null,
  status         text not null default 'agendado'
                 check (status in ('agendado', 'cancelado', 'concluido')),
  criado_em      timestamptz not null default now()
);

create index if not exists idx_pet_tutor on public.pet(id_tutor);
create index if not exists idx_agend_pet on public.agendamento(id_pet);
create index if not exists idx_agend_data on public.agendamento(data_hora);

-- Impede dois banhos ativos no mesmo horário exato
create unique index if not exists uq_agend_horario_ativo
  on public.agendamento(data_hora) where status = 'agendado';

-- ===================================================
-- SEGURANÇA (Row Level Security)
-- Projeto de faculdade SEM login: libera leitura/escrita para a chave anon.
-- Para produção real, troque por políticas com Supabase Auth.
-- ===================================================
alter table public.tutor       enable row level security;
alter table public.pet         enable row level security;
alter table public.agendamento enable row level security;

drop policy if exists "acesso publico tutor" on public.tutor;
drop policy if exists "acesso publico pet" on public.pet;
drop policy if exists "acesso publico agendamento" on public.agendamento;

create policy "acesso publico tutor" on public.tutor
  for all to anon, authenticated using (true) with check (true);

create policy "acesso publico pet" on public.pet
  for all to anon, authenticated using (true) with check (true);

create policy "acesso publico agendamento" on public.agendamento
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant all on public.tutor, public.pet, public.agendamento to anon, authenticated;
