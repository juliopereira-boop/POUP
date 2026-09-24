/**
 * A TABELA DE PREÇO DE UM EMPREENDIMENTO.
 *
 * ===========================================================================
 * O CAMINHO DO MÊS
 * ===========================================================================
 * A construtora manda o PDF. O corretor envia aqui (ou no cadastro do
 * empreendimento), o servidor tira o texto, o POUP entende as linhas de preço e
 * a lista de vagas — e mostra tudo para conferir ANTES de salvar:
 *
 *   * as linhas lidas (andar · posição · vaga → avaliação e venda), editáveis;
 *   * a lista de vagas, e quantas unidades do cadastro ela alcança;
 *   * quantas unidades ficaram com preço, e o que falta para as outras.
 *
 * O preço de cada apartamento não é gravado: ele sai da combinação da tabela
 * com o cadastro (ver `features/tabelaPreco/preco.ts`). Por isso trocar a
 * tabela do mês é trocar estas linhas, e o simulador já usa os valores novos.
 *
 * ===========================================================================
 * O QUE NÃO ESTÁ AQUI: A VENTILAÇÃO
 * ===========================================================================
 * Quem é mais ou menos ventilado depende do BLOCO (os blocos costumam ser
 * espelhados), e mora no cadastro de blocos, no botão "Regra de ventilação".
 * Esta tela aponta os blocos que ainda não têm regra e leva até lá.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Segmento } from '@/components/Segmento';
import { Select } from '@/components/Select';
import { GradeDeUnidades } from '@/components/tabelaPreco/GradeDeUnidades';
import {
  db,
  type ArquivoDaTabela,
  type Development,
  type DevelopmentBlock,
  type ListaDeVagas,
  type RegraDePreco,
  type TabelaDePreco,
  type Vaga,
} from '@/data';
import { useIsAdmin } from '@/features/admin';
import { conferirListaDeVagas, lerTextoDaTabela, numeroBR, type LeituraDoPdf } from '@/features/tabelaPreco/importar';
import {
  coberturaDaTabela,
  descreverRegra,
  precificarBlocos,
  rotuloVaga,
  validarRegras,
} from '@/features/tabelaPreco/preco';
import {
  retirarLeitura,
  rotuloDaEtapa,
  useEnviarTabelaPdf,
} from '@/features/tabelaPreco/useEnviarTabelaPdf';
import { rotuloDoPavimento } from '@/features/unidades/gerador';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

// ---------------------------------------------------------------- edição

const QUALQUER = '*';

/** Os campos são texto enquanto o corretor digita. */
interface LinhaEditavel {
  chave: string;
  pavimento: string;
  ventilacao: string;
  vaga: string;
  area: string;
  avaliacao: string;
  venda: string;
}

interface Rascunho {
  referencia: string;
  linhas: LinhaEditavel[];
  vagas: ListaDeVagas | null;
  arquivo: ArquivoDaTabela | null;
}

let sequencia = 0;
function novaChave(): string {
  sequencia += 1;
  return `l${sequencia}`;
}

function paraCampo(reais: number): string {
  return formatCurrencyBRL(String(Math.round(reais * 100)));
}

function paraEditavel(r: RegraDePreco): LinhaEditavel {
  return {
    chave: novaChave(),
    pavimento: r.pavimento == null ? QUALQUER : String(r.pavimento),
    ventilacao: r.ventilacao ?? QUALQUER,
    vaga: r.vaga ?? QUALQUER,
    area: r.areaM2 == null ? '' : String(r.areaM2).replace('.', ','),
    avaliacao: r.avaliacao == null ? '' : paraCampo(r.avaliacao),
    venda: paraCampo(r.venda),
  };
}

function paraRegra(l: LinhaEditavel): RegraDePreco {
  const avaliacao = currencyToNumber(l.avaliacao);
  return {
    pavimento: l.pavimento === QUALQUER ? null : Number.parseInt(l.pavimento, 10),
    ventilacao: l.ventilacao === 'mais' || l.ventilacao === 'menos' ? l.ventilacao : null,
    vaga: l.vaga === 'carro' || l.vaga === 'moto' ? l.vaga : null,
    areaM2: l.area.trim() ? numeroBR(l.area) : null,
    avaliacao: avaliacao > 0 ? avaliacao : null,
    venda: currencyToNumber(l.venda),
  };
}

