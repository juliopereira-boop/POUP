# Disponibilidade do CV CRM

A cor de cada unidade na tabela de preço (verde, amarelo, vermelho, cinza) vem do **CV CRM da construtora dona do empreendimento**. A Canopus foi a primeira, em 26/10/2026; antes, a cor vinha do UAU (o ERP).

O POUP **só lê** o CV. Ele serve apenas para sinalizar disponibilidade. O preço continua sendo o da tabela de preço enviada.

## Cada construtora com a sua conta ("Integrar CV")

O CV é a primeira **integração nativa** do POUP. Várias construtoras usam o CV, e cada uma tem a sua conta: endereço (`https://<conta>.cvcrm.com.br`), e-mail e token do usuário de integração.

- **Quem configura:** só o admin do POUP, em **Catálogo do sistema › construtora › Integrações › Integrar CV**.
- **Testar conexão:** pergunta ao CV, sem gravar.
- **Salvar integração:** testa de novo e só grava se o CV aceitar.
- **Desligar:** apaga o token. Os empreendimentos da construtora perdem a cor, mas os vínculos ficam, e integrar de novo devolve as cores.

Onde fica cada coisa:

- **Endereço e e-mail:** em `cvcrm_integracoes`, uma linha por empresa. A tabela não tem nenhuma política de RLS: só o service role lê e grava.
- **Token:** no **Vault**, em `cvcrm_token_<empresa>`. Ele nunca volta para o aplicativo, nem para o admin. Para trocar, o admin digita outro. Sem digitar, o token salvo continua, mas só para o mesmo endereço.
- **Quem lê a credencial:** só as Edge Functions, pela RPC `cvcrm_credencial` (service role). Nenhum secret de CV fica nas funções, no `EXPO_PUBLIC_*`, na Vercel, no EAS ou no repositório.

O número de um empreendimento ou de uma unidade no CV só vale **dentro da conta**: o 63 de uma construtora não é o 63 de outra. Por isso o espelho (`cvcrm_unidades`), os vínculos e os empreendimentos vinculados levam `integracao_id`. O empreendimento do POUP sempre usa a conta da construtora dona dele.

O painel do admin (Configurações › Administração › Disponibilidade do CV) lista as construtoras com o CV e a saúde de cada conta. A importação começa escolhendo a construtora.

Na mesma tela, com a conta conectada, ficam dois botões, só para o admin:

- **Habilitar reserva:** o corretor reserva a unidade no CV pelo relatório da simulação; veja `docs/CVCRM_RESERVA.md`.
- **Tabela de preço do CV:** o preço da construtora passa a vir só do CV.

Os dois usam duas funções, cada uma com a sua lista fechada de caminhos:

- `cvcrm-comercial-sync`: lê corretores, séries e tabela, às :17 e :47;
- `cvcrm-reserva`: lê e tem uma única escrita, criar a reserva.

## Como funciona

| CV (situação no mapa) | POUP          | Cor      | Pode escolher no simulador |
| --------------------- | ------------- | -------- | -------------------------- |
| Disponível            | disponível    | verde    | sim                        |
| Reservada             | em negociação | amarelo  | sim, depois de um aviso    |
| Em processo de reserva| em negociação | amarelo  | sim, depois de um aviso    |
| Vendida               | vendida       | vermelho | não                        |
| Bloqueada             | fora de venda | cinza    | não                        |
| (situação nova)       | fora de venda | cinza    | não, até o admin classificar |

O admin reclassifica qualquer situação em **Configurações › Administração › Disponibilidade do CV**. Ao reclassificar, as unidades são repintadas na hora.

**Leitura automática** (pg_cron → Edge Function `cvcrm-disponibilidade-sync`):

- **Leve, a cada minuto:** lê o histórico de situação do CVDW (`/api/v1/cvdw/unidades/situacao`) desde a última leitura. É uma chamada por conta (por construtora), para todos os empreendimentos dela; o limite do CVDW é 20 por minuto. Cada conta tem o seu cursor (`cvcrm_integracoes.cvdw_cursor`), que guarda a última `referencia_data`, no relógio do próprio CV. Cada leitura recomeça 5 minutos antes desse cursor, e aplicar de novo o que já entrou não muda nada.
- **Completa, às :07 e :37:** lê o mapa de disponibilidade (`/api/v1/comercial/mapadisponibilidade/{id}`) de cada empreendimento vinculado, com a conta da construtora dele, filtrado pela etapa quando houver. Confere tudo, pega unidade nova e marca como ausente a que sumiu. Se mais de 30% das unidades (e mais de 5) sumirem de uma vez, a leitura é tratada como quebrada e nada é marcado.
- **Na hora da proposta:** a Edge Function `cvcrm-disponibilidade` relê o bloco da unidade no mapa (`idbloco`) antes de gerar o PDF.

O banco grava só o que mudou. A tabela `development_unit_disponibilidade` vai pelo Realtime para a tela do corretor.

## Só leitura, sem dado de pessoa

- As duas funções têm uma lista fechada de 3 caminhos `GET`, e só um `fetch`.
- Uma segunda trava recusa caminho com nome de escrita (`bloquear`, `reservas`, `webhooks`, `auth`…), mesmo que alguém o coloque na lista.
- Os parâmetros também são lista fechada.
- O token (o de cada construtora) só vai para `https://*.cvcrm.com.br`.
- Ficam de fora:
  - o detalhe do empreendimento, que traz o nome de quem reservou;
  - o `documento_bloqueio` (CPF) e o `motivo_bloqueio` do mapa;
  - o `modificou` do CVDW.

  A função descarta esses dados antes de gravar; o espelho (`cvcrm_unidades`) guarda só id, etapa, bloco, nome da unidade e situação.
