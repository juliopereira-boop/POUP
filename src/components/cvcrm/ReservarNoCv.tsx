/**
 * "RESERVAR NO CV" — NO RELATÓRIO DA SIMULAÇÃO.
 *
 * Aparece só quando a construtora da simulação tem a reserva ligada
 * ("Habilitar reserva", no cadastro da construtora) e a unidade escolhida
 * tem vínculo com o CV. Ao tocar, o POUP confere tudo no CV, na hora:
 *
 *   • a unidade: disponível agora?
 *   • o corretor: o CPF do perfil do POUP acha o corretor e a imobiliária
 *     certos no CV (nunca o usuário da integração);
 *   • o cliente: o CPF da simulação acha o pré-cadastro (e a pessoa) no CV,
 *     com a aprovação de financiamento;
 *   • as condições: o fluxo da simulação (ato, mensais, semestrais, anuais,
 *     financiamento, FGTS, subsídio) nas séries do CV que o admin escolheu.
 *
 * O que falta aparece em frase de gente. Com tudo certo, "Reservar" pede
 * confirmação e cria a reserva no CV para aquele CPF (docs/CVCRM_RESERVA.md).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { db, type PreparoDaReserva, type ReservaDaSimulacao } from '@/data';
import type { CondicaoDaReserva } from '@/features/disponibilidade/condicoesDaReserva';
import { confirmar } from '@/lib/confirmar';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Props {
  simulationId: string;
  unidade: string;
  cliente: string | null;
  /** O fluxo da simulação, em condições (`condicoesDaReserva`). */
  condicoes: CondicaoDaReserva[];
}

const brl = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** "2026-11-10" → "10/11/2026"; já no formato do CV, fica como está. */
const dataBR = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);

