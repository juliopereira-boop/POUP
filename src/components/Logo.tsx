import { Mark } from './Mark';

interface LogoProps {
  /** Altura aproximada da logo; a marca é dimensionada a partir disso. */
  size?: number;
  color?: string;
}

/**
 * Logo do POUP = apenas o símbolo oficial (a marca), sem texto.
 * `size` mantém compatibilidade com as chamadas existentes: a marca é
 * proporcional a ele.
 */
export function Logo({ size = 34, color }: LogoProps) {
  return <Mark height={size * 0.5} color={color} />;
}
