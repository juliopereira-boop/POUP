# Reservar unidade no CV CRM pelo POUP

> **Estado (27/10/2026): o envio está implementado**, com o formulário do CV conferido na documentação que o dono do POUP mandou (`postreserva-2`, `cadastrardocumento-4`, `getreserva-2`).
> **Ainda não foi para o Supabase:** a migration `20261027140000_cvcrm_reserva_envio.sql` e as novas versões de `cvcrm-reserva` e `cvcrm-comercial-sync` sobem juntas.
> A reserva só sai de verdade quando, na construtora:
> - o admin liga **Habilitar reserva**;
> - escolhe as **séries**;
> - e o usuário de integração tem a permissão **"Criar nova reserva"**.

## O fluxo

1. **O admin liga a reserva.** Em Catálogo do sistema › construtora › Integrações, aciona **Habilitar reserva**. Só o admin faz isso.
2. **O corretor simula.** Escolhe empreendimento, bloco e unidade. A tabela de preço já vem, com a disponibilidade pintada, e ele faz a simulação. Nos dados do cliente vai o **CPF**.
3. **Em Relatórios › a simulação, o corretor toca em "Reservar no CV".** O POUP confere no CV, na hora:
   - **A unidade:** relê o bloco dela no mapa de disponibilidade e só segue se ela estiver "Disponível".
   - **O cliente:** busca pelo CPF da simulação em `GET /api/v1/precadastro/{cpf}`. O cliente, em geral, já está em pré-cadastro no CV. Dali vêm o número do pré-cadastro, a situação e a aprovação de financiamento (valor aprovado, subsídio, FGTS, vencimento).
   - **O corretor:** busca pelo CPF do perfil do POUP. O corretor que aparece na reserva é o **usuário do POUP**, com a imobiliária dele, e **nunca o usuário da integração**. Por isso ele precisa ter cadastro de corretor no CV daquela construtora.
4. **O que falta aparece em frase de gente**, por exemplo:
   - "Cadastre o seu CPF no perfil";
   - "Este CPF não tem pré-cadastro no CV desta construtora";
   - "A unidade está Reservada no CV".
5. **Com tudo certo, "Reservar" pede confirmação e cria a reserva no CV para aquele CPF**: `POST /api/v1/comercial/reservas`, com a pessoa do pré-cadastro, a unidade, o corretor (a imobiliária vem do cadastro dele no CV) e o fluxo da simulação como condições.
   - Quando a "Tabela de preço do CV" está ligada, vai também o `idtabela`.
   - O `idreserva_int` é o recibo do POUP (`POUP-<id>`).
   - Se o CV não devolver o número da reserva, o POUP o acha no CVDW: a reserva mais nova da unidade com aquele corretor.
6. **O POUP guarda só o recibo** em `cvcrm_reservas`: quem pediu, quando, qual unidade e o número da reserva no CV. A unidade fica amarela para todos na leitura seguinte (em até um minuto).

## Como o corretor do POUP vira o corretor do CV

O CPF é o id, como você sugeriu.

- A cada 30 minutos, a função `cvcrm-comercial-sync` lê os corretores do CV (`/api/v1/cvdw/corretores`, incremental).
- Do corretor, o POUP guarda **só o hash do CPF** (sha256 de `poup-cv:` + os 11 dígitos), o `idcorretor`, o `idimobiliaria` e o nome da imobiliária. Nome, e-mail e CPF do corretor ficam no CV.
- Na reserva, o mesmo hash é calculado com o CPF do perfil do POUP.

Na Canopus, a primeira leitura trouxe 4.000 corretores de 754 imobiliárias. O resto vem nas rodadas seguintes, porque o CVDW limita as chamadas por minuto.

Se o corretor do POUP não tem cadastro no CV da construtora, a reserva não segue, e a tela diz para pedir o cadastro à construtora.

## O que a pesquisa encontrou (27/10/2026)

