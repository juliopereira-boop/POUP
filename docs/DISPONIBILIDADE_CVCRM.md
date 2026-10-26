# Disponibilidade do CV CRM

A cor de cada unidade na tabela de preço (verde, amarelo, vermelho, cinza) vem do **CV CRM** da Canopus desde 26/10/2026. Antes vinha do UAU (o ERP).

O POUP **só lê** o CV. Ele serve apenas para sinalizar disponibilidade. O preço continua sendo o da tabela de preço enviada.

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

- **Leve, a cada minuto:** lê o histórico de situação do CVDW (`/api/v1/cvdw/unidades/situacao`) desde a última leitura. É uma chamada só, para todos os empreendimentos; o limite do CVDW é 20 por minuto. O cursor guarda a última `referencia_data`, no relógio do próprio CV. Cada leitura recomeça 5 minutos antes desse cursor, e aplicar de novo o que já entrou não muda nada.
- **Completa, às :07 e :37:** lê o mapa de disponibilidade (`/api/v1/comercial/mapadisponibilidade/{id}`) de cada empreendimento vinculado, filtrado pela etapa quando houver. Confere tudo, pega unidade nova e marca como ausente a que sumiu. Se mais de 30% das unidades (e mais de 5) sumirem de uma vez, a leitura é tratada como quebrada e nada é marcado.
- **Na hora da proposta:** a Edge Function `cvcrm-disponibilidade` relê o bloco da unidade no mapa (`idbloco`) antes de gerar o PDF.

O banco grava só o que mudou. A tabela `development_unit_disponibilidade` vai pelo Realtime para a tela do corretor.

## Só leitura, sem dado de pessoa

- As duas funções têm uma lista fechada de 3 caminhos `GET`, e só um `fetch`.
- Uma segunda trava recusa caminho com nome de escrita (`bloquear`, `reservas`, `webhooks`, `auth`…), mesmo que alguém o coloque na lista.
- Os parâmetros também são lista fechada.
- O token só vai para `https://*.cvcrm.com.br`.
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
| Migration | `20261026120000_disponibilidade_cvcrm.sql`. Só cria; não apaga nada. |
| Secrets das funções | `CVCRM_URL`, `CVCRM_EMAIL`, `CVCRM_TOKEN`, cadastrados pelo dono do projeto |
| Vault | `cvcrm_sync_secret` (gerado no banco), `cvcrm_project_url` |
| Edge Functions | `cvcrm-disponibilidade-sync` (Verify JWT **desligado**, exige o `x-sync-secret`); `cvcrm-disponibilidade` (Verify JWT **ligado**, usada pelo app) |
| Jobs | `cvcrm-disponibilidade-leve` (`* * * * *`), `cvcrm-disponibilidade-completo` (`7,37 * * * *`) |

Para refazer em outro projeto, siga `docs/cvcrm-agendar-cron.sql`.

## O UAU

O UAU **deixou de pintar** com esta migration: `uau_recalcular_disponibilidade` agora chama o recálculo do CV. No aplicativo, as telas e o código do UAU saíram, e entraram as do CV.

**Ainda existem no Supabase**, aguardando a confirmação do dono do POUP para remover:

- as funções `uau-disponibilidade` e `uau-disponibilidade-sync`;
- os secrets `UAU_*`;
- as tabelas `uau_*` e `development_uau_obras`, com o retrato de 20/10;
- os vínculos `development_unit_uau`;
- a coluna `developments.uau_fonte_preco`;
- os segredos `uau_*` do Vault.

No repositório continuam, pelo mesmo motivo:

- as duas funções;
- a migration do UAU;
- `scripts/testar-uau-somente-leitura.mjs`;
- `scripts/testar-disponibilidade-db.sql`;
- `docs/DISPONIBILIDADE_UAU.md`;
- `docs/uau-agendar-cron.sql`.

## Conferência rápida (SQL Editor)

```sql
select modo, terminado_em, ok, lidas, mudaram, erro, cursor from public.cvcrm_sync_estado;
select situacao, count(*) from public.development_unit_disponibilidade group by 1;
select * from public.cvcrm_situacao where revisar;
```
