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
/** Sincronize com a data em que o conteúdo abaixo mudar de fato. */
const VIGENCIA = '7 de agosto de 2026';

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
          O controlador dos dados é a equipe responsável pelo Poup Gestão. Dúvidas, solicitações
          sobre seus dados ou pedidos de exclusão podem ser enviados para{' '}
          <Email address={SUPORTE_EMAIL} />.
        </Paragraph>
      </Section>

      <Section title="2. Dados que coletamos">
        <SubTitle>Do corretor, ao criar e usar a conta</SubTitle>
        <Bullet>Nome completo, e-mail e senha (ou login com sua conta Google)</Bullet>
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

        <SubTitle>Do pagamento</SubTitle>
        <Bullet>
          Dados de cobrança da assinatura são processados diretamente pelo Stripe. O POUP nunca
          recebe nem guarda o número do seu cartão.
        </Bullet>
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
          <Bold>Google</Bold> — login via conta Google, quando você escolhe essa opção
        </Bullet>
        <Bullet>
          <Bold>Anthropic (Claude)</Bold> — leitura automática de CNH/RG, apenas quando você aciona
          o leitor de documento
        </Bullet>
        <Bullet>
          <Bold>Vercel</Bold> — hospedagem do site e do aplicativo
        </Bullet>
      </Section>

      <Section title="5. Por quanto tempo guardamos">
        <Paragraph>
          Enquanto sua conta estiver ativa. Se você excluir a conta pelo próprio app (Ajustes →
          Excluir conta), tudo é apagado de forma definitiva: leads, simulações, vendas, comissões
          e arquivos enviados. Não há como recuperar depois — inclusive por nós.
        </Paragraph>
      </Section>

      <Section title="6. Seus direitos">
        <Paragraph>
          Você pode pedir a qualquer momento para acessar, corrigir ou excluir seus dados. A
          exclusão está disponível direto no app; as demais solicitações podem ser feitas por{' '}
          <Email address={SUPORTE_EMAIL} />.
        </Paragraph>
      </Section>

      <Section title="7. Segurança">
        <Paragraph>
          O acesso aos seus dados é protegido por login individual e por regras de permissão no
          banco de dados que impedem um corretor de ver os dados de outro. Senhas nunca são
          guardadas em texto simples.
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
