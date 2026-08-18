/**
 * Tela de TROCAR A SENHA — o segundo passo do "esqueci minha senha".
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTAVA ERRADO
 * ---------------------------------------------------------------------------
 * O link do e-mail apontava para `/login`. Só que clicar nesse link **cria uma
 * sessão de verdade** — é assim que o Supabase prova que quem clicou é o dono
 * da caixa de entrada. Resultado: o `/login` via um usuário autenticado,
 * mandava direto para dentro do app, e a senha continuava exatamente a mesma.
 * Quem pediu para trocar a senha era jogado na tela inicial sem ter trocado
 * nada — e sem nenhuma pista do que aconteceu.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA MORA NA RAIZ, E NÃO EM `(auth)`
 * ---------------------------------------------------------------------------
 * `app/(auth)/_layout.tsx` faz `if (user) return <Redirect href="/" />`. Como o
 * link já autenticou o visitante, dentro daquele grupo esta tela seria expulsa
 * antes de chegar a aparecer — o mesmo bug, de outro jeito. Na raiz não há
 * nenhum porteiro, que é o que este caso pede.
 *
 * ---------------------------------------------------------------------------
 * WEB E CELULAR CHEGAM AQUI POR CAMINHOS DIFERENTES
 * ---------------------------------------------------------------------------
 * Na web o cliente do Supabase é criado com `detectSessionInUrl`: ele lê os
 * tokens do endereço, instala a sessão e **limpa o endereço** logo em seguida.
 * Por isso a tela não tenta ler a URL na web — quando ela monta, o fragmento
 * já pode ter sido consumido. O que se faz é esperar a sessão aparecer.
 *
 * No celular não existe "endereço da página": o link chega como deep link
 * (`poup://redefinir-senha#access_token=...`) e os tokens precisam ser
 * instalados na mão — é o que `applyRecoveryLink` faz.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SAI DA CONTA NO FIM
 * ---------------------------------------------------------------------------
 * Porque foi exatamente isso que o corretor pediu ao clicar em "esqueci minha
 * senha": trocar a senha, não entrar. Entrar sozinho depois de trocar deixaria
 * a dúvida de sempre — "será que salvou?". Voltar para o login e pedir a senha
 * nova responde essa pergunta na hora, com a própria senha.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { spacing, typography, type AppColors } from '@/theme';

/** Mínimo do Supabase. Repetido aqui para avisar ANTES de ir ao servidor. */
const MIN_SENHA = 6;

/*
 * Quanto esperar pela sessão antes de desistir.
 *
 * Na web o `detectSessionInUrl` roda de forma assíncrona e pode terminar
 * depois desta tela montar; sem espera, um link perfeitamente válido seria
 * declarado expirado por milésimos de segundo. Oito segundos é folgado para
 * uma leitura local e ainda curto o bastante para ninguém ficar olhando para
 * um "verificando" eterno quando o link realmente não vale mais.
 */
const ESPERA_MS = 8000;
const INTERVALO_MS = 250;

type Estado = 'verificando' | 'pronto' | 'invalido' | 'salvo';

