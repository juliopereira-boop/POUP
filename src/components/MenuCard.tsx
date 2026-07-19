import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing, typography } from '@/theme';

interface MenuCardProps {
  title: string;
  emoji: string;
  onPress: () => void;
  /** Marca o item como "em breve" quando a feature ainda não foi construída. */
  comingSoon?: boolean;
}

/**
 * Card do menu principal — grade 2 colunas, como na referência do app.
 * Usa emoji como ícone provisório (fácil de trocar por ícones 3D/PNG depois).
 */
export function MenuCard({ title, emoji, onPress, comingSoon = false }: MenuCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {comingSoon ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Em breve</Text>
        </View>
      ) : null}
      <View style={styles.iconWrap}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    marginBottom: spacing.md,
  },
  emoji: {
    fontSize: 44,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.warning,
    fontWeight: '600',
  },
});
