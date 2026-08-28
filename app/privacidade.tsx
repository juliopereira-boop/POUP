/**
 * Política de Privacidade — rota pública (fora dos grupos `(auth)`/`(app)`).
 *
 * Precisa ser pública porque as duas lojas pedem a URL desta página ANTES de
 * qualquer login existir — é uma das primeiras coisas que revisam.
 *
 * ------------------------------------------------------------------
 * MANTER FIEL AO CÓDIGO, NÃO AO QUE SERIA BONITO DE PROMETER
 * ------------------------------------------------------------------
 * Cada item listado aqui corresponde a uma coleta real no app hoje (ver
 * `src/data/types.ts` — `UserProfile`, `Lead` — e as Edge Functions de
 * pagamento e do scanner). Se um campo for removido ou um provedor mudar,
 * esta página societário quica: ela descreve comportamento, não intenção.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const SUPORTE_EMAIL = 'gestao@poupgestao.com';

/**
 * QUEM RESPONDE PELOS DADOS.
 *
 * A LGPD exige que o controlador seja identificável (art. 9º, I), e a Apple
 * confere isso na revisão: uma política que diz apenas "a equipe responsável"
 * não identifica ninguém.
 *
 * Os campos opcionais somem do texto quando vazios, em vez de aparecerem em
 * branco — mas **um CNPJ vazio é pendência, não configuração**. A Apple
 * recomenda submeter serviço financeiro por pessoa jurídica (regra 5.1.1(ix)),
 * e uma conta Individual lidando com CPF e renda de terceiros é exatamente o
 * caso que ela olha com lupa.
 *
 * >>> PREENCHER ANTES DE PUBLICAR NA APP STORE. <<<
 */
const CONTROLADOR = {
  nome: 'Poup Gestão',
  cnpj: '',
  endereco: '',
};
/** Sincronize com a data em que o conteúdo abaixo mudar de fato. */
const VIGENCIA = '17 de agosto de 2026';

