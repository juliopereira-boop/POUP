import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';
import { FEATURES } from '@/features/registry';

const feature = FEATURES.find((f) => f.key === 'vendas')!;

export default function VendasScreen() {
  return (
    <FeaturePlaceholder
      emoji={feature.emoji}
      title={feature.title}
      description={feature.description}
    />
  );
}
