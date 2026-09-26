import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';

import { LiaAgendaChat } from './LiaAgendaChat';
import { LiaBotao, type HabilidadeLia } from './LiaBotao';
import { LiaMaterialChat } from './LiaMaterialChat';
import { LiaPainel } from './LiaPainel';
import { useLia } from '@/features/lia/LiaProvider';
import { liaDisponivel } from '@/features/store';
import { useFeatureAccess } from '@/features/useFeatureAccess';

export function Lia() {
  const router = useRouter();
  const lia = useLia();
  const encerrarLia = lia.encerrar;
  const { canUse } = useFeatureAccess();
  const acessoPermitido = liaDisponivel && canUse('lia');

  const [painelAberto, setPainelAberto] = useState(false);
  const [materialAberto, setMaterialAberto] = useState(false);
  const [agendaAberta, setAgendaAberta] = useState(false);

  useEffect(() => {
    if (acessoPermitido) return;
    encerrarLia();
    setPainelAberto(false);
    setMaterialAberto(false);
    setAgendaAberta(false);
  }, [acessoPermitido, encerrarLia]);

  /*
   * Abre direto. Antes havia um passo de "Autorizar IA nesta sessão", porque o
   * texto ia para um serviço de IA fora do POUP. Com o cérebro no aparelho
   * (`features/lia/cerebro`), nada sai do celular — o que o corretor digita
   * na LIA é tratado como o que ele digita em qualquer formulário do app.
   */
  const abrir = useCallback((habilidade: HabilidadeLia) => {
    if (habilidade === 'material') setMaterialAberto(true);
    else if (habilidade === 'agenda') setAgendaAberta(true);
    else setPainelAberto(true);
  }, []);

  const levarParaSimulador = useCallback(async () => {
    const completo = await lia.levarParaSimulador();
    if (completo === null) return;
    setPainelAberto(false);

    // Completo = os valores já vieram todos da conversa; o que falta é a unidade
    // e o cliente, que moram no bloco 2.
    router.push(completo ? '/simulador/dados' : '/simulador');
  }, [lia, router]);

  if (!liaDisponivel) return null;
  if (!canUse('lia')) return null;

  return (
    <>
      <LiaBotao onAbrir={abrir} />
      <LiaPainel
        visivel={painelAberto}
        aoFechar={() => {
          lia.encerrar();
          setPainelAberto(false);
        }}
        aoLevarParaSimulador={() => void levarParaSimulador()}
      />
      {materialAberto && <LiaMaterialChat visivel aoFechar={() => setMaterialAberto(false)} />}
      {agendaAberta && <LiaAgendaChat visivel aoFechar={() => setAgendaAberta(false)} />}
    </>
  );
}

