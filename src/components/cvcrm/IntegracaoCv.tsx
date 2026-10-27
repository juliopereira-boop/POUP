/**
 * "INTEGRAR CV" — A CONTA DO CV DE UMA CONSTRUTORA.
 *
 * Fica no cadastro da construtora (Catálogo do sistema), só para o admin do
 * POUP. Cada construtora que usa o CV CRM tem a sua conta: o endereço
 * (https://<conta>.cvcrm.com.br), o e-mail e o token do usuário de
 * integração que ela criou no CV.
 *
 *   • "Testar conexão" pergunta ao CV, sem gravar nada.
 *   • "Salvar integração" testa de novo e só grava se o CV aceitar. O token
 *     vai direto para o cofre do servidor (Vault) e nunca mais volta para o
 *     aplicativo: nem o admin o vê de novo. Para trocar, digita outro.
 *   • "Desligar" apaga o token. Os empreendimentos dela perdem a cor; os
 *     vínculos ficam, e integrar de novo devolve as cores.
 *
 * Com a conta conectada, mais dois botões (liga e desliga):
 *   • "Habilitar reserva": o corretor reserva a unidade no CV pelo relatório
 *     da simulação (o CPF do cliente acha o pré-cadastro; o CPF do corretor,
 *     o corretor e a imobiliária). Aqui o admin escolhe também qual SÉRIE do
 *     CV recebe cada parte do fluxo (ato, mensais…). Ver docs/CVCRM_RESERVA.md.
 *   • "Tabela de preço do CV": ligada, o preço dos empreendimentos da
 *     construtora vem só da tabela do CV. A tabela enviada à mão fica
 *     guardada e volta se desligar.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Select } from '@/components/Select';
import { ToggleField } from '@/components/ToggleField';
import { db, type ContaDoCv, type IntegracaoCv as Integracao } from '@/data';
import { haQuanto } from '@/features/disponibilidade/aplicar';
import { PARTES_DA_RESERVA, type ParteDaReserva } from '@/features/disponibilidade/condicoesDaReserva';
import { confirmar } from '@/lib/confirmar';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Props {
  companyId: string;
  /** O nome da construtora, para as mensagens. */
  empresa: string;
}

const ROTULO: Record<Integracao['situacao'], string> = {
  ok: 'Conectado',
  erro: 'Com erro',
  pendente: 'Não integrado',
};

const quantos = (n: number | null) =>
  n == null ? 'O CV aceitou a conta.' : `O CV aceitou a conta: ${n} ${n === 1 ? 'empreendimento' : 'empreendimentos'} nela.`;

