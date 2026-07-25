import { supabase } from './supabase';
import { type Result, err, ok } from '@/data';

export interface ScannedDocument {
  fullName: string;
  cpf: string;
  documentType: 'cnh_antiga' | 'cnh_mercosul' | 'rg_antigo' | 'rg_novo_cin' | 'desconhecido';
  confidence: 'alta' | 'media' | 'baixa';
}

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
