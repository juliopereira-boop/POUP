---
name: video-publicitario-remotion
description: Cria vídeo publicitário/anúncio de app (Reels, Stories, Status, 9:16) com Remotion — roteiro "sofrimento → silêncio → BUM", telas do app de verdade no celular 3D, trilha e efeitos sintetizados em código, stills de conferência e render MP4. Use quando pedirem vídeo publicitário, anúncio, comercial, reels, vídeo de lançamento ou vídeo com Remotion — do POUP ou de outro app.
---

# Vídeo publicitário com Remotion

Método que produziu o anúncio do POUP (`video/` na raiz do repo). O projeto
`video/` é o **modelo vivo**: copie as peças de lá em vez de reescrever.

## 1. Antes de escrever uma linha: conhecer o produto de verdade

O briefing costuma vir de quem não conhece o app. Leia o código e readeque:

- **Telas e rótulos reais**: `grep -oE ">[A-ZÁÉÍÓÚ][^<>{}]{2,60}<|label=\"[^\"]+\""` nas telas
  (no POUP: `app/(app)/**`, `src/components/**`). O vídeo mostra os campos, botões e
  títulos que o app tem ("Ver resultado completo", "Primeira parcela estimada",
  "Levar para o simulador de vendas", "TOTAL A RECEBER", "RANKING POUP"...).
- **Cores e marca**: `src/theme/colors.ts`; logo em `assets/` (redesenhe em SVG — ver
  `video/src/componentes/Logo.tsx` — para trocar a cor da letra conforme o fundo).
- **Domínio/CTA**: procure no código (e-mail de suporte, links). Se não achar, use um
  valor plausível numa constante única e **peça confirmação**.
- Faça uma **tabela "briefing × no vídeo × por quê"** e mostre ao usuário.

Regras que não se negociam:
- **Nenhuma estatística inventada.** Sem o número real, use formulações sem número
  ("de horas para segundos").
- **Valores financeiros ilustrativos** e coerentes entre as telas; aviso "Valores
  ilustrativos." na tela. Sem taxa real, sem nome/logo de banco.
- **Nada que o app não faça.** O POUP não aprova crédito → selo "Cabe na renda", nunca
  "Aprovável".
- Mockups em pt-BR, dinheiro com `Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'})`.

## 2. Estrutura que funciona (30 fps, 1080×1920)

| Quadros | Cena | Ideia |
|---|---|---|
| 0–75 | Hook | Tela preta, pergunta digitada letra a letra, cursor, tique do relógio |
| 75–300 | Sofrimento | Montagem na batida (cortes 30 → 15 quadros), **frio e dessaturado**, tremor crescendo, palavras gigantes ("Papel." "Planilha."), cronômetro vermelho subindo |
| 300–345 | Silêncio | Congela, zoom, "E se levasse segundos?", música a 0 em 4 quadros, escurece; **330–345 quase silêncio (< -30 dB)** |
| **345** | **DROP** | Clarão branco + núcleo da cor da marca + onda de choque + o "antes" explodindo em pedaços + ícone com mola de overshoot forte |
| 360–… | Uso do app | **Um celular só**, telas entrando uma após a outra, manchete por capítulo, dedo tocando (círculo) em cada ação |
| … | Prova | Tela dividida Antes (cinza) × Agora (marca); a direita empurra a esquerda |
| últimos 120 | CTA | Cor da marca, ícone, frase, botão pulsando na batida, endereço; **últimos 15 quadros parados** |

**O contraste é o conceito**: nenhuma cor da marca antes do drop; nada frio depois
(fora o lado "Antes" da prova). Cores em `video/src/tema.ts` (`FRIO` × `MARCA`).

Versão longa (45 s, 1350 quadros): a intro 0–360 fica igual e o uso do app ganha
capítulos — ver `video/src/roteiro.ts` (o dia do corretor: simular → tabela de preço →
LIA preenche → proposta no WhatsApp → LIA agenda + notificação → venda e comissão →
ranking → relatórios).

## 3. Montagem do projeto

- Pasta separada (`video/`), **fora do typecheck e do lint do app**: `tsconfig.json`
  → `"exclude": [..., "video"]`; `.eslintignore` → `video/`.
- Versões exatas iguais entre si: `remotion`, `@remotion/cli`, `@remotion/fonts`
  (mesma versão), React 19. Fonte local: `@fontsource/inter` → `public/fonts/*.woff2` +
  `loadFont` de `@remotion/fonts` (o render não depende de baixar nada).
