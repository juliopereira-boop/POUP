import { FeaturePlaceholder } from '@/components/FeaturePlaceholder';
import { FEATURES } from '@/features/registry';

const feature = FEATURES.find((f) => f.key === 'material-venda')!;

export default function MaterialVendaScreen() {
  return (
    <FeaturePlaceholder
      emoji={feature.emoji}
      title={feature.title}
      description={feature.description}
    />
  );
}
