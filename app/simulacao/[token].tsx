/**
 * A SIMULAÇÃO VISTA PELO CLIENTE.
 *
 * ===========================================================================
 * ESTA ROTA MORA NA RAIZ, FORA DE `(app)`
 * ===========================================================================
 * E é obrigatório que seja assim: `app/(app)/_layout.tsx` redireciona quem não
 * está autenticado para o login e quem não tem assinatura ativa para o paywall.
 * O cliente não tem conta nem assinatura — dentro daquele grupo, o link viraria
 * uma tela de login na cara dele.
 *
 * ===========================================================================
 * O QUE ESTA TELA PODE E NÃO PODE MOSTRAR
 * ===========================================================================
 * Ela lê pela Edge Function `get-financing-simulation`, que confere o token
 * (por hash), a validade e a revogação, e devolve **só o resumo daquela
 * simulação**. Nenhum acesso ao painel do corretor, nenhuma outra simulação,
 * nenhum dado de renda.
 *
 * E carrega o aviso legal em destaque: quem abre este link é o comprador, e é
 * justamente quem mais precisa saber que aquilo é estimativa.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { WordMark } from '@/components/WordMark';
import { supabase } from '@/lib/supabase';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Resumo {
  valorImovel: number | null;
  entradaTotal: number | null;
  valorFinanciado: number | null;
  prazoMeses: number | null;
  sistema: string | null;
  taxaAnualPct: number | null;
  primeira: number | null;
  ultima: number | null;
  totalJuros: number | null;
  elegivel: boolean | null;
  parcial: boolean | null;
}

interface Payload {
  cliente: string | null;
  empreendimento: string | null;
  unidade: string | null;
  bloco: number | null;
  criadaEm: string;
  versaoRegras: string;
  corretor: {
    nome: string | null;
    imobiliaria: string | null;
    creci: string | null;
    telefone: string | null;
  };
  resumo: Resumo;
  aviso: string;
}

/** Centavos → texto. O resumo vem em centavos, como o motor guarda. */
function brl(centavos: number | null): string {
  if (centavos === null || !Number.isFinite(centavos)) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SimulacaoPublica() {
  const styles = useThemedStyles(makeStyles);
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [dados, setDados] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!token) {
        setErro('Link inválido.');
        setCarregando(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('get-financing-simulation', {
        body: { token },
      });
      if (!vivo) return;
      const payload = data as (Payload & { error?: string }) | null;
      if (error || !payload || payload.error) {
        setErro(payload?.error ?? 'Este link não está mais disponível.');
      } else {
        setDados(payload);
      }
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (carregando) return <LoadingScreen />;

  if (erro || !dados) {
    return (
      <Screen center>
        <WordMark />
        <Text style={styles.titulo}>Link indisponível</Text>
        <Text style={styles.texto}>
          {erro ?? 'Este link expirou ou foi desativado pelo corretor. Peça um novo a ele.'}
        </Text>
      </Screen>
    );
  }

  const r = dados.resumo;

  return (
    <Screen>
      <WordMark />
      <Text style={styles.titulo}>Simulação de financiamento</Text>
      {dados.cliente ? <Text style={styles.cliente}>Para {dados.cliente}</Text> : null}
      {dados.empreendimento ? (
        <Text style={styles.imovel}>
          {[dados.empreendimento, dados.bloco ? `bloco ${dados.bloco}` : null, dados.unidade ? `unidade ${dados.unidade}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}

      <View style={styles.destaque}>
        <Text style={styles.destaqueRotulo}>Primeira parcela estimada</Text>
        <Text style={styles.destaqueValor}>{brl(r.primeira)}</Text>
        {r.parcial ? (
          <Text style={styles.destaqueNota}>
            Sem seguros e tarifa do banco — a parcela final será um pouco maior.
          </Text>
        ) : null}
      </View>

      <View style={styles.grade}>
        <Item rotulo="Valor do imóvel" valor={brl(r.valorImovel)} />
        <Item rotulo="Entrada" valor={brl(r.entradaTotal)} />
        <Item rotulo="Financiamento" valor={brl(r.valorFinanciado)} />
        <Item rotulo="Prazo" valor={r.prazoMeses ? `${r.prazoMeses} meses` : '—'} />
        <Item rotulo="Sistema" valor={r.sistema ?? '—'} />
        <Item
          rotulo="Taxa"
          valor={r.taxaAnualPct !== null ? `${r.taxaAnualPct.toFixed(2).replace('.', ',')}% a.a.` : '—'}
        />
        <Item rotulo="Última parcela" valor={brl(r.ultima)} />
        <Item rotulo="Juros totais" valor={brl(r.totalJuros)} />
      </View>

      <View style={styles.corretor}>
        <Text style={styles.corretorTitulo}>Seu corretor</Text>
        <Text style={styles.corretorNome}>{dados.corretor.nome ?? '—'}</Text>
        <Text style={styles.corretorLinha}>
          {[dados.corretor.imobiliaria, dados.corretor.creci ? `CRECI ${dados.corretor.creci}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {dados.corretor.telefone ? (
          <Text style={styles.corretorLinha}>{dados.corretor.telefone}</Text>
        ) : null}
      </View>

      <Text style={styles.aviso}>{dados.aviso}</Text>
      <Text style={styles.rodape}>
        Gerada em {new Date(dados.criadaEm).toLocaleDateString('pt-BR')} · condições da versão{' '}
        {dados.versaoRegras}
      </Text>
    </Screen>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.item}>
      <Text style={styles.itemRotulo}>{rotulo}</Text>
      <Text style={styles.itemValor}>{valor}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary, marginTop: spacing.lg },
    cliente: { ...typography.body, color: colors.ink },
    imovel: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    texto: { ...typography.body, color: colors.inkMuted, textAlign: 'center', lineHeight: 21 },

    destaque: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: 3,
      marginBottom: spacing.lg,
    },
    destaqueRotulo: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    destaqueValor: { ...typography.title, color: colors.primary, fontSize: 34, lineHeight: 40 },
    destaqueNota: { ...typography.caption, color: colors.warning, lineHeight: 18 },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    item: {
      minWidth: 148,
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 2,
    },
    itemRotulo: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },
    itemValor: { ...typography.heading, color: colors.ink, fontSize: 15 },

    corretor: {
      marginTop: spacing.xl,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      gap: 2,
    },
    corretorTitulo: { ...typography.caption, color: colors.inkMuted },
    corretorNome: { ...typography.heading, color: colors.ink },
    corretorLinha: { ...typography.caption, color: colors.inkMuted },

    aviso: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.xl,
      lineHeight: 18,
      overflow: 'hidden',
    },
    rodape: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
  });
