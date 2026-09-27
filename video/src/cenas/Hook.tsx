/** 1. HOOK (0–75): tela preta, a pergunta digitada letra por letra, cursor piscando. */
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { FONTE, FRIO } from '../tema';
import { letras } from '../util';

export const PERGUNTA = 'Quanto tempo você leva pra simular um financiamento?';

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const texto = letras(PERGUNTA, f, 4, 1.05);
  const digitando = texto.length < PERGUNTA.length;
  // Pisca a cada meia batida; enquanto digita, fica aceso.
  const cursorAceso = digitando || Math.floor(f / 8) % 2 === 0;
  return (
    <AbsoluteFill style={{ background: '#000', justifyContent: 'center', padding: '0 90px' }}>
      <div
        style={{
          fontFamily: FONTE,
          fontWeight: 700,
          fontSize: 92,
          lineHeight: 1.12,
          letterSpacing: -2,
          color: FRIO.texto,
        }}
      >
        {texto}
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 92,
            marginLeft: 8,
            verticalAlign: '-12px',
            background: FRIO.texto,
            opacity: cursorAceso ? 1 : 0,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
