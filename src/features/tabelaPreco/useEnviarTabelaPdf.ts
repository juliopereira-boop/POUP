/**
 * ENVIAR O PDF DA TABELA E LER O QUE ELE DIZ.
 *
 * Três passos, e o corretor vê cada um: escolher o arquivo, guardar no
 * Storage, e o servidor devolver o texto — que o aplicativo interpreta aqui
 * mesmo (`lerTextoDaTabela`). Nada é SALVO na tabela ainda: o resultado volta
 * para a tela, o corretor confere, e só então salva. Uma leitura errada de PDF
 * não pode virar preço sem ninguém olhar.
 *
 * O mesmo gancho serve o cadastro do empreendimento (o campo de envio) e a
 * tela da tabela. Do cadastro, a leitura segue para a tela da tabela pela
 * `leituraPendente`, porque é lá que se confere.
 */
import { useCallback, useState } from 'react';

import { db, type ArquivoDaTabela } from '@/data';
import { pickFiles } from '@/features/files/pick';
import { lerTextoDaTabela, type LeituraDoPdf } from './importar';

export type EtapaDoEnvio = 'parado' | 'enviando' | 'lendo';

export interface TabelaEnviada {
  arquivo: ArquivoDaTabela;
  leitura: LeituraDoPdf;
  paginas: number;
}

const MAX_BYTES = 15 * 1024 * 1024;

export function useEnviarTabelaPdf(developmentId: string | null) {
  const [etapa, setEtapa] = useState<EtapaDoEnvio>('parado');
  const [erro, setErro] = useState<string | null>(null);

  const enviar = useCallback(async (): Promise<TabelaEnviada | null> => {
    if (!developmentId) return null;
    setErro(null);
    const [arquivo] = await pickFiles({ multiple: false, type: 'application/pdf' });
    if (!arquivo) return null; // fechou o seletor: não é erro

    const ehPdf = /\.pdf$/i.test(arquivo.name) || arquivo.contentType === 'application/pdf';
    if (!ehPdf) {
      setErro('Escolha o arquivo da tabela em PDF.');
      return null;
    }
    if (arquivo.size > MAX_BYTES) {
      setErro('PDF grande demais. O limite é 15 MB.');
      return null;
    }

    setEtapa('enviando');
    const enviado = await db.tabelaPreco.enviarPdf(developmentId, arquivo);
    if (!enviado.ok) {
      setEtapa('parado');
      setErro(enviado.error);
      return null;
    }

    setEtapa('lendo');
    const lido = await db.tabelaPreco.lerPdf(enviado.data.path);
    setEtapa('parado');
    if (!lido.ok) {
      setErro(lido.error);
      return null;
    }

    const leitura = lerTextoDaTabela(lido.data.texto);
    if (leitura.regras.length === 0 && !leitura.vagas) {
      setErro(
        'Não encontrei linhas de preço nem lista de vagas neste PDF. Confira se é a tabela da construtora, ou use "Colar o texto".',
      );
      return null;
    }
    return { arquivo: enviado.data, leitura, paginas: lido.data.paginas };
  }, [developmentId]);

  return { enviar, etapa, erro, limparErro: () => setErro(null) };
}

export function rotuloDaEtapa(etapa: EtapaDoEnvio): string | null {
  if (etapa === 'enviando') return 'Enviando o PDF…';
  if (etapa === 'lendo') return 'Lendo a tabela…';
  return null;
}

// ---------------------------------------------------------------- de uma tela para outra

/*
 * A leitura feita no cadastro do empreendimento, esperando a tela da tabela
 * abrir. Fica em memória, de propósito: é uma passagem de mão entre duas telas
 * do mesmo toque, não um rascunho. Se o aplicativo fechar no meio, o PDF
 * continua no Storage e basta enviar de novo.
 */
const pendentes = new Map<string, TabelaEnviada>();

export function guardarLeitura(developmentId: string, t: TabelaEnviada): void {
  pendentes.set(developmentId, t);
}

export function retirarLeitura(developmentId: string): TabelaEnviada | null {
  const t = pendentes.get(developmentId) ?? null;
  pendentes.delete(developmentId);
  return t;
}
