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
