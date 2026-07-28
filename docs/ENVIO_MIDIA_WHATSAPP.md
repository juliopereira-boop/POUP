# Envio de mídia pelo WhatsApp — como funciona

Dentro de **Leads → 💬 (atender)**, o corretor escolhe a empresa, o
empreendimento, a IA escreve a mensagem e ele marca as mídias do Material de
Venda. Ao tocar em **Enviar no WhatsApp**, a conversa abre já no número do lead,
com a mensagem pronta e um **link da vitrine** logo abaixo.

O WhatsApp lê esse link e mostra um **cartão de prévia com a foto do imóvel**.
Quando o lead toca, abre uma página com todas as fotos, vídeos e PDFs que o
corretor escolheu, além de um botão para responder no WhatsApp do corretor.

## Por que não anexa o arquivo direto na conversa

O link `wa.me` — o único jeito de abrir uma conversa já endereçada para um
número que **não é seu contato** — só transporta texto. Não existe parâmetro de
anexo. O outro caminho, a folha de compartilhamento do celular, manda o arquivo
de verdade, mas só lista contatos que já estão na agenda ou com quem já houve
conversa: para um lead novo, ele simplesmente não aparece na lista.

Por isso o padrão é a vitrine com link, que funciona com **qualquer número**.
Quando o aparelho suporta e a conversa já existe, aparece também o botão
secundário **Anexar o arquivo direto**, que usa a folha de compartilhamento.

## O que precisa estar configurado

### 1. Rodar a migration

`supabase/migrations/0021_media_links.sql` no **SQL Editor** do Supabase. Ela
cria a tabela `media_links` (com RLS: cada corretor só vê as próprias vitrines)
e a função que conta as visualizações.

### 2. Publicar a Edge Function `media-page`

A página da vitrine é servida por uma Edge Function pública — precisa ser
pública porque quem abre é o lead, sem login, e porque o robô do WhatsApp
precisa ler a página para montar a prévia.

No painel do Supabase, **Edge Functions → Deploy a new function**, nome
`media-page`, e cole o conteúdo de `supabase/functions/media-page/index.ts`.
Marque para **não exigir JWT** (`Verify JWT` desligado).

Pela CLI seria:

```
supabase functions deploy media-page --no-verify-jwt
```

Ela usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que o Supabase já injeta
sozinho — não precisa cadastrar segredo nenhum.

### 3. Conferir

Marque uma mídia em um lead e toque em **Enviar no WhatsApp**. O texto deve
terminar com um link do tipo:

```
https://SEU-PROJETO.supabase.co/functions/v1/media-page?k=<id>
```

Abra esse link no navegador: tem que aparecer a página com as fotos. Se aparecer
"Link não encontrado", a migration não rodou. Se der erro 404 da própria
Supabase, a função não foi publicada.

## Detalhes

- Os arquivos são servidos por URL assinada com validade de 7 dias, gerada na
  hora em que a página é aberta — o bucket continua privado.
- A vitrine expira em 90 dias (`expires_at`), e o link expirado mostra um aviso
  em vez de erro.
- Cada abertura incrementa `views` na linha da vitrine.
- O bucket `uploads` não fica público em momento nenhum: só a Edge Function, com
  service role, consegue assinar as URLs.
