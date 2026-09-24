/**
 * ENVIAR A TABELA DA CONSTRUTORA E LER O QUE ELA DIZ.
 *
 * Dois formatos, um botão:
 *
 *   * o MODELO POUP (`.csv`, ver `modelo.ts`) — o formato único, em que toda
 *     tabela pode ser passada. É lido aqui mesmo, sem servidor;
 *   * o PDF da construtora — o servidor tira o texto (Edge Function
 *     `ler-tabela-preco`) e `importar.ts` lê o formato do Connect.
 *
 * Nos dois casos o arquivo fica guardado no Storage, junto do empreendimento.
 * E nada é SALVO na tabela ainda: o resultado volta para a tela, o corretor
 * confere, e só então salva. Uma leitura errada não pode virar preço sem
 * ninguém olhar.
 *
 * O mesmo gancho serve o cadastro do empreendimento (o campo de envio) e a
 * tela da tabela. Do cadastro, a leitura segue para a tela da tabela pela
 * `guardarLeitura`, porque é lá que se confere.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { db, type ArquivoDaTabela, type UploadBody } from '@/data';
import { pickFiles, type PickedFile } from '@/features/files/pick';
import { lerTextoDaTabela, type LeituraDoPdf } from './importar';
import { lerModelo } from './modelo';

export type EtapaDoEnvio = 'parado' | 'enviando' | 'lendo';

export interface TabelaEnviada {
  /** `null` quando o modelo foi lido mas o arquivo não pôde ser guardado. */
  arquivo: ArquivoDaTabela | null;
  leitura: LeituraDoPdf;
  /** Páginas do PDF; 0 para o modelo POUP. */
  paginas: number;
  formato: 'pdf' | 'modelo';
}

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * O que o seletor aceita. Cada sistema chama o CSV de um jeito, então vão
 * todos os nomes; no navegador, também a extensão (o `accept` do input aceita
 * ".csv", o seletor nativo não).
 */
const TIPOS_ACEITOS = [
  'application/pdf',
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  ...(Platform.OS === 'web' ? ['.csv'] : []),
];

function formatoDe(arquivo: PickedFile): 'pdf' | 'modelo' | null {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith('.pdf') || arquivo.contentType === 'application/pdf') return 'pdf';
  if (nome.endsWith('.csv') || nome.endsWith('.txt') || /csv|text\/plain|ms-excel/.test(arquivo.contentType)) {
    return 'modelo';
  }
  return null;
}

/** O texto do arquivo, nos dois formatos que o seletor devolve (Blob na web, bytes no celular). */
async function textoDe(body: UploadBody): Promise<string> {
  if (body instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(body);
  return body.text();
}

export function useEnviarTabela(developmentId: string | null) {
  const [etapa, setEtapa] = useState<EtapaDoEnvio>('parado');
  const [erro, setErro] = useState<string | null>(null);

  const enviar = useCallback(async (): Promise<TabelaEnviada | null> => {
    if (!developmentId) return null;
    setErro(null);
    const [arquivo] = await pickFiles({ multiple: false, type: TIPOS_ACEITOS });
    if (!arquivo) return null; // fechou o seletor: não é erro

    const formato = formatoDe(arquivo);
    if (!formato) {
      setErro(
        /\.xlsx?$/i.test(arquivo.name)
          ? 'Esse arquivo é do Excel. Salve como CSV (separado por ponto e vírgula) e envie de novo.'
          : 'Envie o PDF da construtora ou a tabela no modelo POUP (.csv).',
      );
      return null;
    }
    if (arquivo.size > MAX_BYTES) {
      setErro('Arquivo grande demais. O limite é 15 MB.');
      return null;
    }

    // ------------------------------------------------ o modelo POUP
    if (formato === 'modelo') {
      setEtapa('lendo');
      let texto: string;
      try {
        texto = await textoDe(arquivo.body);
      } catch {
        setEtapa('parado');
        setErro('Não foi possível abrir o arquivo.');
        return null;
      }
      const modelo = lerModelo(texto);
      if (!modelo) {
        setEtapa('parado');
        setErro(
          'Este arquivo não está no modelo POUP. A primeira linha precisa ser "MODELO POUP". Baixe o modelo em branco na tela da tabela.',
        );
        return null;
      }
      if (modelo.regras.length === 0 && modelo.precosPorUnidade.length === 0 && !modelo.vagas) {
        setEtapa('parado');
        setErro('O modelo está vazio: preencha o preço por regra ou o preço por unidade.');
        return null;
      }
      setEtapa('enviando');
      const guardado = await db.tabelaPreco.enviarArquivo(developmentId, arquivo, 'csv');
      setEtapa('parado');
      const avisos = [...modelo.avisos];
      // O arquivo não subir não impede usar a tabela: os dados já estão lidos.
      if (!guardado.ok) avisos.push(`O arquivo não foi guardado (${guardado.error}), mas a tabela foi lida.`);
      return {
        arquivo: guardado.ok ? guardado.data : null,
        leitura: {
          regras: modelo.regras,
          avisos,
          referencia: modelo.referencia,
          vagas: modelo.vagas,
          unidadesLidas: (modelo.vagas?.unidades ?? []).map((u) => ({ ...u, texto: `${u.bloco} ${u.unidade}` })),
          precosPorUnidade: modelo.precosPorUnidade,
        },
        paginas: 0,
        formato,
      };
    }

    // ------------------------------------------------ o PDF
    setEtapa('enviando');
    const enviado = await db.tabelaPreco.enviarArquivo(developmentId, arquivo, 'pdf');
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
        'Não encontrei linhas de preço nem lista de vagas neste PDF. Passe a tabela para o modelo POUP e envie o arquivo .csv.',
      );
      return null;
    }
    return { arquivo: enviado.data, leitura, paginas: lido.data.paginas, formato };
  }, [developmentId]);

  return { enviar, etapa, erro, limparErro: () => setErro(null) };
}

export function rotuloDaEtapa(etapa: EtapaDoEnvio): string | null {
  if (etapa === 'enviando') return 'Enviando o arquivo…';
  if (etapa === 'lendo') return 'Lendo a tabela…';
  return null;
}

// ---------------------------------------------------------------- de uma tela para outra

/*
 * A leitura feita no cadastro do empreendimento, esperando a tela da tabela
 * abrir. Fica em memória, de propósito: é uma passagem de mão entre duas telas
 * do mesmo toque, não um rascunho. Se o aplicativo fechar no meio, o arquivo
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
