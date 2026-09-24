/**
 * O CAMPO "TABELA DE PREÇO" NO CADASTRO DO EMPREENDIMENTO.
 *
 * É aqui que o corretor sobe a tabela do mês — no modelo POUP (.csv) ou o
 * PDF da construtora. O envio e a leitura acontecem
 * neste mesmo toque; a conferência abre em seguida na tela da tabela, com as
 * linhas lidas já preenchidas — nada vira preço sem alguém olhar.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { db, type TabelaDePreco } from '@/data';
import { guardarLeitura, rotuloDaEtapa, useEnviarTabela } from '@/features/tabelaPreco/useEnviarTabela';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Props {
  developmentId: string;
}

export function CampoTabelaDePreco({ developmentId }: Props) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const envio = useEnviarTabela(developmentId);
  const [tabela, setTabela] = useState<TabelaDePreco | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void db.tabelaPreco.carregar(developmentId).then((r) => {
      if (!vivo) return;
      setTabela(r.ok ? r.data : null);
      setPendente(r.ok ? null : r.migracaoPendente ? r.error : null);
    });
    return () => {
      vivo = false;
    };
  }, [developmentId]);

  const abrirTabela = () =>
    router.push({ pathname: '/(app)/cadastros/tabela-preco', params: { developmentId } });

  async function enviar() {
    const r = await envio.enviar();
    if (!r) return;
    guardarLeitura(developmentId, r);
    abrirTabela();
  }

  const etapa = rotuloDaEtapa(envio.etapa);
  const linhas = tabela?.regras.length ?? 0;

  return (
    <View style={styles.caixa}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>Tabela de preço</Text>
        {tabela ? (
          <Pressable onPress={abrirTabela} hitSlop={8} accessibilityRole="link">
            <Text style={styles.link}>Ver tabela</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.status}>
        {pendente
          ? pendente
          : tabela
            ? [
                tabela.referencia || 'Sem referência',
                linhas > 0 ? `${linhas} linha${linhas === 1 ? '' : 's'}` : null,
                tabela.precosPorUnidade.length > 0 ? `preço de ${tabela.precosPorUnidade.length} unidades` : null,
                tabela.vagas?.unidades.length ? `${tabela.vagas.unidades.length} na lista de vagas` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'Envie a tabela no modelo POUP (.csv) ou o PDF da construtora: o POUP lê os preços e o simulador preenche o valor de venda sozinho.'}
      </Text>
      {tabela?.arquivo ? (
        <Text style={styles.arquivo} numberOfLines={1}>
          Arquivo: {tabela.arquivo.nome}
        </Text>
      ) : null}
      <Button
        label={tabela ? 'Enviar tabela nova' : 'Enviar a tabela'}
        variant="secondary"
        onPress={() => void enviar()}
        loading={envio.etapa !== 'parado'}
        disabled={Boolean(pendente)}
        style={styles.botao}
      />
      {etapa ? <Text style={styles.etapa}>{etapa}</Text> : null}
      {envio.erro ? <Text style={styles.erro}>{envio.erro}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    caixa: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      backgroundColor: colors.surfaceAlt,
    },
    topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    titulo: { ...typography.label, color: colors.ink },
    link: { ...typography.label, color: colors.primary },
    status: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs },
    arquivo: { ...typography.caption, color: colors.inkSubtle, marginTop: 2 },
    botao: { marginTop: spacing.md },
    etapa: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, textAlign: 'center' },
    erro: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  });
