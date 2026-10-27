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
 * O CV só é LIDO: a integração serve para sinalizar a disponibilidade das
 * unidades. A reserva de unidade pelo POUP está só no papel
 * (docs/CVCRM_RESERVA.md).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { db, type ContaDoCv, type IntegracaoCv as Integracao } from '@/data';
import { haQuanto } from '@/features/disponibilidade/aplicar';
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
  const [ocupado, setOcupado] = useState<'testar' | 'salvar' | 'testar_salva' | 'desligar' | null>(null);
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

      <Text style={styles.reserva}>
        Reserva de unidade pelo POUP: em preparação. Por enquanto, a integração só sinaliza a disponibilidade.
      </Text>
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
    reserva: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.xs },
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
