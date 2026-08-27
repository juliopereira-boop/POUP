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
      'Do primeiro contato até a comissão paga, tudo em um só lugar. Vamos te mostrar o caminho em 13 passos rápidos — leva menos de dois minutos.',
    bullets: [
      'Você pode sair do guia quando quiser',
      'Para rever depois: Ajustes › Guia do app',
    ],
  },
  {
    icon: 'building',
    where: 'Início › Cadastros › Empresas',
    title: 'Comece pelos cadastros — se houver o que cadastrar',
    description:
      'O simulador, a proposta e a comissão trabalham com as regras da construtora. Antes de digitar qualquer coisa, abra a aba “Catálogo do sistema”: se a sua construtora já estiver lá, é só aceitar e tudo entra pronto.',
    bullets: [
      'Do catálogo vêm prontos a regra de comissão, os empreendimentos e o material de venda',
      'Se ela não estiver no catálogo, cadastre você: risco máximo, número de parcelas, semestrais e anuais',
      'Depois cadastre os empreendimentos da empresa, com data de entrega e descrição',
      'A descrição é o que a IA usa para escrever suas mensagens',
    ],
  },
  {
    icon: 'handshake',
    where: 'Início › Cadastros › Empresas › aba “Catálogo do sistema”',
    title: 'Catálogo do sistema: aceitar e usar',
    description:
      'São construtoras que o POUP já cadastrou, com regra de comissão, empreendimentos e material de venda. Toque na construtora, leia o aviso e aceite: na hora tudo passa a valer na sua conta.',
    bullets: [
      'As atualizações do POUP chegam sozinhas: regra ajustada ou empreendimento novo aparece na sua conta',
      'Por isso a empresa do catálogo é somente leitura — você não edita os dados dela',
      'Suas simulações, vendas e comissões já lançadas não mudam: elas guardam os valores do dia',
      'Pode remover da sua lista quando quiser, sem perder histórico',
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
    where: 'Leads › Captação',
    title: 'Deixe o cliente vir até você',
    description:
      'Sua página de captação com QR Code. Quem preenche entra direto na sua carteira, já com a origem registrada.',
    bullets: [
      'Publique o QR Code no story, na placa ou no cartão',
      'Um link de WhatsApp que cadastra a pessoa antes de abrir a conversa',
      'O cliente escolhe se cadastrar — e você tem o consentimento registrado',
      'Todo lead que chega cai na Gestão de Leads com a origem certa',
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
      'Estimativa de enquadramento, com subsídio e FGTS',
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
      'A regra fica em Cadastros › Empresas: percentual, campanhas promocionais e em quantas vezes recebe',
      'Se a construtora veio do catálogo do sistema, a regra já vem pronta',
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
      '1. Aceite sua construtora no catálogo do sistema — ou cadastre empresa e empreendimento',
      '2. Suba um material de venda desse empreendimento',
      '3. Publique seu QR Code de captação no story ou no WhatsApp',
      '4. Faça a primeira simulação e gere a proposta',
    ],
  },
];
