/**
 * BLOCOS E UNIDADES DE UM EMPREENDIMENTO.
 *
 * ===========================================================================
 * O CORRETOR INFORMA A FORMA, NÃO A LISTA
 * ===========================================================================
 * Cada bloco é descrito pelos pavimentos: "pavimento 1 (térreo), 4 unidades;
 * pavimento 2, 4 unidades..." — e os códigos 001, 002, 101, 102 saem do gerador
 * (`features/unidades/gerador.ts`), que é testado. Dois atalhos fazem o resto:
 *
 *   * "+ Pavimento" já vem com o número seguinte e a quantidade do anterior,
 *     porque num prédio quase todo andar repete o de baixo;
 *   * "Repetir até o pavimento N" monta o prédio inteiro de uma vez;
 *   * "+ Bloco" copia a forma do último, porque condomínio de blocos iguais é
 *     o caso mais comum.
 *
 * ===========================================================================
 * O PREÇO QUE A TABELA GRAVOU NÃO PODE SUMIR SEM AVISO
 * ===========================================================================
 * As unidades são salvas pelo código, e quem continua existindo mantém o preço.
 * Mas encolher um bloco APAGA unidades — e se elas tinham preço, o corretor
 * precisa saber antes de salvar. Por isso cada bloco mostra quantas unidades
 * com preço vão sair, antes do botão.
 *
 * ===========================================================================
 * A REGRA DE VENTILAÇÃO MORA NO BLOCO
 * ===========================================================================
 * A tabela de preço do Connect cobra diferente o apartamento mais ventilado.
 * Quem é mais ventilado se diz pela TERMINAÇÃO ("finais 1 e 3"), e é regra do
 * bloco porque, num condomínio, os blocos costumam ser espelhados: o final 1
 * de um é o final 2 do vizinho. Por isso cada bloco tem o seu botão, com
 * "Aplicar a todos os blocos" para o caso comum e "Inverter" para o espelhado.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { db, type Development, type DevelopmentBlock } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { resumoDaVentilacao, terminacaoDoCodigo } from '@/features/tabelaPreco/preco';
import {
  LIMITES,
  PAVIMENTO_INICIAL,
  gerarUnidades,
  pavimentosDasUnidades,
  proximoNomeDeBloco,
  proximoPavimento,
  repetirAte,
  resumoDoPavimento,
  rotuloDoPavimento,
  type Pavimento,
  type UnidadeGerada,
} from '@/features/unidades/gerador';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** Os campos são texto enquanto o corretor digita: ele precisa poder apagar e redigitar. */
interface PavimentoEditavel {
  chave: string;
  numero: string;
  unidades: string;
}

interface BlocoEditavel {
  chave: string;
  /** `null` = bloco novo. O id do existente é o que preserva os preços ao salvar. */
  id: string | null;
  nome: string;
  pavimentos: PavimentoEditavel[];
  /** Terminações mais ventiladas. `null` = sem regra de ventilação. */
  ventilacao: number[] | null;
  /** Códigos que JÁ têm preço no banco — para avisar antes de apagar algum. */
  codigosComPreco: Set<string>;
}

let sequencia = 0;
function novaChave(): string {
  sequencia += 1;
  return `k${sequencia}`;
}

function paraEditavel(p: Pavimento): PavimentoEditavel {
  return { chave: novaChave(), numero: String(p.numero), unidades: String(p.unidades) };
}

function blocoDoBanco(b: DevelopmentBlock): BlocoEditavel {
  return {
    chave: novaChave(),
    id: b.id,
    nome: b.nome,
    pavimentos: pavimentosDasUnidades(b.unidades).map(paraEditavel),
    ventilacao: b.terminacoesMaisVentiladas,
    codigosComPreco: new Set(b.unidades.filter((u) => u.valor != null).map((u) => u.codigo)),
  };
}