export default function PrivacyPolicyScreen() {
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen>
      <View style={styles.header}>
        <WordMark size={28} />
      </View>

      <Text style={styles.title}>Política de Privacidade</Text>
      <Text style={styles.vigencia}>Vigente desde {VIGENCIA}</Text>

      <Text style={styles.paragraph}>
        O Poup Gestão ("POUP") é uma ferramenta de trabalho para corretores de imóveis: simulação
        de financiamento, gestão de leads, propostas, comissões e material de venda. Esta página
        explica quais dados o app coleta, para quê, e com quem eles são compartilhados.
      </Text>

      <Section title="1. Quem trata os seus dados">
        <Paragraph>
          O <Bold>controlador</Bold> dos dados, na definição da LGPD, é{' '}
          <Bold>{CONTROLADOR.nome}</Bold>
          {CONTROLADOR.cnpj ? `, inscrita no CNPJ ${CONTROLADOR.cnpj}` : ''}
          {CONTROLADOR.endereco ? `, com endereço em ${CONTROLADOR.endereco}` : ''}.
        </Paragraph>
        <Paragraph>
          Dúvidas, solicitações sobre seus dados, pedidos de acesso, correção ou exclusão podem ser
          enviados para <Email address={SUPORTE_EMAIL} />. Respondemos em até 15 dias.
        </Paragraph>
      </Section>

      <Section title="2. Dados que coletamos">
        <SubTitle>Do corretor, ao criar e usar a conta</SubTitle>
        <Bullet>Nome completo, e-mail e senha (ou login com sua conta Google ou Apple)</Bullet>
        <Bullet>Telefone, CNPJ e CPF, imobiliária e CRECI</Bullet>
        <Bullet>Estado (UF) onde atua — usado só para filtrar quais empreendimentos aparecem</Bullet>
        <Bullet>Foto de perfil, se você optar por enviar uma</Bullet>

        <SubTitle>Dos clientes do corretor, quando ele os cadastra</SubTitle>
        <Bullet>Nome, telefone, e-mail, CPF, renda e data de nascimento informados no cadastro do lead</Bullet>
        <Bullet>
          Fotos de documentos de identidade (CNH/RG), quando o corretor usa o leitor automático
          para preencher nome e CPF do cliente
        </Bullet>

        <SubTitle>Do uso do app</SubTitle>
        <Bullet>Simulações, propostas geradas em PDF, vendas e comissões registradas</Bullet>
        <Bullet>
          Arquivos enviados (material de venda, fotos de empresas e empreendimentos cadastrados)
        </Bullet>
        <Bullet>
          <Bold>Medições de uso do produto</Bold>: registramos que ações acontecem no app — criou
          uma empresa, começou uma simulação, gerou uma proposta —, em que etapa, quanto tempo
          levou e se deu certo.{' '}
          <Bold>Nenhum dado de cliente entra nessas medições</Bold>: não gravamos nome, CPF,
          telefone, renda nem valor de imóvel, e o próprio banco de dados não tem onde guardá-los.
          Servem para descobrir onde o app está confuso ou quebrado.
        </Bullet>
        <Bullet>
          <Bold>Contagem de uso dos recursos de inteligência artificial</Bold>: quantas leituras de
          documento, quantas análises da LIA e quantos textos gerados você usou no mês. É só um
          número por recurso, e existe para respeitar o limite do seu plano.
        </Bullet>
        <Bullet>
          <Bold>O que você escreve em &quot;Reportar problema ou dar sugestão&quot;</Bold>, junto
          com a tela onde o problema aconteceu. Pedimos que não inclua dados de clientes nesse
          texto.
        </Bullet>

        <SubTitle>Do pagamento</SubTitle>
        <Bullet>
          Dados de cobrança da assinatura são processados diretamente pelo Stripe. O POUP nunca
          recebe nem guarda o número do seu cartão.
        </Bullet>
      </Section>

      <Section title="2.1. Da sua página de captação">
        <Paragraph>
          Quando alguém preenche a página de captação de um corretor (o link ou o QR Code que ele
          divulga), coletamos <Bold>nome e telefone</Bold> informados pela própria pessoa, e
          registramos o <Bold>consentimento</Bold>: a data e hora, e o texto exato que ela marcou.
        </Paragraph>
        <Paragraph>
          Guardamos o texto integral, e não apenas um "aceito", justamente para que o registro
          continue significando alguma coisa se a redação mudar no futuro. Esses dados ficam na
          carteira do corretor que divulgou o link, e quem se cadastrou pode pedir a exclusão pelo
          e-mail de contato ou diretamente ao corretor.
        </Paragraph>
      </Section>

      <Section title="3. Para que usamos esses dados">
        <Bullet>Autenticar seu acesso e manter sua conta funcionando</Bullet>
        <Bullet>Gerar simulações, propostas e relatórios que você mesmo solicita</Bullet>
        <Bullet>Processar a cobrança da assinatura mensal</Bullet>
        <Bullet>
          Preencher automaticamente nome e CPF a partir da foto de um documento, quando você usa
          essa opção — a foto é enviada para leitura e não fica guardada além do necessário para
          essa leitura
        </Bullet>
        <Bullet>Dar suporte quando você entra em contato</Bullet>
        <Bullet>
          Entender como o app é usado para melhorá-lo, e controlar o consumo dos recursos de
          inteligência artificial dentro do limite do seu plano
        </Bullet>
      </Section>

      <Section title="4. Com quem compartilhamos">
        <Paragraph>
          Não vendemos seus dados. Eles são compartilhados apenas com prestadores que fazem o app
          funcionar:
        </Paragraph>
        <Bullet>
          <Bold>Supabase</Bold> — banco de dados, login e armazenamento de arquivos
        </Bullet>
        <Bullet>
          <Bold>Stripe</Bold> — processamento de pagamento da assinatura
        </Bullet>
        <Bullet>
          <Bold>Google</Bold> e <Bold>Apple</Bold> — login pela sua conta, quando você escolhe
          uma dessas opções
        </Bullet>
        <Bullet>
          <Bold>Anthropic (Claude)</Bold> — recebe, e somente quando você aciona cada recurso:
          {'\n'}• a <Bold>foto do documento</Bold>, no leitor de CNH/RG;
          {'\n'}• o <Bold>texto transcrito</Bold> da negociação, enquanto a LIA estiver ligada;
          {'\n'}• a <Bold>frase</Bold> do agendamento por voz, junto de uma lista com os nomes
          dos seus empreendimentos e clientes, para conseguir identificar quem e o quê você citou;
          {'\n'}• o <Bold>texto de apoio</Bold> quando você pede um convite ou uma abordagem
          pronta.
          {'\n\n'}
          Segundo a política da Anthropic, o conteúdo enviado pela API pode ser mantido por{' '}
          <Bold>até 30 dias</Bold> para segurança e prevenção de abuso, e depois é descartado. Ele
          não é usado para treinar modelos.
        </Bullet>
        <Bullet>
          <Bold>Vercel</Bold> — hospedagem do site e do aplicativo
        </Bullet>
        <Paragraph>
          Exigimos de cada um desses prestadores proteção aos seus dados equivalente à descrita
          nesta política. Nenhum deles está autorizado a usar seus dados para finalidade própria.
        </Paragraph>
      </Section>

      <Section title="5. Por quanto tempo guardamos">
        <Paragraph>
          Enquanto sua conta estiver ativa. Se você excluir a conta pelo próprio app (Ajustes →
          Excluir conta), apagamos leads, simulações, vendas, comissões e arquivos enviados, e a
          assinatura é cancelada antes de a conta ser removida — se o cancelamento não puder ser
          concluído, a exclusão não acontece e avisamos, em vez de deixar uma cobrança sem dono.
          Se você entrou com a Apple, a autorização também é revogada junto.
        </Paragraph>
        <Paragraph>
          Uma ressalva honesta sobre <Bold>backups</Bold>: nosso banco de dados mantém cópias de
          segurança automáticas, e uma cópia feita antes da exclusão pode conter seus dados por{' '}
          <Bold>até 30 dias</Bold>, até ser sobrescrita no ciclo normal. Essas cópias não são
          consultadas no dia a dia e servem apenas para recuperação de desastre.
        </Paragraph>
        <Paragraph>
          A foto de documento usada no preenchimento automático é exceção: ela não é guardada em
          momento algum. É lida e descartada — só o nome e o CPF extraídos ficam no cadastro que
          você preencheu.
        </Paragraph>
        <Paragraph>
          As <Bold>medições de uso do produto</Bold> seguem outro caminho, porque não são dados
          seus nem dos seus clientes — são contagens de eventos do aplicativo. Elas são apagadas
          depois de seis meses, e apagadas junto com a conta se você excluí-la.
        </Paragraph>
        <Paragraph>
          A assistente <Bold>LIA</Bold>: o áudio da negociação <Bold>não é gravado</Bold> nem sai
          do seu aparelho. A transcrição em texto existe só enquanto a sessão está aberta e é
          descartada quando você encerra — o POUP não a guarda em servidor nenhum. Do que foi
          falado, o que sobra aqui é apenas a simulação que você decidiu salvar.
        </Paragraph>
        <Paragraph>
          O trecho de texto enviado para análise, porém, passa pela Anthropic, que{' '}
          <Bold>pode mantê-lo por até 30 dias</Bold> antes de descartar, conforme a política dela.
          Dizer que "nada é armazenado" seria impreciso, e preferimos ser exatos: nós não
          guardamos; o prestador guarda por esse período, para segurança e prevenção de abuso.
        </Paragraph>
      </Section>

      <Section title="6. Seus direitos e como revogar consentimentos">
        <Paragraph>
          Você pode pedir a qualquer momento para acessar, corrigir ou excluir seus dados. A
          exclusão da conta está disponível direto no app, em Ajustes → Excluir conta; as demais
          solicitações podem ser feitas por <Email address={SUPORTE_EMAIL} />.
        </Paragraph>
        <SubTitle>Revogar consentimentos já dados</SubTitle>
        <Bullet>
          <Bold>Leitura de documento por IA</Bold>: em <Bold>Ajustes → Privacidade</Bold> você vê
          quando autorizou e pode desligar com um toque. Além disso, a autorização do titular é
          pedida <Bold>a cada documento</Bold> — nenhuma foto é enviada sem que você confirme, na
          hora, que tem permissão daquela pessoa.
        </Bullet>
        <Bullet>
          <Bold>Câmera e fotos</Bold>: podem ser revogadas a qualquer momento nos ajustes do
          próprio aparelho. O app continua funcionando; só o preenchimento automático deixa de
          estar disponível.
        </Bullet>
        <Bullet>
          <Bold>Todo o resto</Bold>: excluir a conta encerra qualquer tratamento e apaga os dados,
          conforme o item 5.
        </Bullet>
      </Section>

      <Section title="7. Segurança">
        <Paragraph>
          O acesso aos seus dados é protegido por login individual e por regras de permissão no
          banco de dados que impedem um corretor de ver os dados de outro. Senhas nunca são
          guardadas em texto simples.
        </Paragraph>
        <Paragraph>
          Essas regras valem no próprio banco de dados, e não apenas na tela: mesmo que alguém
          contorne o aplicativo e fale direto com o servidor, continua só alcançando os dados da
          conta dele. As chaves dos serviços de pagamento e de inteligência artificial ficam no
          servidor e nunca são enviadas para o aparelho.
        </Paragraph>
      </Section>

      <Section title="8. Menores de idade">
        <Paragraph>O POUP é uma ferramenta profissional e não é destinado a menores de 18 anos.</Paragraph>
      </Section>

      <Section title="9. Mudanças nesta política">
        <Paragraph>
          Se o conteúdo desta página mudar de forma relevante, atualizamos a data de vigência no
          topo. Recomendamos revisitar esta página periodicamente.
        </Paragraph>
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Contato: {SUPORTE_EMAIL}</Text>
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.subTitle}>{children}</Text>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.bold}>{children}</Text>;
}

function Email({ address }: { address: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={() => void Linking.openURL(`mailto:${address}`)}>
      <Text style={styles.link}>{address}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    header: { marginBottom: spacing.lg },
    title: { ...typography.heading, fontSize: 24, color: colors.ink, marginBottom: 2 },
    vigencia: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    paragraph: { ...typography.body, color: colors.ink, marginBottom: spacing.sm, lineHeight: 22 },
    section: { marginTop: spacing.lg },
    sectionTitle: { ...typography.label, fontSize: 16, color: colors.ink, marginBottom: spacing.sm },
    subTitle: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.sm,
      marginBottom: 4,
    },
    bulletRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 6 },
    bulletDot: { ...typography.body, color: colors.primary },
    bulletText: { ...typography.body, color: colors.ink, flex: 1, lineHeight: 21 },
    bold: { fontWeight: '700', color: colors.ink },
    link: { ...typography.body, color: colors.primary, textDecorationLine: 'underline' },
    footer: {
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      borderRadius: radius.sm,
    },
    footerText: { ...typography.caption, color: colors.inkMuted },
  });
