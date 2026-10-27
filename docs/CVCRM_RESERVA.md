# Reservar unidade no CV CRM pelo POUP

> **Estado (27/10/2026): tudo preparado, o envio ainda travado.**
> Já funciona: o botão "Habilitar reserva" na integração, a conferência completa no relatório e os corretores do CV reconhecidos pelo CPF.
> Falta só o envio da reserva ao CV. Ele fica travado na Edge Function `cvcrm-reserva` (`ENVIO_LIBERADO = false`) até o formulário do CV ser confirmado; veja "O que falta" abaixo.

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
5. **Com tudo certo, "Reservar" cria a reserva no CV para aquele CPF**, com corretor, imobiliária e o fluxo financeiro da simulação. É o passo que ainda está travado.
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

## O que falta para liberar o envio

1. **O formulário exato.** Os campos obrigatórios e o formato do `POST /api/v1/comercial/reservas`, do `POST /comercial/reservas/documentos` e da resposta de `GET /precadastro/{cpf}`. Estão nas páginas `reference/postreserva-2`, `reference/cadastrardocumento-4`, `reference/getreserva-2` e `reference/listartiposreservav3` do portal do desenvolvedor do CV.

   O portal (`desenvolvedor.cvcrm.com.br`) está bloqueado pela política de rede do ambiente do Claude. Há duas saídas:
   - liberar esse domínio em Network access, nas configurações do ambiente;
   - mandar as páginas.
2. **As permissões do usuário de integração no CV da construtora:**
   - "Criar nova reserva";
   - "Listar Pré-cadastros";
   - "Adicionar documento das reservas";
   - "Listar Séries";
   - "Listar Tabelas de Preços".
3. **O de-para do fluxo financeiro.** Cada parte da simulação (ato, mensais, semestrais, anuais, financiamento, FGTS, subsídio) vira uma série do CV, pelo `idserie`. Para isso é preciso ler as séries da construtora, com a permissão "Listar Séries".
4. **O tipo de reserva padrão de cada construtora**, se o CV exigir.
5. **Um teste combinado:** uma unidade e um cliente de teste, de preferência no ambiente de homologação do CV. Só depois disso `ENVIO_LIBERADO` vira `true`.

## Garantias

- **Cada parte do CV na sua função, com a sua lista fechada de caminhos:**
  - a disponibilidade (`cvcrm-disponibilidade*`) continua **só lendo**;
  - a reserva (`cvcrm-reserva`) hoje também só lê, e o envio entra na lista dela com teste próprio;
  - `scripts/testar-cvcrm-somente-leitura.mjs` prova as três.
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
