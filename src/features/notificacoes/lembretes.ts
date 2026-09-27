/**
 * LEMBRETES DA AGENDA NO CELULAR — com som, mesmo com o app fechado.
 *
 * ===========================================================================
 * POR QUE NÃO TOCAVA NADA
 * ===========================================================================
 * O agendamento guardava "lembrar 60 e 30 minutos antes" no banco, mas nada no
 * app entregava isso ao sistema do celular: não havia biblioteca de
 * notificações, nem pedido de permissão. Agora há.
 *
 * ===========================================================================
 * COMO FUNCIONA
 * ===========================================================================
 * São notificações LOCAIS: o próprio celular marca a hora e toca, sem servidor
 * no meio — funcionam com o app fechado e sem internet na hora do lembrete.
 *
 * `sincronizarLembretes` apaga os lembretes que o POUP marcou e marca de novo
 * a partir da agenda dos próximos 30 dias. Roda quando o app abre, quando volta
 * para a frente e sempre que um agendamento muda (ver
 * `data/mudancasDaAgenda.ts`) — então editar, reagendar, concluir, cancelar ou
 * apagar já corrige o que vai tocar. Na web não existe lembrete agendado.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '@/data';
import { sessionStorage } from '@/lib/storage';
import {
  DIAS_A_FRENTE,
  lerPreferencias,
  planejarLembretes,
  type PreferenciasDeNotificacao,
} from './planejar';

const CHAVE_PREFERENCIAS = 'poup:notificacoes:v1';
/** Todo lembrete da agenda começa com isto — é assim que o POUP acha os seus. */
export const PREFIXO_LEMBRETE = 'poup-agenda:';
const CANAL_COM_SOM = 'lembretes-agenda';
const CANAL_SEM_SOM = 'lembretes-agenda-silencioso';

export const LEMBRETES_DISPONIVEIS = Platform.OS === 'ios' || Platform.OS === 'android';

export type Permissao = 'concedida' | 'negada' | 'pode-pedir' | 'indisponivel';

// --------------------------------------------------------------- preferências

export async function carregarPreferencias(): Promise<PreferenciasDeNotificacao> {
  try {
    return lerPreferencias(await sessionStorage.getItem(CHAVE_PREFERENCIAS));
  } catch {
    return lerPreferencias(null);
  }
}

export async function salvarPreferencias(p: PreferenciasDeNotificacao): Promise<void> {
  await sessionStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p));
}

// ------------------------------------------------------------------ o sistema

let configurado = false;

/** Como o aviso aparece com o app aberto, e os canais do Android. Uma vez só. */
export async function configurarNotificacoes(): Promise<void> {
  if (!LEMBRETES_DISPONIVEIS || configurado) return;
  configurado = true;
  Notifications.setNotificationHandler({
    // Com o app aberto o aviso aparece e toca igual — senão o corretor que
    // está no app na hora da visita não ficaria sabendo.
    handleNotification: async (n) => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: Boolean(n.request.content.sound),
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL_COM_SOM, {
      name: 'Lembretes da agenda',
      description: 'Avisos antes das visitas, reuniões e ligações agendadas.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 300, 200, 300],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(CANAL_SEM_SOM, {
      name: 'Lembretes da agenda (sem som)',
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      enableVibrate: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function lerPermissao(): Promise<Permissao> {
  if (!LEMBRETES_DISPONIVEIS) return 'indisponivel';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'concedida';
  return p.canAskAgain ? 'pode-pedir' : 'negada';
}

/** Pede ao corretor (a janela do sistema só aparece da primeira vez). */
export async function pedirPermissao(): Promise<Permissao> {
  if (!LEMBRETES_DISPONIVEIS) return 'indisponivel';
  await configurarNotificacoes();
  const atual = await lerPermissao();
  if (atual !== 'pode-pedir') return atual;
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return p.granted ? 'concedida' : p.canAskAgain ? 'pode-pedir' : 'negada';
}

async function apagarLembretesDoPoup(): Promise<void> {
  const marcados = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    marcados
      .filter((n) => n.identifier.startsWith(PREFIXO_LEMBRETE))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// ---------------------------------------------------------------- sincronizar

let fila: Promise<number> = Promise.resolve(0);

/**
 * Remarca os lembretes do aparelho a partir da agenda. Devolve quantos ficaram
 * marcados. Duas chamadas seguidas não se atropelam: uma espera a outra.
 */
export function sincronizarLembretes(userId: string): Promise<number> {
  fila = fila.then(() => sincronizarAgora(userId)).catch(() => 0);
  return fila;
}

async function sincronizarAgora(userId: string): Promise<number> {
  if (!LEMBRETES_DISPONIVEIS) return 0;
  await configurarNotificacoes();
  const prefs = await carregarPreferencias();
  if (!prefs.ativadas || (await lerPermissao()) !== 'concedida') {
    await apagarLembretesDoPoup();
    return 0;
  }
  const agora = Date.now();
  const ate = new Date(agora + DIAS_A_FRENTE * 86_400_000);
  const agenda = await db.appointments.listRange(userId, new Date(agora).toISOString(), ate.toISOString());
  const lembretes = planejarLembretes(agenda, prefs, agora);

  await apagarLembretesDoPoup();
  for (const l of lembretes) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIXO_LEMBRETE}${l.chave}`,
      content: {
        title: l.titulo,
        body: l.corpo,
        sound: prefs.som ? 'default' : false,
        data: { appointmentId: l.appointmentId },
        ...(Platform.OS === 'android' ? { priority: Notifications.AndroidNotificationPriority.MAX } : null),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: l.quando,
        channelId: prefs.som ? CANAL_COM_SOM : CANAL_SEM_SOM,
      },
    });
  }
  return lembretes.length;
}

/** "Testar notificação": toca em 5 segundos, com as preferências de agora. */
export async function enviarTeste(): Promise<Permissao> {
  const permissao = await pedirPermissao();
  if (permissao !== 'concedida') return permissao;
  const prefs = await carregarPreferencias();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Teste do POUP',
      body: 'É assim que os lembretes da sua agenda vão aparecer.',
      sound: prefs.som ? 'default' : false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: prefs.som ? CANAL_COM_SOM : CANAL_SEM_SOM,
    },
  });
  return permissao;
}

/** De qual agendamento é a notificação tocada (para abrir a ficha dele). */
export function agendamentoDaResposta(r: Notifications.NotificationResponse | null | undefined): string | null {
  const id = r?.notification.request.content.data?.appointmentId;
  return typeof id === 'string' && id ? id : null;
}
