/**
 * PLANOS — sempre disponível, para qualquer conta.
 *
 * Antes, a comparação de planos só aparecia no cadastro e quando o teste
 * acabava; o aviso "Faltam x dias do seu teste" levava ao paywall, que devolvia
 * quem ainda tinha acesso direto para o início (parecia que o toque não fazia
 * nada). Agora há um lugar fixo, dentro do app, com a situação da conta e o
 * botão certo em cada plano:
 *
 *   teste / sem plano     → "Assinar o Start" · "Assinar o Pro"
 *   Start pago            → "Seu plano atual" · "Fazer upgrade para o Pro"
 *   Pro pago              → "Mudar para o Start" (fluxo com motivo) · "Seu plano atual"
 *   Pro/Start pago        → "Cancelar assinatura" (o mesmo fluxo, com motivo)
 *
 * Chega-se aqui pelo aviso do teste no início, pelo Perfil, por Configurações
 * e pelos bloqueios dos módulos do Pro. Quem executa a cobrança é
 * `features/cobranca` (portal de pagamento na web, loja no celular).
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { Button } from '@/components/Button';
import { CartaoDePlano } from '@/components/planos/CartaoDePlano';
import { FluxoDeMudanca } from '@/components/planos/FluxoDeMudanca';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { registrar } from '@/features/analytics/eventos';
import {
  abrirCheckout,
  abrirPortalDeCobranca,
  cancelarAssinatura,
  mudarDePlano,
} from '@/features/cobranca/abrirCobranca';
import {
  loadStorePrices,
  purchaseStorePlan,
  restoreStorePurchases,
} from '@/features/cobranca/comprasNaLoja';
import {
  acaoDoPlano,
  estadoDaConta,
  resumoDaConta,
  type DestinoDaMudanca,
  type Motivo,
} from '@/features/planos/acoes';
import { PLANS, PLAN_ORDER } from '@/features/plans';
import { canShowBilling, usesNativeBilling } from '@/features/store';
import { depoisDeFecharJanela } from '@/lib/navegacao';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';
import type { PlanTier } from '@/data/types';

const plataforma = (): 'web' | 'ios' | 'android' =>
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

export default function PlanosScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { subscription, trialDaysLeft, refresh } = useSubscription();
  const [precosDaLoja, setPrecosDaLoja] = useState<Partial<Record<PlanTier, string>>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Onde o erro aparece: embaixo do plano tocado (senão ficava só no topo, fora da vista). */
  const [ondeErro, setOndeErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fluxo, setFluxo] = useState<DestinoDaMudanca | null>(null);

  const estado = estadoDaConta(subscription);
  const resumo = resumoDaConta(estado, trialDaysLeft);
  const fim = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const pago = estado.situacao === 'paga';

  useEffect(() => {
    registrar('subscription_viewed', { etapa: 'planos', resultado: 'ok' });
  }, []);

  useEffect(() => {
    if (!usesNativeBilling) return;
    let vivo = true;
    void loadStorePrices().then((r) => {
      if (vivo && r.ok)
        setPrecosDaLoja(Object.fromEntries(r.data.map((p) => [p.tier, p.priceLabel])));
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Voltando da Stripe pelo "voltar" do navegador, a página é restaurada como
  // estava ao sair — com o botão ainda carregando. Solta o botão.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const aoVoltar = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setOcupado(null);
        void refresh();
      }
    };
    window.addEventListener('pageshow', aoVoltar);
    return () => window.removeEventListener('pageshow', aoVoltar);
  }, [refresh]);

  // Voltando do portal de pagamento ou da loja, a assinatura pode ter mudado.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const executar = useCallback(
    async (
      chave: string,
      acao: () => Promise<{ ok: boolean; error?: string }>,
      sucesso?: string,
    ) => {
      setErro(null);
      setOndeErro(chave);
      setAviso(null);
      setOcupado(chave);
      let saindo = false;
      try {
        const r = await acao();
        if (!r.ok) {
          if (r.error) setErro(r.error);
          return;
        }
        // Na web, dar certo = a página já está indo para a Stripe: o botão
        // segue carregando até ela abrir (e o "voltar" solta, no pageshow).
        if (!usesNativeBilling) {
          saindo = true;
          return;
        }
        await refresh();
        if (sucesso) setAviso(sucesso);
      } catch {
        setErro('Não foi possível abrir a cobrança. Tente de novo.');
      } finally {
        if (!saindo) setOcupado(null);
      }
    },
    [refresh],
  );

  function tocarNoPlano(tier: PlanTier) {
    const acao = acaoDoPlano(tier, estado);
    if (acao.tipo === 'atual') return;
    if (acao.tipo === 'downgrade') return setFluxo('start');
    if (acao.tipo === 'upgrade') {
      return void executar(
        tier,
        () => mudarDePlano('pro'),
        usesNativeBilling ? 'Pronto: você já está no Pro.' : undefined,
      );
    }
    // Assinar (teste, sem plano ou acesso concedido).
    return void executar(
      tier,
      async () => {
        if (!usesNativeBilling) return abrirCheckout(tier);
        const r = await purchaseStorePlan(tier);
        return r.ok ? r : { ok: false, error: r.cancelled ? '' : r.error };
      },
      usesNativeBilling ? 'Compra confirmada. Seu plano já foi atualizado.' : undefined,
    );
  }

  async function confirmarMudanca(motivo: Motivo, comentario: string): Promise<string | null> {
    const destino = fluxo;
    if (!destino) return null;
    // O motivo é informação para o POUP: se não gravar, a troca segue mesmo assim.
    await db.billing.registrarMudancaDePlano({
      de: estado.tier ?? 'nenhum',
      para: destino,
      motivo,
      comentario,
      plataforma: plataforma(),
    });
    setFluxo(null);
    // A janela precisa sair antes de abrir o portal ou a página da loja.
    await new Promise<void>((r) => depoisDeFecharJanela(r));
    await executar(destino, () =>
      destino === 'cancelar' ? cancelarAssinatura() : mudarDePlano('start'),
    );
    return null;
  }

  return (
    <Screen>
      <View style={styles.situacao}>
        <Text style={styles.situacaoRotulo}>SEU PLANO</Text>
        <Text style={styles.situacaoTitulo}>{resumo.titulo}</Text>
        <Text style={styles.situacaoTexto}>{resumo.detalhe}</Text>
        {pago && fim ? (
          <Text style={styles.situacaoTexto}>
            {estado.cancelaNoFim ? 'Acesso até' : 'Renova em'} {fim.toLocaleDateString('pt-BR')}
          </Text>
        ) : null}
      </View>

      {erro && !PLAN_ORDER.includes(ondeErro as PlanTier) ? (
        <Text style={styles.erro}>{erro}</Text>
      ) : null}
      {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

      <View style={styles.planos}>
        {PLAN_ORDER.map((tier) => {
          const plano = PLANS[tier];
          const acao = acaoDoPlano(tier, estado);
          const preco = usesNativeBilling
            ? (precosDaLoja[tier] ?? 'Preço indisponível')
            : plano.priceLabel;
          return (
            <View key={tier} style={styles.plano}>
              <CartaoDePlano
                plan={plano}
                priceLabel={preco}
                rotulo={canShowBilling ? acao.rotulo : null}
                atual={acao.tipo === 'atual'}
                perigo={acao.tipo === 'downgrade'}
                loading={ocupado === tier}
                disabled={
                  ocupado !== null ||
                  (usesNativeBilling && acao.tipo !== 'downgrade' && !precosDaLoja[tier])
                }
                onPress={() => tocarNoPlano(tier)}
              />
              {erro && ondeErro === tier ? <Text style={styles.erro}>{erro}</Text> : null}
            </View>
          );
        })}
      </View>

      {canShowBilling && pago ? (
        <View style={styles.acoes}>
          <Button
            label={estado.cancelaNoFim ? 'Reativar assinatura' : 'Gerenciar assinatura'}
            variant="secondary"
            onPress={() => void executar('gerenciar', abrirPortalDeCobranca)}
            loading={ocupado === 'gerenciar'}
          />
          {!estado.cancelaNoFim ? (
            <Button
              label="Cancelar assinatura"
              variant="ghost"
              onPress={() => setFluxo('cancelar')}
            />
          ) : null}
        </View>
      ) : null}
      {usesNativeBilling ? (
        <Button
          label="Restaurar compras"
          variant="ghost"
          onPress={() =>
            void executar(
              'restaurar',
              async () => {
                const r = await restoreStorePurchases();
                return r.ok ? { ok: true } : r;
              },
              'Compras restauradas.',
            )
          }
          loading={ocupado === 'restaurar'}
        />
      ) : null}

      <Text style={styles.letraMiuda}>
        {usesNativeBilling
          ? 'Assinatura mensal com renovação automática, cobrada na conta da loja do seu celular. Cancele nos ajustes da loja até 24 horas antes do fim do período.'
          : 'Cobrança mensal recorrente. Troque de plano ou cancele quando quiser, pelo portal de pagamento.'}
      </Text>
      <View style={styles.links}>
        <Pressable onPress={() => router.push('/termos' as Href)} hitSlop={6}>
          <Text style={styles.link}>Termos de Uso</Text>
        </Pressable>
        <Text style={styles.separador}>•</Text>
        <Pressable onPress={() => router.push('/privacidade')} hitSlop={6}>
          <Text style={styles.link}>Política de Privacidade</Text>
        </Pressable>
      </View>

      <FluxoDeMudanca
        aberto={fluxo !== null}
        de={estado.tier ?? 'pro'}
        destino={fluxo ?? 'start'}
        onFechar={() => setFluxo(null)}
        onConfirmar={confirmarMudanca}
      />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    situacao: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.xl,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: 4,
    },
    situacaoRotulo: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '800',
      letterSpacing: 1,
    },
    situacaoTitulo: { ...typography.title, color: colors.ink },
    situacaoTexto: { ...typography.body, color: colors.inkMuted },
    planos: { gap: spacing.lg },
    plano: { gap: spacing.sm },
    acoes: { gap: spacing.sm, marginTop: spacing.lg },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    aviso: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    letraMiuda: {
      ...typography.caption,
      color: colors.inkSubtle,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    links: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.xl,
    },
    link: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    separador: { ...typography.caption, color: colors.inkSubtle },
  });