export default function RedefinirSenhaScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { applyRecoveryLink, updatePassword, signOut } = useAuth();

  const [estado, setEstado] = useState<Estado>('verificando');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  // A URL que abriu o app. Só serve no celular; na web o Supabase já cuidou.
  const urlInicial = Linking.useURL();

  // Evita instalar a mesma URL duas vezes: `useURL` reemite quando o app volta
  // do segundo plano, e um `setSession` repetido não é de graça.
  const jaAplicado = useRef<string | null>(null);

  const esperarSessao = useCallback(async (): Promise<boolean> => {
    const limite = Date.now() + ESPERA_MS;
    for (;;) {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
      if (Date.now() >= limite) return false;
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }
  }, []);

  useEffect(() => {
    let vivo = true;

    async function preparar() {
      // Celular: os tokens vêm no deep link e ninguém os instala por nós.
      if (Platform.OS !== 'web' && urlInicial && jaAplicado.current !== urlInicial) {
        jaAplicado.current = urlInicial;
        const r = await applyRecoveryLink(urlInicial);
        if (!vivo) return;
        if (!r.ok) {
          setMotivo(r.error);
          setEstado('invalido');
          return;
        }
      }

      const temSessao = await esperarSessao();
      if (!vivo) return;
      if (temSessao) {
        setEstado('pronto');
      } else {
        setMotivo('Este link de redefinição expirou ou já foi usado.');
        setEstado('invalido');
      }
    }

    preparar();
    return () => {
      vivo = false;
    };
  }, [applyRecoveryLink, esperarSessao, urlInicial]);

  async function salvar() {
    setErro(null);
    if (senha.length < MIN_SENHA) {
      setErro(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (senha !== repetir) {
      setErro('As duas senhas não são iguais.');
      return;
    }

    setSalvando(true);
    const r = await updatePassword(senha);
    if (!r.ok) {
      setSalvando(false);
      setErro(r.error);
      return;
    }

    /*
     * A senha já está trocada no servidor. O `signOut` daqui em diante é
     * higiene: encerra a sessão de recuperação e limpa o que ficou no
     * aparelho. Se ele falhar, a troca continua valendo — por isso o `catch`
     * vazio, e por isso a tela vai para o sucesso de qualquer jeito.
     */
    await signOut().catch(() => undefined);
    setSalvando(false);
    setEstado('salvo');
  }

  if (estado === 'verificando') {
    return (
      <Screen center>
        <View style={styles.centro}>
          <Logo size={40} />
          <Text style={styles.titulo}>Verificando o link…</Text>
        </View>
      </Screen>
    );
  }

  if (estado === 'invalido') {
    return (
      <Screen center>
        <View style={styles.centro}>
          <Logo size={40} />
        </View>
        <Text style={styles.titulo}>Link expirado</Text>
        <Text style={styles.texto}>
          {motivo ?? 'Este link de redefinição não vale mais.'} Por segurança, o link do e-mail
          dura pouco tempo e só pode ser usado uma vez. Peça um novo — leva alguns segundos.
        </Text>
        <Button
          label="Pedir um novo link"
          onPress={() => router.replace('/(auth)/forgot-password')}
          style={styles.cta}
        />
        <Button
          label="Voltar para o login"
          variant="ghost"
          onPress={() => router.replace('/(auth)/login')}
        />
      </Screen>
    );
  }

  if (estado === 'salvo') {
    return (
      <Screen center>
        <View style={styles.centro}>
          <Logo size={40} />
        </View>
        <Text style={styles.titulo}>Senha alterada</Text>
        <Text style={styles.texto}>
          Pronto. Entre com a senha nova para confirmar que ficou como você quer.
        </Text>
        <Button
          label="Ir para o login"
          onPress={() => router.replace('/(auth)/login')}
          style={styles.cta}
        />
      </Screen>
    );
  }

  return (
    <Screen center>
      <View style={styles.centro}>
        <Logo size={40} />
      </View>
      <Text style={styles.titulo}>Criar uma senha nova</Text>
      <Text style={styles.texto}>
        Escolha a senha que você vai usar a partir de agora. Mínimo de {MIN_SENHA} caracteres.
      </Text>

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      <Input
        label="Nova senha"
        value={senha}
        onChangeText={setSenha}
        placeholder="Sua nova senha"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Input
        label="Repita a nova senha"
        value={repetir}
        onChangeText={setRepetir}
        placeholder="Digite de novo"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={salvar}
        returnKeyType="done"
      />

      <Button label="Salvar nova senha" onPress={salvar} loading={salvando} style={styles.cta} />
      <Button
        label="Cancelar"
        variant="ghost"
        onPress={() => router.replace('/(auth)/login')}
      />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    centro: { alignItems: 'center', marginBottom: spacing.xl },
    titulo: {
      ...typography.title,
      color: colors.primary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    texto: {
      ...typography.body,
      color: colors.inkMuted,
      marginBottom: spacing.xl,
      textAlign: 'center',
    },
    cta: { marginTop: spacing.sm, marginBottom: spacing.sm },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
  });
