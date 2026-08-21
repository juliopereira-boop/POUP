/**
 * OS DOIS RASTREIOS QUE PRECISAM DE UM LUGAR NA ÁRVORE DO REACT.
 *
 * O resto da telemetria é uma chamada solta no momento em que a coisa acontece
 * (`registrar('company_created')` depois de criar a empresa). Estes dois não
 * têm um "momento": são sobre navegação e sobre tempo, e por isso precisam de
 * um hook montado uma vez no layout do app.
 */
import { useEffect } from 'react';
import { usePathname } from 'expo-router';

import { sessionStorage } from '@/lib/storage';
import { registrar } from './eventos';
import { anotarTela } from './tela';

/**
 * Guarda a rota atual para o formulário de "reportar problema" saber onde o
 * problema aconteceu. Não grava nada no banco — ver `tela.ts`.
 */
export function useRastrearTela(): void {
  const rota = usePathname();
  useEffect(() => {
    if (rota) anotarTela(rota);
  }, [rota]);
}

const CHAVE_ULTIMA_VISITA = 'poup.analytics.ultimaVisita.v1';

/**
 * VINTE HORAS, E NÃO VINTE E QUATRO.
 *
 * "Voltou outro dia" é a pergunta, mas medir 24 horas exatas erra o caso mais
 * comum: quem usa o app às 9h da manhã todo dia útil nunca completa 24 horas
 * entre duas sessões, e apareceria como se nunca tivesse voltado. Vinte horas
 * pega o dia seguinte e ainda descarta o "abri de novo depois do almoço".
 */
const HORAS_PARA_CONTAR_RETORNO = 20;
const MS_POR_HORA = 3_600_000;

/**
 * Emite `user_returned` quando o corretor abre o app depois de um intervalo
 * longo — a única métrica de valor que não dá para fingir.
 *
 * A `etapa` leva a faixa de dias fora (`'1d'`, `'2-3d'`, `'4-7d'`, `'8d+'`).
 * Faixa, e não o número exato, porque a pergunta é "voltou rápido ou voltou
 * depois de sumir", e faixa é o suficiente — além de ser menos granular sobre o
 * comportamento de uma pessoa identificável, que é o lado certo de errar.
 */
export function useRegistrarRetorno(): void {
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const bruto = await sessionStorage.getItem(CHAVE_ULTIMA_VISITA);
        const agora = Date.now();
        // Sempre atualiza a marca, mesmo quando não emite: senão a primeira
        // sessão nunca gravaria nada e o retorno nunca seria detectado.
        await sessionStorage.setItem(CHAVE_ULTIMA_VISITA, String(agora));
        if (!ativo || !bruto) return;

        const antes = Number(bruto);
        if (!Number.isFinite(antes) || antes <= 0 || antes > agora) return;

        const horas = (agora - antes) / MS_POR_HORA;
        if (horas < HORAS_PARA_CONTAR_RETORNO) return;

        registrar('user_returned', { etapa: faixaDeAusencia(horas), resultado: 'ok' });
      } catch {
        /* Sem armazenamento, não há como saber. Silêncio é a resposta certa. */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);
}

function faixaDeAusencia(horas: number): string {
  const dias = horas / 24;
  if (dias < 2) return '1d';
  if (dias < 4) return '2-3d';
  if (dias < 8) return '4-7d';
  return '8d+';
}
