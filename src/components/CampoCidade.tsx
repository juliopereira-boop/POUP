/**
 * A CIDADE ONDE O CORRETOR ATUA — escolhida da lista do IBGE.
 *
 * O ranking da cidade junta quem escreveu "São Luís", "Sao Luis" e "SÃO LUÍS"
 * (o banco compara sem acento e sem caixa). Mesmo assim, escolher da lista
 * oficial evita o erro que a normalização não pega — "S. Luís", "Sao Luiz".
 * A lista vem do serviço público do IBGE, uma vez por estado; se ele não
 * responder, o campo vira texto livre e o corretor segue.
 */
import { useEffect, useState } from 'react';

import { Input } from '@/components/Input';
import { Select } from '@/components/Select';

const porUf = new Map<string, string[]>();

async function municipios(uf: string): Promise<string[] | null> {
  const guardado = porUf.get(uf);
  if (guardado) return guardado;
  try {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 8000);
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,
      { signal: controle.signal },
    );
    clearTimeout(prazo);
    if (!res.ok) return null;
    const lista = ((await res.json()) as { nome?: string }[])
      .map((m) => m.nome?.trim() ?? '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (lista.length === 0) return null;
    porUf.set(uf, lista);
    return lista;
  } catch {
    return null;
  }
}

interface Props {
  uf: string | null;
  value: string;
  onChange: (cidade: string) => void;
}

export function CampoCidade({ uf, value, onChange }: Props) {
  const [lista, setLista] = useState<string[] | null>(uf ? (porUf.get(uf) ?? null) : null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    setFalhou(false);
    if (!uf) {
      setLista(null);
      return;
    }
    setLista(porUf.get(uf) ?? null);
    void municipios(uf).then((l) => {
      if (!vivo) return;
      if (l) setLista(l);
      else setFalhou(true);
    });
    return () => {
      vivo = false;
    };
  }, [uf]);

  if (!uf) {
    return <Input label="Cidade onde você atua" value="" editable={false} placeholder="Escolha o estado primeiro" />;
  }

  if (falhou || !lista) {
    return (
      <Input
        label="Cidade onde você atua"
        value={value}
        onChangeText={onChange}
        placeholder={falhou ? 'Ex.: São Luís' : 'Carregando as cidades…'}
        autoCapitalize="words"
        maxLength={80}
      />
    );
  }

  const opcoes = (value && !lista.includes(value) ? [value, ...lista] : lista).map((c) => ({ value: c, label: c }));
  return (
    <Select
      label="Cidade onde você atua"
      placeholder="Escolha a cidade"
      value={value || null}
      options={opcoes}
      onChange={onChange}
      searchable
    />
  );
}
