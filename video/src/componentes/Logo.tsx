/**
 * O "P" do POUP redesenhado em vetor (a partir de assets/logo.png do app), para
 * ficar nítido em qualquer tamanho e trocar a cor da letra conforme o fundo.
 */
import { MARCA } from '../tema';

export const LogoP: React.FC<{ tamanho: number; cor?: string; ponto?: string }> = ({
  tamanho,
  cor = MARCA.tinta,
  ponto = MARCA.laranja,
}) => (
  <svg width={tamanho} height={tamanho} viewBox="300 140 700 960">
    <path
      fillRule="evenodd"
      fill={cor}
      d="M340 172 L690 172 C852 172 948 312 948 490 C948 676 842 808 690 808 L495 808 L492 910 A71 64 0 0 0 350 910 Z
         M497 608 L686 608 A53 53 0 0 1 686 715 L497 715 Z"
    />
    <circle cx={421} cy={996} r={72} fill={ponto} />
  </svg>
);

/** O ícone do app: o "P" no quadrado branco arredondado. */
export const IconeApp: React.FC<{ tamanho: number; sombra?: boolean }> = ({ tamanho, sombra = true }) => (
  <div
    style={{
      width: tamanho,
      height: tamanho,
      borderRadius: tamanho * 0.23,
      background: MARCA.branco,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: sombra ? `0 ${tamanho * 0.08}px ${tamanho * 0.25}px rgba(120, 40, 0, 0.35)` : 'none',
    }}
  >
    <LogoP tamanho={tamanho * 0.72} />
  </div>
);