function blocoNovo(nome: string, forma: Pavimento[], ventilacao: number[] | null = null): BlocoEditavel {
  return {
    chave: novaChave(),
    id: null,
    nome,
    pavimentos: forma.map(paraEditavel),
    ventilacao,
    codigosComPreco: new Set(),
  };
}

function lerPavimentos(lista: PavimentoEditavel[]): Pavimento[] {
  return lista.map((p) => ({
    numero: Number.parseInt(p.numero, 10),
    unidades: Number.parseInt(p.unidades, 10),
  }));
}

/** Só a parte que o corretor edita — é o que decide se há algo por salvar. */
function assinatura(blocos: BlocoEditavel[]): string {
  return JSON.stringify(
    blocos.map((b) => [
      b.id,
      b.nome.trim(),
      b.pavimentos.map((p) => [p.numero, p.unidades]),
      b.ventilacao ? [...b.ventilacao].sort((x, y) => x - y) : null,
    ]),
  );
}

type Geracao = ReturnType<typeof gerarUnidades>;

export default function UnidadesScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { developmentId } = useLocalSearchParams<{ developmentId?: string }>();

  const [dev, setDev] = useState<Development | null>(null);
  const [blocos, setBlocos] = useState<BlocoEditavel[]>([]);
  const [salvo, setSalvo] = useState('[]');
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [repetir, setRepetir] = useState<Record<string, string>>({});
  const [ventilacaoAberta, setVentilacaoAberta] = useState<Record<string, boolean>>({});

  const podeEditar = Boolean(dev) && (!dev?.isCatalog || isAdmin) && !migracaoPendente;

  const carregar = useCallback(async () => {
    if (!user || !developmentId) return;
    setCarregando(true);
    const [devs, res] = await Promise.all([
      db.developments.list(user.id),
      db.unidades.listarBlocos(developmentId),
    ]);
    setDev(devs.find((d) => d.id === developmentId) ?? null);
    if (res.ok) {
      const editaveis = res.data.map(blocoDoBanco);
      setBlocos(editaveis);
      setSalvo(assinatura(editaveis));
      setAviso(null);
      setMigracaoPendente(false);
    } else {
      setAviso(res.error);
      setMigracaoPendente(res.migracaoPendente);
    }
    setCarregando(false);
  }, [user, developmentId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const geracoes = useMemo(
    () => new Map<string, Geracao>(blocos.map((b) => [b.chave, gerarUnidades(lerPavimentos(b.pavimentos))])),
    [blocos],
  );

  const pendente = podeEditar && assinatura(blocos) !== salvo;

  /*
   * SAIR COM ALTERAÇÃO NÃO SALVA PERGUNTA ANTES.
   *
   * Um prédio de 15 andares leva um minuto para cadastrar e um toque em Voltar
   * para perder. O evento `beforeRemove` é o da própria navegação, então vale
   * para o botão de voltar, o gesto de arrastar e o voltar do Android.
   */
  const pendenteRef = useRef(pendente);
  pendenteRef.current = pendente;
  useEffect(() => {
    const cancelar = navigation.addListener('beforeRemove', (e) => {
      if (!pendenteRef.current) return;
      e.preventDefault();
      const sair = () => navigation.dispatch(e.data.action);
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (window.confirm('Há alterações nos blocos que ainda não foram salvas. Sair mesmo assim?')) sair();
        return;
      }
      Alert.alert('Alterações não salvas', 'Os blocos que você mudou ainda não foram salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Sair sem salvar', style: 'destructive', onPress: sair },
      ]);
    });
    return cancelar;
  }, [navigation]);

  // ---------------------------------------------------------------- edição

  function mudarBloco(chave: string, patch: Partial<BlocoEditavel>) {
    setSucesso(null);
    setBlocos((atual) => atual.map((b) => (b.chave === chave ? { ...b, ...patch } : b)));
  }

  function mudarPavimento(bloco: BlocoEditavel, chavePav: string, patch: Partial<PavimentoEditavel>) {
    mudarBloco(bloco.chave, {
      pavimentos: bloco.pavimentos.map((p) => (p.chave === chavePav ? { ...p, ...patch } : p)),
    });
  }

  function adicionarPavimento(bloco: BlocoEditavel) {
    const validos = lerPavimentos(bloco.pavimentos).filter(
      (p) => Number.isInteger(p.numero) && Number.isInteger(p.unidades),
    );
    mudarBloco(bloco.chave, { pavimentos: [...bloco.pavimentos, paraEditavel(proximoPavimento(validos))] });
  }

  function removerPavimento(bloco: BlocoEditavel, chavePav: string) {
    mudarBloco(bloco.chave, { pavimentos: bloco.pavimentos.filter((p) => p.chave !== chavePav) });
  }

  function aplicarRepeticao(bloco: BlocoEditavel) {
    const ate = Number.parseInt(repetir[bloco.chave] ?? '', 10);
    const atuais = lerPavimentos(bloco.pavimentos);
    if (atuais.some((p) => !Number.isInteger(p.numero) || !Number.isInteger(p.unidades))) {
      setErro(`Confira os pavimentos do ${bloco.nome || 'bloco'} antes de repetir.`);
      return;
    }
    const completos = repetirAte(atuais, ate);
    const novos = completos.slice(atuais.length).map(paraEditavel);
    if (novos.length === 0) return;
    setErro(null);
    mudarBloco(bloco.chave, { pavimentos: [...bloco.pavimentos, ...novos] });
    setRepetir((r) => ({ ...r, [bloco.chave]: '' }));
  }

  function adicionarBloco() {
    setSucesso(null);
    const nome = proximoNomeDeBloco(blocos.map((b) => b.nome));
    const ultimo = blocos.at(-1);
    const forma = ultimo ? lerPavimentos(ultimo.pavimentos) : [];
    const valida = forma.length > 0 && gerarUnidades(forma).ok;
    // Copia também a regra de ventilação: bloco igual costuma ventilar igual.
    setBlocos((atual) => [
      ...atual,
      blocoNovo(nome, valida ? forma : [PAVIMENTO_INICIAL], ultimo?.ventilacao ?? null),
    ]);
  }

  function ventilacaoParaTodos(origem: BlocoEditavel) {
    setSucesso(null);
    setBlocos((atual) => atual.map((b) => ({ ...b, ventilacao: origem.ventilacao ? [...origem.ventilacao] : null })));
  }

  function removerBloco(bloco: BlocoEditavel) {
    const executar = () => {
      setSucesso(null);
      setBlocos((atual) => atual.filter((b) => b.chave !== bloco.chave));
    };
    const precos = bloco.codigosComPreco.size;
    const texto =
      precos > 0
        ? `O ${bloco.nome} tem ${precos} unidade(s) com preço. Remover apaga o bloco e os preços ao salvar.`
        : `Remover o ${bloco.nome || 'bloco'}?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(texto)) executar();
      return;
    }
    Alert.alert('Remover bloco', texto, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: executar },
    ]);
  }

  // ---------------------------------------------------------------- salvar

  async function salvar() {
    if (!developmentId) return;
    setErro(null);
    setSucesso(null);

    const nomes = blocos.map((b) => b.nome.trim().toLowerCase());
    if (nomes.some((n) => !n)) return setErro('Todo bloco precisa de um nome.');
    if (new Set(nomes).size !== nomes.length) {
      return setErro('Dois blocos estão com o mesmo nome. Dê um nome diferente a cada um.');
    }

    const payload = [];
    for (const b of blocos) {
      const g = geracoes.get(b.chave);
      if (!g || !g.ok) return setErro(`${b.nome}: ${g && !g.ok ? g.erro : 'confira os pavimentos.'}`);
      payload.push({
        id: b.id,
        nome: b.nome.trim(),
        ventilacaoMais: b.ventilacao,
        unidades: g.unidades.map((u) => ({ codigo: u.codigo, pavimento: u.pavimento, ordem: u.ordem })),
      });
    }

    setSalvando(true);
    const res = await db.unidades.salvarBlocos(developmentId, payload);
    setSalvando(false);
    if (!res.ok) return setErro(res.error);

    const editaveis = res.data.map(blocoDoBanco);
    setBlocos(editaveis);
    setSalvo(assinatura(editaveis));
    const total = res.data.reduce((s, b) => s + b.unidades.length, 0);
    setSucesso(
      res.data.length === 0
        ? 'Salvo. O empreendimento ficou sem blocos.'
        : `Salvo: ${total.toLocaleString('pt-BR')} unidades em ${res.data.length} bloco(s).`,
    );
  }

  // ---------------------------------------------------------------- tela

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

  const totalUnidades = [...geracoes.values()].reduce((s, g) => s + (g.ok ? g.unidades.length : 0), 0);

  return (
    <Screen>
      <Text style={styles.eyebrow}>{dev?.companyName ?? 'Empreendimento'}</Text>
      <Text style={styles.title}>{dev?.name ?? 'Blocos e unidades'}</Text>
      <Text style={styles.subtitle}>
        {blocos.length === 0
          ? 'Nenhum bloco cadastrado ainda.'
          : `${blocos.length} bloco(s) · ${totalUnidades.toLocaleString('pt-BR')} unidades`}
      </Text>

      {aviso ? <Text style={styles.warn}>{aviso}</Text> : null}
      {dev?.isCatalog && !isAdmin ? (
        <Text style={styles.info}>
          Empreendimento do catálogo: mantido pelo POUP. Você vê as unidades, e as atualizações chegam
          sozinhas.
        </Text>
      ) : null}

      {blocos.length === 0 && podeEditar ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTitulo}>Como funciona</Text>
          <Text style={styles.vazioTexto}>
            Informe os pavimentos de cada bloco e quantas unidades cada um tem. Os números saem
            sozinhos: o térreo vira 001, 002, 003… e o andar de cima, 101, 102, 103…
          </Text>
          <Button label="Criar o Bloco 1" onPress={adicionarBloco} />
        </View>
      ) : null}

      {blocos.map((bloco) => (
        <CartaoBloco
          key={bloco.chave}
          bloco={bloco}
          geracao={geracoes.get(bloco.chave)}
          editavel={podeEditar}
          repetirAte={repetir[bloco.chave] ?? ''}
          onRepetirAte={(t) => setRepetir((r) => ({ ...r, [bloco.chave]: t.replace(/\D/g, '').slice(0, 3) }))}
          onAplicarRepeticao={() => aplicarRepeticao(bloco)}
          onNome={(nome) => mudarBloco(bloco.chave, { nome })}
          onPavimento={(chavePav, patch) => mudarPavimento(bloco, chavePav, patch)}
          onAdicionarPavimento={() => adicionarPavimento(bloco)}
          onRemoverPavimento={(chavePav) => removerPavimento(bloco, chavePav)}
          onRemover={() => removerBloco(bloco)}
          ventilacaoAberta={Boolean(ventilacaoAberta[bloco.chave])}
          onAlternarVentilacao={() =>
            setVentilacaoAberta((v) => ({ ...v, [bloco.chave]: !v[bloco.chave] }))
          }
          onVentilacao={(ventilacao) => mudarBloco(bloco.chave, { ventilacao })}
          onVentilacaoParaTodos={blocos.length > 1 ? () => ventilacaoParaTodos(bloco) : undefined}
        />
      ))}

      {podeEditar && blocos.length > 0 ? (
        <Button
          label={`+ ${proximoNomeDeBloco(blocos.map((b) => b.nome))} (copia a forma do anterior)`}
          variant="secondary"
          onPress={adicionarBloco}
          disabled={blocos.length >= LIMITES.blocos}
          style={styles.addBloco}
        />
      ) : null}

      {erro ? <Text style={styles.error}>{erro}</Text> : null}
      {sucesso ? <Text style={styles.success}>{sucesso}</Text> : null}

      {podeEditar && (blocos.length > 0 || pendente) ? (
        <Button
          label={pendente ? 'Salvar blocos e unidades' : 'Tudo salvo'}
          onPress={() => void salvar()}
          loading={salvando}
          disabled={!pendente}
        />
      ) : null}
    </Screen>
  );
}

// ==========================================================================

interface CartaoBlocoProps {
  bloco: BlocoEditavel;
  geracao: Geracao | undefined;
  editavel: boolean;
  repetirAte: string;
  onRepetirAte: (texto: string) => void;
  onAplicarRepeticao: () => void;
  onNome: (nome: string) => void;
  onPavimento: (chave: string, patch: Partial<PavimentoEditavel>) => void;
  onAdicionarPavimento: () => void;
  onRemoverPavimento: (chave: string) => void;
  onRemover: () => void;
  ventilacaoAberta: boolean;
  onAlternarVentilacao: () => void;
  onVentilacao: (v: number[] | null) => void;
  onVentilacaoParaTodos?: () => void;
}

function CartaoBloco({
  bloco,
  geracao,
  editavel,
  repetirAte: valorRepetir,
  onRepetirAte,
  onAplicarRepeticao,
  onNome,
  onPavimento,
  onAdicionarPavimento,
  onRemoverPavimento,
  onRemover,
  ventilacaoAberta,
  onAlternarVentilacao,
  onVentilacao,
  onVentilacaoParaTodos,
}: CartaoBlocoProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  const unidades: UnidadeGerada[] = geracao?.ok ? geracao.unidades : [];
  const gerados = new Set(unidades.map((u) => u.codigo));
  const precoPerdido = [...bloco.codigosComPreco].filter((c) => !gerados.has(c)).length;
  const comPreco = [...bloco.codigosComPreco].filter((c) => gerados.has(c)).length;
  const forma = geracao?.ok ? pavimentosDasUnidades(unidades) : [];
  const terminacoes = [
    ...new Set(unidades.map((u) => terminacaoDoCodigo(u.codigo)).filter((t): t is number => t != null)),
  ].sort((a, b) => a - b);
  const mais = bloco.ventilacao ?? [];

  function alternarTerminacao(t: number) {
    onVentilacao(mais.includes(t) ? mais.filter((x) => x !== t) : [...mais, t].sort((a, b) => a - b));
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTopo}>
        {editavel ? (
          <View style={styles.flex1}>
            <Input
              label="Nome do bloco"
              value={bloco.nome}
              onChangeText={onNome}
              placeholder="Ex.: Bloco 1, Torre A, Quadra 3"
              maxLength={LIMITES.nomeBloco}
            />
          </View>
        ) : (
          <Text style={styles.cardTitulo}>{bloco.nome}</Text>
        )}
        {editavel ? (
          <Pressable onPress={onRemover} hitSlop={8} style={styles.removerBloco}>
            <Text style={styles.deleteLink}>Remover</Text>
          </Pressable>
        ) : null}
      </View>

      {editavel ? (
        <>
          <View style={styles.cabecalho}>
            <Text style={[styles.colTitulo, styles.colPav]}>Pavimento</Text>
            <Text style={[styles.colTitulo, styles.colRotulo]} />
            <Text style={[styles.colTitulo, styles.colUni]}>Unidades</Text>
            <View style={styles.colX} />
          </View>
          {bloco.pavimentos.map((p) => {
            const n = Number.parseInt(p.numero, 10);
            return (
              <View key={p.chave} style={styles.linha}>
                <TextInput
                  value={p.numero}
                  onChangeText={(t) => onPavimento(p.chave, { numero: t.replace(/\D/g, '').slice(0, 3) })}
                  keyboardType="number-pad"
                  style={[styles.campo, styles.colPav]}
                  placeholderTextColor={colors.inkSubtle}
                  accessibilityLabel="Número do pavimento"
                />
                <Text style={[styles.rotulo, styles.colRotulo]} numberOfLines={1}>
                  {Number.isInteger(n) && n >= 1 ? rotuloDoPavimento(n) : ''}
                </Text>
                <TextInput
                  value={p.unidades}
                  onChangeText={(t) => onPavimento(p.chave, { unidades: t.replace(/\D/g, '').slice(0, 2) })}
                  keyboardType="number-pad"
                  style={[styles.campo, styles.colUni]}
                  placeholderTextColor={colors.inkSubtle}
                  accessibilityLabel="Quantidade de unidades no pavimento"
                />
                <Pressable
                  onPress={() => onRemoverPavimento(p.chave)}
                  hitSlop={8}
                  style={styles.colX}
                  accessibilityLabel="Remover pavimento"
                >
                  <Text style={styles.x}>×</Text>
                </Pressable>
              </View>
            );
          })}

          <View style={styles.acoes}>
            <Button label="+ Pavimento" variant="secondary" onPress={onAdicionarPavimento} style={styles.flex1} />
          </View>
          <View style={styles.repetir}>
            <Text style={styles.repetirTexto}>Repetir até o pavimento</Text>
            <TextInput
              value={valorRepetir}
              onChangeText={onRepetirAte}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor={colors.inkSubtle}
              style={[styles.campo, styles.campoRepetir]}
              accessibilityLabel="Repetir até o pavimento"
              onSubmitEditing={onAplicarRepeticao}
            />
            <Button label="Aplicar" variant="ghost" onPress={onAplicarRepeticao} />
          </View>
        </>
      ) : null}

      {/* A regra de ventilação: quem é mais ventilado, pela terminação. */}
      <View style={styles.ventilacao}>
        <View style={styles.ventilacaoTopo}>
          <Text style={[styles.ventilacaoResumo, !bloco.ventilacao && styles.ventilacaoSemRegra]}>
            {resumoDaVentilacao(bloco.ventilacao, terminacoes)}
          </Text>
          {editavel ? (
            <Pressable
              onPress={onAlternarVentilacao}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ expanded: ventilacaoAberta }}
            >
              <Text style={styles.link}>{ventilacaoAberta ? 'Fechar' : 'Regra de ventilação'}</Text>
            </Pressable>
          ) : null}
        </View>
        {editavel && ventilacaoAberta ? (
          <View style={styles.ventilacaoPainel}>
            <Text style={styles.ventilacaoDica}>
              Toque nos finais MAIS ventilados. Os outros ficam menos ventilados. Vale para todos os andares
              do bloco.
            </Text>
            <View style={styles.finais}>
              {terminacoes.map((t) => {
                const ehMais = bloco.ventilacao != null && mais.includes(t);
                return (
                  <Pressable
                    key={t}
                    onPress={() => alternarTerminacao(t)}
                    style={[styles.final, ehMais && styles.finalMais]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: ehMais }}
                    accessibilityLabel={`Final ${t}: ${ehMais ? 'mais' : 'menos'} ventilado`}
                  >
                    <Text style={[styles.finalNumero, ehMais && styles.finalTextoMais]}>Final {t}</Text>
                    <Text style={[styles.finalEstado, ehMais && styles.finalTextoMais]}>
                      {bloco.ventilacao == null ? '—' : ehMais ? 'mais' : 'menos'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.ventilacaoAcoes}>
              {bloco.ventilacao ? (
                <Pressable
                  onPress={() => onVentilacao(terminacoes.filter((t) => !mais.includes(t)))}
                  hitSlop={6}
                >
                  <Text style={styles.link}>Inverter (bloco espelhado)</Text>
                </Pressable>
              ) : null}
              {onVentilacaoParaTodos && bloco.ventilacao ? (
                <Pressable onPress={onVentilacaoParaTodos} hitSlop={6}>
                  <Text style={styles.link}>Aplicar a todos os blocos</Text>
                </Pressable>
              ) : null}
              {bloco.ventilacao ? (
                <Pressable onPress={() => onVentilacao(null)} hitSlop={6}>
                  <Text style={styles.deleteLink}>Sem regra</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* A prévia: o que vai ser gravado, antes de gravar. */}
      <View style={styles.previa}>
        {geracao && !geracao.ok ? (
          <Text style={styles.previaErro}>{geracao.erro}</Text>
        ) : (
          <>
            <Text style={styles.previaTitulo}>
              {unidades.length.toLocaleString('pt-BR')} unidades
              {comPreco > 0 ? ` · ${comPreco} com preço` : ''}
            </Text>
            {forma.map((p) => {
              const r = resumoDoPavimento(p);
              return (
                <View key={p.numero} style={styles.previaLinha}>
                  <Text style={styles.previaRotulo}>{r.rotulo}</Text>
                  <Text style={styles.previaCodigos}>
                    {p.unidades === 1 ? r.primeiro : `${r.primeiro} a ${r.ultimo}`}
                  </Text>
                  <Text style={styles.previaQtd}>{p.unidades} un.</Text>
                </View>
              );
            })}
          </>
        )}
        {precoPerdido > 0 ? (
          <Text style={styles.previaAlerta}>
            {precoPerdido} unidade(s) com preço vão sair deste bloco ao salvar.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    eyebrow: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    title: { ...typography.title, color: colors.ink, marginTop: 2 },
    subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    muted: { ...typography.body, color: colors.inkSubtle },
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
    vazio: {
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    vazioTitulo: { ...typography.heading, color: colors.ink },
    vazioTexto: { ...typography.body, color: colors.inkMuted },

    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    cardTitulo: { ...typography.heading, color: colors.ink, flex: 1, marginBottom: spacing.md },
    removerBloco: { paddingTop: 34 },
    flex1: { flex: 1 },

    cabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    colTitulo: { ...typography.caption, color: colors.inkMuted, fontWeight: '600' },
    colPav: { width: 72 },
    colRotulo: { flex: 1 },
    colUni: { width: 72 },
    colX: { width: 28, alignItems: 'center' },
    linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    campo: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 16,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    rotulo: { ...typography.caption, color: colors.inkMuted },
    x: { fontSize: 22, lineHeight: 24, color: colors.inkSubtle },

    acoes: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
    repetir: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    repetirTexto: { ...typography.caption, color: colors.inkMuted, flex: 1 },
    campoRepetir: { width: 64 },

    previa: {
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.xs,
    },
    previaTitulo: { ...typography.label, color: colors.ink, marginBottom: spacing.xs },
    previaLinha: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
    previaRotulo: { ...typography.caption, color: colors.inkMuted, width: 72 },
    previaCodigos: { ...typography.caption, color: colors.ink, flex: 1, fontVariant: ['tabular-nums'] },
    previaQtd: { ...typography.caption, color: colors.inkSubtle, fontVariant: ['tabular-nums'] },
    previaErro: { ...typography.caption, color: colors.danger },
    previaAlerta: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.sm,
      borderRadius: radius.sm,
      marginTop: spacing.sm,
      overflow: 'hidden',
    },

    link: { ...typography.label, color: colors.primary },
    ventilacao: {
      marginTop: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    ventilacaoTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    ventilacaoResumo: { ...typography.caption, color: colors.ink, flex: 1 },
    ventilacaoSemRegra: { color: colors.inkSubtle },
    ventilacaoPainel: { marginTop: spacing.md, gap: spacing.md },
    ventilacaoDica: { ...typography.caption, color: colors.inkMuted },
    finais: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    final: {
      minWidth: 72,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    finalMais: { backgroundColor: colors.successSoft, borderColor: colors.success },
    finalNumero: { ...typography.label, color: colors.ink },
    finalEstado: { ...typography.caption, color: colors.inkSubtle },
    finalTextoMais: { color: colors.success },
    ventilacaoAcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
    deleteLink: { ...typography.label, color: colors.danger },
    addBloco: { marginBottom: spacing.lg },
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
  });
