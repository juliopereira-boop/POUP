# Reservar unidade no CV CRM pelo POUP — esboço

> **Estado (27/10/2026): só no papel.** Nada aqui está ligado. Hoje a integração com o CV **só lê** e serve **apenas** para sinalizar disponibilidade. A única peça que já existe é a coluna `cvcrm_integracoes.reserva_habilitada` (padrão `false`), que nenhum código usa ainda.

## O que seria "reservar"

O corretor está no simulador, com a unidade **verde** escolhida e a proposta pronta. Um botão **"Reservar no CV"** cria a reserva no CV da construtora dona do empreendimento: unidade, cliente, corretor e condição de pagamento. O próprio CV passa a unidade para "Em processo de reserva" ou "Reservada". O POUP fica sabendo pela leitura normal: o CVDW, de minuto em minuto, ou a conferência pontual logo depois de reservar. Em segundos a unidade fica **amarela** para todos.

O POUP não guarda a reserva como fonte da verdade. Quem manda é o CV. O POUP guarda só o **recibo**: quem pediu, quando, para qual unidade e o número da reserva que o CV devolveu.

## Princípios (os mesmos da leitura, mais rígidos)

1. **Função separada:** `cvcrm-reserva`. As duas funções de disponibilidade continuam **só leitura**, com a trava e o teste de hoje (`testar:cvcrm-leitura`). A reserva tem a **sua** lista fechada:
   - `POST /api/v1/comercial/reservas` — criar.
   - `GET /api/v1/comercial/reservas/{id}` — conferir o que foi criado.
   - O mapa de disponibilidade por bloco, para conferir a unidade antes de reservar.
   - **Cancelar** (`/comercial/reservas/cancelar-reserva`), alterar situação, informar venda e distrato **ficam de fora** na primeira versão. Isso continua sendo feito no CV, por quem tem permissão lá.

   Um teste novo (`testar:cvcrm-reserva`) prova a lista, nos moldes do de leitura.
2. **Ligado por construtora e por quem decide:**
   - `reserva_habilitada` só é ligada pelo admin do POUP, a pedido da construtora.
   - Com ela desligada, o botão não aparece e a função recusa.
3. **Credencial separada (recomendado):** a construtora cria no CV um **segundo usuário**, só com a permissão **"Criar nova reserva"**. O token dele vai para o Vault, num segredo próprio (`cvcrm_reserva_token_<empresa>`). Assim, se o token de leitura vazar, ninguém cria reserva com ele, e o de reserva não lê nada além do necessário.

   Na tabela de permissões do CV:

   | Endpoint | Permissão no CV |
   | --- | --- |
   | `POST /comercial/reservas` | Criar nova reserva |
   | `GET /comercial/reservas/{idReserva}` | Administrar reservas |
   | `POST /comercial/reservas/alterar-situacao`, `/informar_venda`, `/cancelar-reserva` | Alterar situação da reserva |
4. **Só quem pode vender aquela unidade:** a função confere, com a sessão do corretor, que ele lê o empreendimento (adotou a construtora ou é da equipe dela) e que o plano dele permite. O admin do POUP **não** reserva em nome de ninguém.
5. **Uma reserva por unidade, por vez, sem clique duplo:**
   - A função trava a unidade no banco (`pg_advisory_xact_lock` pela chave `integracao + cv_unidade`).
   - Um índice único parcial impede duas reservas "enviando" ou "criada" para a mesma unidade.
   - Cada pedido leva uma **chave de idempotência**: o id da simulação mais a unidade. Repetir o pedido devolve o recibo que já existe.
6. **Conferir no CV logo antes:** relê o bloco da unidade no mapa. Se não estiver **Disponível** naquele instante, não envia, e a tela explica por quê.
7. **Confirmação explícita:** a tela mostra o resumo (unidade, cliente, valor, condição) e o aviso "isto cria uma reserva no CV da [construtora]". Só segue com o toque em "Reservar".
8. **Dado pessoal (LGPD):**
   - O CPF, o nome e o contato do cliente vão para o CV da construtora. É a finalidade da reserva, e o cliente precisa ter consentido (registrar o aceite na simulação).
   - No POUP, o recibo **não** copia o CPF nem o payload inteiro: guarda o hash do que foi enviado e o número da reserva.
   - Os logs da função não imprimem o corpo.

## O que falta saber do CV (antes de escrever código)

O corpo do `POST /comercial/reservas` **não está** na documentação que temos (`196ca86a-cvcrm-docs-webhooks-unidades.md`). Ela traz só o índice, as permissões e o mapa. Também não deu para baixar daqui: o portal `desenvolvedor.cvcrm.com.br` não respondeu deste ambiente. Precisamos destas páginas:

