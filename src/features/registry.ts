import type { Href } from 'expo-router';

/**
 * Registro central das funcionalidades do POUP.
 *
 * O menu principal e as rotas são gerados a partir daqui — para adicionar uma
 * nova funcionalidade, inclua um item e crie a tela correspondente em
 * app/(app)/<route>.tsx. Marque `ready: true` quando a feature estiver pronta.
 */
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
    key: 'simulador',
    title: 'Simulador de poupança',
    emoji: '🏡',
    route: '/(app)/simulador',
    description: 'Simule rendimentos e projeções de poupança para seus clientes.',
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
    description: 'Materiais, apresentações e conteúdos para apoiar suas vendas.',
    ready: false,
  },
  {
    key: 'comissao',
    title: 'Controle de Comissão',
    emoji: '🪙',
    route: '/(app)/comissao',
    description: 'Calcule e acompanhe suas comissões por venda.',
    ready: false,
  },
  {
    key: 'vendas',
    title: 'Vendas Realizadas',
    emoji: '🤝',
    route: '/(app)/vendas',
    description: 'Histórico e gestão das vendas fechadas.',
    ready: false,
  },
];
