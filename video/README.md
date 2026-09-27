# Vídeo publicitário do POUP (Remotion)

30 s · 1080×1920 (9:16, Reels/Stories/Status) · 30 fps · áudio sintetizado.

```bash
cd video
npm install
npm run audio     # gera public/audio/*.wav (trilha e efeitos)
npm run studio    # abre o editor do Remotion no navegador
npm run render    # out/poup-anuncio.mp4
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
| CTA "Teste grátis — site.com.br" | **"Teste grátis" · poupgestao.com** | O app tem período de teste; o domínio é o do e-mail de suporte. **Confirme** (`src/cenas/Cta.tsx`, constante `CTA`) |

Valores ilustrativos (aparece na tela): imóvel R$ 210.000, entrada R$ 12.000,
FGTS R$ 10.000 + subsídio R$ 20.000, banco financia R$ 168.000, renda
R$ 3.200, parcela R$ 958,40 (dentro de 30% da renda). Sem taxa, sem nome de banco.

## Estrutura (quadros a 30 fps)

| Quadros | Cena | Arquivo |
|---|---|---|
| 0–75 | Hook: pergunta digitada, cursor, tique do relógio | `src/cenas/Hook.tsx` |
| 75–300 | Sofrimento: papel, planilha travada, calculadora, cliente esfriando, relógio; cortes de 30 → 15 quadros na batida; frio e dessaturado; tremor crescendo | `src/cenas/Sofrimento.tsx` |
| 300–345 | Congela no relógio, "E se levasse segundos?", música corta em 4 quadros, escurece | `src/cenas/Drop.tsx` |
| **345** | **DROP**: clarão, onda de choque, o "antes" explode, o laranja invade, ícone com mola de overshoot | `src/cenas/Drop.tsx` |
| 360–660 | Solução no celular 3D: simular → PDF no WhatsApp → Relatórios (papéis varridos) | `src/cenas/Solucao.tsx` |
| 660–780 | Prova: Antes (cinza) × Agora (laranja), a direita empurra a esquerda | `src/cenas/Prova.tsx` |
| 780–900 | CTA: ícone, "Simule rápido. Venda mais.", botão pulsando na batida, endereço; 885–900 parado | `src/cenas/Cta.tsx` |

A regra de cor é o conceito: **nada da marca antes do 345, nada frio depois**
(fora o lado "Antes" da prova). As cores estão em `src/tema.ts`.

O áudio (`scripts/gerar-audio.mjs`) é a 120 BPM — uma batida a cada 15
quadros —, então os cortes da montagem e o pulso do CTA caem no tempo. Os
efeitos estão amarrados aos quadros em `src/PoupAnuncio.tsx`. Para usar uma
trilha licenciada no lugar da sintetizada, troque `public/audio/trilha-*.wav`
(mesmos nomes) e mantenha o drop no quadro 345.
