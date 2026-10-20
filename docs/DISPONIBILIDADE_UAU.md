# Disponibilidade do UAU na tabela de preço — andamento

> Registro curto para quem continuar (pessoa ou sessão do Claude). A explicação
> completa está no README, seção **🟢 Disponibilidade do UAU**.

## O que é

A tabela de preço do POUP mostra cada unidade pintada conforme o UAU (o ERP da
Canopus), ao vivo:

| Cor | Situação | No UAU | Pode simular? |
|---|---|---|---|
| verde | disponível | Disponível | sim |
| amarelo | em negociação | Proposta, Reservado | sim, com aviso |
| vermelho | vendida | Vendida, Quitado | **não** |
| cinza | fora de venda | Fora de venda, ou status novo ainda não classificado | **não** |
| (sem cor) | sem vínculo | unidade não vinculada ou renumerada no UAU | como antes |

O admin importa a obra do UAU (empreendimento, blocos, unidades, vínculo e
valores) em **Configurações → Administração → Disponibilidade do UAU**.

## Decisões do dono (20/10/2026)

1. **O UAU é só LIDO.** Nenhuma edição, de nenhum tipo: o POUP só sinaliza
   disponibilidade e mostra valor. Garantido no código das Edge Functions:
   - lista fechada de 3 rotas de consulta;
   - segunda trava que recusa rota com nome de escrita mesmo se ela entrar na
     lista;
   - rota sempre fixa no código.
   O teste `npm run testar:uau-leitura` confere isso. A credencial de teste é
   a do ALPHA (pode ter permissão de escrita no ERP; o código nunca usa).
2. Reservado é amarelo (como Proposta).
3. A bolinha de "mais ventilado" passou a ser **azul** (o verde é de "disponível").
4. Vendida e fora de venda **não podem** ser escolhidas no simulador. Em
   negociação pode, com aviso. Ao gerar a proposta, a unidade é conferida no
   UAU na hora.
5. Vale para os dois planos (Start e Pro).
6. Piloto: **Village Connect I = obra 1/259V** no UAU.
7. Preço: o admin escolhe por empreendimento.
   - **automático** (padrão): a tabela enviada, se houver; senão o valor do UAU.
   - **tabela**: só a tabela enviada.
   - **UAU**: só o valor do UAU.
8. A skill `poup-disponibilidade-uau` fica fora do repositório (o dono guarda).

## Andamento

- [x] Fase 0: decisões com o dono.
- [x] Código no julio_dev:
  - migration `20261020120000_disponibilidade_uau.sql`;
  - Edge Functions `uau-disponibilidade` e `uau-disponibilidade-sync`;
  - app: cores, simulador, admin e importação;
  - testes.
- [x] **Fase 1, parte do banco** (20/10, pelo conector do Supabase):
  - `pg_net` ligado;
  - `uau_project_url` e `uau_sync_secret` no Vault. O segredo foi gerado no
    banco: ninguém viu, e não há `UAU_SYNC_SECRET` para cadastrar.
- [ ] **Fase 1, parte do dono**: cadastrar em Edge Functions → Secrets
  `UAU_INTEGRATION_TOKEN`, `UAU_USER` e `UAU_PASS`.
- [ ] **Fase 2**: a migration entrou em partes no dia 20/10 (tabelas, RLS,
  Realtime, fonte do preço, painel e as RPCs do admin e do corretor). Faltam 3
  funções: `uau_aplicar_leitura`, `uau_remover_obra` e `uau_salvar_vinculos`.
  - Elas têm `delete` no corpo, e o conector exige a confirmação do dono para
    isso.
  - O dono aplica pelo SQL Editor (o trecho da migration com as 3) ou confirma
    no conector.
- [x] **Fase 3, publicação** (20/10): as duas funções publicadas e as travas
  testadas pelo `pg_net`.
  - `uau-disponibilidade-sync`: Verify JWT **desligado**. Sem o segredo, 401.
    Com o segredo do Vault, passa e para em "Secret ausente: UAU_USER".
  - `uau-disponibilidade`: Verify JWT **ligado**. Sem login, 401.
- [ ] **Fase 3, `ping`**: depois dos 3 secrets do UAU.
- [ ] **Fase 4**: importar o piloto (1/259V) pela tela do admin.
  - A prévia deve trazer 464 unidades.
  - Conferir os números por situação.
- [ ] **Fase 5**: prova do tempo real (leitura "pontual" falsa pelo SQL Editor).
- [ ] **Fase 6**: ligar o cron (leve a cada minuto, completa às :07 e :37) e
  acompanhar a primeira hora pelo `uau_sync_log`.
- [ ] **Fase 7**: build nova para as lojas (o navegador recebe antes).

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Banco (tabelas, RPCs, Realtime, fonte do preço) | `supabase/migrations/20261020120000_disponibilidade_uau.sql` |
| Leitura do UAU (cron) | `supabase/functions/uau-disponibilidade-sync/index.ts` |
| Leitura do UAU (app: obras, prévia, atualizar, conferir) | `supabase/functions/uau-disponibilidade/index.ts` |
| Vínculo unidade X ↔ unidade X | `src/features/disponibilidade/chaveUau.ts` |
| Cor e preço na unidade | `src/features/disponibilidade/aplicar.ts` |
| Ao vivo (foto + Realtime) | `src/features/disponibilidade/useDisponibilidade.ts` |
| Importar obra | `src/features/disponibilidade/importarObra.ts`, `src/components/uau/ImportarObra.tsx` |
| Telas do admin | `app/(app)/admin/uau.tsx`, `app/(app)/admin/uau-obra.tsx` |
| Grade com cores | `src/components/tabelaPreco/GradeDeUnidades.tsx` |
| Testes | `scripts/testar-disponibilidade.mjs`, `scripts/testar-uau-somente-leitura.mjs`, `scripts/testar-disponibilidade-db.sql` |

## Problemas comuns

| Sintoma | Onde olhar |
|---|---|
| Tudo sem cor | Vínculos gravados? Tela da obra (conferência). Obra ativa? |
| Cores não mudam sozinhas | `select * from uau_sync_log order by id desc limit 10;` e `cron.job_run_details`. O cron está ligado? |
| "Pode estar desatualizada" | `development_uau_obras.ultimo_erro`. UAU lento ou fora: a leitura volta sozinha. |
| `suspeita: true` no log | O UAU devolveu muito menos unidade que o esperado; nada foi marcado. |
| Unidade cinza com status novo | Classificar no painel do admin ("Status novos do UAU"). |
| Unidade renumerada no UAU | Fica sem cor. Na tela da obra: "Desfazer esses vínculos" e vincular de novo. |
