/**
 * IMPORTAR UM EMPREENDIMENTO DO CV — A TELA.
 *
 * Abre com a prévia (o mapa de disponibilidade inteiro, lido agora): quantas
 * unidades, por situação, as etapas e os blocos que o CV tem. O admin escolhe:
 *
 *   • a etapa (módulo), quando o CV junta mais de um no mesmo empreendimento
 *     (o "VILLAGE RESERVA II" do CV tem o Módulo I e o Módulo II);
 *   • criar um empreendimento NOVO no catálogo (construtora, nome, UF), ou
 *     usar um que JÁ EXISTE (ex.: o Village Connect I).
 *
 * "Importar" faz o resto (`features/disponibilidade/importarDoCv.ts`). O CV
 * só é LIDO: nada desta tela escreve no CV. O preço continua o da tabela de
 * preço enviada.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Segmento } from '@/components/Segmento';
import { Select } from '@/components/Select';
import { db, type Company, type Development, type EmpreendimentoDoCv, type PreviaDoCv } from '@/data';
import { blocosDoCv } from '@/features/disponibilidade/vinculo';
import { importarDoCv, unidadesDaPrevia, type ResultadoDaImportacao } from '@/features/disponibilidade/importarDoCv';
import { normalizar } from '@/features/tabelaPreco/chaves';
import { UF_OPTIONS } from '@/features/uf';
import { confirmar } from '@/lib/confirmar';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const TODAS = 'todas';

/** "VILLAGE CONNECT I" e "Village Connect I" são o mesmo nome. */
const mesmoNome = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && normalizar(a!).replace(/\s+/g, ' ').trim() === normalizar(b!).replace(/\s+/g, ' ').trim();

interface Props {
  empreendimento: EmpreendimentoDoCv;
  onFechar: () => void;
  /** Importou: a tela de cima recarrega e pode abrir a conferência. */
  onImportou: (r: ResultadoDaImportacao) => void;
  onAbrirConferencia: (developmentId: string) => void;
}

