import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/providers/ThemeProvider';

export type IconName =
  | 'home'
  | 'calendar'
  | 'contacts'
  | 'menu'
  | 'bell'
  | 'gear'
  | 'house'
  | 'chart'
  | 'briefcase'
  | 'coins'
  | 'handshake'
  | 'building'
  | 'user';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color, strokeWidth = 1.7 }: IconProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' ? (
        <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H4a1 1 0 0 1-1-1z" {...common} />
      ) : null}

      {name === 'calendar' ? (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={3} {...common} />
          <Path d="M3 10h18M8 3v4M16 3v4" {...common} />
        </>
      ) : null}

      {name === 'contacts' ? (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={3} {...common} />
          <Circle cx={12} cy={10.5} r={2.4} {...common} />
          <Path d="M8 16.5c1-1.6 2.4-2.2 4-2.2s3 .6 4 2.2" {...common} />
        </>
      ) : null}

      {name === 'menu' ? <Path d="M4 7h16M4 12h16M4 17h16" {...common} /> : null}

      {name === 'bell' ? (
        <Path
          d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15zM10 21h4"
          {...common}
        />
      ) : null}

      {name === 'gear' ? (
        <>
          <Circle cx={12} cy={12} r={3.2} {...common} />
          <Path
            d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7"
            {...common}
          />
        </>
      ) : null}

      {name === 'house' ? (
        <>
          <Path d="M4 11 12 4.5 20 11v9H4z" {...common} />
          <Path d="M9.5 20v-5h5v5" {...common} />
        </>
      ) : null}

      {name === 'chart' ? (
        <>
          <Path d="M4 20h16" {...common} />
          <Path d="M7 20v-6M12 20V7M17 20v-9" {...common} />
        </>
      ) : null}

      {name === 'briefcase' ? (
        <>
          <Rect x={3} y={7.5} width={18} height={12.5} rx={2.5} {...common} />
          <Path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" {...common} />
        </>
      ) : null}

      {name === 'coins' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...common} />
          <Path d="M12 7.5v9M14.6 9.7c-.6-.7-1.5-1-2.6-1-1.5 0-2.5.7-2.5 1.8s.9 1.5 2.5 1.8c1.6.3 2.6.7 2.6 1.9 0 1.1-1 1.8-2.6 1.8-1.2 0-2.1-.4-2.7-1.1" {...common} />
        </>
      ) : null}

      {name === 'handshake' ? (
        <Path
          d="M3 12.5 7 8.5l3 2.5 2-1.5 2 1.5 3-2.5 4 4-4 4-3-2.5-2 1.5-2-1.5-3 2.5z"
          {...common}
        />
      ) : null}

      {name === 'building' ? (
        <>
          <Rect x={4} y={3.5} width={16} height={17} rx={2.5} {...common} />
          <Path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20.5v-4h4v4" {...common} />
        </>
      ) : null}

      {name === 'user' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.8} {...common} />
          <Path d="M4.5 20.5c1.6-3.4 4.3-5 7.5-5s5.9 1.6 7.5 5" {...common} />
        </>
      ) : null}
    </Svg>
  );
}
