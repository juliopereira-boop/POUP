/**
 * SIMULADOR DE POUPANÇA — BLOCO 2: UNIDADE E CLIENTE.
 *
 * ===========================================================================
 * O QUE MORA AQUI
 * ===========================================================================
 * Tudo que identifica a proposta e não muda a conta: construtora,
 * empreendimento, bloco, unidade, o cliente e o correspondente. A conta já foi
 * feita no bloco 1 e continua à vista no topo.
 *
 * ===========================================================================
 * A UNIDADE VEM DO CADASTRO, E O PREÇO DELA CONFERE O VALOR DIGITADO
 * ===========================================================================
 * Quando o empreendimento tem blocos cadastrados, o corretor escolhe a unidade
 * numa lista em vez de digitar — e se a unidade tem preço na tabela:
 *
 *   * valor de venda ainda vazio → é preenchido pela tabela;
 *   * valor de venda diferente   → o aplicativo mostra a diferença e oferece
 *                                  usar o da tabela, SEM trocar sozinho.
 *
 * Trocar sozinho seria errado: o corretor pode ter negociado um valor diferente
 * da tabela com o cliente, e a proposta tem que sair com o valor combinado.
 *
 * Empreendimento sem blocos (ou a migration ainda não rodada) cai no jeito de
 * sempre: bloco e unidade digitados.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { NumberPickerField } from '@/components/NumberPickerField';
import { ScanDocumentButton } from '@/components/ScanDocumentButton';
import { Select } from '@/components/Select';
import { CascoSimulador } from '@/components/simulador/CascoSimulador';
import { EtapasSimulador } from '@/components/simulador/EtapasSimulador';
import { ProponenteCampos } from '@/components/simulador/ProponenteCampos';
import { ResumoPoupanca } from '@/components/simulador/ResumoPoupanca';
import {
  db,
  type Company,
  type Correspondent,
  type Development,
  type DevelopmentBlock,
} from '@/data';
import { computePoupanca } from '@/features/simulador/calc';
import {
  pendencias,
  pendenciasDosValores,
  proponenteCompleto,
  type Pendencia,
} from '@/features/simulador/pendencias';
import {
  ASSOCIATION_OPTIONS,
  useSimulador,
  type Proponent,
} from '@/features/simulador/SimuladorProvider';
import { useGerarProposta } from '@/features/simulador/useGerarProposta';
import type { ScannedDocument } from '@/lib/documentScan';
import { currencyToNumber, formatCPF, formatCurrencyBRL } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Reais para o formato do campo de moeda ("R$ 250.000,00"). */
function paraCampo(reais: number): string {
  return formatCurrencyBRL(String(Math.round(reais * 100)));
}

