/**
 * MINHAS SIMULAÇÕES — e a ponte para o simulador de poupança.
 *
 * ===========================================================================
 * O PEDIDO QUE ESTA TELA CUMPRE
 * ===========================================================================
 * *"Se um cliente x faz uma simulação de financiamento, esses dados já vão
 * ficar ligados a esse cliente, pois quando ele for para o simulador de
 * poupança, lá em fluxo de pagamento esses dados já vão estar preenchidos."*
 *
 * É o botão **"Usar no simulador de poupança"** de cada linha. Ele leva para o
 * outro simulador já com:
 *
 *   - o empreendimento e a empresa,
 *   - o valor da unidade,
 *   - o **financiamento aprovado**, o **subsídio** e o **FGTS**,
 *   - nome, renda e telefone do proponente.
 *
 * Ou seja: o corretor faz a simulação de financiamento com o cliente, e o
 * fluxo de pagamento à construtora já começa com a metade difícil preenchida.
 *
 * ===========================================================================
 * O QUE ESTÁ SALVO É O QUE FOI PROMETIDO
 * ===========================================================================
 * Cada linha mostra a versão de regras que a produziu. Uma simulação de agosto
 * continua sendo uma simulação de agosto mesmo que a taxa mude em setembro —
 * porque ela carrega o snapshot inteiro das regras, e não uma referência.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { db, type FinancingSimulation, type Lead } from '@/data';
import { sessionStorage } from '@/lib/storage';
import { pontePoupanca } from '@/features/financiamento/ponte';
import { PREFILL_KEY } from '@/features/simulador/SimuladorProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBR(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function HistoricoFinanciamento() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();

  const [lista, setLista] = useState<FinancingSimulation[]>([]);
  const [clientes, setClientes] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const [sims, leads] = await Promise.all([
      db.financing.list(user.id),
      db.leads.list(user.id),
    ]);
    setLista(sims);
    setClientes(leads);
    setCarregando(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * A ponte. A tradução dos dois modelos mora em `financiamento/ponte.ts`,
   * pura e testada — aqui só se lê o cliente e navega.
   */
  async function levarParaPoupanca(sim: FinancingSimulation) {
    const lead = clientes.find((c) => c.id === sim.leadId) ?? null;
    const prefill = pontePoupanca(sim, lead);
    await sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
    router.push('/(app)/simulador');
  }

  async function apagar(sim: FinancingSimulation) {
    const confirmar = async () => {
      await db.financing.remove(sim.id);
      void carregar();
    };
    Alert.alert('Apagar simulação', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void confirmar() },
    ]);
  }

  if (carregando) return <LoadingScreen />;

  return (
    <Screen>
      <Text style={styles.titulo}>Minhas simulações</Text>
      <Text style={styles.sub}>
        Cada uma guarda as condições exatas do dia em que foi feita. Mudança de taxa depois não
        altera o que já foi apresentado ao cliente.
      </Text>

      {lista.length === 0 ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>
            Nenhuma simulação salva ainda. Faça uma e toque em "Salvar simulação" no resultado.
          </Text>
          <Button
            label="Simular agora"
            onPress={() => router.push('/(app)/financiamento/simular')}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      ) : (
        lista.map((sim) => (
          <View key={sim.id} style={styles.cartao}>
            <View style={styles.cabeca}>
              <View style={styles.cabecaTexto}>
                <Text style={styles.cliente}>{sim.clientName ?? 'Sem cliente'}</Text>
                <Text style={styles.imovel}>
                  {[sim.developmentName, sim.unit ? `un. ${sim.unit}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Imóvel não informado'}
                </Text>
              </View>
              <View
                style={[
                  styles.selo,
                  sim.eligible ? styles.seloOk : styles.seloRuim,
                ]}
              >
                <Text
                  style={[
                    styles.seloTexto,
                    { color: sim.eligible ? colors.success : colors.danger },
                  ]}
                >
                  {sim.eligible ? 'Apto' : 'Não enquadra'}
                </Text>
              </View>
            </View>

            <View style={styles.numeros}>
              <Numero rotulo="Imóvel" valor={brl(sim.propertyValue)} />
              <Numero rotulo="Financiado" valor={brl(sim.financedValue)} />
              <Numero rotulo="1ª parcela" valor={brl(sim.firstInstallment)} />
              <Numero
                rotulo="Prazo"
                valor={sim.termMonths ? `${sim.termMonths}x ${sim.amortization ?? ''}` : '—'}
              />
            </View>

            <Text style={styles.rodape}>
              {dataBR(sim.createdAt)} · regras versão {sim.ruleVersion}
              {sim.leadId ? ' · ligada ao cliente' : ''}
            </Text>

            <View style={styles.acoes}>
              <Button
                label="Usar no simulador de poupança"
                variant="secondary"
                onPress={() => void levarParaPoupanca(sim)}
                style={styles.acaoLarga}
              />
              <Pressable onPress={() => void apagar(sim)} style={styles.apagar}>
                <Text style={styles.apagarTexto}>Apagar</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
      <Text style={styles.numeroValor}>{valor}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary },
    sub: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 19 },
    vazio: { paddingVertical: spacing.xl, alignItems: 'center' },
    vazioTexto: { ...typography.body, color: colors.inkMuted, textAlign: 'center', lineHeight: 21 },

    cartao: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    cabeca: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    cabecaTexto: { flex: 1, gap: 2 },
    cliente: { ...typography.heading, color: colors.ink, fontSize: 16 },
    imovel: { ...typography.caption, color: colors.inkMuted },
    selo: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
    seloOk: { backgroundColor: colors.successSoft },
    seloRuim: { backgroundColor: colors.dangerSoft },
    seloTexto: { ...typography.caption, fontWeight: '700', fontSize: 11.5 },

    numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    numero: { minWidth: 118, flexGrow: 1, gap: 1 },
    numeroRotulo: { ...typography.caption, color: colors.inkSubtle, fontSize: 11 },
    numeroValor: { ...typography.label, color: colors.ink, fontWeight: '700' },

    rodape: { ...typography.caption, color: colors.inkSubtle, fontSize: 11.5 },
    acoes: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    acaoLarga: { flex: 1 },
    apagar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    apagarTexto: { ...typography.caption, color: colors.danger },
  });
