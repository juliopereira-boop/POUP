/**
 * Mantém os lembretes do celular em dia com a agenda — montado uma vez, no
 * layout do app logado.
 *
 *   - ao entrar: pede a permissão de notificação (a janela do sistema só
 *     aparece da primeira vez) e marca os lembretes;
 *   - ao voltar para o app e a cada mudança na agenda: marca de novo;
 *   - ao tocar na notificação: abre a ficha do agendamento.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { ouvirMudancasDaAgenda } from '@/data';
import { depoisDeFecharJanela } from '@/lib/navegacao';
import {
  agendamentoDaResposta,
  carregarPreferencias,
  LEMBRETES_DISPONIVEIS,
  lerPermissao,
  pedirPermissao,
  sincronizarLembretes,
} from './lembretes';

export function useLembretesDaAgenda(userId: string | null) {
  const router = useRouter();
  const respostaTratada = useRef<string | null>(null);

  useEffect(() => {
    if (!LEMBRETES_DISPONIVEIS || !userId) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const sincronizar = () => {
      if (espera) clearTimeout(espera);
      // Várias gravações seguidas (ex.: reagendar + mudar status) viram uma só.
      espera = setTimeout(() => {
        if (vivo) void sincronizarLembretes(userId);
      }, 600);
    };

    void (async () => {
      const prefs = await carregarPreferencias();
      if (prefs.ativadas && (await lerPermissao()) === 'pode-pedir') await pedirPermissao();
      if (vivo) void sincronizarLembretes(userId);
    })();

    const pararDeOuvir = ouvirMudancasDaAgenda(sincronizar);
    const app = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizar();
    });
    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      pararDeOuvir();
      app.remove();
    };
  }, [userId]);

  // Tocou na notificação: abre a ficha do agendamento. Só no celular — na web a
  // biblioteca nem tem essas funções (e chamar derrubaria a tela).
  useEffect(() => {
    if (!LEMBRETES_DISPONIVEIS || !userId) return;
    const abrir = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const chave = r.notification.request.identifier;
      if (respostaTratada.current === chave) return;
      respostaTratada.current = chave;
      const id = agendamentoDaResposta(r);
      if (id) depoisDeFecharJanela(() => router.push(`/(app)/agendamentos/${id}`));
    };
    // O app estava fechado e abriu pelo toque na notificação.
    void Notifications.getLastNotificationResponseAsync().then(abrir).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(abrir);
    return () => sub.remove();
  }, [router, userId]);
}