- `reference/postreserva-2` — cadastra uma reserva: campos obrigatórios, formato da condição de pagamento, erros.
- `reference/getreserva-2` — retorna a reserva: para conferir o que foi criado.
- `reference/listartiposreservav3` — tipos de reserva da construtora: qual usar por padrão.
- `reference/cancelamento-4` e `reference/alterarsituacao` — para a fase 2.
- Corretores e imobiliárias no CV: como o corretor do POUP vira o `idcorretor` (e a `idimobiliaria`) do CV. Sem isso, a reserva cairia sem corretor, ou no usuário da integração.
- Campos adicionais obrigatórios: cada construtora configura os seus no CV.
- O erro que o CV devolve quando a unidade já não está disponível, para traduzir na tela.

## O que o POUP já tem e o que falta

| Dado da reserva | De onde vem | Situação |
| --- | --- | --- |
| Empreendimento e unidade no CV | `development_unit_cvcrm` (`cv_unidade`) e `development_cvcrm_empreendimentos` | pronto |
| Conta do CV da construtora | `cvcrm_integracoes` e Vault | pronto (falta o 2º token, só de reserva) |
| Cliente (nome, CPF, contato) | simulação, scanner de documento | existe; falta o consentimento explícito |
| Valor e condição de pagamento | simulador (entrada, mensais, semestrais, anuais, financiamento) | existe; falta mapear para as séries do CV |
| Corretor e imobiliária no CV | — | **falta**: tabela `cvcrm_corretores (integracao_id, user_id, cv_corretor, cv_imobiliaria)`, preenchida pelo admin ou casada por e-mail ou CPF |
| Tipo de reserva | — | **falta**: escolha por construtora (`cvcrm_integracoes.reserva_tipo`) |

## Esboço do banco (não aplicado)

```sql
-- O recibo de cada pedido de reserva. Fonte da verdade continua no CV.
create table public.cvcrm_reservas (
  id uuid primary key default gen_random_uuid(),
  integracao_id uuid not null references public.cvcrm_integracoes(id),
  unit_id uuid not null references public.development_units(id),
  cv_unidade integer not null,
  pedido_por uuid not null references auth.users(id),
  chave_idempotencia text not null unique,      -- simulação + unidade
  situacao text not null check (situacao in ('enviando', 'criada', 'recusada', 'erro')),
  cv_reserva integer,                           -- o id que o CV devolveu
  erro text,
  corpo_hash text not null,                     -- sha256 do que foi enviado (não o corpo)
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);
-- Duas reservas em andamento para a mesma unidade: nunca.
create unique index cvcrm_reservas_uma_por_unidade
  on public.cvcrm_reservas (integracao_id, cv_unidade)
  where situacao in ('enviando', 'criada');
alter table public.cvcrm_reservas enable row level security;
-- O corretor lê os próprios recibos; o admin, todos. Só a função grava.

alter table public.cvcrm_integracoes
  add column reserva_token_secret_id uuid,      -- 2º usuário do CV, só "Criar nova reserva"
  add column reserva_tipo integer;              -- tipo de reserva padrão da construtora
```

## O fluxo

```text
simulador (unidade verde, proposta pronta)
  └─ "Reservar no CV"  (aparece só com reserva_habilitada e vínculo da unidade)
       └─ tela de confirmação (resumo + aviso + consentimento do cliente)
            └─ Edge Function cvcrm-reserva  (Verify JWT ligado)
                 1. permissão do corretor + reserva_habilitada
                 2. idempotência: já existe recibo? devolve
                 3. trava a unidade; grava recibo "enviando"
                 4. relê o bloco no mapa: não está Disponível → "recusada", explica
                 5. POST /comercial/reservas (lista fechada, token de reserva)
                 6. recibo "criada" + cv_reserva  |  "erro" + mensagem traduzida
                 7. leitura pontual do bloco → a unidade fica amarela para todos
```

## Fases

1. **Agora:**
   - Disponibilidade com a conta de cada construtora (feito).
   - Este esboço.
   - A coluna `reserva_habilitada`.
2. **Quando tivermos a documentação e uma construtora piloto:**
   - mapeamento de corretores;
   - 2º token;
   - `cvcrm-reserva` só com "criar";
   - teste da lista fechada;
   - tela de confirmação.

   Ligar só para a piloto, de preferência num ambiente de homologação do CV.
3. **Depois:** cancelar pelo POUP (só a reserva que o próprio POUP criou, dentro de um prazo), anexar documentos e enviar contrato para assinatura. Cada um entra na lista da função com o seu teste.
