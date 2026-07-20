import { supabase } from './supabase';
import { type Result, err, ok } from '@/data';

export interface ScannedDocument {
  fullName: string;
  cpf: string;
  documentType: 'cnh_antiga' | 'cnh_mercosul' | 'rg_antigo' | 'rg_novo_cin' | 'desconhecido';
  confidence: 'alta' | 'media' | 'baixa';
}

/**
 * Envia a foto de um documento (CNH ou RG, qualquer modelo) para a Edge
 * Function `scan-document`, que usa o Claude (visão) para extrair nome e CPF.
 * O resultado deve sempre ser exibido em campos EDITÁVEIS — nunca salvo
 * automaticamente sem revisão do corretor.
 */
export async function scanDocument(
  imageBase64: string,
  mimeType: string,
): Promise<Result<ScannedDocument>> {
  const { data, error } = await supabase.functions.invoke('scan-document', {
    body: { imageBase64, mimeType },
  });
  if (error) return err(error.message);
  if (data?.error) return err(data.error as string);
  return ok(data as ScannedDocument);
}