export default function SimuladorDados() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const sim = useSimulador();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [correspondents, setCorrespondents] = useState<Correspondent[]>([]);
  const [blocos, setBlocos] = useState<DevelopmentBlock[]>([]);
  const [blocosCarregados, setBlocosCarregados] = useState(false);
  const [digitarUnidade, setDigitarUnidade] = useState(false);
  const [clienteAberto, setClienteAberto] = useState(() => !proponenteCompleto(sim.proponent1));
  const [preenchidoPelaTabela, setPreenchidoPelaTabela] = useState(false);
  const [faltando, setFaltando] = useState<Pendencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { gerar, gerando } = useGerarProposta({ companies, developments });

  // ------------------------------------------------------------ carregar

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    void Promise.all([db.companies.list(user.id), db.developments.list(user.id)]).then(([c, d]) => {
      if (!vivo) return;
      setCompanies(c);
      setDevelopments(d);
    });
    return () => {
      vivo = false;
    };
  }, [user]);

  useEffect(() => {
    let vivo = true;
    if (!sim.companyId) {
      setCorrespondents([]);
      return;
    }
    void db.companies.listCorrespondents(sim.companyId).then((lista) => {
      if (vivo) setCorrespondents(lista);
    });
    return () => {
      vivo = false;
    };
  }, [sim.companyId]);

  useEffect(() => {
    let vivo = true;
    setBlocosCarregados(false);
    if (!sim.developmentId) {
      setBlocos([]);
      setBlocosCarregados(true);
      return;
    }
    void db.unidades.listarBlocos(sim.developmentId).then((res) => {
      if (!vivo) return;
      // Sem a migration, ou com erro de leitura: o simulador segue com a
      // unidade digitada, como sempre funcionou. Não é motivo para travar.
      setBlocos(res.ok ? res.data : []);
      setBlocosCarregados(true);
    });
    return () => {
      vivo = false;
    };
  }, [sim.developmentId]);

  // As regras da construtora (risco, máximo de parcelas) valem assim que ela é
  // conhecida — inclusive quando veio preenchida do lead.
  const aplicarRegras = useCallback(
    (c: Company | undefined) => {
      sim.setField('companyRisk', c?.risk ?? null);
      sim.setField('companyMaxInstallments', c?.maxInstallments ?? null);
      sim.setField('companyMaxSemiannual', c?.maxSemiannual ?? null);
      sim.setField('companyMaxAnnual', c?.maxAnnual ?? null);
      sim.setField('companyCoincide', c?.coincideInstallments ?? true);
    },
    [sim],
  );
  const regrasDe = useRef<string | null>(null);
  useEffect(() => {
    if (!sim.companyId || companies.length === 0) return;
    if (regrasDe.current === sim.companyId) return;
    regrasDe.current = sim.companyId;
    aplicarRegras(companies.find((c) => c.id === sim.companyId));
  }, [sim.companyId, companies, aplicarRegras]);

  // ------------------------------------------------------------ derivados

  const dev = developments.find((d) => d.id === sim.developmentId) ?? null;
  const opcoesEmpresa = companies.map((c) => ({ value: c.id, label: c.name }));
  const opcoesEmpreendimento = useMemo(
    () =>
      developments
        .filter((d) => d.companyId === sim.companyId)
        .map((d) => ({ value: d.id, label: d.name })),
    [developments, sim.companyId],
  );

  const temBlocos = blocos.length > 0;
  const modoLista = temBlocos && !digitarUnidade;
  const blocoEscolhido = blocos.find((b) => b.id === sim.blockId) ?? null;
  const unidadeEscolhida = blocoEscolhido?.unidades.find((u) => u.id === sim.unitId) ?? null;

  const precoTabela = unidadeEscolhida?.valor ?? null;
  const valorInformado = currencyToNumber(sim.unitValue);
  const divergeDaTabela = precoTabela != null && Math.abs(precoTabela - valorInformado) >= 0.01;

  const faltaNosValores = pendenciasDosValores(sim);
  const poupanca = computePoupanca(sim);
  const pctPoupanca = valorInformado > 0 ? (poupanca / valorInformado) * 100 : 0;

  // ------------------------------------------------------------ ações

  function limparUnidade() {
    sim.setField('blockId', null);
    sim.setField('blockName', '');
    sim.setField('block', 0);
    sim.setField('unit', '');
    sim.setField('unitId', null);
    setPreenchidoPelaTabela(false);
  }

  function escolherEmpresa(id: string) {
    sim.setField('companyId', id);
    sim.setField('developmentId', null);
    sim.setField('correspondentId', null);
    sim.setField('correspondentName', null);
    limparUnidade();
    setDigitarUnidade(false);
    regrasDe.current = id;
    aplicarRegras(companies.find((c) => c.id === id));
  }

  function escolherEmpreendimento(id: string) {
    sim.setField('developmentId', id);
    limparUnidade();
    setDigitarUnidade(false);
  }

  function escolherBloco(id: string) {
    const b = blocos.find((x) => x.id === id);
    if (!b) return;
    sim.setField('blockId', b.id);
    sim.setField('blockName', b.nome);
    // Número para vendas e relatórios, que leem o bloco como número.
    sim.setField('block', b.ordem + 1);
    sim.setField('unit', '');
    sim.setField('unitId', null);
    setPreenchidoPelaTabela(false);
  }

  function escolherUnidade(id: string) {
    const u = blocoEscolhido?.unidades.find((x) => x.id === id);
    if (!u) return;
    sim.setField('unit', u.codigo);
    sim.setField('unitId', u.id);
    // Só preenche o que está VAZIO. Valor já digitado pode ser o combinado com
    // o cliente — a diferença aparece logo abaixo, e quem decide é o corretor.
    if (u.valor != null && currencyToNumber(sim.unitValue) <= 0) {
      sim.setField('unitValue', paraCampo(u.valor));
      setPreenchidoPelaTabela(true);
    } else {
      setPreenchidoPelaTabela(false);
    }
  }

  function passarParaDigitacao() {
    setDigitarUnidade(true);
    sim.setField('blockId', null);
    sim.setField('unitId', null);
  }

  function escolherCorrespondente(id: string) {
    sim.setField('correspondentId', id);
    sim.setField('correspondentName', correspondents.find((c) => c.id === id)?.name ?? null);
  }

  function aplicarLeitura(r: ScannedDocument, set: (patch: Partial<Proponent>) => void) {
    set({ name: r.fullName || '', cpf: r.cpf ? formatCPF(r.cpf) : '' });
  }

  const irParaValores = () => router.dismissTo('/(app)/simulador');

  async function gerarProposta() {
    setErro(null);
    const lista = pendencias(sim, { exigeCorrespondente: correspondents.length > 0 });
    if (lista.length > 0) {
      setFaltando(lista);
      if (lista.some((p) => p.bloco === 2 && /proponente/.test(p.mensagem))) setClienteAberto(true);
      return;
    }
    setFaltando(null);
    const e = await gerar();
    if (e) setErro(e);
  }

  // ------------------------------------------------------------ tela

  const topo = (
    <>
      <EtapasSimulador atual={2} onIrPara={(e) => e === 1 && irParaValores()} />
      <ResumoPoupanca compacto onEditar={irParaValores} />
    </>
  );

  const p1 = sim.proponent1;

  return (
    <CascoSimulador topo={topo}>
      {faltaNosValores.length > 0 ? (
        <View style={styles.alerta}>
          <Text style={styles.alertaTitulo}>Ainda falta nos valores</Text>
          {faltaNosValores.map((p) => (
            <Text key={p.mensagem} style={styles.alertaItem}>
              • {p.mensagem}
            </Text>
          ))}
          <Button label="Ir para os valores" variant="secondary" onPress={irParaValores} />
        </View>
      ) : null}

      {/* ---------------------------------------------------------- imóvel */}
      <Text style={styles.secao}>O imóvel</Text>
      <Select
        label="Construtora"
        placeholder="Escolha a construtora"
        value={sim.companyId}
        options={opcoesEmpresa}
        onChange={escolherEmpresa}
        emptyHint="Cadastre uma construtora em Ajustes › Cadastros."
      />
      <Select
        label="Empreendimento"
        placeholder={sim.companyId ? 'Escolha o empreendimento' : 'Escolha a construtora primeiro'}
        value={sim.developmentId}
        options={opcoesEmpreendimento}
        onChange={escolherEmpreendimento}
        emptyHint="Nenhum empreendimento para esta construtora."
        searchable={opcoesEmpreendimento.length > 8}
      />

      {sim.developmentId && blocosCarregados ? (
        modoLista ? (
          <>
            <View style={styles.row}>
              <View style={styles.col}>
                <Select
                  label="Bloco"
                  placeholder="Escolha"
                  value={sim.blockId}
                  options={blocos.map((b) => ({ value: b.id, label: b.nome }))}
                  onChange={escolherBloco}
                />
              </View>
              <View style={styles.col}>
                <Select
                  label="Unidade"
                  placeholder={blocoEscolhido ? 'Escolha' : 'Bloco primeiro'}
                  value={sim.unitId}
                  options={(blocoEscolhido?.unidades ?? []).map((u) => ({
                    value: u.id,
                    label: u.valor != null ? `${u.codigo} · ${brl(u.valor)}` : u.codigo,
                  }))}
                  onChange={escolherUnidade}
                  searchable={(blocoEscolhido?.unidades.length ?? 0) > 12}
                  emptyHint="Escolha o bloco primeiro."
                />
              </View>
            </View>
            <Pressable onPress={passarParaDigitacao} hitSlop={6} style={styles.linkLinha}>
              <Text style={styles.link}>A unidade não está na lista? Digitar à mão</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <View style={styles.col}>
                <NumberPickerField
                  label="Bloco / Quadra"
                  min={0}
                  max={100}
                  value={sim.block}
                  onChange={(n) => {
                    sim.setField('block', n);
                    sim.setField('blockName', '');
                    sim.setField('blockId', null);
                  }}
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Unidade"
                  value={sim.unit}
                  onChangeText={(t) => {
                    sim.setField('unit', t);
                    sim.setField('unitId', null);
                  }}
                  placeholder="Ex.: 101"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
                />
              </View>
            </View>
            {temBlocos ? (
              <Pressable onPress={() => setDigitarUnidade(false)} hitSlop={6} style={styles.linkLinha}>
                <Text style={styles.link}>Escolher da lista de unidades</Text>
              </Pressable>
            ) : dev && !dev.isCatalog ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/(app)/cadastros/unidades', params: { developmentId: dev.id } })
                }
                hitSlop={6}
                style={styles.linkLinha}
              >
                <Text style={styles.link}>Cadastrar os blocos deste empreendimento</Text>
              </Pressable>
            ) : null}
          </>
        )
      ) : null}

      {/* O preço da tabela conferindo o valor que veio do bloco 1. */}
      {precoTabela != null && preenchidoPelaTabela && !divergeDaTabela ? (
        <Text style={styles.okTabela}>Valor de venda preenchido pela tabela: {brl(precoTabela)}.</Text>
      ) : null}
      {precoTabela != null && !preenchidoPelaTabela && !divergeDaTabela ? (
        <Text style={styles.okTabela}>Confere com a tabela de preços.</Text>
      ) : null}
      {divergeDaTabela && precoTabela != null ? (
        <View style={styles.diverge}>
          <Text style={styles.divergeTexto}>
            Na tabela, a unidade {unidadeEscolhida?.codigo} está {brl(precoTabela)}. O valor de venda
            informado é {brl(valorInformado)}.
          </Text>
          <Button
            label={`Usar ${brl(precoTabela)}`}
            variant="secondary"
            onPress={() => {
              sim.setField('unitValue', paraCampo(precoTabela));
              setPreenchidoPelaTabela(true);
            }}
          />
        </View>
      ) : null}

      {sim.companyRisk != null && valorInformado > 0 ? (
        <Text style={pctPoupanca <= sim.companyRisk ? styles.okTabela : styles.foraRisco}>
          Poupança em {pctPoupanca.toFixed(1).replace('.', ',')}% do valor · risco da construtora:{' '}
          {sim.companyRisk}%{pctPoupanca <= sim.companyRisk ? ' ✓' : ' — acima do permitido'}
        </Text>
      ) : null}

      {/* ---------------------------------------------------------- cliente */}
      <Text style={styles.secao}>O cliente</Text>
      {!clienteAberto && proponenteCompleto(p1) ? (
        <Pressable onPress={() => setClienteAberto(true)} style={styles.resumo} accessibilityRole="button">
          <View style={styles.flex1}>
            <Text style={styles.resumoNome}>{p1.name}</Text>
            <Text style={styles.resumoDetalhe}>
              CPF {p1.cpf} · Renda {p1.rendaBruta}
            </Text>
            <Text style={styles.resumoDetalhe}>
              {p1.contact} · {p1.email}
            </Text>
          </View>
          <Text style={styles.link}>Editar</Text>
        </Pressable>
      ) : (
        <View style={styles.card}>
          <View style={styles.cardTopo}>
            <Text style={styles.cardTitulo}>1º proponente</Text>
            <ScanDocumentButton onScanned={(r) => aplicarLeitura(r, sim.setProponent1)} />
          </View>
          <ProponenteCampos value={sim.proponent1} onChange={sim.setProponent1} />
        </View>
      )}

      {sim.hasSecondProponent ? (
        <View style={styles.card}>
          <View style={styles.cardTopo}>
            <Text style={styles.cardTitulo}>2º proponente</Text>
            <View style={styles.cardAcoes}>
              <ScanDocumentButton onScanned={(r) => aplicarLeitura(r, sim.setProponent2)} />
              <Button label="Remover" variant="ghost" onPress={() => sim.setField('hasSecondProponent', false)} />
            </View>
          </View>
          <Select
            label="Tipo de associação"
            placeholder="Selecione"
            value={sim.association}
            options={ASSOCIATION_OPTIONS}
            onChange={(v) => sim.setField('association', v as typeof sim.association)}
          />
          <ProponenteCampos value={sim.proponent2} onChange={sim.setProponent2} />
        </View>
      ) : (
        <Button
          label="+ 2º proponente"
          variant="secondary"
          onPress={() => sim.setField('hasSecondProponent', true)}
          style={styles.addBtn}
        />
      )}

      {/* ------------------------------------------ corretor e correspondente */}
      <Text style={styles.secao}>Corretor e correspondente</Text>
      <View style={styles.resumo}>
        <View style={styles.flex1}>
          <Text style={styles.resumoNome}>{profile?.fullName?.trim() || 'Seu nome não está no perfil'}</Text>
          <Text style={styles.resumoDetalhe}>
            {[profile?.agency, dev?.managerName ? `Gerente: ${dev.managerName}` : null]
              .filter(Boolean)
              .join(' · ') || 'Imobiliária não informada'}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(app)/perfil')} hitSlop={8}>
          <Text style={styles.link}>Perfil</Text>
        </Pressable>
      </View>
      {sim.companyId ? (
        <Select
          label="Correspondente"
          placeholder="Selecione o correspondente"
          value={sim.correspondentId}
          options={correspondents.map((c) => ({ value: c.id, label: c.name }))}
          onChange={escolherCorrespondente}
          emptyHint="Nenhum correspondente cadastrado para esta construtora."
        />
      ) : null}

      {/* ------------------------------------------------------------ gerar */}
      {faltando && faltando.length > 0 ? (
        <View style={styles.faltando}>
          <Text style={styles.faltandoTitulo}>Para gerar a proposta, falta:</Text>
          {faltando.map((p) => (
            <Text key={`${p.bloco}${p.mensagem}`} style={styles.faltandoItem}>
              • {p.mensagem}
              {p.bloco === 1 ? ' (valores)' : ''}
            </Text>
          ))}
          {faltando.some((p) => p.bloco === 1) ? (
            <Button label="Ir para os valores" variant="secondary" onPress={irParaValores} />
          ) : null}
        </View>
      ) : null}
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <Button label="Gerar proposta" onPress={() => void gerarProposta()} loading={gerando} style={styles.cta} />
    </CascoSimulador>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    secao: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    col: { flex: 1 },
    linkLinha: { marginTop: -spacing.sm, marginBottom: spacing.lg, alignSelf: 'flex-start' },
    link: { ...typography.label, color: colors.primary },

    alerta: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    alertaTitulo: { ...typography.label, color: colors.warning, marginBottom: spacing.xs },
    alertaItem: { ...typography.caption, color: colors.ink, marginBottom: spacing.xs },

    okTabela: {
      ...typography.caption,
      color: colors.success,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
    },
    foraRisco: {
      ...typography.caption,
      color: colors.danger,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
    },
    diverge: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    divergeTexto: { ...typography.caption, color: colors.ink },

    resumo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    resumoNome: { ...typography.body, color: colors.ink, fontWeight: '600' },
    resumoDetalhe: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },

    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardTopo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    cardAcoes: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardTitulo: { ...typography.heading, color: colors.ink },
    addBtn: { marginBottom: spacing.lg },

    faltando: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    faltandoTitulo: { ...typography.label, color: colors.danger, marginBottom: spacing.xs },
    faltandoItem: { ...typography.caption, color: colors.ink, marginBottom: spacing.xs },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    cta: { marginTop: spacing.sm },
  });