function rascunhoDe(t: TabelaDePreco | null): Rascunho {
  return {
    referencia: t?.referencia ?? '',
    linhas: (t?.regras ?? []).map(paraEditavel),
    vagas: t?.vagas ?? null,
    arquivo: t?.arquivo ?? null,
  };
}

function comoTabela(r: Rascunho): TabelaDePreco {
  return {
    referencia: r.referencia.trim(),
    atualizadoEm: null,
    regras: r.linhas.map(paraRegra),
    vagas: r.vagas,
    arquivo: r.arquivo,
  };
}

/** O que decide se há algo por salvar. */
function assinatura(r: Rascunho): string {
  const t = comoTabela(r);
  return JSON.stringify([t.referencia, t.regras, t.vagas, t.arquivo?.path ?? null]);
}

function confirmar(titulo: string, texto: string, acao: string, executar: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(texto)) executar();
    return;
  }
  Alert.alert(titulo, texto, [
    { text: 'Cancelar', style: 'cancel' },
    { text: acao, style: 'destructive', onPress: executar },
  ]);
}

function dataCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

// ==========================================================================

export default function TabelaPrecoScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { developmentId } = useLocalSearchParams<{ developmentId?: string }>();

  const [dev, setDev] = useState<Development | null>(null);
  const [blocos, setBlocos] = useState<DevelopmentBlock[]>([]);
  const [salva, setSalva] = useState<TabelaDePreco | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho>(rascunhoDe(null));
  const [assinaturaSalva, setAssinaturaSalva] = useState(assinatura(rascunhoDe(null)));
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [lido, setLido] = useState<{ mensagem: string; avisos: string[] } | null>(null);
  const [colarAberto, setColarAberto] = useState(false);
  const [textoColado, setTextoColado] = useState('');
  const [blocoConferido, setBlocoConferido] = useState<string | null>(null);
  const [verTodasNaoEncontradas, setVerTodasNaoEncontradas] = useState(false);

  const envio = useEnviarTabelaPdf(developmentId ?? null);
  const podeEditar = Boolean(dev) && (!dev?.isCatalog || isAdmin) && !migracaoPendente;

  // ------------------------------------------------------------ carregar

  const aplicarLeitura = useCallback((l: LeituraDoPdf, arquivo: ArquivoDaTabela | null, paginas?: number) => {
    setSucesso(null);
    setErro(null);
    setRascunho((r) => ({
      // A tabela nova traz o mês dela; sem mês no texto, fica o que estava.
      referencia: l.referencia ?? r.referencia,
      linhas: l.regras.length > 0 ? l.regras.map(paraEditavel) : r.linhas,
      vagas: l.vagas ?? r.vagas,
      arquivo: arquivo ?? r.arquivo,
    }));
    const partes = [
      l.regras.length > 0 ? `${l.regras.length} linha(s) de preço` : null,
      l.vagas ? `${l.vagas.unidades.length} unidade(s) com vaga de ${l.vagas.vagaDaLista}` : null,
    ].filter(Boolean);
    setLido({
      mensagem: `Lido${paginas ? ` (${paginas} página${paginas > 1 ? 's' : ''})` : ''}: ${partes.join(' e ')}. Confira abaixo e toque em "Salvar tabela".`,
      avisos: l.avisos,
    });
  }, []);

  const carregar = useCallback(async () => {
    if (!user || !developmentId) return;
    setCarregando(true);
    const [devs, b, t] = await Promise.all([
      db.developments.list(user.id),
      db.unidades.listarBlocos(developmentId),
      db.tabelaPreco.carregar(developmentId),
    ]);
    setDev(devs.find((d) => d.id === developmentId) ?? null);
    setBlocos(b.ok ? b.data : []);
    if (t.ok) {
      const r = rascunhoDe(t.data);
      setSalva(t.data);
      setRascunho(r);
      setAssinaturaSalva(assinatura(r));
      setAviso(null);
      setMigracaoPendente(false);
    } else {
      setAviso(t.error);
      setMigracaoPendente(t.migracaoPendente);
    }
    setCarregando(false);

    // Veio do cadastro do empreendimento com um PDF acabado de ler.
    const pendente = retirarLeitura(developmentId);
    if (pendente && t.ok) aplicarLeitura(pendente.leitura, pendente.arquivo, pendente.paginas);
  }, [user, developmentId, aplicarLeitura]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // ------------------------------------------------------------ derivados

  const tabelaDoRascunho = useMemo(() => comoTabela(rascunho), [rascunho]);
  const precificados = useMemo(() => precificarBlocos(blocos, tabelaDoRascunho), [blocos, tabelaDoRascunho]);
  const cobertura = useMemo(() => coberturaDaTabela(precificados), [precificados]);
  const conferencia = useMemo(() => conferirListaDeVagas(blocos, rascunho.vagas), [blocos, rascunho.vagas]);

  const maiorPavimento = Math.max(
    4,
    ...blocos.flatMap((b) => b.unidades.map((u) => u.pavimento)),
    ...rascunho.linhas.map((l) => Number.parseInt(l.pavimento, 10)).filter(Number.isFinite),
  );
  const opcoesAndar = [
    { value: QUALQUER, label: 'Qualquer andar' },
    ...Array.from({ length: maiorPavimento }, (_, i) => ({ value: String(i + 1), label: rotuloDoPavimento(i + 1) })),
  ];

  const pendente = podeEditar && assinatura(rascunho) !== assinaturaSalva;
  const blocoEmConferencia = precificados.find((b) => b.id === blocoConferido) ?? precificados[0] ?? null;

  // ------------------------------------------------------------ sair sem salvar

  const pendenteRef = useRef(pendente);
  pendenteRef.current = pendente;
  useEffect(() => {
    const cancelar = navigation.addListener('beforeRemove', (e) => {
      if (!pendenteRef.current) return;
      e.preventDefault();
      const sair = () => navigation.dispatch(e.data.action);
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (window.confirm('A tabela tem alterações que ainda não foram salvas. Sair mesmo assim?')) sair();
        return;
      }
      Alert.alert('Alterações não salvas', 'A tabela de preço que você mudou ainda não foi salva.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Sair sem salvar', style: 'destructive', onPress: sair },
      ]);
    });
    return cancelar;
  }, [navigation]);

  // ------------------------------------------------------------ ações

  function mudar(patch: Partial<Rascunho>) {
    setSucesso(null);
    setRascunho((r) => ({ ...r, ...patch }));
  }

  function mudarLinha(chave: string, patch: Partial<LinhaEditavel>) {
    setSucesso(null);
    setRascunho((r) => ({ ...r, linhas: r.linhas.map((l) => (l.chave === chave ? { ...l, ...patch } : l)) }));
  }

  function adicionarLinha() {
    const ultima = rascunho.linhas.at(-1);
    const nova: LinhaEditavel = ultima
      ? { ...ultima, chave: novaChave() }
      : { chave: novaChave(), pavimento: '1', ventilacao: QUALQUER, vaga: QUALQUER, area: '', avaliacao: '', venda: '' };
    mudar({ linhas: [...rascunho.linhas, nova] });
  }

  function removerLinha(chave: string) {
    mudar({ linhas: rascunho.linhas.filter((l) => l.chave !== chave) });
  }

  function mudarVagas(patch: Partial<ListaDeVagas>) {
    const base: ListaDeVagas = rascunho.vagas ?? { vagaDaLista: 'moto', vagaDasDemais: null, unidades: [] };
    const nova = { ...base, ...patch };
    mudar({ vagas: nova.unidades.length === 0 && nova.vagaDasDemais == null ? null : nova });
  }

  async function enviarPdf() {
    setLido(null);
    const r = await envio.enviar();
    if (r) aplicarLeitura(r.leitura, r.arquivo, r.paginas);
  }

  function lerColado() {
    const l = lerTextoDaTabela(textoColado);
    if (l.regras.length === 0 && !l.vagas) {
      setErro('Não encontrei linhas de preço nem lista de vagas no texto colado.');
      setColarAberto(false);
      return;
    }
    aplicarLeitura(l, null);
    setColarAberto(false);
    setTextoColado('');
  }

  async function verPdf() {
    if (!rascunho.arquivo) return;
    const url = await db.tabelaPreco.linkDoPdf(rascunho.arquivo.path);
    if (!url) {
      setErro('Não foi possível abrir o PDF agora.');
      return;
    }
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }

  async function gravar(tabela: TabelaDePreco | null) {
    if (!developmentId) return;
    setSalvando(true);
    const res = await db.tabelaPreco.salvar(developmentId, tabela);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    const r = rascunhoDe(res.data);
    setSalva(res.data);
    setRascunho(r);
    setAssinaturaSalva(assinatura(r));
    setLido(null);
    setSucesso(
      res.data
        ? `Tabela salva. ${cobertura.comPreco.toLocaleString('pt-BR')} de ${cobertura.total.toLocaleString('pt-BR')} unidades com preço — o simulador já usa estes valores.`
        : 'Tabela apagada.',
    );
  }

  function salvar() {
    setErro(null);
    setSucesso(null);
    const tabela = comoTabela(rascunho);
    const falhaDeLinha = rascunho.linhas.findIndex((l) => !l.venda.trim() || currencyToNumber(l.venda) <= 0);
    if (falhaDeLinha >= 0) return setErro(`Linha ${falhaDeLinha + 1}: informe o valor de venda.`);
    const v = validarRegras(tabela.regras);
    if (!v.ok) return setErro(v.erro);
    const vazia = tabela.regras.length === 0 && !tabela.vagas && !tabela.arquivo && !tabela.referencia;
    if (vazia) {
      if (!salva) return;
      confirmar('Apagar tabela', 'A tabela ficou vazia. Apagar a tabela de preço deste empreendimento?', 'Apagar', () =>
        void gravar(null),
      );
      return;
    }
    void gravar(tabela);
  }

  function apagar() {
    confirmar(
      'Apagar tabela',
      'Apagar a tabela de preço deste empreendimento? O simulador deixa de preencher o valor de venda pela tabela.',
      'Apagar',
      () => void gravar(null),
    );
  }

  // ------------------------------------------------------------ tela

  if (!developmentId) {
    return (
      <Screen>
        <Text style={styles.muted}>Abra esta tela a partir de um empreendimento, em Cadastros.</Text>
      </Screen>
    );
  }

  if (carregando) {
    return (
      <Screen center>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const etapa = rotuloDaEtapa(envio.etapa);
  const semBlocos = blocos.length === 0;
  const pct = cobertura.total > 0 ? Math.round((cobertura.comPreco / cobertura.total) * 100) : 0;
  const naoEncontradas = verTodasNaoEncontradas
    ? conferencia.naoEncontradas
    : conferencia.naoEncontradas.slice(0, 8);

  return (
    <Screen>
      <Text style={styles.eyebrow}>{dev?.companyName ?? 'Empreendimento'}</Text>
      <Text style={styles.title}>{dev?.name ?? 'Tabela de preço'}</Text>
      <Text style={styles.subtitle}>
        {salva
          ? `Tabela${salva.referencia ? ` de ${salva.referencia}` : ''}${salva.atualizadoEm ? ` · atualizada em ${dataCurta(salva.atualizadoEm)}` : ''}`
          : 'Nenhuma tabela de preço ainda.'}
      </Text>

      {aviso ? <Text style={styles.warn}>{aviso}</Text> : null}
      {dev?.isCatalog && !isAdmin ? (
        <Text style={styles.info}>Empreendimento do catálogo: a tabela é mantida pelo POUP.</Text>
      ) : null}

      {/* ------------------------------------------------------ o PDF */}
      <View style={styles.card}>
        <Text style={styles.cardTitulo}>PDF da tabela</Text>
        {rascunho.arquivo ? (
          <Pressable onPress={() => void verPdf()} style={styles.arquivo} accessibilityRole="link">
            <Text style={styles.arquivoIcone}>PDF</Text>
            <View style={styles.flex1}>
              <Text style={styles.arquivoNome} numberOfLines={2}>
                {rascunho.arquivo.nome}
              </Text>
              <Text style={styles.link}>Abrir o PDF</Text>
            </View>
          </Pressable>
        ) : (
          <Text style={styles.cardTexto}>
            Envie o PDF que a construtora mandou. O POUP lê as linhas de preço e a lista de vagas, e você
            confere antes de salvar.
          </Text>
        )}
        {podeEditar ? (
          <>
            <Button
              label={rascunho.arquivo ? 'Enviar tabela nova (PDF)' : 'Enviar o PDF da tabela'}
              onPress={() => void enviarPdf()}
              loading={envio.etapa !== 'parado'}
              style={styles.mt}
            />
            {etapa ? <Text style={styles.etapa}>{etapa}</Text> : null}
            <Pressable onPress={() => setColarAberto(true)} hitSlop={6} style={styles.linkLinha}>
              <Text style={styles.link}>Ou cole o texto da tabela</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {envio.erro ? <Text style={styles.error}>{envio.erro}</Text> : null}
      {lido ? (
        <View style={styles.lido}>
          <Text style={styles.lidoTexto}>{lido.mensagem}</Text>
          {lido.avisos.map((a) => (
            <Text key={a} style={styles.lidoAviso}>
              • {a}
            </Text>
          ))}
        </View>
      ) : null}

      {/* ------------------------------------------------------ conferência */}
      {tabelaDoRascunho.regras.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Conferência</Text>
          {semBlocos ? (
            <>
              <Text style={styles.cardTexto}>
                Cadastre os blocos e as unidades para ver o preço de cada apartamento. A tabela e a lista de
                vagas ficam guardadas e valem para os blocos que você cadastrar depois.
              </Text>
              <Button
                label="Cadastrar blocos e unidades"
                variant="secondary"
                onPress={() => router.push({ pathname: '/(app)/cadastros/unidades', params: { developmentId } })}
                style={styles.mt}
              />
            </>
          ) : (
            <>
              <Text style={styles.cobertura}>
                {cobertura.comPreco.toLocaleString('pt-BR')} de {cobertura.total.toLocaleString('pt-BR')} unidades
                com preço
              </Text>
              <View style={styles.barra}>
                <View style={[styles.barraCheia, { width: `${pct}%` }]} />
              </View>
              {cobertura.faltas.map((f) => (
                <View key={f.motivo} style={styles.falta}>
                  <Text style={styles.faltaTexto}>
                    {f.quantidade.toLocaleString('pt-BR')} {f.mensagem}: {f.blocos.slice(0, 6).join(', ')}
                    {f.blocos.length > 6 ? ` e mais ${f.blocos.length - 6}` : ''}.
                  </Text>
                  {f.motivo === 'sem_ventilacao' || f.motivo === 'sem_linha' ? (
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: '/(app)/cadastros/unidades', params: { developmentId } })
                      }
                      hitSlop={6}
                    >
                      <Text style={styles.link}>
                        {f.motivo === 'sem_ventilacao'
                          ? 'Definir a regra de ventilação'
                          : 'Conferir a regra de ventilação desses blocos'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </>
          )}
        </View>
      ) : null}

      {/* ------------------------------------------------------ referência e linhas */}
      <Input
        label="Referência (mês da tabela)"
        value={rascunho.referencia}
        onChangeText={(t) => mudar({ referencia: t.slice(0, 60) })}
        placeholder="Ex.: Setembro/2026"
        editable={podeEditar}
      />

      <Text style={styles.secao}>Linhas da tabela ({rascunho.linhas.length})</Text>
      {rascunho.linhas.length === 0 ? (
        <Text style={styles.muted}>Nenhuma linha ainda. Envie o PDF ou adicione à mão.</Text>
      ) : null}
      {rascunho.linhas.map((l, i) =>
        podeEditar ? (
          <View key={l.chave} style={styles.linha}>
            <View style={styles.linhaTopo}>
              <Text style={styles.linhaTitulo}>Linha {i + 1}</Text>
              <Pressable onPress={() => removerLinha(l.chave)} hitSlop={8} accessibilityLabel={`Remover linha ${i + 1}`}>
                <Text style={styles.deleteLink}>Remover</Text>
              </Pressable>
            </View>
            <Select
              label="Andar"
              value={l.pavimento}
              options={opcoesAndar}
              onChange={(v) => mudarLinha(l.chave, { pavimento: v })}
            />
            <View style={styles.row}>
              <View style={styles.col}>
                <Select
                  label="Posição"
                  value={l.ventilacao}
                  options={[
                    { value: QUALQUER, label: 'Qualquer' },
                    { value: 'mais', label: 'Mais ventilado' },
                    { value: 'menos', label: 'Menos ventilado' },
                  ]}
                  onChange={(v) => mudarLinha(l.chave, { ventilacao: v })}
                />
              </View>
              <View style={styles.col}>
                <Select
                  label="Vaga"
                  value={l.vaga}
                  options={[
                    { value: QUALQUER, label: 'Qualquer' },
                    { value: 'carro', label: 'Carro' },
                    { value: 'moto', label: 'Moto' },
                  ]}
                  onChange={(v) => mudarLinha(l.chave, { vaga: v })}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.colArea}>
                <Input
                  label="m²"
                  value={l.area}
                  onChangeText={(t) => mudarLinha(l.chave, { area: t.replace(/[^\d,]/g, '').slice(0, 8) })}
                  placeholder="40,94"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Avaliação"
                  value={l.avaliacao}
                  onChangeText={(t) => mudarLinha(l.chave, { avaliacao: formatCurrencyBRL(t) })}
                  placeholder="R$ 0,00"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Venda"
                  value={l.venda}
                  onChangeText={(t) => mudarLinha(l.chave, { venda: formatCurrencyBRL(t) })}
                  placeholder="R$ 0,00"
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        ) : (
          <View key={l.chave} style={styles.linhaLeitura}>
            <Text style={styles.linhaLeituraNome}>{descreverRegra(paraRegra(l))}</Text>
            <Text style={styles.linhaLeituraValor}>{l.venda}</Text>
          </View>
        ),
      )}
      {podeEditar ? (
        <Button label="+ Linha" variant="secondary" onPress={adicionarLinha} style={styles.addLinha} />
      ) : null}

      {/* ------------------------------------------------------ vagas */}
      <Text style={styles.secao}>Vagas</Text>
      <View style={styles.card}>
        {rascunho.vagas && rascunho.vagas.unidades.length > 0 ? (
          <>
            <Text style={styles.cardTexto}>
              A lista da construtora tem {rascunho.vagas.unidades.length.toLocaleString('pt-BR')} unidade(s)
              {semBlocos
                ? '. O de-para com o cadastro acontece quando os blocos forem cadastrados.'
                : `: ${conferencia.naLista.toLocaleString('pt-BR')} encontrada(s) no cadastro, e as outras ${conferencia.foraDaLista.toLocaleString('pt-BR')} unidades ficam com ${rotuloVaga(rascunho.vagas.vagaDasDemais).toLowerCase()}.`}
            </Text>
            <Segmento
              rotulo="Quem está na lista tem"
              opcoes={[
                { valor: 'moto', rotulo: 'Vaga de moto' },
                { valor: 'carro', rotulo: 'Vaga de carro' },
              ]}
              valor={rascunho.vagas.vagaDaLista}
              onMudar={(v) => mudarVagas({ vagaDaLista: v as Vaga })}
              desabilitado={!podeEditar}
              style={styles.mt}
            />
            <Segmento
              rotulo="Quem não está na lista tem"
              opcoes={[
                { valor: 'carro', rotulo: 'Carro' },
                { valor: 'moto', rotulo: 'Moto' },
                { valor: QUALQUER, rotulo: 'Não informar' },
              ]}
              valor={rascunho.vagas.vagaDasDemais ?? QUALQUER}
              onMudar={(v) => mudarVagas({ vagaDasDemais: v === QUALQUER ? null : (v as Vaga) })}
              desabilitado={!podeEditar}
              style={styles.mt}
            />
            {conferencia.naoEncontradas.length > 0 && !semBlocos ? (
              <View style={styles.naoEncontradas}>
                <Text style={styles.naoEncontradasTitulo}>
                  {conferencia.naoEncontradas.length} unidade(s) da lista não estão no cadastro:
                </Text>
                {naoEncontradas.map((n) => (
                  <Text key={`${n.item.bloco}|${n.item.unidade}`} style={styles.naoEncontradaItem}>
                    • Bloco {n.item.bloco}, unidade {n.item.unidade} — {n.motivo}
                  </Text>
                ))}
                {conferencia.naoEncontradas.length > naoEncontradas.length ? (
                  <Pressable onPress={() => setVerTodasNaoEncontradas(true)} hitSlop={6}>
                    <Text style={styles.link}>Ver todas</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {podeEditar ? (
              <Pressable
                onPress={() =>
                  confirmar('Remover lista', 'Remover a lista de vagas desta tabela?', 'Remover', () =>
                    mudar({ vagas: null }),
                  )
                }
                hitSlop={6}
                style={styles.linkLinha}
              >
                <Text style={styles.deleteLink}>Remover a lista de vagas</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.cardTexto}>
              Sem lista de vagas. Envie o PDF com a lista, ou diga a vaga de todas as unidades:
            </Text>
            <Segmento
              opcoes={[
                { valor: 'carro', rotulo: 'Todas carro' },
                { valor: 'moto', rotulo: 'Todas moto' },
                { valor: QUALQUER, rotulo: 'Não informar' },
              ]}
              valor={rascunho.vagas?.vagaDasDemais ?? QUALQUER}
              onMudar={(v) =>
                mudarVagas({
                  unidades: [],
                  vagaDasDemais: v === QUALQUER ? null : (v as Vaga),
                })
              }
              desabilitado={!podeEditar}
              style={styles.mt}
            />
          </>
        )}
      </View>

      {/* ------------------------------------------------------ preços por bloco */}
      {!semBlocos && tabelaDoRascunho.regras.length > 0 && blocoEmConferencia ? (
        <>
          <Text style={styles.secao}>Preço de cada unidade</Text>
          <View style={styles.chips}>
            {precificados.map((b) => {
              const ativo = b.id === blocoEmConferencia.id;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setBlocoConferido(b.id)}
                  style={[styles.chip, ativo && styles.chipAtivo]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                >
                  <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{b.nome}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardSub}>
              {blocoEmConferencia.nome} ·{' '}
              {blocoEmConferencia.terminacoesMaisVentiladas
                ? `mais ventilados: finais ${blocoEmConferencia.terminacoesMaisVentiladas.join(', ') || 'nenhum'}`
                : 'sem regra de ventilação'}
            </Text>
            <GradeDeUnidades unidades={blocoEmConferencia.unidades} />
            {(() => {
              const semPreco = blocoEmConferencia.unidades.find((u) => !u.preco.ok);
              return semPreco && !semPreco.preco.ok ? (
                <Text style={styles.faltaTexto}>
                  Unidade {semPreco.codigo}: {semPreco.preco.mensagem}
                </Text>
              ) : null;
            })()}
          </View>
        </>
      ) : null}

      {/* ------------------------------------------------------ salvar */}
      {erro ? <Text style={styles.error}>{erro}</Text> : null}
      {sucesso ? <Text style={styles.success}>{sucesso}</Text> : null}
      {podeEditar ? (
        <>
          <Button
            label={pendente ? 'Salvar tabela' : 'Tudo salvo'}
            onPress={salvar}
            loading={salvando}
            disabled={!pendente}
          />
          {salva ? (
            <Pressable onPress={apagar} hitSlop={6} style={styles.apagar}>
              <Text style={styles.deleteLink}>Apagar a tabela de preço</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <Modal visible={colarAberto} transparent animationType="fade" onRequestClose={() => setColarAberto(false)}>
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <Text style={styles.modalTitulo}>Colar o texto da tabela</Text>
            <Text style={styles.cardTexto}>
              Abra o PDF, selecione tudo, copie e cole aqui. O POUP acha as linhas de preço e a lista de vagas
              sozinho.
            </Text>
            <TextInput
              value={textoColado}
              onChangeText={setTextoColado}
              multiline
              placeholder="TÉRREO  MAIS VENTILADO  Moto  40,94  R$ 231.900,00  R$ 244.780,00…"
              placeholderTextColor={colors.inkSubtle}
              style={styles.colar}
              accessibilityLabel="Texto da tabela"
            />
            <View style={styles.row}>
              <Button label="Cancelar" variant="ghost" onPress={() => setColarAberto(false)} style={styles.col} />
              <Button label="Ler o texto" onPress={lerColado} disabled={!textoColado.trim()} style={styles.col} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    mt: { marginTop: spacing.md },
    eyebrow: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    title: { ...typography.title, color: colors.ink, marginTop: 2 },
    subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    muted: { ...typography.body, color: colors.inkSubtle, marginBottom: spacing.md },
    warn: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    info: {
      ...typography.caption,
      color: colors.inkMuted,
      backgroundColor: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    secao: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardTitulo: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
    cardSub: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.md },
    cardTexto: { ...typography.caption, color: colors.inkMuted },
    arquivo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    arquivoIcone: {
      ...typography.caption,
      fontWeight: '800',
      color: colors.white,
      backgroundColor: colors.danger,
      paddingHorizontal: 6,
      paddingVertical: 10,
      borderRadius: 4,
      overflow: 'hidden',
    },
    arquivoNome: { ...typography.label, color: colors.ink },
    etapa: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm, textAlign: 'center' },
    linkLinha: { marginTop: spacing.md, alignSelf: 'flex-start' },
    link: { ...typography.label, color: colors.primary },
    lido: {
      backgroundColor: colors.successSoft,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: spacing.xs,
    },
    lidoTexto: { ...typography.caption, color: colors.success, fontWeight: '600' },
    lidoAviso: { ...typography.caption, color: colors.ink },

    cobertura: { ...typography.body, color: colors.ink, fontWeight: '600' },
    barra: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfaceAlt,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    barraCheia: { height: 8, backgroundColor: colors.success },
    falta: { gap: spacing.xs, marginTop: spacing.sm },
    faltaTexto: { ...typography.caption, color: colors.warning, marginTop: spacing.sm },

    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    col: { flex: 1 },
    colArea: { width: 76 },
    linha: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      paddingBottom: spacing.xs,
      marginBottom: spacing.md,
    },
    linhaTopo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    linhaTitulo: { ...typography.label, color: colors.ink },
    linhaLeitura: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    linhaLeituraNome: { ...typography.caption, color: colors.ink, flex: 1 },
    linhaLeituraValor: { ...typography.label, color: colors.ink, fontVariant: ['tabular-nums'] },
    addLinha: { marginBottom: spacing.lg },

    naoEncontradas: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.warningSoft,
      gap: 2,
    },
    naoEncontradasTitulo: { ...typography.caption, color: colors.warning, fontWeight: '700' },
    naoEncontradaItem: { ...typography.caption, color: colors.ink },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipTexto: { ...typography.caption, color: colors.ink, fontWeight: '600' },
    chipTextoAtivo: { color: colors.white },

    deleteLink: { ...typography.label, color: colors.danger },
    apagar: { alignSelf: 'center', marginTop: spacing.lg },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    success: {
      ...typography.caption,
      color: colors.success,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },

    modalFundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCartao: {
      width: '100%',
      maxWidth: 520,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      gap: spacing.md,
    },
    modalTitulo: { ...typography.heading, color: colors.ink },
    colar: {
      minHeight: 180,
      maxHeight: 320,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      fontSize: 14,
      textAlignVertical: 'top',
    },
  });
