import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Logo } from '@/components/Logo';
import { MenuCard } from '@/components/MenuCard';
import { Screen } from '@/components/Screen';
import { FEATURES } from '@/features/registry';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing, typography } from '@/theme';

export default function MenuScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  // 2 colunas no celular; 3 em telas largas (PC/tablet).
  const columns = width >= 900 ? 3 : 2;
  const firstName = (user?.displayName ?? user?.email ?? 'corretor').split(' ')[0].split('@')[0];

  return (
    <Screen>
      <View style={styles.topBar}>
        <Logo size={30} />
        <Pressable
          onPress={() => router.push('/(app)/configuracoes')}
          accessibilityLabel="Configurações"
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
        </Pressable>
      </View>

      <Text style={styles.greeting}>Olá, {firstName} 👋</Text>
      <Text style={styles.title}>Menu Principal</Text>

      <View style={styles.grid}>
        {FEATURES.map((feature) => (
          <View
            key={feature.key}
            style={[styles.cell, { width: `${100 / columns}%` }]}
          >
            <MenuCard
              title={feature.title}
              emoji={feature.emoji}
              comingSoon={!feature.ready}
              onPress={() => router.push(feature.route)}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, ...typography.label, fontSize: 16 },
  greeting: { ...typography.body, color: colors.inkMuted },
  title: { ...typography.display, color: colors.ink, marginBottom: spacing.xl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
  },
  cell: {
    padding: spacing.sm,
  },
});
