# 🐾 Agenda de Banho – Pet Shop

Aplicação web (HTML + CSS + JS puro) para cadastrar **tutores**, **pets** e **agendar / reagendar / cancelar / concluir banhos**.

- **Front-end:** HTML, CSS e JS puros (responsivo, sem build)
- **Banco/Backend:** Supabase (PostgreSQL + API automática)
- **Hospedagem:** Vercel (deploy automático a cada push no GitHub)

## Estrutura

```
petshop-agenda/
├── index.html      # páginas e formulários
├── style.css       # estilos responsivos
├── app.js          # lógica + acesso ao Supabase
├── config.js       # URL e chave do Supabase (VOCÊ preenche)
├── supabase.sql    # script para criar as tabelas
├── .gitignore
└── README.md       # este guia
```

> Sem preencher o `config.js`, o app abre em **modo teste** (salva no navegador via localStorage). Assim dá pra abrir o `index.html` e testar tudo antes de ligar o banco.

---

## PARTE 1 – Criar o backend e o banco no Supabase

### 1.1 Criar conta e projeto
1. 
2. Entre com sua conta do **GitHub** (mais sAcesse <https://supabase.com> e clique em **Start your project**.imples).
3. Clique em **New project**.
4. Preencha:
   - **Name:** `petshop-agenda`
   - **Database Password:** crie uma senha forte e **guarde-a** (clique em *Generate*).
   - **Region:** `South America (São Paulo)`
   - **Plan:** Free
5. Clique em **Create new project** e aguarde 1–2 minutos.

### 1.2 Criar as tabelas
1. No menu lateral esquerdo, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase.sql` deste projeto, **copie todo o conteúdo** e cole no editor.
4. Clique em **Run** (ou `Ctrl + Enter`).
5. Deve aparecer **"Success. No rows returned"**.
6. Confira em **Table Editor**: devem existir as tabelas `tutor`, `pet` e `agendamento`.

O script já cria:
- as 3 tabelas com chaves estrangeiras (tutor → pet → agendamento);
- a regra que **impede dois banhos no mesmo horário**;
- as políticas de acesso (RLS) para o site funcionar sem login.

### 1.3 Pegar URL e chave da API
1. Menu lateral → **Project Settings** (ícone de engrenagem) → **API** (ou **API Keys**).
2. Copie:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon public key** (ou *publishable key*) → começa com `eyJ...` ou `sb_publishable_...`
3. ⚠️ **NÃO use** a chave `service_role` / `secret`. Ela dá acesso total e nunca pode ir para o front-end.

### 1.4 Colocar as chaves no projeto
Abra o arquivo `config.js` e troque os valores:

```js
window.SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
window.SUPABASE_KEY = "SUA_ANON_OU_PUBLISHABLE_KEY";
```

Salve. Abra o `index.html` no navegador: o aviso de "modo teste" some e os dados passam a ser gravados no Supabase. Confirme cadastrando um tutor e vendo o registro em **Table Editor → tutor**.

> A chave anon/publishable **é pública por natureza** (fica visível no navegador). A proteção real vem das políticas RLS. As políticas do script são abertas (adequadas para trabalho de faculdade). Em um sistema real, use **Supabase Auth** e políticas por usuário.

---

## PARTE 2 – Subir o código para o GitHub

### Opção A – Pelo site (sem instalar nada)
1. Acesse <https://github.com/new>.
2. **Repository name:** `petshop-agenda` → deixe **Public** (ou Private) → **Create repository**.
3. Na página do repositório vazio, clique em **uploading an existing file**.
4. Arraste **todos os arquivos** da pasta (`index.html`, `style.css`, `app.js`, `config.js`, `supabase.sql`, `README.md`, `.gitignore`) — *os arquivos, não a pasta*.
5. Escreva a mensagem "Primeira versão" e clique em **Commit changes**.

### Opção B – Pelo Git (terminal)
Dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Primeira versão da agenda pet shop"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/petshop-agenda.git
git push -u origin main
```

Depois, a cada alteração:

```bash
git add .
git commit -m "Descreva a mudança"
git push
```

---

## PARTE 3 – Publicar na Vercel

1. Acesse <https://vercel.com> e clique em **Sign Up** → **Continue with GitHub**.
2. No painel, clique em **Add New… → Project**.
3. Em **Import Git Repository**, encontre `petshop-agenda` e clique em **Import**
   (se não aparecer, clique em *Adjust GitHub App Permissions* e libere o repositório).
4. Configurações:
   - **Framework Preset:** `Other`
   - **Root Directory:** `./`
   - **Build Command / Output Directory:** deixe em branco (site estático)
5. Clique em **Deploy**.
6. Em ~30 segundos você recebe uma URL como `https://petshop-agenda.vercel.app`.

A partir daí, **todo `git push` na branch `main` publica automaticamente**.

---

## PARTE 4 – Testar em produção

1. Abra a URL da Vercel.
2. Cadastre um **tutor** → um **pet** desse tutor → **agende um banho**.
3. Clique em **Reagendar**, escolha outro horário e salve.
4. Tente agendar outro pet no mesmo horário exato: deve aparecer "Já existe um banho agendado nesse horário".
5. Confirme os dados em **Supabase → Table Editor**.

## Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Aviso "Modo teste" na Vercel | `config.js` não foi preenchido ou não foi enviado ao GitHub (`git push`). |
| `permission denied` / `row-level security` | O `supabase.sql` não foi executado por inteiro. Rode de novo (é seguro repetir). |
| `Invalid API key` | Chave copiada errada, ou usou a `service_role`. Use a anon/publishable. |
| `relation "public.tutor" does not exist` | Tabelas não criadas: execute o `supabase.sql`. |
| Alteração não aparece na Vercel | Faltou `git push`; veja o deploy em Vercel → *Deployments*. Force atualização com `Ctrl+F5`. |

## Funcionalidades

- Cadastro de tutor (nome, telefone) e de pet vinculado ao tutor
- Agendamento de banho com data e hora (bloqueia datas passadas e horários duplicados)
- **Reagendar** (janela para escolher nova data/hora), **cancelar** e **concluir**
- Filtro da agenda por status
- Layout responsivo: tabela no desktop, cartões no celular
