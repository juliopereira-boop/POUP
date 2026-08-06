/**
 * Foto redonda de empresa ou empreendimento.
 *
 * Sem foto cadastrada cai nas INICIAIS sobre fundo laranja claro — nunca num
 * quadrado vazio ou num ícone genérico. Uma lista de construtoras precisa ser
 * reconhecível de relance mesmo antes de o admin subir as fotos.
 */
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, type AppColors } from '@/theme';

interface EntityAvatarProps {
  /** URL pública da foto. `null` mostra as iniciais. */
  photoUrl?: string | null;
  /** Nome da entidade — de onde saem as iniciais. */
  name: string;
  /** Diâmetro em pixels. */
  size?: number;
}

/**
 * Até duas iniciais: primeira e última palavra "de verdade".
 *
 * Preposições ficam de fora para "Construtora e Incorporadora Alfa" não virar
 * "CA" pelo "e" do meio nem "CI" — o que interessa é a marca.
 */
function initials(name: string): string {
  const skip = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', '&']);
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w && !skip.has(w.toLowerCase()));
  if (words.length === 0) return '?';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function EntityAvatar({ photoUrl, name, size = 44 }: EntityAvatarProps) {
  const styles = useThemedStyles(makeStyles);
  // Uma URL quebrada (arquivo apagado no bucket) não pode deixar um buraco na
  // lista: o onError devolve as iniciais.
  const [failed, setFailed] = useState(false);

  const box = {
    width: size,
    height: size,
    borderRadius: radius.pill,
  };

  if (!photoUrl || failed) {
    return (
      <View style={[styles.fallback, box]} accessibilityLabel={name}>
        <Text
          style={[styles.initials, { fontSize: Math.max(11, Math.round(size * 0.38)) }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {initials(name)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: photoUrl }}
      style={[styles.photo, box]}
      onError={() => setFailed(true)}
      resizeMode="cover"
      accessibilityLabel={name}
    />
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    photo: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fallback: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: { color: colors.primary, fontWeight: '700' },
  });