export function ReservarNoCv({ simulationId, unidade, cliente, condicoes }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  const [estado, setEstado] = useState<ReservaDaSimulacao | null>(null);
  const [aberto, setAberto] = useState(false);
  const [preparo, setPreparo] = useState<PreparoDaReserva | null>(null);
  const [ocupado, setOcupado] = useState<'preparar' | 'reservar' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await db.disponibilidade.reservaDaSimulacao(simulationId);
    setEstado(r.ok ? r.data : null);
  }, [simulationId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function preparar() {
    setAberto(true);
    setAviso(null);
    setErro(null);
    setOcupado('preparar');
    const r = await db.disponibilidade.prepararReserva(simulationId, condicoes);
    setOcupado(null);
    if (r.ok) setPreparo(r.data);
    else setErro(r.error);
  }

  async function reservar() {
    if (!preparo) return;
    const seguir = await confirmar(
      'Reservar no CV',
      `A unidade ${preparo.unidade?.identificador ?? unidade} vai ser reservada no CV da construtora para ${
        preparo.cliente?.nome ?? cliente ?? 'o cliente'
      }, com você como corretor${preparo.corretor?.imobiliaria ? ` (${preparo.corretor.imobiliaria})` : ''}.`,
      'Reservar',
    );
    if (!seguir) return;
    setAviso(null);
    setErro(null);
    setOcupado('reservar');
    const r = await db.disponibilidade.reservar(simulationId, condicoes);
    setOcupado(null);
    if (r.ok) {
      setPreparo(r.data);
      setAviso(`Reserva criada no CV${r.data.cvReserva ? ` (nº ${r.data.cvReserva})` : ''}.`);
      await carregar();
    } else {
      setErro(r.error);
    }
  }

  if (!estado?.habilitada) return null;
  if (!estado.temVinculo) {
    return (
      <Text style={styles.dica}>
        Para reservar no CV, escolha a unidade pela tabela de preço do empreendimento (ela precisa estar ligada ao CV).
      </Text>
    );
  }

  const ultima = estado.ultima;
  if (ultima?.situacao === 'criada') {
    return (
      <View style={styles.feito}>
        <Text style={styles.feitoTitulo}>✓ Reservada no CV{ultima.cvReserva ? ` · nº ${ultima.cvReserva}` : ''}</Text>
      </View>
    );
  }

  if (!aberto) {
    return <Button label="Reservar no CV" variant="secondary" onPress={() => void preparar()} />;
  }

  const pronto = Boolean(preparo && preparo.pendencias.length === 0);
  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Reservar no CV</Text>
      {ocupado === 'preparar' ? (
        <View style={styles.linha}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.texto}>Conferindo no CV...</Text>
        </View>
      ) : null}

      {preparo ? (
        <>
          <Item
            ok={Boolean(preparo.unidade?.livre)}
            titulo="Unidade"
            texto={
              preparo.unidade
                ? `${preparo.unidade.identificador ?? unidade} · ${preparo.unidade.situacao ?? 'sem situação'}`
                : 'Sem vínculo com o CV'
            }
          />
          <Item
            ok={Boolean(preparo.corretor?.ativo)}
            titulo="Corretor"
            texto={
              preparo.corretor
                ? `Você, no CV${preparo.corretor.imobiliaria ? ` · ${preparo.corretor.imobiliaria}` : ''}`
                : 'Não achado no CV pelo seu CPF'
            }
          />
          <Item
            ok={Boolean(preparo.cliente?.cvPrecadastro)}
            titulo="Cliente"
            texto={
              preparo.cliente
                ? `${preparo.cliente.nome ?? cliente ?? 'Cliente'} · pré-cadastro ${preparo.cliente.situacao ?? ''}`.trim()
                : 'Pré-cadastro não achado pelo CPF'
            }
          />
          {preparo.cliente && (preparo.cliente.valorAprovado || preparo.cliente.valorSubsidio || preparo.cliente.valorFgts) ? (
            <Text style={styles.meta}>
              Aprovado {brl(preparo.cliente.valorAprovado)} · subsídio {brl(preparo.cliente.valorSubsidio)} · FGTS{' '}
              {brl(preparo.cliente.valorFgts)}
            </Text>
          ) : null}

          {preparo.condicoes.length > 0 ? (
            <View style={styles.condicoes}>
              <Text style={styles.itemTitulo}>Condições no CV</Text>
              {preparo.condicoes.map((c) => (
                <Text key={c.rotulo} style={styles.meta}>
                  {c.rotulo} → {c.serie}: {c.quantidade}× {brl(c.valorParcela)}
                  {c.primeiroVencimento ? ` · 1º venc. ${dataBR(c.primeiroVencimento)}` : ''}
                </Text>
              ))}
            </View>
          ) : null}

          {preparo.pendencias.length > 0 ? (
            <View style={styles.pendencias}>
              {preparo.pendencias.map((p) => (
                <Text key={p} style={styles.pendencia}>
                  • {p}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.botoes}>
            <Button
              label="Reservar"
              onPress={() => void reservar()}
              loading={ocupado === 'reservar'}
              disabled={!pronto || ocupado !== null}
            />
            <Button label="Conferir de novo" variant="ghost" onPress={() => void preparar()} disabled={ocupado !== null} />
          </View>
        </>
      ) : null}

      {aviso ? <Text style={styles.ok}>{aviso}</Text> : null}
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
    </View>
  );
}

function Item({ ok, titulo, texto }: { ok: boolean; titulo: string; texto: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.item}>
      <Text style={[styles.marca, ok ? styles.marcaOk : styles.marcaFalta]}>{ok ? '✓' : '!'}</Text>
      <View style={styles.flex1}>
        <Text style={styles.itemTitulo}>{titulo}</Text>
        <Text style={styles.meta}>{texto}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      padding: spacing.lg,
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    titulo: { ...typography.heading, color: colors.ink },
    texto: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.inkMuted },
    dica: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm },
    linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    itemTitulo: { ...typography.label, color: colors.ink },
    marca: {
      ...typography.label,
      width: 22,
      height: 22,
      borderRadius: 11,
      textAlign: 'center',
      lineHeight: 22,
      overflow: 'hidden',
    },
    marcaOk: { color: colors.success, backgroundColor: colors.successSoft },
    marcaFalta: { color: colors.warning, backgroundColor: colors.warningSoft },
    pendencias: { gap: spacing.xs },
    condicoes: { gap: 2, marginTop: spacing.xs },
    pendencia: { ...typography.caption, color: colors.ink },
    botoes: { gap: spacing.sm, marginTop: spacing.sm },
    feito: {
      backgroundColor: colors.successSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginTop: spacing.sm,
    },
    feitoTitulo: { ...typography.label, color: colors.success },
    ok: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
  });
