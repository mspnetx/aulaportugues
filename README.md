# Português Master — 6º ano

Aplicativo de exercícios de Língua Portuguesa para o 6º ano, com 100 questões em oito módulos, correção após cada resposta e painel do responsável.

## Estrutura

- `public/`: arquivos estáticos do site. É a única pasta que deve ser publicada.
- `supabase/functions/quiz-api/`: função de backend que valida o código do aluno, corrige as respostas e protege o painel do responsável.
- O banco de dados e o gabarito são provisionados separadamente no Supabase.

## Estado da publicação

O frontend está preparado para hospedagem estática, mas o aplicativo **ainda não está operacional para alunos** até que o projeto Supabase seja criado, o banco seja carregado, a Edge Function seja publicada e `public/config.js` seja configurado.

## Segurança — leia antes de publicar

Este repositório foi criado inicialmente como **público**. Por isso, o arquivo SQL que contém o banco de questões e o gabarito foi deliberadamente excluído. O arquivo está listado no `.gitignore` e **não deve ser enviado enquanto o repositório estiver público**.

Recomendação: altere a visibilidade do repositório para **Private** antes de adicionar `supabase/schema-and-seed.sql`. Não coloque a chave `service_role`, PIN do responsável ou código de acesso do aluno no GitHub nem no frontend.

## Desenvolvimento local

1. Copie `public/config.example.js` para `public/config.js`.
2. Preencha a URL do projeto Supabase e a chave pública (anon/publishable).
3. Sirva a pasta `public/` com um servidor HTTP local.

Sem configuração Supabase, o site abre apenas em modo de prévia e informa que o backend não está conectado.

## Configuração do Supabase

Quando o repositório estiver privado:

1. Execute `supabase/schema-and-seed.sql` no SQL Editor do projeto Supabase.
2. Publique a função:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy quiz-api --no-verify-jwt
```

3. Configure os secrets da Edge Function:
   - `STUDENT_ACCESS_CODE`
   - `PARENT_PIN`

O Supabase disponibiliza `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente da função. A chave service role nunca deve ser colocada no navegador.

## Hospedagem

- Netlify: publicar a pasta `public/` (configuração em `netlify.toml`).
- GitHub Pages: workflow em `.github/workflows/pages.yml`, que publica somente `public/`.

O link só deve ser enviado ao aluno depois de configurar o Supabase e testar uma tentativa completa. O link do responsável usa o mesmo site com `?mode=parent`.

## Módulos

1. Infográficos (15)
2. Relato pessoal (10)
3. Substantivos e verbos (10)
4. Artigos (10)
5. Adjetivos e locuções adjetivas (15)
6. Numerais (15)
7. Pronomes pessoais e de tratamento (15)
8. Coesão e revisão integrada (10)

Painel do responsável: atualização automática a cada 3 segundos (polling).
