import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';
import { FEATURES } from '@/features/registry';

const feature = FEATURES.find((f) => f.key === 'simulador')!;

export default function SimuladorScreen() {
  return (
    <FeaturePlaceholder
      emoji={feature.emoji}
      title={feature.title}
      description={feature.description}
    />
  );
}
