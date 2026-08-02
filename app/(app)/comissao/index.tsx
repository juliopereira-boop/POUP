import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';
import { ProFeatureLock } from '@/components/ProFeatureLock';
import { FEATURES } from '@/features/registry';
import { useFeatureAccess } from '@/features/useFeatureAccess';

const feature = FEATURES.find((f) => f.key === 'comissao')!;

export default function ComissaoScreen() {
  const { canUse } = useFeatureAccess();

  if (!canUse('comissao')) {
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
