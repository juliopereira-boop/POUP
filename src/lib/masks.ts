function onlyDigits(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  let out = d;
  out = out.replace(/^(\d{2})(\d)/, '$1.$2');
  out = out.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  out = out.replace(/\.(\d{3})(\d)/, '.$1/$2');
  out = out.replace(/(\d{4})(\d)/, '$1-$2');
  return out;
}

export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  let out = d;
  out = out.replace(/^(\d{3})(\d)/, '$1.$2');
  out = out.replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
  out = out.replace(/\.(\d{3})(\d)/, '.$1-$2');
  return out;
}

/**
 * Valida CPF pelos dígitos verificadores.
 * Rejeita também os casos de todos os dígitos iguais (111.111.111-11),
 * que passam no cálculo mas não são CPFs válidos.
 */
export function isValidCPF(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const check = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i++) {
      sum += Number(d[i]) * (upTo + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function cpfDigits(value: string | null | undefined): string {
  return onlyDigits(value);
}

export function formatCurrencyBRL(value: string): string {
  const d = onlyDigits(value);
  if (!d) return '';
  const cents = parseInt(d, 10);
  const reais = (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${reais}`;
}

export function currencyToNumber(masked: string): number {
  const d = onlyDigits(masked);
  return d ? parseInt(d, 10) / 100 : 0;
}
