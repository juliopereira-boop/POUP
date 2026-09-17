import { mensagemDoErro } from './edgeError';
import { supabase } from './supabase';
import { type Result, err, ok } from '@/data';
import { temConsentimentoScan } from '@/features/scan/consent';

export interface ScannedDocument {
  fullName: string;
  cpf: string;
  documentType: 'cnh_antiga' | 'cnh_mercosul' | 'rg_antigo' | 'rg_novo_cin' | 'desconhecido';
  confidence: 'alta' | 'media' | 'baixa';
}

export async function scanDocument(
  imageBase64: string,
  mimeType: string,
  autorizacaoTitular = false,
): Promise<Result<ScannedDocument>> {
  if (!autorizacaoTitular || !(await temConsentimentoScan())) {
    return err('Autorize a leitura deste documento antes de enviar a imagem. Você também pode preencher manualmente.');
  }
  const { data, error } = await supabase.functions.invoke('scan-document', {
    body: { imageBase64, mimeType },
  });
  if (error) {
    return err(await mensagemDoErro(error, 'Não foi possível ler o documento agora.'));
  }
  if (data?.error) return err(data.error as string);
  return ok(data as ScannedDocument);
}
