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
    actions: { gap: spacing.md },
  });