export function IntegracaoCv({ companyId, empresa }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  // undefined = carregando; null = nunca integrada.
  const [integracao, setIntegracao] = useState<Integracao | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [ocupado, setOcupado] = useState<'testar' | 'salvar' | 'testar_salva' | 'desligar' | 'recurso' | 'ler' | null>(
    null,
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = useCallback(async () => {
    setAgora(Date.now());
    const r = await db.disponibilidade.integracao(companyId);
    if (r.ok) setIntegracao(r.data);
    else {
      setIntegracao(null);
      setErro(r.error);
    }
  }, [companyId]);

  useEffect(() => {
    setIntegracao(undefined);
    setEditando(false);
    setToken('');
    setAviso(null);
    setErro(null);
    void carregar();
  }, [carregar]);

  const ligada = Boolean(integracao && integracao.situacao !== 'pendente' && integracao.temToken);

  function abrirFormulario() {
    setUrl(integracao?.url ?? '');
    setEmail(integracao?.email ?? '');
    setToken('');
    setAviso(null);
    setErro(null);
    setEditando(true);
  }

  function conta(): ContaDoCv | null {
    if (!url.trim() || !email.trim()) {
      setErro('Preencha o endereço do CV e o e-mail do usuário de integração.');
      return null;
    }
    if (!token.trim() && !ligada) {
      setErro('Informe o token do usuário de integração do CV.');
      return null;
    }
    return { url, email, token };
  }

  async function testar() {
    setAviso(null);
    setErro(null);
    const c = conta();
    if (!c) return;
    setOcupado('testar');
    const r = await db.disponibilidade.testarIntegracao(companyId, c);
    setOcupado(null);
    if (r.ok) setAviso(quantos(r.data.empreendimentos));
    else setErro(r.error);
  }

  async function salvar() {
    setAviso(null);
    setErro(null);
    const c = conta();
    if (!c) return;
    setOcupado('salvar');
    const r = await db.disponibilidade.salvarIntegracao(companyId, c);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setToken('');
    setEditando(false);
    setAviso(`${quantos(r.data.empreendimentos)} Integração salva para ${empresa}.`);
    await carregar();
  }

  async function testarSalva() {
    setAviso(null);
    setErro(null);
    setOcupado('testar_salva');
    const r = await db.disponibilidade.testarIntegracao(companyId);
    setOcupado(null);
    if (r.ok) setAviso(quantos(r.data.empreendimentos));
    else setErro(r.error);
    await carregar();
  }

  async function desligar() {
    const n = integracao?.empreendimentos ?? 0;
    const seguir = await confirmar(
      'Desligar o CV',
      `O token de ${empresa} é apagado do servidor e ${
        n ? `os ${n} empreendimentos dela deixam` : 'os empreendimentos dela deixam'
      } de mostrar a disponibilidade. Os vínculos das unidades ficam guardados: integrar de novo devolve as cores. Nada muda no CV.`,
      'Desligar',
    );
    if (!seguir) return;
    setAviso(null);
    setErro(null);
    setOcupado('desligar');
    const r = await db.disponibilidade.removerIntegracao(companyId);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setEditando(false);
    setAviso('Integração desligada.');
    await carregar();
  }

  async function mudarRecurso(qual: 'reserva' | 'tabelaPreco', ligar: boolean) {
    if (qual === 'tabelaPreco') {
      const n = integracao?.empreendimentos ?? 0;
      const seguir = await confirmar(
        ligar ? 'Tabela de preço do CV' : 'Voltar à tabela enviada',
        ligar
          ? `O preço ${n ? `dos ${n} empreendimentos` : 'dos empreendimentos'} de ${empresa} passa a vir só da tabela de preço do CV (a aprovada e vigente). A tabela enviada à mão fica guardada e volta se você desligar. Enquanto estiver ligada, ninguém troca a tabela à mão.`
          : `Os empreendimentos de ${empresa} voltam para a tabela enviada à mão (a que estava antes do CV).`,
        ligar ? 'Ligar' : 'Desligar',
      );
      if (!seguir) return;
    }
    setAviso(null);
    setErro(null);
    setOcupado('recurso');
    const r = await db.disponibilidade.definirRecursos(
      companyId,
      qual === 'reserva' ? { reserva: ligar } : { tabelaPreco: ligar },
    );
    if (r.ok && ligar) await db.disponibilidade.lerComercialAgora(companyId);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setIntegracao(r.data);
    if (ligar) setAviso('Ligado. A leitura do CV já foi pedida: em um ou dois minutos o resultado aparece aqui.');
  }

  async function escolherSerie(parte: ParteDaReserva, valor: string) {
    if (!integracao) return;
    const id = Number(valor);
    setErro(null);
    setOcupado('recurso');
    const r = await db.disponibilidade.definirSeries(companyId, {
      ...integracao.seriesReserva,
      [parte]: Number.isInteger(id) && id > 0 ? id : null,
    });
    setOcupado(null);
    if (r.ok) setIntegracao(r.data);
    else setErro(r.error);
  }

  async function lerAgora() {
    setAviso(null);
    setErro(null);
    setOcupado('ler');
    const r = await db.disponibilidade.lerComercialAgora(companyId);
    setOcupado(null);
    if (r.ok) setAviso('Leitura pedida ao CV. Em um ou dois minutos o resultado aparece aqui.');
    else setErro(r.error);
  }

  if (integracao === undefined) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const situacao = integracao?.situacao ?? 'pendente';
  const ultima = haQuanto(integracao?.ultimaLeveEm ?? null, agora);

  return (
    <View style={styles.card}>
      <View style={styles.cabeca}>
        <Text style={styles.titulo}>CV CRM</Text>
        <Text
          style={[
            styles.selo,
            situacao === 'ok' ? styles.seloOk : situacao === 'erro' ? styles.seloErro : styles.seloPendente,
          ]}
        >
          {ROTULO[situacao]}
        </Text>
      </View>
      <Text style={styles.dica}>
        Com o CV integrado, a tabela de preço e o simulador mostram cada unidade pintada conforme o CV desta construtora:
        verde disponível, amarelo reservada, vermelho vendida, cinza bloqueada. O POUP só lê o CV, nunca altera nada lá.
      </Text>

      {ligada && !editando ? (
        <>
          <Text style={styles.texto}>{integracao?.url}</Text>
          <Text style={styles.meta}>
            Usuário de integração: {integracao?.email} · token guardado no servidor
          </Text>
          <Text style={styles.meta}>
            {integracao?.empreendimentos
              ? `${integracao.empreendimentos} ${integracao.empreendimentos === 1 ? 'empreendimento ligado' : 'empreendimentos ligados'}`
              : 'Nenhum empreendimento ligado ainda (Configurações › Disponibilidade do CV › Importar)'}
            {ultima ? ` · última leitura ${ultima}` : ''}
          </Text>
          {situacao === 'erro' && integracao?.ultimoErro ? (
            <Text style={styles.erro}>Último erro: {integracao.ultimoErro.slice(0, 240)}</Text>
          ) : null}

          <View style={styles.recursos}>
            <ToggleField
              label="Habilitar reserva"
              value={Boolean(integracao?.reservaHabilitada)}
              onChange={(v) => void mudarRecurso('reserva', v)}
              onLabel="Ligada"
              offLabel="Desligada"
            />
            <Text style={styles.meta}>
              {integracao?.corretores
                ? `${integracao.corretores} corretores do CV reconhecidos pelo CPF`
                : 'Corretores do CV ainda não lidos'}
              {integracao?.corretoresLidosEm ? ` · lidos ${haQuanto(integracao.corretoresLidosEm, agora) ?? ''}` : ''}
            </Text>
            {integracao?.corretoresErro ? (
              <Text style={styles.erro}>Corretores: {integracao.corretoresErro.slice(0, 200)}</Text>
            ) : null}
            {integracao?.reservaHabilitada ? (
              <>
                <Text style={styles.dica}>
                  O corretor vê "Reservar no CV" no relatório da simulação. O POUP confere a unidade, o cliente (pelo CPF,
                  no pré-cadastro) e o corretor (pelo CPF do perfil) e cria a reserva no CV com o fluxo da simulação.
                </Text>
                <Text style={styles.subtitulo}>Séries da reserva no CV</Text>
                {integracao.series.length === 0 ? (
                  <Text style={styles.meta}>
                    As séries do CV aparecem depois da primeira leitura ("Ler corretores e tabela agora").
                  </Text>
                ) : (
                  PARTES_DA_RESERVA.map(({ parte, rotulo }) => (
                    <Select
                      key={parte}
                      label={rotulo}
                      placeholder="Sem série"
                      value={integracao.seriesReserva[parte] ? String(integracao.seriesReserva[parte]) : null}
                      options={[
                        { value: '0', label: 'Sem série (não vai na reserva)' },
                        ...integracao.series.map((x) => ({ value: String(x.id), label: `${x.nome} (${x.id})` })),
                      ]}
                      onChange={(v) => void escolherSerie(parte, v)}
                    />
                  ))
                )}
              </>
            ) : null}

            <ToggleField
              label="Tabela de preço do CV"
              value={Boolean(integracao?.tabelaPrecoCv)}
              onChange={(v) => void mudarRecurso('tabelaPreco', v)}
              onLabel="Ligada"
              offLabel="Desligada"
            />
            {integracao?.tabelaPrecoCv ? (
              <Text style={styles.meta}>
                {integracao.tabelaLidaEm
                  ? `Tabela lida ${haQuanto(integracao.tabelaLidaEm, agora) ?? ''}`
                  : 'Tabela ainda não lida'}
              </Text>
            ) : null}
            {integracao?.tabelaPrecoCv && integracao.tabelaErro ? (
              <Text style={styles.erro}>Tabela: {integracao.tabelaErro.slice(0, 200)}</Text>
            ) : null}
            <Button
              label="Ler corretores e tabela agora"
              variant="ghost"
              onPress={() => void lerAgora()}
              loading={ocupado === 'ler'}
              disabled={ocupado !== null}
            />
          </View>
          <View style={styles.botoes}>
            <Button
              label="Testar agora"
              variant="secondary"
              onPress={() => void testarSalva()}
              loading={ocupado === 'testar_salva'}
              disabled={ocupado !== null}
            />
            <Button label="Alterar conta" variant="secondary" onPress={abrirFormulario} disabled={ocupado !== null} />
            <Button
              label="Desligar"
              variant="danger"
              onPress={() => void desligar()}
              loading={ocupado === 'desligar'}
              disabled={ocupado !== null}
            />
          </View>
        </>
      ) : null}

      {!ligada && !editando ? (
        <Button label="Integrar CV" onPress={abrirFormulario} />
      ) : null}

      {editando ? (
        <View style={styles.formulario}>
          <Input
            label="Endereço do CV"
            value={url}
            onChangeText={setUrl}
            placeholder="https://suaconta.cvcrm.com.br"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Input
            label="E-mail do usuário de integração"
            value={email}
            onChangeText={setEmail}
            placeholder="integracao@construtora.com.br"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Input
            label="Token"
            value={token}
            onChangeText={setToken}
            placeholder={ligada ? 'Deixe vazio para manter o token salvo' : 'Token do usuário de integração'}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.dica}>
            Use um usuário do CV só para a integração, com acesso aos empreendimentos da construtora, e o token dele. O
            token fica guardado no cofre do servidor e não aparece de novo, nem para você.
          </Text>
          <View style={styles.botoes}>
            <Button
              label="Testar conexão"
              variant="secondary"
              onPress={() => void testar()}
              loading={ocupado === 'testar'}
              disabled={ocupado !== null}
            />
            <Button
              label="Salvar integração"
              onPress={() => void salvar()}
              loading={ocupado === 'salvar'}
              disabled={ocupado !== null}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => {
                setEditando(false);
                setToken('');
                setErro(null);
              }}
              disabled={ocupado !== null}
            />
          </View>
        </View>
      ) : null}

      {aviso ? <Text style={styles.ok}>{aviso}</Text> : null}
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    cabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    titulo: { ...typography.body, color: colors.ink, fontWeight: '600' },
    subtitulo: { ...typography.label, color: colors.ink, marginTop: spacing.sm },
    selo: {
      ...typography.caption,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    seloOk: { color: colors.success, backgroundColor: colors.successSoft },
    seloErro: { color: colors.danger, backgroundColor: colors.dangerSoft },
    seloPendente: { color: colors.inkMuted, backgroundColor: colors.surfaceAlt },
    texto: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.inkMuted },
    dica: { ...typography.caption, color: colors.inkMuted },
    recursos: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.xs,
    },
    formulario: { marginTop: spacing.sm },
    botoes: { gap: spacing.sm, marginTop: spacing.sm },
    ok: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
  });
