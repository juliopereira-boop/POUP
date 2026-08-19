/**
 * O ESTADO DO SIMULADOR DE FINANCIAMENTO.
 *
 * ===========================================================================
 * O QUE ELE FAZ, E O QUE ELE DEIXA PARA O MOTOR
 * ===========================================================================
 * Este provider cuida do formulário, do catálogo e do salvamento. **Ele não
 * calcula nada**: a cada mudança de campo ele chama `simular()`, que é função
 * pura, e guarda o resultado.
 *
 * Simular a cada tecla é barato e é o que dá a sensação de vivo — o corretor vê
 * a parcela mudar enquanto digita o valor do imóvel. Uma tabela de 420 linhas
 * é aritmética inteira; custa microssegundos.
 *
 * ===========================================================================
 * O CLIENTE É O EIXO
 * ===========================================================================
 * Escolhido o cliente, a renda, o CPF e a data de nascimento que já estão na
 * ficha dele entram sozinhos. E, do outro lado, a simulação salva fica ligada
 * ao lead — é ela que o simulador de poupança vai ler para já abrir com o
 * financiamento aprovado, o subsídio e o FGTS preenchidos.
 *
 * ===========================================================================
 * REGRAS: DO BANCO, COM QUEDA PARA A DE FÁBRICA
 * ===========================================================================
 * As regras vêm do Supabase (`financing_active_rules`). Não havendo nenhuma
 * cadastrada — que é o estado inicial —, cai em `REGRAS_PADRAO`, que traz os
 * parâmetros oficiais como PENDENTES. Nunca cai em regra inventada, e é isso
 * que garante que o produto "Condições informadas" seja o caminho natural até
 * o administrador cadastrar as linhas oficiais.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { db, type Company, type Development, type Lead } from '@/data';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { centavosParaReais } from './dinheiro';
import {
  FORM_INICIAL,
  dinheiro,
  hojeISO,
  idadeEmAnos,
  paraEntrada,
  proponenteVazio,
  rendaFamiliar,
  type FormFinanciamento,
  type FormProponente,
} from './formulario';
import { simular, type ResultadoSimulacao } from './motor';
import { acharProduto, produtoCalculavel, type VersaoRegras } from './regras';
import { REGRAS_PADRAO } from './regrasPadrao';

/**
 * Rascunho no aparelho.
 *
 * Guarda renda e nome do cliente, então entra na lista que o `AuthProvider`
 * limpa no logout — sem isso, o próximo corretor a entrar no mesmo aparelho
 * abriria o simulador com o cliente do anterior. É vazamento de dado pessoal
 * entre contas.
 */
export const FINANCIAMENTO_DRAFT_KEY = 'poup.financiamento.draft';
export const FINANCIAMENTO_PREFILL_KEY = 'financiamento:prefill';
export const FINANCIAMENTO_LOCAL_KEYS = [FINANCIAMENTO_DRAFT_KEY, FINANCIAMENTO_PREFILL_KEY];

const SALVAR_DEBOUNCE_MS = 300;

interface FinanciamentoContextValue {
  form: FormFinanciamento;
  set: <K extends keyof FormFinanciamento>(campo: K, valor: FormFinanciamento[K]) => void;
  aplicar: (patch: Partial<FormFinanciamento>) => void;
  limpar: () => void;

  regras: VersaoRegras;
  /** `true` enquanto as regras do servidor ainda não chegaram. */
  carregando: boolean;
  /** O administrador ainda não cadastrou nenhuma versão de regras. */
  regrasDeFabrica: boolean;

  empresas: Company[];
  empreendimentos: Development[];
  clientes: Lead[];

  /** O resultado da condição atual. `null` enquanto faltar dado essencial. */
  resultado: ResultadoSimulacao | null;
  erro: string | null;
  /** O produto escolhido exige que o corretor informe taxa, prazo e quota. */
  exigeCondicaoInformada: boolean;

  escolherCliente: (leadId: string | null) => void;
  escolherEmpreendimento: (developmentId: string | null) => void;

  /* --- proponentes (§5): a composição de renda é parte do produto --- */
  adicionarProponente: () => void;
  removerProponente: (id: string) => void;
  atualizarProponente: (id: string, patch: Partial<FormProponente>) => void;
  /** Soma das rendas informadas, para a tela mostrar sem chamar o motor. */
  rendaFamiliarBruta: ReturnType<typeof dinheiro>;

  /** Grava a simulação, com o snapshot das regras. Devolve o id. */
  salvar: () => Promise<{ ok: true; id: string } | { ok: false; erro: string }>;
}

const Ctx = createContext<FinanciamentoContextValue | undefined>(undefined);