Fontes: a documentação pública que você mandou (o índice, a tabela de permissões e as definições das rotas de unidades e de tabela de preço) e uma leitura só de formato na conta da Canopus. Dessa leitura voltaram só nomes de campos, nenhum valor de pessoa.

| Para quê | Caminho no CV | Permissão no CV | Hoje, na conta da Canopus |
| --- | --- | --- | --- |
| Criar a reserva | `POST /api/v1/comercial/reservas` | Criar nova reserva | não testado (é escrita) |
| Conferir a reserva criada | `GET /api/v1/comercial/reservas/{id}` | Administrar reservas | ok |
| Cliente pelo CPF | `GET /api/v1/precadastro/{id ou documento}` | Listar Pré-cadastros | a confirmar |
| Anexar documentos na reserva | `POST /api/v1/comercial/reservas/documentos` | Adicionar documento das reservas | não testado |
| Condições de pagamento | `GET /api/v1/comercial/reservas/condicao-pagamentos` | Administrar reservas | a confirmar |
| Séries (ato, mensal, anual…) | `GET /api/v1/cv/seriestabelasdepreco` | Listar Séries | **sem permissão (403)** |
| Tabelas de preço | `GET /api/v1/cv/tabelasdepreco` | Listar Tabelas de Preços | **sem permissão (403)** |
| Corretores (CVDW) | `GET /api/v1/cvdw/corretores` | — | ok (tem `documento`, `idcorretor`, `idimobiliaria`) |
| Pré-cadastros (CVDW) | `GET /api/v1/cvdw/precadastros` | — | ok (tem `idprecadastro`, `valor_aprovado`, `valor_subsidio`, `valor_fgts`, `condicao_aprovada`) |
| Corretores, clientes e imobiliárias (cadastro) | `/api/v1/cadastros/...` | — | **sem permissão (403)** |

A **reserva**, como o CV a devolve, liga:

- titular (com `documento` e `idpessoa_cv`);
- unidade (`idunidade_cv`);
- corretor (`idcorretor_cv` e `idimobiliaria_cv`);
- imobiliária;
- condições (`idtabela`, `vpl_reserva`, `valor_contrato`);
- `idprecadastro`, `idtipo_reserva` e observações.

As **condições de pagamento** da reserva, no CVDW, vêm uma por série: `idserie`, `serie`, `valor`, `parcela_quantidade`, `vencimento` e `indexador`. É aí que entram ato, mensais, semestrais, anuais e financiamento.

**Documentos:** o CV aceita anexar documentos na reserva (`POST /comercial/reservas/documentos`), então dá para fazer pelo POUP. Fica para a fase seguinte ao envio.

## O formulário do CV (POST /api/v1/comercial/reservas)

| Campo | De onde vem no POUP |
| --- | --- |
| `idpessoa_cv` | a pessoa do pré-cadastro achado pelo CPF do cliente |
| `idempreendimento_cv`, `idunidade_cv` | o vínculo da unidade com o CV |
| `idcorretor_cv` | o corretor achado pelo CPF do perfil (a imobiliária vem junto, do cadastro dele no CV) |
| `idtabela` | só com a "Tabela de preço do CV" ligada |
| `idreserva_int` | o recibo do POUP |
| `condicoes[]` | uma por parte do fluxo: `idserie_cv`, `quantidade_parcelas`, `valor_parcela`, `primeiro_vencimento` (DD/MM/AAAA) |

Como o fluxo vira condições:

- **Ato:** 1 parcela, com o vencimento do ato.
- **Mensais, semestrais e anuais:** a quantidade, o valor e o primeiro vencimento do simulador.
- **Financiamento, FGTS e subsídio:** 1 parcela cada, sem vencimento (quem marca a data é o banco).
- **Cupom:** não vira condição, porque já desconta da poupança.
- **Soma:** as condições nunca passam do valor da unidade.

**As séries:** qual série do CV recebe cada parte, o admin escolhe uma vez no cadastro da construtora. O usuário de integração não tem permissão para listar séries, então o POUP aprende quais existem pelo histórico de condições das reservas no CVDW (`/api/v1/cvdw/reservas/condicoes`, só id e nome da série), na leitura das :17 e :47.

