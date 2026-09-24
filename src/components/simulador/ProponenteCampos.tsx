/**
 * OS CINCO DADOS DE UM PROPONENTE.
 *
 * Nenhum deles entra na conta da poupança — eles existem para sair impressos
 * na proposta. É por isso que moram no bloco de unidade e cliente, depois dos
 * valores: o corretor chega ao número que o cliente quer ouvir antes de
 * precisar digitar o CPF dele.
 */
import { Input } from '@/components/Input';
import type { Proponent } from '@/features/simulador/SimuladorProvider';
import { formatCPF, formatCurrencyBRL, formatPhone } from '@/lib/masks';

interface Props {
  value: Proponent;
  onChange: (patch: Partial<Proponent>) => void;
}

export function ProponenteCampos({ value, onChange }: Props) {
  return (
    <>
      <Input
        label="Nome"
        value={value.name}
        onChangeText={(t) => onChange({ name: t })}
        placeholder="Nome completo"
        autoCapitalize="words"
      />
      <Input
        label="CPF"
        value={value.cpf}
        onChangeText={(t) => onChange({ cpf: formatCPF(t) })}
        placeholder="000.000.000-00"
        keyboardType="numbers-and-punctuation"
      />
      <Input
        label="Renda bruta"
        value={value.rendaBruta}
        onChangeText={(t) => onChange({ rendaBruta: formatCurrencyBRL(t) })}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />
      <Input
        label="E-mail"
        value={value.email}
        onChangeText={(t) => onChange({ email: t })}
        placeholder="email@exemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input
        label="Contato"
        value={value.contact}
        onChangeText={(t) => onChange({ contact: formatPhone(t) })}
        placeholder="(00) 00000-0000"
        keyboardType="phone-pad"
      />
    </>
  );
}
