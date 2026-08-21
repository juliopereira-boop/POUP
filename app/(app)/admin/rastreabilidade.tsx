/**
 * PAINEL DE RASTREABILIDADE — o que está acontecendo de verdade no piloto.
 *
 * ===========================================================================
 * POR QUE ESTA TELA EXISTE, E POR QUE AGORA
 * ===========================================================================
 * No piloto as decisões são baratas de tomar e caras de errar. "Acho que o
 * simulador está confuso" e "de cada dez que começam a simular, três geram
 * proposta" levam a lugares diferentes — e só o segundo aponta a tela a
 * consertar.
 *
 * Três blocos, nesta ordem, porque é a ordem das perguntas:
 *
 *   1. **FUNIL** — onde as pessoas param. É a pergunta que decide o que
 *      consertar primeiro.
 *   2. **CONSUMO DE IA** — o que o uso custa. É a pergunta que decide se o
 *      preço está certo, e é a única com uma resposta que chega como fatura.
 *   3. **EVENTOS** — o detalhe, com duração e erro por tipo. É onde se olha
 *      depois de o funil apontar um degrau suspeito.
 *
 * Os recados dos corretores vêm por último de propósito: são poucos, e cada um
 * merece ser lido inteiro, não contado.
 *
 * ===========================================================================
 * NENHUM DADO DE CLIENTE APARECE AQUI — NEM PODERIA
 * ===========================================================================
 * Não é uma escolha desta tela: os eventos não têm onde guardar nome, CPF ou
 * valor. Ver `supabase/migrations/0029_rastreabilidade.sql` e
 * `src/features/analytics/eventos.ts`. Esta tela mostra contagem, duração e
 * resultado — e é tudo o que existe para mostrar.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import {
  db,
  type DegrauFunil,
  type LinhaConsumoIA,
  type LinhaEvento,
  type RecadoDoCorretor,
} from '@/data';
import { useIsAdmin } from '@/features/admin';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** Janelas de tempo. 7 dias para "o que mudou", 30 e 90 para tendência. */
const JANELAS = [7, 30, 90] as const;

/** O nome interno do evento vira frase. O painel é lido por gente. */
const ROTULO_EVENTO: Record<string, string> = {
  signup_completed: 'Criou a conta',
  onboarding_completed: 'Terminou o começo',
  company_created: 'Cadastrou empresa',
  development_created: 'Cadastrou empreendimento',
  simulation_started: 'Começou a simular',
  simulation_step_completed: 'Concluiu etapa da simulação',
  simulation_abandoned: 'Abandonou a simulação',
  proposal_generated: 'Gerou proposta',
  proposal_shared: 'Enviou proposta',
  user_returned: 'Voltou outro dia',
  subscription_viewed: 'Olhou os planos',
};

const ROTULO_RECURSO: Record<string, string> = {
  scan: 'Leitura de documento',
  lia_escuta: 'LIA ouvindo',
  lia_fechamento: 'LIA fechando conversa',
  lia_agenda: 'LIA agendando',
  pitch: 'Texto de abordagem',
  convite: 'Convite de captação',
};

function rotularEvento(nome: string): string {
  return ROTULO_EVENTO[nome] ?? nome;
}

function rotularRecurso(nome: string): string {
  return ROTULO_RECURSO[nome] ?? nome;
}

/** Milissegundos viram algo legível. Ninguém lê "184320 ms". */
function duracao(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
  const min = Math.floor(s / 60);
  return `${min} min ${Math.round(s - min * 60)} s`;
}

