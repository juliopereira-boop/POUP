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
- [ ] **Fase 1** (dono): cadastrar os secrets do UAU no Supabase, ligar o
  `pg_net` e guardar `uau_project_url` / `uau_sync_secret` no Vault.
- [ ] **Fase 2** (dono): rodar a migration no SQL Editor. Conferir com o bloco
  CONFERÊNCIA do fim do arquivo.
- [ ] **Fase 3** (dono): publicar as duas funções e fazer o `ping`.
  - `uau-disponibilidade-sync`: Verify JWT **desligado**.
  - `uau-disponibilidade`: Verify JWT **ligado**.
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
