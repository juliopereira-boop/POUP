/**
 * O quanto está sendo falado, agora, de 0 a 1.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * Para o orbe da LIA pulsar **com a voz**, e não no relógio.
 *
 * Uma animação em laço fixo é bonita por dez segundos e vira papel de parede
 * no décimo primeiro — o olho percebe que ela não tem nada a ver com o que
 * está acontecendo. Reagindo ao volume real, o movimento vira informação: o
 * corretor vê, sem ler nada, que a LIA está captando *aquela* frase.
 *
 * ===========================================================================
 * O CUSTO ESTÁ CONTROLADO
 * ===========================================================================
 * A medição roda em `requestAnimationFrame` (~60 vezes por segundo). Mandar
 * isso para o estado do React seriam 60 renderizações por segundo do
 * aplicativo inteiro. Em vez disso, o valor é escrito direto num
 * `Animated.Value`, que a árvore de estilos consome **sem re-renderizar
 * nada**. É a diferença entre uma animação suave e um app arrastando.
 *
 * ===========================================================================
 * O MICROFONE PRECISA SER DEVOLVIDO
 * ===========================================================================
 * Este módulo abre um segundo fluxo de áudio, ao lado do que o reconhecimento
 * de fala usa. Deixar esse fluxo aberto mantém a luz do microfone acesa no
 * aparelho depois de a LIA ser encerrada — o tipo de coisa que faz o usuário
 * desinstalar o app e não dizer por quê. `parar()` fecha tudo: o laço, o nó de
 * análise, o contexto de áudio e as faixas do fluxo.
 *
 * Se qualquer parte falhar, `medirVoz` devolve `null` em silêncio: o orbe cai
 * na animação por ritmo e a LIA continua funcionando. Enfeite nunca derruba a
 * funcionalidade.
 */
import { Platform } from 'react-native';

export interface MedidorDeVoz {
  parar: () => void;
}

/** Acima disto já é fala clara; abaixo é ruído de sala. Calibrado no ouvido. */
const RMS_MAXIMO = 0.22;

/**
 * Suavização na subida e na descida.
 *
 * A subida é rápida (a batida da sílaba tem que aparecer) e a descida é lenta
 * (senão o orbe pisca entre as palavras, o que parece defeito).
 */
const SUBIDA = 0.55;
const DESCIDA = 0.12;

export async function medirVoz(aoMedir: (nivel: number) => void): Promise<MedidorDeVoz | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const janela = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Contexto = janela.AudioContext ?? janela.webkitAudioContext;
  if (!Contexto || !navigator.mediaDevices?.getUserMedia) return null;

  let fluxo: MediaStream;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    // Permissão negada ou sem microfone. O reconhecimento de fala vai reclamar
    // por conta própria; aqui só se desiste do enfeite.
    return null;
  }

  let contexto: AudioContext;
  try {
    contexto = new Contexto();
  } catch {
    fluxo.getTracks().forEach((t) => t.stop());
    return null;
  }

  const fonte = contexto.createMediaStreamSource(fluxo);
  const analisador = contexto.createAnalyser();
  analisador.fftSize = 512;
  // O próprio analisador já suaviza um pouco; o resto é feito abaixo, onde dá
  // para separar subida de descida.
  analisador.smoothingTimeConstant = 0.6;
  fonte.connect(analisador);

  const amostras = new Uint8Array(analisador.fftSize);
  let quadro = 0;
  let suave = 0;
  let vivo = true;

  function medir() {
    if (!vivo) return;
    analisador.getByteTimeDomainData(amostras);

    // RMS do sinal centrado em 128 (o silêncio digital deste formato).
    let soma = 0;
    for (let i = 0; i < amostras.length; i++) {
      const v = (amostras[i]! - 128) / 128;
      soma += v * v;
    }
    const rms = Math.sqrt(soma / amostras.length);
    const alvo = Math.min(1, rms / RMS_MAXIMO);

    suave += (alvo - suave) * (alvo > suave ? SUBIDA : DESCIDA);
    aoMedir(suave);

    quadro = requestAnimationFrame(medir);
  }

  quadro = requestAnimationFrame(medir);

  return {
    parar() {
      vivo = false;
      cancelAnimationFrame(quadro);
      try {
        fonte.disconnect();
        analisador.disconnect();
      } catch {
        /* já desconectado */
      }
      // As faixas primeiro: é o que apaga a luz do microfone.
      fluxo.getTracks().forEach((t) => t.stop());
      void contexto.close().catch(() => undefined);
      aoMedir(0);
    },
  };
}
