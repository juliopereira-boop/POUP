import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';
import { ProFeatureLock } from '@/components/ProFeatureLock';
import { FEATURES } from '@/features/registry';
import { useFeatureAccess } from '@/features/useFeatureAccess';

const feature = FEATURES.find((f) => f.key === 'vendas')!;

export default function VendasScreen() {
  const { canUse } = useFeatureAccess();

  if (!canUse('vendas')) {
    return (
      <ProFeatureLock
        emoji={feature.emoji}
        title={feature.title}
        description={feature.description}
      />
    );
  }

  return (
    <FeaturePlaceholder
      emoji={feature.emoji}
      title={feature.title}
      description={feature.description}
    />
  );
}
