/**
 * IMPORTAR UMA OBRA DO UAU — A TELA.
 *
 * Abre com a prévia da obra (a leitura completa, agora): quantas unidades,
 * por status, a faixa de valor e os blocos que o UAU tem. O admin escolhe:
 *
 *   • criar um empreendimento NOVO no catálogo (construtora, nome, UF), ou
 *     usar um que JÁ EXISTE (ex.: o Village Connect I);
 *   • de onde vem o valor de venda: automático (a tabela enviada, se houver;
 *     senão o UAU), só a tabela, ou só o UAU.
 *
 * "Importar" faz o resto (`features/disponibilidade/importarObra.ts`). O UAU
 * só é LIDO: nada desta tela escreve no ERP.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Segmento } from '@/components/Segmento';
import { Select } from '@/components/Select';
import { db, type Company, type Development, type FonteDoPreco, type PreviaDaObra } from '@/data';
import { blocosDoUau } from '@/features/disponibilidade/chaveUau';
import { importarObra, unidadesDaPrevia, type ResultadoDaImportacao } from '@/features/disponibilidade/importarObra';
import { nomeDaObra } from '@/features/disponibilidade/obrasConhecidas';
import { UF_OPTIONS } from '@/features/uf';
import { confirmar } from '@/lib/confirmar';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const TEXTO_DA_FONTE: Record<FonteDoPreco, string> = {
  automatico: 'Vale a tabela de preço que você enviar. Sem tabela enviada, vale o valor do UAU.',
  tabela: 'Só a tabela de preço enviada (PDF ou modelo POUP). O UAU só pinta a disponibilidade.',
  uau: 'Só o valor do UAU (a tabela do dia no ERP). Se houver tabela enviada, ela ainda dá avaliação, área e vaga.',
};

export const OPCOES_DA_FONTE: { valor: FonteDoPreco; rotulo: string }[] = [
  { valor: 'automatico', rotulo: 'Automático' },
  { valor: 'tabela', rotulo: 'Tabela' },
  { valor: 'uau', rotulo: 'UAU' },
];

interface Props {
  empresa: number;
  obra: string;
  onFechar: () => void;
  /** Importou: a tela de cima recarrega e pode abrir a conferência. */
  onImportou: (r: ResultadoDaImportacao) => void;
  onAbrirConferencia: (developmentId: string) => void;
}

