/**
 * GERAR A PROPOSTA — o fim do simulador.
 *
 * Este código morava na antiga etapa 5 (`fluxo.tsx`) e veio para cá sem mudar
 * de comportamento: gera o PDF, salva em Relatórios, registra o evento. Saiu
 * da tela porque o botão "Gerar proposta" agora mora no bloco de unidade e
 * cliente, e a geração não é assunto de tela nenhuma.
 *
 * A única diferença é a checagem ANTES de gerar: antes a etapa 5 conferia só o
 * vencimento do ato e as mensais, porque as outras quatro etapas já tinham
 * conferido o resto no "Avançar". Agora quem confere tudo é `pendencias.ts`, e
 * quem chama este hook já passou por ela.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { db, type Company, type Development, type Simulation, type SimulationInput } from '@/data';
import { friendlyError } from '@/data/friendlyError';
import { registrar } from '@/features/analytics/eventos';
import { currencyToNumber } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { buildFlow } from './calc';
import { generateProposal } from './proposal';
import { useSimulador } from './SimuladorProvider';

interface Opcoes {
  /** As listas que a tela já carregou para os seletores — sem buscar de novo. */
  companies: Company[];
  developments: Development[];
}

export function useGerarProposta({ companies, developments }: Opcoes) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const sim = useSimulador();
  const [gerando, setGerando] = useState(false);
  // Simulação que está sendo editada, vinda de Relatórios. Guarda a data
  // original da proposta e os nomes, caso a construtora já não esteja na lista.
  const [stored, setStored] = useState<Simulation | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!sim.editId) return;
    void db.simulations.get(sim.editId).then((s) => {
      if (vivo) setStored(s);
    });
    return () => {
      vivo = false;
    };
  }, [sim.editId]);

  /** Devolve a frase de erro para a tela, ou `null` quando deu certo. */
  const gerar = useCallback(async (): Promise<string | null> => {
    if (!user) return 'Entre na sua conta para gerar a proposta.';

    const comp = companies.find((c) => c.id === sim.companyId);
    const dev = developments.find((d) => d.id === sim.developmentId);
    const companyName = comp?.name ?? stored?.companyName ?? null;
    const developmentName = dev?.name ?? stored?.developmentName ?? null;
    const deliveryDate = dev?.deliveryDate ?? stored?.deliveryDate ?? null;
    const gerente = dev?.managerName ?? stored?.managerName ?? null;
    // Foto da construtora: sai no topo do PDF, ao lado da logo do POUP.
    const companyPhotoUrl = comp?.photoUrl ?? null;

    setGerando(true);
    try {
      const flow = buildFlow(sim);
      const genDate =
        sim.editId && stored?.proposalDate
          ? stored.proposalDate
          : new Date().toISOString().slice(0, 10);

      // A impressão RECUSA imprimir uma folha vazia e lança. Só que perder a
      // simulação por causa disso seria pior que não gerar o PDF: salvamos em
      // Relatórios de qualquer jeito e avisamos no fim.
      let printError: string | null = null;
      try {
        await generateProposal({
          sim,
          profile,
          companyName,
          developmentName,
          deliveryDate,
          gerente,
          todayISO: genDate,
          companyPhotoUrl,
        });
      } catch (e) {
        printError =
          e instanceof Error && e.message ? e.message : 'Não foi possível gerar a proposta em PDF.';
      }

      const unitValue = currencyToNumber(sim.unitValue);
      const riskPct = unitValue > 0 ? (flow.poupanca / unitValue) * 100 : 0;
      const input: SimulationInput = {
        clientName: sim.proponent1.name.trim() || null,
        companyId: sim.companyId,
        companyName,
        developmentId: sim.developmentId,
        developmentName,
        monthlyValue: flow.monthlyValue,
        riskPct,
        withinRisk: sim.companyRisk != null && unitValue > 0 ? riskPct <= sim.companyRisk : null,
        unitValue,
        deliveryDate,
        managerName: gerente,
        proposalDate: genDate,
        state: sim.snapshot,
      };
      const result = sim.editId
        ? await db.simulations.update(sim.editId, input)
        : await db.simulations.create(user.id, input);
      if (!result.ok) return `Proposta gerada, mas falha ao salvar em Relatórios: ${result.error}`;

      if (printError) {
        /*
         * Salvou em Relatórios mas o PDF não saiu. Conta como evento com
         * `resultado: 'erro'` e não como sucesso: a diferença entre "gerou" e
         * "tentou gerar e a impressão falhou" é exatamente o que o painel
         * precisa distinguir para saber se a proposta está quebrada em algum
         * aparelho.
         */
        registrar('proposal_generated', { etapa: 'pdf_falhou', resultado: 'erro', refId: result.data.id });
        return `${printError} A simulação foi salva em Relatórios, dá para gerar o PDF por lá.`;
      }

      registrar('proposal_generated', { resultado: 'ok', refId: result.data.id });
      sim.reset();
      router.replace('/(app)');
      return null;
    } catch (e) {
      // Mensagem crua de exceção não vai para a tela: passa pelo mesmo filtro
      // que o resto do app, e o detalhe técnico fica no log.
      console.error('[simulador] falha ao gerar a proposta:', e);
      return (
        friendlyError(e instanceof Error ? e.message : '') ||
        'Não foi possível gerar a proposta. Tente de novo.'
      );
    } finally {
      setGerando(false);
    }
  }, [user, companies, developments, sim, stored, profile, router]);

  return { gerar, gerando };
}