export function FinanciamentoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProfile();

  const [form, setForm] = useState<FormFinanciamento>(FORM_INICIAL);
  const [regras, setRegras] = useState<VersaoRegras>(REGRAS_PADRAO);
  const [regrasDeFabrica, setRegrasDeFabrica] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Development[]>([]);
  const [clientes, setClientes] = useState<Lead[]>([]);
  const [hidratado, setHidratado] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------------------------------------ carga */

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!user) return;
      const [regrasRemotas, comps, devs, leads] = await Promise.all([
        db.financing.regrasVigentes(),
        db.companies.list(user.id),
        db.developments.list(user.id),
        db.leads.list(user.id),
      ]);
      if (!vivo) return;
      if (regrasRemotas && typeof regrasRemotas === 'object') {
        setRegras(regrasRemotas as VersaoRegras);
        setRegrasDeFabrica(false);
      }
      setEmpresas(comps);
      setEmpreendimentos(devs);
      setClientes(leads);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [user]);

  /* ------------------------------------------------- rascunho e prefill */

  useEffect(() => {
    let vivo = true;
    void (async () => {
      let proximo = { ...FORM_INICIAL };
      const rascunho = await sessionStorage.getItem(FINANCIAMENTO_DRAFT_KEY);
      if (rascunho) {
        try {
          proximo = { ...proximo, ...(JSON.parse(rascunho) as Partial<FormFinanciamento>) };
        } catch {
          // Rascunho corrompido não pode impedir o corretor de simular.
        }
      }
      const prefill = await sessionStorage.getItem(FINANCIAMENTO_PREFILL_KEY);
      if (prefill) {
        await sessionStorage.removeItem(FINANCIAMENTO_PREFILL_KEY);
        try {
          proximo = { ...proximo, ...(JSON.parse(prefill) as Partial<FormFinanciamento>) };
        } catch {
          // idem
        }
      }
      if (!vivo) return;
      setForm(proximo);
      setHidratado(true);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void sessionStorage.setItem(FINANCIAMENTO_DRAFT_KEY, JSON.stringify(form));
    }, SALVAR_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form, hidratado]);

  // A UF do perfil entra sozinha: é onde o corretor atua, e digitá-la de novo
  // em cada simulação seria pedir que ele repetisse o que o app já sabe.
  useEffect(() => {
    if (!profile?.uf) return;
    setForm((f) => (f.uf ? f : { ...f, uf: profile.uf }));
  }, [profile?.uf]);

  /* --------------------------------------------------------- comandos */

  const set = useCallback(
    <K extends keyof FormFinanciamento>(campo: K, valor: FormFinanciamento[K]) => {
      setForm((f) => ({ ...f, [campo]: valor }));
    },
    [],
  );

  const aplicar = useCallback((patch: Partial<FormFinanciamento>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const limpar = useCallback(() => {
    setForm({ ...FORM_INICIAL, uf: profile?.uf ?? null });
    void sessionStorage.removeItem(FINANCIAMENTO_DRAFT_KEY);
  }, [profile?.uf]);

  /**
   * Escolher o cliente traz o que a ficha dele já sabe.
   *
   * Só preenche campo VAZIO. Sobrescrever o que o corretor acabou de digitar
   * porque ele selecionou o cliente depois seria apagar trabalho na frente
   * dele — e a renda da ficha costuma estar desatualizada em relação à que ele
   * acabou de ouvir na mesa.
   */
  const escolherCliente = useCallback(
    (leadId: string | null) => {
      const lead = clientes.find((c) => c.id === leadId) ?? null;
      const idadeDoLead = idadeEmAnos(lead?.birthDate ?? null, hojeISO());
      setForm((f) => {
        const primeiro = f.proponentes[0] ?? proponenteVazio('p1');
        const atualizado: FormProponente = {
          ...primeiro,
          nome: primeiro.nome.trim() || (lead?.name ?? ''),
          rendaBruta:
            primeiro.rendaBruta.trim() ||
            (lead?.income
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  lead.income,
                )
              : ''),
          idade: primeiro.idade.trim() || (idadeDoLead !== null ? String(idadeDoLead) : ''),
        };
        return {
          ...f,
          leadId,
          proponentes: [atualizado, ...f.proponentes.slice(1)],
          companyId: f.companyId ?? lead?.companyId ?? null,
          developmentId: f.developmentId ?? lead?.developmentId ?? null,
        };
      });
    },
    [clientes],
  );

  /**
   * Escolher o empreendimento traz o valor da unidade quando ele existe.
   *
   * É o mesmo truque que faz a LIA parecer que já sabe das coisas: o cadastro
   * tem a informação, então ninguém deveria digitá-la de novo.
   */
  const escolherEmpreendimento = useCallback(
    (developmentId: string | null) => {
      const dev = empreendimentos.find((d) => d.id === developmentId) ?? null;
      setForm((f) => ({
        ...f,
        developmentId,
        companyId: dev?.companyId ?? f.companyId,
      }));
    },
    [empreendimentos],
  );

  /*
   * Até quatro proponentes. Não é limite técnico — é limite de tela: acima
   * disso o formulário deixa de caber no celular, e composição de renda com
   * cinco pessoas é rara o bastante para não valer o custo de desenho.
   */
  const adicionarProponente = useCallback(() => {
    setForm((f) =>
      f.proponentes.length >= 4
        ? f
        : { ...f, proponentes: [...f.proponentes, proponenteVazio(`p${f.proponentes.length + 1}`)] },
    );
  }, []);

  // Nunca fica sem nenhum: um formulário de financiamento sem proponente não
  // tem renda, e sem renda não há simulação.
  const removerProponente = useCallback((id: string) => {
    setForm((f) =>
      f.proponentes.length <= 1
        ? f
        : { ...f, proponentes: f.proponentes.filter((p) => p.id !== id) },
    );
  }, []);

  const atualizarProponente = useCallback((id: string, patch: Partial<FormProponente>) => {
    setForm((f) => ({
      ...f,
      proponentes: f.proponentes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }, []);

  /* -------------------------------------------------------- o resultado */

  const produto = acharProduto(regras, form.produtoId);
  const exigeCondicaoInformada = produto?.parametrosManuais ?? false;

  const { resultado, erro } = useMemo(() => {
    const entrada = paraEntrada(form);
    if (entrada.valorImovel <= 0 || entrada.prazoMeses <= 0) {
      return { resultado: null, erro: null };
    }
    const r = simular(entrada, regras);
    return r.ok ? { resultado: r.resultado, erro: null } : { resultado: null, erro: r.erro };
  }, [form, regras]);

  /* ------------------------------------------------------------ salvar */

  const salvar = useCallback(async () => {
    if (!user) return { ok: false as const, erro: 'Faça login novamente.' };
    if (!resultado) return { ok: false as const, erro: erro ?? 'Complete a simulação antes de salvar.' };

    const dev = empreendimentos.find((d) => d.id === form.developmentId) ?? null;

    /*
     * A TABELA DE 420 LINHAS NÃO É GRAVADA.
     *
     * Ela é determinística: o motor a regera exatamente igual a partir da
     * entrada e do snapshot de regras. Guardá-la seriam dezenas de KB por
     * simulação para reproduzir algo que já sabemos reproduzir — e ainda por
     * cima em JSON, dentro de uma coluna que a listagem lê o tempo todo.
     */
    const resumo = { ...resultado } as Partial<ResultadoSimulacao>;
    delete resumo.tabela;
    delete resumo.snapshot;

    const r = await db.financing.create(user.id, {
      leadId: form.leadId,
      clientName: form.proponentes[0]?.nome.trim() || null,
      companyId: form.companyId,
      developmentId: form.developmentId,
      developmentName: dev?.name ?? null,
      block: form.block || null,
      unit: form.unit.trim() || null,
      input: paraEntrada(form),
      result: resumo,
      rulesSnapshot: resultado.snapshot,
      ruleVersion: resultado.versaoRegras,
      propertyValue: centavosParaReais(resultado.valorImovel),
      financedValue: centavosParaReais(resultado.valorFinanciado),
      firstInstallment: centavosParaReais(resultado.primeira?.prestacaoTotal ?? (0 as never)),
      termMonths: resultado.prazoMeses,
      amortization: resultado.sistema,
      eligible: resultado.elegibilidade.elegivel,
    });
    if (!r.ok) return { ok: false as const, erro: r.error };
    return { ok: true as const, id: r.data.id };
  }, [user, resultado, erro, form, empreendimentos]);

  const value = useMemo<FinanciamentoContextValue>(
    () => ({
      form,
      set,
      aplicar,
      limpar,
      regras,
      carregando,
      regrasDeFabrica,
      empresas,
      empreendimentos,
      clientes,
      resultado,
      erro,
      exigeCondicaoInformada,
      escolherCliente,
      escolherEmpreendimento,
      adicionarProponente,
      removerProponente,
      atualizarProponente,
      rendaFamiliarBruta: rendaFamiliar(form),
      salvar,
    }),
    [
      form,
      set,
      aplicar,
      limpar,
      regras,
      carregando,
      regrasDeFabrica,
      empresas,
      empreendimentos,
      clientes,
      resultado,
      erro,
      exigeCondicaoInformada,
      escolherCliente,
      escolherEmpreendimento,
      adicionarProponente,
      removerProponente,
      atualizarProponente,
      salvar,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinanciamento(): FinanciamentoContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFinanciamento deve ser usado dentro de <FinanciamentoProvider>.');
  return ctx;
}

/** As linhas que o corretor pode escolher, com o motivo de cada uma indisponível. */
export function opcoesDeProduto(regras: VersaoRegras) {
  return regras.produtos.map((p) => ({
    value: p.id,
    label: produtoCalculavel(p) ? p.nome : `${p.nome} — sem parâmetros cadastrados`,
    disponivel: produtoCalculavel(p),
    descricao: p.descricao,
  }));
}