- Emoji: fonte do sistema (Noto Color Emoji) na pilha `FONTE`.
- **Um arquivo de roteiro** (`roteiro.ts`) com todos os quadros e valores: as telas e os
  efeitos sonoros leem dele, então mexer num tempo mexe nos dois.
- Peças de UI reutilizáveis em `video/src/telas/ui.tsx`: `Toque` (o dedo),
  `Campo` (digita ou "acende" quando preenchido sozinho), `Botao`, `Folha` (bottom
  sheet), `OrbeLia`, `Selo`, `mola()`.
- Transição entre telas: a nova entra da direita em 8 quadros, a antiga recua 30% e
  escurece (`video/src/cenas/UsoDoApp.tsx`, lista `TELAS`).

## 4. Áudio sem banco de sons

`video/scripts/gerar-audio.mjs` sintetiza tudo (osciladores, ruído, envelopes, filtro,
eco) em WAV 44,1 kHz — determinístico (sem `Math.random`).
- **120 BPM = uma batida a cada 15 quadros** a 30 fps: os cortes e o pulso do CTA caem
  no tempo. Conte as batidas a partir do drop.
- Duas trilhas: `trilha-tensa` (drone dissonante, bumbo abafado, acelera no fim) e
  `trilha-drop` (4/4, palmas, baixo, acordes, arpejo, variação no meio, rufo antes da
  prova, acorde final com cauda). Para outra duração, ajuste `seg` e `fimMusica`.
- Efeitos: tique, papel, tecla, notificação, riser, reverso, impacto (3 pesos), whoosh,
  clique de UI, pop, ding positivo. Amarrados aos quadros em `PoupAnuncio.tsx`.
- `volume` da `<Audio>` pode ser função: o quadro é **relativo ao início da Sequence**.
- O riser NÃO pode encher o silêncio pré-drop: sobe até ~330 e cai a quase nada.

## 5. Conferir antes de entregar (obrigatório)

1. `npx tsc --noEmit -p .` no projeto do vídeo.
2. Stills: `video/scripts/stills.mjs` (bundle uma vez, `renderStill` para vários quadros,
   `scale: 0.5`). **Sempre** 340, 345, 348, 355 (o drop) e uma amostra de cada capítulo.
3. Folha de contato para olhar tudo de uma vez: `scripts/folha-de-contato.cjs` desta skill.
4. Olhe de verdade: texto cortado, valor quebrando linha, selo sobrepondo, tela errada
   no quadro, transição escurecendo.
5. Render final e níveis de áudio por trecho: `scripts/niveis-de-audio.mjs`
   (silêncio < -30 dB, drop > -10 dB, trilha ~ -16 dB). Confira `nb_frames` e duração
   com o `ffprobe` do Remotion.
6. Entregue o MP4 e os stills do drop com `SendUserFile`. **Não** comite MP4 (vai no
   `.gitignore`: `out/`, `entrega/`).

## 6. Pegadinhas já pisadas

- Neste ambiente o Remotion **não baixa** o navegador: use o do Playwright
  (`POUP_BROWSER=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`,
  lido em `remotion.config.ts` → `Config.setBrowserExecutable`). Em máquina comum, nada.
- O ffmpeg do Remotion é mínimo (sem `drawtext`/`xstack`) e precisa de
  `LD_LIBRARY_PATH` apontando para a pasta dele.
- `spring()` antes do início devolve 0: `scale(1 + (mola-1)*k)` encolhe o elemento
  antes da hora. Proteja com `s >= inicio ? mola : 1`.
- `interpolate` com `Infinity` na faixa derruba o render (ex.: "próxima tela" da última
  tela). Cheque `Number.isFinite`.
- Camadas que somem separadas escurecem a transição (fundo escuro aparece pelo meio do
  laranja). Faça o fade no **grupo**.
- Os primeiros quadros podem pegar a splash/carregamento: espere antes de fotografar
  num teste de navegador; no `renderStill` isso não acontece.
- Número "rolando" (contador) precisa de `fontVariantNumeric: 'tabular-nums'` para não
  tremer.
- Valor em reais em cartão estreito quebra linha: `whiteSpace: 'nowrap'` + fonte menor.

## 7. Comandos

```bash
cd video && npm install
npm run audio                     # trilha + efeitos
npm run studio                    # editor
POUP_BROWSER=... npm run stills -- 340 345 348 355
POUP_BROWSER=... npx remotion render PoupAnuncio out/video.mp4 --codec=h264 --crf=18 --audio-codec=aac
```
