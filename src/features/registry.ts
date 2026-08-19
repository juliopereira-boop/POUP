import type { Href } from 'expo-router';

export interface Feature {
  key: string;
  title: string;
  emoji: string;
  route: Href;
  description: string;
  ready: boolean;
}

export const FEATURES: Feature[] = [
  {
    key: 'leads',
    title: 'Leads',
    emoji: '📇',
    route: '/(app)/leads',
    description: 'Gerencie seus contatos e capte novos leads com prospecção.',
    ready: true,
  },
  {
    key: 'calendario',
    title: 'Calendário',
    emoji: '📅',
    route: '/(app)/calendario',
    description: 'Organize compromissos, visitas e vencimentos.',
    ready: true,
  },
  {
    key: 'financiamento',
    title: 'Simulador de financiamento',
    emoji: '🏦',
    route: '/(app)/financiamento',
    description:
      'Quanto o banco empresta, qual a parcela e se enquadra. SAC ou PRICE, com poder de compra.',
    ready: true,
  },
  {
    key: 'simulador',
    title: 'Simulador de poupança',
    emoji: '🏡',
    route: '/(app)/simulador',
    description: 'Ato, mensais e reforços à construtora — e a proposta em PDF no fim.',
    ready: true,
  },
  {
    key: 'relatorios',
    title: 'Relatórios',
    emoji: '📊',
    route: '/(app)/relatorios',
    description: 'Veja suas simulações concluídas, filtre e gere a proposta em PDF.',
    ready: true,
  },
  {
    key: 'configuracoes',
    title: 'Configurações',
    emoji: '⚙️',
    route: '/(app)/configuracoes',
    description: 'Perfil, assinatura e preferências da conta.',
    ready: true,
  },
  {
    key: 'material-venda',
    title: 'Material de Venda',
    emoji: '💼',
    route: '/(app)/material-venda',
    description: 'Organize materiais por empresa e empreendimento, em pastas.',
    ready: true,
  },
  {
    key: 'comissao',
    title: 'Controle de Comissão',
    emoji: '🪙',
    route: '/(app)/comissao',
    description: 'Parcelas, recebimentos e o que ainda falta entrar.',
    ready: true,
  },
  {
    key: 'vendas',
    title: 'Vendas Realizadas',
    emoji: '🤝',
    route: '/(app)/vendas',
    description: 'Painel de indicadores e histórico das vendas fechadas.',
    ready: true,
  },
];
