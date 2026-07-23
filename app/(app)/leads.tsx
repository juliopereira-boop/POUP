import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';
import { FEATURES } from '@/features/registry';

const feature = FEATURES.find((f) => f.key === 'leads')!;

export default function LeadsScreen() {
  return (
    <FeaturePlaceholder
      emoji={feature.emoji}
      title={feature.title}
      description={feature.description}
    />
  );
}