function dataBR(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function RastreabilidadeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();

  const [dias, setDias] = useState<number>(30);
  const [funil, setFunil] = useState<DegrauFunil[]>([]);
  const [eventos, setEventos] = useState<LinhaEvento[]>([]);
  const [consumo, setConsumo] = useState<LinhaConsumoIA[]>([]);
  const [recados, setRecados] = useState<RecadoDoCorretor[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [f, e, c, r] = await Promise.all([
      db.analytics.painelFunil(dias),
      db.analytics.painelEventos(dias),
      db.analytics.painelConsumoIA(),
      db.feedback.listar(),
    ]);
    setFunil(f);
    setEventos(e);
    setConsumo(c);
    setRecados(r);
    setCarregando(false);
  }, [dias]);

  useEffect(() => {
    if (!isAdmin) {
      setCarregando(false);
      return;
    }
    void carregar();
  }, [isAdmin, carregar]);

  async function marcar(recado: RecadoDoCorretor) {
    // Aberto -> lido -> resolvido, no mesmo toque. Três estados não precisam de
    // menu; ciclar é mais rápido do que escolher.
    const proxima =
      recado.situacao === 'aberto' ? 'lido' : recado.situacao === 'lido' ? 'resolvido' : 'aberto';
    const res = await db.feedback.marcar(recado.id, proxima);
    if (res.ok) {
      setRecados((prev) =>
        prev.map((r) => (r.id === recado.id ? { ...r, situacao: proxima } : r)),
      );
    }
  }

  if (loadingAdmin) return <LoadingScreen />;

  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.sectionLabel}>Acesso restrito</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            A rastreabilidade do produto é vista apenas pelo administrador do POUP.
          </Text>
        </View>
      </Screen>
    );
  }

  /*
   * O topo do funil é a base de todas as porcentagens: "de cada dez que
   * criaram a conta, quantos chegaram aqui". Zero pessoas no topo não é erro —
   * é o estado normal antes de a migration rodar ou de alguém usar o app —, e
   * dividir por zero mostraria "NaN%" em toda linha.
   */
  const topoDoFunil = funil[0]?.pessoas ?? 0;

  return (
    <Screen>
      <Text style={styles.sectionLabel}>Período</Text>
      <View style={styles.janelas}>
        {JANELAS.map((j) => {
          const ativo = j === dias;
          return (
            <Pressable
              key={j}
              onPress={() => setDias(j)}
              style={[styles.janela, ativo && styles.janelaAtiva]}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
            >
              <Text style={[styles.janelaTexto, ativo && styles.janelaTextoAtivo]}>{j} dias</Text>
            </Pressable>
          );
        })}
      </View>

      {carregando ? <ActivityIndicator style={styles.loader} /> : null}

      <Text style={styles.sectionLabel}>Funil</Text>
      <View style={styles.card}>
        {funil.length === 0 ? (
          <Text style={styles.vazio}>
            Nenhum evento no período. Se acabou de publicar, confira se a migration 0029 foi
            aplicada.
          </Text>
        ) : (
          funil.map((d, i) => {
            const pct = topoDoFunil > 0 ? Math.round((d.pessoas / topoDoFunil) * 100) : 0;
            return (
              <View key={d.marco} style={[styles.linha, i > 0 && styles.linhaComTopo]}>
                <View style={styles.linhaTexto}>
                  <Text style={styles.linhaTitulo}>{d.marco}</Text>
                  <View style={styles.barraFundo}>
                    <View style={[styles.barra, { width: `${pct}%` }]} />
                  </View>
                </View>
                <View style={styles.linhaNumeros}>
                  <Text style={styles.numeroGrande}>{d.pessoas}</Text>
                  <Text style={styles.numeroPequeno}>{topoDoFunil > 0 ? `${pct}%` : '—'}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <Text style={styles.sectionLabel}>Consumo de IA neste mês</Text>
      <View style={styles.card}>
        <Text style={styles.cardNota}>
          O que o uso custa. &quot;Maior&quot; é o consumo do corretor que mais usou — se ele
          estiver colado no teto do plano, ou o teto está apertado ou o preço está errado.
        </Text>
        {consumo.length === 0 ? (
          <Text style={styles.vazio}>Nenhum uso de IA registrado neste mês.</Text>
        ) : (
          consumo.map((c, i) => (
            <View key={c.recurso} style={[styles.linha, i > 0 && styles.linhaComTopo]}>
              <View style={styles.linhaTexto}>
                <Text style={styles.linhaTitulo}>{rotularRecurso(c.recurso)}</Text>
                <Text style={styles.linhaSub}>
                  {c.pessoas} {c.pessoas === 1 ? 'corretor' : 'corretores'} · maior: {c.maior}
                </Text>
              </View>
              <Text style={styles.numeroGrande}>{c.total}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionLabel}>Eventos</Text>
      <View style={styles.card}>
        {eventos.length === 0 ? (
          <Text style={styles.vazio}>Nada no período.</Text>
        ) : (
          eventos.map((e, i) => (
            <View key={e.evento} style={[styles.linha, i > 0 && styles.linhaComTopo]}>
              <View style={styles.linhaTexto}>
                <Text style={styles.linhaTitulo}>{rotularEvento(e.evento)}</Text>
                <Text style={styles.linhaSub}>
                  {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
                  {e.duracaoMediana != null ? ` · mediana ${duracao(e.duracaoMediana)}` : ''}
                  {e.erros > 0 ? ` · ${e.erros} com erro` : ''}
                </Text>
              </View>
              <Text style={[styles.numeroGrande, e.erros > 0 && styles.numeroAlerta]}>
                {e.total}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={styles.sectionLabel}>Recados dos corretores</Text>
      <View style={styles.card}>
        <Text style={styles.cardNota}>
          Toque para mudar a situação: aberto → lido → resolvido.
        </Text>
        {recados.length === 0 ? (
          <Text style={styles.vazio}>Nenhum recado ainda.</Text>
        ) : (
          recados.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => void marcar(r)}
              style={({ pressed }) => [
                styles.recado,
                i > 0 && styles.linhaComTopo,
                pressed && styles.pressionado,
              ]}
              accessibilityRole="button"
            >
              <View style={styles.recadoTopo}>
                <Text style={[styles.selo, SELO_ESTILO[r.situacao](styles)]}>
                  {r.situacao.toUpperCase()}
                </Text>
                <Text style={styles.recadoData}>{dataBR(r.criadoEm)}</Text>
              </View>
              <Text style={styles.recadoMensagem}>{r.mensagem}</Text>
              {r.tela ? (
                <Text style={styles.recadoTela}>
                  {r.tela}
                  {r.etapa ? ` · ${r.etapa}` : ''}
                </Text>
              ) : null}
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.rodape}>
        <Pressable onPress={() => void carregar()} accessibilityRole="button">
          <Text style={styles.recarregar}>Atualizar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

type Estilos = ReturnType<typeof makeStyles>;

/**
 * O selo da situação muda de cor, e a cor é o que se lê primeiro numa lista
 * longa: vermelho é o que ainda ninguém olhou.
 */
const SELO_ESTILO: Record<string, (s: Estilos) => object> = {
  aberto: (s) => s.seloAberto,
  lido: (s) => s.seloLido,
  resolvido: (s) => s.seloResolvido,
};

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    sectionLabel: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    cardText: { ...typography.body, color: colors.ink, paddingVertical: spacing.md },
    cardNota: {
      ...typography.caption,
      color: colors.inkMuted,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    vazio: { ...typography.body, color: colors.inkSubtle, paddingVertical: spacing.md },
    loader: { marginTop: spacing.md },

    janelas: { flexDirection: 'row', gap: spacing.sm },
    janela: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    janelaAtiva: { backgroundColor: colors.primary, borderColor: colors.primary },
    janelaTexto: { ...typography.label, color: colors.inkMuted },
    janelaTextoAtivo: { color: colors.white },

    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      paddingVertical: spacing.md,
    },
    linhaComTopo: { borderTopWidth: 1, borderTopColor: colors.border },
    linhaTexto: { flex: 1, gap: spacing.xs },
    linhaTitulo: { ...typography.body, color: colors.ink },
    linhaSub: { ...typography.caption, color: colors.inkMuted },
    linhaNumeros: { alignItems: 'flex-end' },
    numeroGrande: { ...typography.title, color: colors.ink },
    numeroPequeno: { ...typography.caption, color: colors.inkMuted },
    numeroAlerta: { color: colors.danger },

    barraFundo: {
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
    },
    barra: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },

    recado: { paddingVertical: spacing.md, gap: spacing.xs },
    pressionado: { opacity: 0.6 },
    recadoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    selo: {
      ...typography.caption,
      fontWeight: '700',
      letterSpacing: 0.5,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    seloAberto: { backgroundColor: colors.danger, color: colors.white },
    seloLido: { backgroundColor: colors.surfaceAlt, color: colors.ink },
    seloResolvido: { backgroundColor: colors.surfaceAlt, color: colors.inkSubtle },
    recadoData: { ...typography.caption, color: colors.inkSubtle },
    recadoMensagem: { ...typography.body, color: colors.ink },
    recadoTela: { ...typography.caption, color: colors.inkMuted },

    rodape: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.lg },
    recarregar: { ...typography.body, color: colors.primary },
  });