**O recibo:** o mesmo pedido (simulação + unidade) não entra duas vezes.

- Já criada: devolve o número, sem reenviar.
- Recusada pelo CV: dá para tentar de novo, no mesmo recibo.
- Envio sem resposta: destrava em 5 minutos. O CV recusa unidade já reservada, então nada duplica.

**Documentos:** o CV aceita (`POST /comercial/reservas/documentos`: `idreserva`, `idtipo` e o arquivo em base64). Para fazer pelo POUP, falta a lista dos **tipos de arquivo** do CV (a API de tipos de arquivos, em Cadastros) e a permissão "Adicionar documento das reservas".

**O 2º proponente:** vai como `associado`, com a pessoa dele no CV e o tipo de associação. Entra junto com os documentos: falta a lista dos tipos de associação.

## O que falta para a primeira reserva

1. **Subir para o Supabase** a migration `20261027140000` e as funções `cvcrm-reserva` e `cvcrm-comercial-sync`.
2. **As permissões do usuário de integração no CV da construtora:**
   - "Criar nova reserva";
   - "Listar Pré-cadastros";
   - "Adicionar documento das reservas";
   - "Listar Séries";
   - "Listar Tabelas de Preços".
3. **O admin escolhe as séries** (ato, mensais…) no cadastro da construtora, depois da primeira leitura delas.
4. **Uma primeira reserva acompanhada:** uma unidade e um cliente combinados com a construtora, para conferir no CV como a reserva entrou (séries, valores, vencimentos).

   O formato da resposta de `GET /precadastro/{cpf}` não está na documentação: o POUP procura o `idpessoa` no pré-cadastro, e a primeira consulta real confirma.

## Garantias

- **Cada parte do CV na sua função, com a sua lista fechada de caminhos:**
  - a disponibilidade (`cvcrm-disponibilidade*`) e a leitura comercial continuam **só lendo**;
  - a reserva (`cvcrm-reserva`) tem **uma** escrita: criar a reserva. Cancelar, alterar situação, informar venda e distrato não estão lá;
  - `scripts/testar-cvcrm-somente-leitura.mjs` prova tudo isso, executando as travas.
- **Uma reserva por vez em cada unidade:** um índice único impede dois envios simultâneos da mesma unidade, e a chave simulação + unidade faz o mesmo pedido repetido devolver o mesmo recibo.
- **Dado pessoal:**
  - o CPF do cliente só vai ao CV da própria construtora, para achar o pré-cadastro dele;
  - o POUP não guarda CPF de ninguém, só o hash do CPF do corretor;
  - do pré-cadastro, o POUP mostra só o número, a situação e os valores aprovados.

## Tabela de preço do CV

O botão **Tabela de preço do CV** (na mesma tela) faz o preço dos empreendimentos da construtora vir **só** do CV:

- **A tabela usada:** a aprovada e vigente hoje, e não a "tabela mínima". Havendo mais de uma, a de vigência mais recente; o admin pode fixar outra.
- **Onde ela entra:** vira o "preço por unidade" da tabela do POUP, unidade a unidade, pelo vínculo do CV. O simulador não muda nada.
- **A tabela manual:** a enviada à mão fica guardada e volta quando o botão é desligado. Enquanto ele estiver ligado, ninguém troca a tabela à mão.
- **Quando o CV não tem tabela:** se o CV não trouxer tabela para um empreendimento, a que estava valendo continua, e o erro aparece na integração.

**Na Canopus, hoje:**

- o Connect I (CV 63) não tem tabela de preço visível no CV: o detalhe do empreendimento traz `tabela: false`, e a lista vem vazia;
- os valores das tabelas dinâmicas (CVDW) também vêm vazios;
- e o usuário de integração está sem a permissão "Listar Tabelas de Preços".

Por isso o botão fica **desligado** na Canopus até ela confirmar que mantém a tabela no CV e liberar a permissão.
