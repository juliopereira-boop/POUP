/** O celular 3D, com a tela do app dentro. */
import { MARCA } from '../tema';

export const TELA = { largura: 684, altura: 1444 };

export const Celular: React.FC<{
  children: React.ReactNode;
  giroY?: number;
  giroX?: number;
  brilho?: number;
}> = ({ children, giroY = 0, giroX = 0, brilho = 1 }) => (
  <div style={{ perspective: 2600 }}>
    <div
      style={{
        width: TELA.largura + 36,
        height: TELA.altura + 36,
        borderRadius: 96,
        padding: 18,
        boxSizing: 'border-box',
        background: 'linear-gradient(145deg, #2a2d33, #0b0c0f 45%, #1c1e22)',
        transform: `rotateY(${giroY}deg) rotateX(${giroX}deg)`,
        boxShadow: `0 60px 120px rgba(90, 30, 0, 0.45), 0 0 ${140 * brilho}px rgba(255, 190, 120, ${0.45 * brilho})`,
        position: 'relative',
      }}
    >
      <div
        style={{
          width: TELA.largura,
          height: TELA.altura,
          borderRadius: 78,
          overflow: 'hidden',
          background: MARCA.fundoApp,
          position: 'relative',
        }}
      >
        {children}
        {/* Ilha do topo e barra de status. */}
        <div style={{ position: 'absolute', top: 22, left: '50%', marginLeft: -95, width: 190, height: 54, borderRadius: 27, background: '#000' }} />
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 56,
            right: 56,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: 30,
            color: MARCA.tinta,
          }}
        >
          <span>9:41</span>
          <span style={{ letterSpacing: 4 }}>▮▮▮</span>
        </div>
      </div>
      {/* Reflexo no vidro. */}
      <div
        style={{
          position: 'absolute',
          inset: 18,
          borderRadius: 78,
          background: 'linear-gradient(120deg, rgba(255,255,255,0.16) 0%, transparent 32%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  </div>
);
