import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

export default function CadastrosScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen>
      <Text style={styles.intro}>
        Cadastre as construtoras e seus empreendimentos. Eles serão usados em vários módulos,
        principalmente no Simulador de poupança.
      </Text>
      {/* O catálogo é o caminho mais rápido, e ninguém acha o que não sabe que
          existe: o atalho precisa ser anunciado aqui, na porta de entrada. */}
      <Text style={styles.intro}>
        Em “Cadastro de empresas”, a aba <Text style={styles.strong}>Catálogo do sistema</Text> traz
        construtoras que o POUP já configurou — com empreendimentos e regra de comissão prontos.
        Você adota com um toque e as atualizações chegam sozinhas.
      </Text>

      <View style={styles.actions}>
        <Button
          label="🏢  Cadastro de empresas"
          variant="secondary"
          onPress={() => router.push('/(app)/cadastros/empresas')}
        />
        <Button
          label="🏗️  Cadastro de empreendimentos"
          variant="secondary"
          onPress={() => router.push('/(app)/cadastros/empreendimentos')}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: {
      ...typography.body,
      color: colors.inkMuted,
      marginBottom: spacing.xl,
    },
    strong: { color: colors.ink, fontWeight: '700' },
    actions: { gap: spacing.md },
  });