- `npm run testar:cvcrm-leitura` prova cada item acima.

## Unidade X com unidade X

O vínculo é gravado pelo `idunidade` do CV. O `idunidade_int` não serve como chave: no Calhau ele vem como "79" ou "302", sem padrão.

O banco monta o identificador da unidade: o bloco mais o nome, ou só o nome quando ele já traz o bloco. Formatos reais:

| Empreendimento | Identificador no CV | No POUP |
| --- | --- | --- |
| Connect I, Alvorada IV | `Bloco 29 Apto 304` | Bloco 29 / 304 |
| Reserva II, Estrelas, Águas II | `BLOCO 46 UNIDADE 304`; térreo `BLOCO 27 UNIDADE 1` | Bloco 46 / 304; Bloco 27 / 001 |
| Prime Calhau IV | `Torre 09 Apto 702` | Bloco 9 / 702 |
| Parque Ville, Del Ville II | `Quadra F Casa 19` | Quadra F / 019 |

Os pares são casados pela mesma chave da tabela de preço (`src/features/disponibilidade/vinculo.ts`), e só quando a chave é igual e única dos dois lados. Se o CV renomear a unidade, ela fica sem cor até o admin confirmar o vínculo de novo.

## Os empreendimentos vinculados (26/10/2026)

| POUP | CV | Unidades | Vinculadas |
| --- | --- | --- | --- |
| Village Connect I | 63 | 464 | 464 |
| Village das Estrelas | 61 | 480 | 480 |
| Village Reserva II - Mod II | 55, etapa MODULO II (2264) | 320 | 320 |
| Village Del Ville II | 56 | 351 | 351 |
| Village Parque Ville | 47 (o de São Luís; o 64 é Teresina) | 475 | 475 |
| Village Prime Calhau IV | 66 | 480 | 480 |
| Village Alvorada IV | 67 | 352 | 352 |
| Village das Águas II | 60 | 544 | 544 |

Ao todo foram 3.466 unidades, todas por par exato e sem nenhum conflito.

- **Conferência com o UAU:** nas 3.242 que já tinham vínculo no UAU, o par do CV é exatamente a mesma unidade.
- **Águas II:** o UAU só tinha 320 das 544; agora todas têm cor.
- **Reservada × Vendida:** o CV mantém como "Reservada" 832 unidades que o UAU tinha como "Vendida". Elas aparecem em amarelo. Se a Canopus preferir vermelho para "Reservada", basta reclassificar no painel.

## O que existe no Supabase

| Item | Detalhes |
| --- | --- |
| Migrations | `20261026120000_disponibilidade_cvcrm.sql` e `20261026180000_cvcrm_por_empresa.sql` (aplicadas em 27/10/2026). Não apagam nada: as tabelas da primeira versão ficaram como `_antiga`. |
| Integrações | `cvcrm_integracoes`, uma por construtora. A Canopus está ligada. |
| Vault | `cvcrm_token_<empresa>` (o token de cada construtora), `cvcrm_sync_secret` (gerado no banco), `cvcrm_project_url` |
| Edge Functions | `cvcrm-disponibilidade-sync` (Verify JWT **desligado**, exige o `x-sync-secret`); `cvcrm-disponibilidade` (Verify JWT **ligado**, usada pelo app) |
| Jobs | `cvcrm-disponibilidade-leve` (`* * * * *`), `cvcrm-disponibilidade-completo` (`7,37 * * * *`) |

Para refazer em outro projeto, siga `docs/cvcrm-agendar-cron.sql`.

## A limpeza do UAU e da primeira versão (autorizada em 27/10/2026)

A migration `20261027120000_limpar_uau_e_cvcrm_antigo.sql` apaga:

- **Do UAU:** as tabelas `uau_*`, `development_uau_obras` e `development_unit_uau`, as funções `uau_*`, a coluna `developments.uau_fonte_preco` e os segredos `uau_*` do Vault.
- **Da primeira versão do CV:** as tabelas `_antiga` e as três funções "obsoleta".

Fica `development_unit_disponibilidade`: a tabela nasceu na migration do UAU, mas é a de cores do CV.

**A ponte para o app 1.0.1 (build 9).** Essa versão ainda chama o UAU pelo nome. Para quem não atualizou não perder as cores, ficam três peças sem nenhum dado do UAU:

- as RPCs `uau_disponibilidade`, que devolve as cores do CV no formato antigo, e `uau_empreendimentos_com_preco`, que devolve uma lista vazia;
- a função `uau-disponibilidade`, que só responde o "conferir" com a cor que está no banco.

As três saem quando ninguém mais usar a 1.0.1.

**No painel do Supabase**, porque não há ferramenta para isso, o dono do projeto apaga:

- a função `uau-disponibilidade-sync`;
- os secrets `UAU_*`, `CVCRM_URL`, `CVCRM_EMAIL` e `CVCRM_TOKEN`. Nenhum código usa mais esses secrets: a conta da Canopus está na integração dela, com o token no Vault.

No repositório saíram a função de sync do UAU, o teste de somente leitura do UAU, o teste de banco antigo e os documentos do UAU. A migration do UAU (`20261020120000`) fica: ela é o histórico, e as do CV dependem dela.

## Conferência rápida (SQL Editor)

```sql
select modo, terminado_em, ok, lidas, mudaram, erro, cursor from public.cvcrm_sync_estado;
select situacao, count(*) from public.development_unit_disponibilidade group by 1;
select * from public.cvcrm_situacao where revisar;
```
