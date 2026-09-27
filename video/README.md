# Vídeo publicitário do POUP (Remotion)

45 s · 1080×1920 (9:16, Reels/Stories/Status) · 30 fps · áudio sintetizado.

> O método completo virou skill: `.claude/skills/video-publicitario-remotion/`.

```bash
cd video
npm install
npm run audio     # gera public/audio/*.wav (trilha e efeitos)
npm run studio    # abre o editor do Remotion no navegador
npm run render    # out/poup-anuncio.mp4 (45 s)
npm run stills -- 340 345 348 355   # quadros soltos em out/stills
```

> Neste ambiente o navegador vem de `POUP_BROWSER` (ver `remotion.config.ts`).
> Numa máquina comum não precisa: o Remotion baixa o dele.

## O roteiro, readequado ao app

O briefing veio de quem não conhece o POUP. O que mudou, e por quê:

| Briefing | No vídeo | Por quê |
|---|---|---|
| Formulário: renda, dependentes, valor do imóvel → "Simular" | **Valor do imóvel, Entrada, FGTS, Renda bruta familiar, Idade, Prazo** → **"Ver resultado completo"** | São os seis campos e o botão da tela "Simular financiamento" do app |
| Cards: parcela, subsídio, entrada, valor financiado | **Primeira parcela estimada** + **O banco financia · Entrada (poupança) · FGTS + subsídio · Imóvel** | São os rótulos do resultado do app |
| Selo "Aprovável" | **"✓ Cabe na renda"** | O próprio POUP avisa que não faz análise de crédito nem aprova financiamento; "aprovável" seria promessa falsa |
| "Enviar PDF" | **"Gerar PDF"** e "Resumo p/ cliente" | Botões do resultado |
| Kanban de simulações | **Relatórios** ("Simulações concluídas.") com filtro por empreendimento | É assim que o app organiza as simulações |
| "E se levasse 30 segundos?" · "Antes: 47 min / Agora: 30 s" · contador até 47:12 | **"E se levasse segundos?"** · **"Antes: horas / Agora: segundos"** · "De horas para segundos." · cronômetro dramatizado até 02:47:12 | O número real não foi informado: regra do briefing, nada de estatística inventada |
| CTA "Teste grátis — site.com.br" | **"Teste grátis" · poupcrm.online** | Confirmado pelo Julio (`src/cenas/Cta.tsx`, constante `CTA`) |

Valores ilustrativos (aparece na tela): imóvel R$ 210.000, entrada R$ 12.000,
FGTS R$ 10.000 + subsídio R$ 20.000, banco financia R$ 168.000, renda
R$ 3.200, parcela R$ 958,40 (dentro de 30% da renda). Sem taxa, sem nome de banco.

## Estrutura (quadros a 30 fps)

| Quadros | Cena | Arquivo |
|---|---|---|
| 0–75 | Hook: pergunta digitada, cursor, tique do relógio | `src/cenas/Hook.tsx` |
| 75–300 | Sofrimento: papel, planilha travada, calculadora, cliente esfriando, relógio | `src/cenas/Sofrimento.tsx` |
| 300–345 | Congela, "E se levasse segundos?", música corta, escurece | `src/cenas/Drop.tsx` |
| **345** | **DROP** | `src/cenas/Drop.tsx` |
| 360–1110 | **Uso do app** — um celular só, o dia do corretor (quadros em `src/roteiro.ts`) | `src/cenas/UsoDoApp.tsx` + `src/telas/*` |
| 1110–1230 | Prova: Antes (cinza) × Agora (laranja) | `src/cenas/Prova.tsx` |
| 1230–1350 | CTA; 1335–1350 parado | `src/cenas/Cta.tsx` |

### O uso do app (capítulos)

| Quadros | Tela do app | O que acontece |
|---|---|---|
| 360–470 | Simular financiamento → Resultado | seis campos digitados, "Ver resultado completo", cartões, "✓ Cabe na renda", **"Levar para o simulador de vendas"** |
| 470–620 | Simulador de vendas | **"Usar tabela de preço"** → Bloco 2 → unidade 301 (preço da tabela); a **LIA** recebe a frase da negociação e preenche financiamento, subsídio, FGTS, ato e mensais; parcela rola; "Dentro do risco (20%)" |
| 620–720 | Unidade e cliente → WhatsApp | "Gerar proposta"; o PDF voa para a conversa; ✓✓ azul; "Perfeito! Vamos fechar 🙌" |
| 720–810 | Calendário + LIA → tela bloqueada | "Agendar compromisso": "visita ao decorado com a Ana amanhã às 15h" → agendado; no dia, a notificação "Em 1 hora: Visita ao decorado" |
| 810–910 | Registrar venda → Controle de Comissão | comissão já calculada pela regra (House 4%); TOTAL A RECEBER sobe |
| 910–1000 | Ranking POUP | "Você" sobe de 5º para 2º (▲ 3) |
| 1000–1110 | Relatórios | filtro por empreendimento; os papéis do "antes" voltam e são varridos — "Adeus, papel." |

A regra de cor é o conceito: **nada da marca antes do 345, nada frio depois**
(fora o lado "Antes" da prova). As cores estão em `src/tema.ts`.

O áudio (`scripts/gerar-audio.mjs`) é a 120 BPM; depois do drop, deep house
cinematográfico em lá menor (sub, piano elétrico, pad, sidechain) — — uma batida a cada 15
quadros —, então os cortes da montagem e o pulso do CTA caem no tempo. Os
efeitos estão amarrados aos quadros em `src/PoupAnuncio.tsx`. Para usar uma
trilha licenciada no lugar da sintetizada, troque `public/audio/trilha-*.wav`
(mesmos nomes) e mantenha o drop no quadro 345.