export function ImportarObra({ empresa, obra, onFechar, onImportou, onAbrirConferencia }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { user } = useAuth();

  const [previa, setPrevia] = useState<PreviaDaObra | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [construtoras, setConstrutoras] = useState<Company[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Development[]>([]);

  const [destino, setDestino] = useState<'novo' | 'existente'>('novo');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [nome, setNome] = useState(nomeDaObra(empresa, obra) ?? '');
  const [uf, setUf] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);
  const [fonte, setFonte] = useState<FonteDoPreco>('automatico');

  const [importando, setImportando] = useState(false);
  const [passo, setPasso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);

  // A prévia: a obra inteira, lida no UAU agora.
  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setErroPrevia(null);
    void db.disponibilidade.previa(empresa, obra).then((r) => {
      if (!vivo) return;
      if (r.ok) setPrevia(r.data);
      else setErroPrevia(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [empresa, obra, tentativa]);

  // As construtoras e os empreendimentos do catálogo.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const comps = await db.catalog.listCompanies();
      const devs = (await Promise.all(comps.map((c) => db.catalog.listDevelopments(c.id)))).flat();
      if (!vivo) return;
      setConstrutoras(comps);
      setEmpreendimentos(devs);
      // Já existe um empreendimento com o nome da obra: sugere usar ele.
      const conhecido = nomeDaObra(empresa, obra)?.toLowerCase();
      const mesmo = conhecido ? devs.find((d) => d.name.trim().toLowerCase() === conhecido) : undefined;
      if (mesmo) {
        setDestino('existente');
        setDevelopmentId(mesmo.id);
      }
      const canopus = comps.find((c) => /canopus/i.test(c.name)) ?? (comps.length === 1 ? comps[0] : undefined);
      if (canopus) setCompanyId(canopus.id);
    })();
    return () => {
      vivo = false;
    };
  }, [empresa, obra]);

  // A UF mais comum entre os empreendimentos da construtora escolhida.
  useEffect(() => {
    if (!companyId) return;
    const conta = new Map<string, number>();
    for (const d of empreendimentos) if (d.companyId === companyId && d.uf) conta.set(d.uf, (conta.get(d.uf) ?? 0) + 1);
    const mais = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (mais) setUf((atual) => atual ?? mais);
  }, [companyId, empreendimentos]);

  const forma = useMemo(() => (previa ? blocosDoUau(unidadesDaPrevia(previa)) : null), [previa]);

  async function importar() {
    if (!user || !previa) return;
    setErro(null);
    if (destino === 'novo' && (!companyId || !nome.trim())) {
      setErro('Escolha a construtora e dê um nome ao empreendimento.');
      return;
    }
    if (destino === 'existente' && !developmentId) {
      setErro('Escolha o empreendimento que vai receber esta obra.');
      return;
    }
    const alvo =
      destino === 'novo' ? `o empreendimento novo "${nome.trim()}"` : `"${empreendimentos.find((d) => d.id === developmentId)?.name}"`;
    const seguir = await confirmar(
      'Importar do UAU',
      `A obra ${empresa}/${obra} (${previa.unidades} unidades) vai para ${alvo}: blocos e unidades que faltarem são cadastrados, e cada unidade é vinculada à sua no UAU. Nada é apagado, e nada é alterado no UAU.`,
      'Importar',
    );
    if (!seguir) return;

    setImportando(true);
    const r = await importarObra(
      {
        userId: user.id,
        previa,
        destino:
          destino === 'novo'
            ? { tipo: 'novo', companyId: companyId!, nome: nome.trim(), uf }
            : { tipo: 'existente', developmentId: developmentId! },
        fonte,
      },
      {
        criarEmpreendimento: (u, d) => db.developments.create(u, d),
        salvarObra: (d, e, o) => db.disponibilidade.salvarObra(d, e, o),
        listarBlocos: (d) => db.unidades.listarBlocos(d),
        salvarBlocos: (d, b) => db.unidades.salvarBlocos(d, b),
        conferencia: (d) => db.disponibilidade.conferencia(d),
        salvarVinculos: (d, v) => db.disponibilidade.salvarVinculos(d, v),
        definirFontePreco: (d, f) => db.disponibilidade.definirFontePreco(d, f),
      },
      setPasso,
    );
    setImportando(false);
    setPasso(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setResultado(r.data);
    onImportou(r.data);
  }

  if (resultado) {
    const p = resultado.pendentes;
    const pendentes =
      p.divergentes.length + p.conflitos.length + p.soNoPoup.length + p.soNoUau.length + p.naoReconhecidas.length;
    return (
      <View style={styles.card}>
        <Text style={styles.titulo}>Importado</Text>
        <Text style={styles.texto}>
          {resultado.criouEmpreendimento ? 'Empreendimento criado. ' : ''}
          {resultado.unidadesNovas > 0
            ? `${resultado.unidadesNovas} unidades cadastradas${resultado.blocosNovos ? ` em ${resultado.blocosNovos} blocos novos` : ''}. `
            : ''}
          {resultado.vinculadas} unidades vinculadas ao UAU
          {resultado.jaVinculadas ? ` (+${resultado.jaVinculadas} que já estavam)` : ''}. A disponibilidade já aparece na
          tabela de preço.
        </Text>
        {pendentes > 0 ? (
          <Text style={styles.aviso}>
            {pendentes} unidades ficaram para conferir à mão (sem par exato dos dois lados). Nada foi vinculado por
            aproximação.
          </Text>
        ) : null}
        {resultado.recusadas > 0 ? (
          <Text style={styles.aviso}>
            {resultado.recusadas} unidades do UAU sem bloco ou quadra legível não foram cadastradas.
          </Text>
        ) : null}
        <View style={styles.botoes}>
          <Button label="Abrir a conferência" onPress={() => onAbrirConferencia(resultado.developmentId)} />
          <Button label="Concluir" variant="ghost" onPress={onFechar} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>
        Importar {nomeDaObra(empresa, obra) ?? 'obra'} · {empresa}/{obra}
      </Text>

      {!previa && !erroPrevia ? (
        <View style={styles.linha}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.texto}>Lendo a obra no UAU (pode levar alguns segundos)...</Text>
        </View>
      ) : null}
      {erroPrevia ? (
        <>
          <Text style={styles.erro}>{erroPrevia}</Text>
          <Button label="Tentar de novo" variant="secondary" onPress={() => setTentativa((t) => t + 1)} />
        </>
      ) : null}

      {previa ? (
        <>
          <Text style={styles.secao}>No UAU</Text>
          <Text style={styles.texto}>
            {previa.unidades} unidades
            {previa.valorMin != null
              ? ` · de ${brl(previa.valorMin)} a ${brl(previa.valorMax ?? previa.valorMin)}`
              : ' · sem valor no UAU'}
            {previa.entregaChaves ? ` · entrega ${previa.entregaChaves.slice(5, 7)}/${previa.entregaChaves.slice(0, 4)}` : ''}
          </Text>
          <View style={styles.chips}>
            {Object.entries(previa.porStatus).map(([k, n]) => (
              <Text key={k} style={styles.chip}>
                {k}: {n}
              </Text>
            ))}
          </View>
          {forma ? (
            <Text style={styles.texto}>
              {forma.blocos.length} {forma.blocos.length === 1 ? 'bloco' : 'blocos/quadras'}:{' '}
              {forma.blocos
                .slice(0, 6)
                .map((b) => `${b.nome} (${b.unidades.length})`)
                .join(', ')}
              {forma.blocos.length > 6 ? '…' : ''}
              {forma.recusadas.length ? ` · ${forma.recusadas.length} sem bloco legível` : ''}
            </Text>
          ) : null}
          {previa.aviso ? <Text style={styles.aviso}>{previa.aviso}</Text> : null}

          <Text style={styles.secao}>Para onde</Text>
          <Segmento
            opcoes={[
              { valor: 'novo', rotulo: 'Empreendimento novo' },
              { valor: 'existente', rotulo: 'Um que já existe' },
            ]}
            valor={destino}
            onMudar={setDestino}
          />
          <View style={styles.campos}>
            {destino === 'novo' ? (
              <>
                <Select
                  label="Construtora (catálogo)"
                  placeholder="Escolha a construtora"
                  value={companyId}
                  options={construtoras.map((c) => ({ value: c.id, label: c.name }))}
                  onChange={setCompanyId}
                  emptyHint="Cadastre a construtora no Catálogo do sistema."
                />
                <Input label="Nome do empreendimento" value={nome} onChangeText={setNome} placeholder="Ex.: Village Connect I" />
                <Select
                  label="Estado (UF)"
                  placeholder="Todos os estados"
                  value={uf}
                  options={UF_OPTIONS}
                  onChange={setUf}
                  searchable
                />
              </>
            ) : (
              <Select
                label="Empreendimento"
                placeholder="Escolha o empreendimento"
                value={developmentId}
                options={empreendimentos.map((d) => ({
                  value: d.id,
                  label: `${d.name}${d.companyName ? ` · ${d.companyName}` : ''}`,
                }))}
                onChange={setDevelopmentId}
                searchable
                emptyHint="Nenhum empreendimento no catálogo."
              />
            )}
          </View>

          <Text style={styles.secao}>Valor de venda</Text>
          <Segmento opcoes={OPCOES_DA_FONTE} valor={fonte} onMudar={setFonte} />
          <Text style={styles.dica}>{TEXTO_DA_FONTE[fonte]}</Text>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          {passo ? <Text style={styles.dica}>{passo}</Text> : null}
          <View style={styles.botoes}>
            <Button label="Importar" onPress={() => void importar()} loading={importando} disabled={previa.unidades === 0} />
            <Button label="Cancelar" variant="ghost" onPress={onFechar} disabled={importando} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.primary,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    titulo: { ...typography.heading, color: colors.ink },
    secao: { ...typography.label, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md },
    texto: { ...typography.body, color: colors.ink },
    dica: { ...typography.caption, color: colors.inkMuted },
    linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    campos: { marginTop: spacing.sm },
    botoes: { gap: spacing.sm, marginTop: spacing.md },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    aviso: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
  });
