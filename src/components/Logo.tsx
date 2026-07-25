import { Mark } from './Mark';

interface LogoProps {
  size?: number;
  color?: string;
}

export function Logo({ size = 34, color }: LogoProps) {
  return <Mark height={size * 0.5} color={color} />;
}
