import type { IconName } from '@/components/Icon';

export interface GuideStep {
  icon: IconName;
  /** Onde a funcionalidade fica no app. Aparece como etiqueta acima do título. */
  where?: string;
  title: string;
  description: string;
  bullets?: string[];
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'house',
    title: 'Bem-vindo ao POUP',
    description:
      'Do primeiro contato até a comissão paga, tudo em um só lugar. Vamos te mostrar o caminho em 12 passos rápidos — leva menos de dois minutos.',
    bullets: [
      'Você pode sair do guia quando quiser',
      'Para rever depois: Ajustes › Guia do app',
    ],
  },
  {
    icon: 'building',
    where: 'Ajustes › Empresas e empreendimentos',
    title: 'Comece pelos cadastros',
    description:
      'É a base de tudo. O simulador e a proposta usam as regras que você cadastra aqui, então esse é o primeiro passo.',
    bullets: [
      'Cadastre a construtora com as regras dela: risco máximo, número de parcelas, semestrais e anuais',
      'Cadastre os empreendimentos de cada empresa, com data de entrega e descrição',
      'A descrição é o que a IA usa para escrever suas mensagens',
    ],
  },
  {
    icon: 'briefcase',
    where: 'Início › Material de Venda',
    title: 'Suba seu material de venda',
    description:
      'Plantas, fotos, tabelas e vídeos organizados por empresa e empreendimento, sempre à mão no celular.',
    bullets: [
      'Crie pastas dentro de cada empreendimento, do jeito que você organiza',
      'Cada arquivo pode ter até 20 MB',
      'Na empresa você também pode salvar um link externo, como uma pasta do Drive',
    ],
  },
  {
    icon: 'chart',
    where: 'Leads › Prospecção',
    title: 'Prospecte contatos novos',
    description:
      'Gere uma lista de possíveis clientes na cidade que você atende, com nome e telefone, em segundos.',
    bullets: [
      'Escolha o estado e a cidade na lista',
      'Defina quantos contatos quer receber',
      'Salve os que interessarem na sua carteira com um toque',
      'O app nunca repete um contato que já foi gerado para você',
    ],
  },
  {
    icon: 'contacts',
    where: 'Leads › Gestão de Leads',
    title: 'Organize sua carteira',
    description:
      'Cada lead com ficha completa e a etapa do funil sempre visível. Nada de contato esquecido.',
    bullets: [
      'Toque no lead para abrir a ficha dele',
      'Guarde CPF, renda, telefone, e-mail e observações — é o que alimenta a simulação',
      'Use os filtros para achar por nome, CPF, empresa, empreendimento ou etapa',
      'A etapa do lead muda dentro da ficha dele',
    ],
  },
  {
    icon: 'bell',
    where: 'Leads › botão de conversa',
    title: 'Atenda pelo WhatsApp',
    description:
      'A IA escreve a mensagem do empreendimento para você. Você ajusta o que quiser e abre a conversa já no número do lead.',
    bullets: [
      'Escolha a empresa e o empreendimento',
      'A mensagem é gerada a partir da descrição que você cadastrou',
      'Pode editar tudo antes de enviar, ou gerar de novo',
    ],
  },
  {
    icon: 'coins',
    where: 'Início › Simulador',
    title: 'Simule e envie a proposta',
    description:
      'Cinco etapas simples e o fluxo de pagamento sai pronto, já respeitando as regras da construtora.',
    bullets: [
      'Análise de risco automática, com subsídio e FGTS',
      'Proposta de compra e venda em PDF, em uma página só',
      'Abrindo pelo botão dentro do lead, a simulação já vem preenchida',
      'Suas simulações ficam salvas em Relatórios',
    ],
  },
  {
    icon: 'calendar',
    where: 'Início › Agenda',
    title: 'Agende e acompanhe',
    description:
      'Visitas, reuniões e retornos no calendário, com lembrete no topo da tela inicial.',
    bullets: [
      'Toque no compromisso para administrar: concluir, reagendar ou mudar o status',
      'Associe empresa e empreendimento ao atendimento',
      'Ao criar um agendamento, o lead muda de etapa automaticamente',
    ],
  },
  {
    icon: 'handshake',
    where: 'Início › Vendas Realizadas',
    title: 'Acompanhe suas vendas',
    description:
      'Fechou? Abra o relatório da simulação e toque em “Registrar venda realizada”. A venda entra aqui com todos os dados do cliente e do negócio.',
    bullets: [
      'A aba Painel mostra seus indicadores: VGV, ticket médio, comissão, ciclo de venda, conversão e distrato',
      'Filtre por período, construtora, empreendimento ou situação — os indicadores recalculam na hora',
      'A aba Vendas lista tudo, com busca por cliente, CPF ou unidade',
      'Se um negócio cair, registre o distrato sem perder o histórico',
    ],
  },
  {
    icon: 'coins',
    where: 'Início › Controle de Comissão',
    title: 'Receba o que é seu',
    description:
      'Cada venda registrada já lança a comissão calculada pela regra da construtora, dividida nas parcelas combinadas. Você só acompanha o que entra.',
    bullets: [
      'Cadastre a regra em Ajustes › Empresas: percentual, campanhas promocionais e em quantas vezes recebe',
      'A parcela vencida aparece em vermelho — nada passa batido',
      'Marque como recebida direto na lista, com um toque',
      'Registre a nota fiscal de cada parcela',
    ],
  },
  {
    icon: 'gear',
    where: 'Início › Ajustes',
    title: 'Deixe do seu jeito',
    description: 'O app se adapta ao seu processo, não o contrário.',
    bullets: [
      'Workflow de Leads: crie suas etapas, com nome, ordem e cor',
      'Marque qual etapa é de agendamento e qual é de simulação',
      'Tema claro ou escuro',
      'Seu perfil e sua imobiliária aparecem nas propostas',
    ],
  },
  {
    icon: 'home',
    title: 'Pronto para vender',
    description: 'Se quiser um roteiro para hoje, é este:',
    bullets: [
      '1. Cadastre uma empresa e um empreendimento',
      '2. Suba um material de venda desse empreendimento',
      '3. Prospecte cinco leads na sua cidade',
      '4. Faça a primeira simulação e gere a proposta',
    ],
  },
];