export function ImportarDoCv({ empreendimento, onFechar, onImportou, onAbrirConferencia }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { user } = useAuth();

  const [previa, setPrevia] = useState<PreviaDoCv | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [construtoras, setConstrutoras] = useState<Company[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Development[]>([]);

  const [etapa, setEtapa] = useState<string>(TODAS);
  const [destino, setDestino] = useState<'novo' | 'existente'>('novo');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [nome, setNome] = useState(empreendimento.nome ?? '');
  const [uf, setUf] = useState<string | null>(null);
  const [developmentId, setDevelopmentId] = useState<string | null>(null);

  const [importando, setImportando] = useState(false);
  const [passo, setPasso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDaImportacao | null>(null);

  // A prévia: o mapa inteiro, lido no CV agora.
  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    setErroPrevia(null);
    void db.disponibilidade.previa(empreendimento.id).then((r) => {
      if (!vivo) return;
      if (r.ok) setPrevia(r.data);
      else setErroPrevia(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [empreendimento.id, tentativa]);

  // As construtoras e os empreendimentos do catálogo.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const comps = await db.catalog.listCompanies();
      const devs = (await Promise.all(comps.map((c) => db.catalog.listDevelopments(c.id)))).flat();
      if (!vivo) return;
      setConstrutoras(comps);
      setEmpreendimentos(devs);
      // Já existe um empreendimento com o nome do CV: sugere usar ele.
      const mesmo = devs.find((d) => mesmoNome(d.name, empreendimento.nome));
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
  }, [empreendimento.nome]);

  // A UF mais comum entre os empreendimentos da construtora escolhida.
  useEffect(() => {
    if (!companyId) return;
    const conta = new Map<string, number>();
    for (const d of empreendimentos) if (d.companyId === companyId && d.uf) conta.set(d.uf, (conta.get(d.uf) ?? 0) + 1);
    const mais = [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (mais) setUf((atual) => atual ?? mais);
  }, [companyId, empreendimentos]);

  const etapaEscolhida = etapa === TODAS ? null : Number(etapa);
  const unidades = useMemo(() => (previa ? unidadesDaPrevia(previa, etapaEscolhida) : []), [previa, etapaEscolhida]);
  const forma = useMemo(() => (unidades.length ? blocosDoCv(unidades) : null), [unidades]);
  const nomeDaEtapa = previa?.etapas.find((e) => e.id === etapaEscolhida)?.nome ?? null;

  async function importar() {
    if (!user || !previa) return;
    setErro(null);
    if (destino === 'novo' && (!companyId || !nome.trim())) {
      setErro('Escolha a construtora e dê um nome ao empreendimento.');
      return;
    }
    if (destino === 'existente' && !developmentId) {
      setErro('Escolha o empreendimento que vai receber o CV.');
      return;
    }
    const alvo =
      destino === 'novo' ? `o empreendimento novo "${nome.trim()}"` : `"${empreendimentos.find((d) => d.id === developmentId)?.name}"`;
    const deOnde = `${previa.nome ?? `o empreendimento ${previa.cvEmpreendimento}`}${nomeDaEtapa ? ` (${nomeDaEtapa})` : ''}`;
    const seguir = await confirmar(
      'Importar do CV',
      `${deOnde}, com ${unidades.length} unidades, vai para ${alvo}: blocos e unidades que faltarem são cadastrados, e cada unidade é vinculada à sua no CV. Nada é apagado, e nada é alterado no CV.`,
      'Importar',
    );
    if (!seguir) return;

    setImportando(true);
    const r = await importarDoCv(
      {
        userId: user.id,
        previa,
        etapa: etapaEscolhida,
        dataEntrega: empreendimento.dataEntrega,
        destino:
          destino === 'novo'
            ? { tipo: 'novo', companyId: companyId!, nome: nome.trim(), uf }
            : { tipo: 'existente', developmentId: developmentId! },
      },
      {
        criarEmpreendimento: (u, d) => db.developments.create(u, d),
        salvarEmpreendimento: (d, cv) => db.disponibilidade.salvarEmpreendimento(d, cv),
        listarBlocos: (d) => db.unidades.listarBlocos(d),
        salvarBlocos: (d, b) => db.unidades.salvarBlocos(d, b),
        conferencia: (d) => db.disponibilidade.conferencia(d),
        salvarVinculos: (d, v) => db.disponibilidade.salvarVinculos(d, v),
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
      p.divergentes.length + p.conflitos.length + p.soNoPoup.length + p.soNoCv.length + p.naoReconhecidas.length;
    return (
      <View style={styles.card}>
        <Text style={styles.titulo}>Importado</Text>
        <Text style={styles.texto}>
          {resultado.criouEmpreendimento ? 'Empreendimento criado. ' : ''}
          {resultado.unidadesNovas > 0
            ? `${resultado.unidadesNovas} unidades cadastradas${resultado.blocosNovos ? ` em ${resultado.blocosNovos} blocos novos` : ''}. `
            : ''}
          {resultado.vinculadas} unidades vinculadas ao CV
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
            {resultado.recusadas} unidades do CV sem bloco ou quadra legível não foram cadastradas.
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
        Importar {empreendimento.nome ?? 'empreendimento'} · CV {empreendimento.id}
      </Text>

      {!previa && !erroPrevia ? (
        <View style={styles.linha}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.texto}>Lendo o empreendimento no CV (pode levar alguns segundos)...</Text>
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
          <Text style={styles.secao}>No CV</Text>
          <Text style={styles.texto}>
            {previa.unidades} unidades
            {empreendimento.cidade ? ` · ${empreendimento.cidade}` : ''}
            {empreendimento.dataEntrega
              ? ` · entrega ${empreendimento.dataEntrega.slice(5, 7)}/${empreendimento.dataEntrega.slice(0, 4)}`
              : ''}
          </Text>
          <View style={styles.chips}>
            {Object.entries(previa.porSituacao).map(([k, n]) => (
              <Text key={k} style={styles.chip}>
                {k}: {n}
              </Text>
            ))}
          </View>
          {previa.aviso ? <Text style={styles.aviso}>{previa.aviso}</Text> : null}

          {previa.etapas.length > 1 ? (
            <>
              <Text style={styles.secao}>Etapa</Text>
              <Text style={styles.dica}>
                Este empreendimento do CV tem {previa.etapas.length} etapas. Escolha a que corresponde ao empreendimento do
                POUP (cada módulo cadastrado no POUP recebe a sua).
              </Text>
              <Select
                label="Etapa do CV"
                placeholder="Todas as etapas"
                value={etapa}
                options={[
                  { value: TODAS, label: `Todas (${previa.unidades} unidades)` },
                  ...previa.etapas.map((e) => ({ value: String(e.id), label: `${e.nome} (${e.unidades} unidades)` })),
                ]}
                onChange={(v) => setEtapa(v ?? TODAS)}
              />
            </>
          ) : null}

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

          <Text style={styles.dica}>O valor de venda continua vindo da tabela de preço enviada: o CV só pinta a disponibilidade.</Text>

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          {passo ? <Text style={styles.dica}>{passo}</Text> : null}
          <View style={styles.botoes}>
            <Button label="Importar" onPress={() => void importar()} loading={importando} disabled={unidades.length === 0} />
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
