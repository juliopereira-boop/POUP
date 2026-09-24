import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from './Button';
import { DeleteAccountButton } from './DeleteAccountButton';

/** Gestão de conta não depende de assinatura, tanto na web quanto nas lojas. */
export function AccountActions({ includePrivacy = true }: { includePrivacy?: boolean }) {
  const router = useRouter();
  return (
    <View style={{ alignSelf: 'stretch' }}>
      <Button label="Suporte" variant="ghost" onPress={() => router.push('/suporte')} />
      {includePrivacy ? (
        <Button label="Privacidade" variant="ghost" onPress={() => router.push('/privacidade')} />
      ) : null}
      <Button
        label="Métodos de acesso"
        variant="ghost"
        onPress={() => router.push('/acesso-conta')}
      />
      <DeleteAccountButton />
    </View>
  );
}
