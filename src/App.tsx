import React from 'react';
import { Shell } from './core/ui/basic';
import { sendTemplate } from './core/ui/DCMode';
import { LearnView, PracticeView } from './core/ui/Practice';
import { CircuitPreview } from './core/ui/CircuitPreview';
import { CompareMode, MeshMode, NodalMode, SuperpositionMode, TheveninMode, TransformMode } from './sim/modes';
import { GENS, GLOSSARY, LEARN, TEMPLATES } from './sim/content';

export default function App() {
  return (
    <Shell
      number={4}
      title="Métodos y Técnicas en el Análisis de Circuitos"
      modes={[
        { id: 'nodos', title: '4.2 Nodos y supernodos', render: () => <NodalMode /> },
        { id: 'mallas', title: '4.3 Mallas y supermallas', render: () => <MeshMode /> },
        { id: 'comparar', title: '4.1/4.9 Recomendador y comparación', render: () => <CompareMode /> },
        { id: 'transformar', title: '4.5 Transformación de fuentes', render: () => <TransformMode /> },
        { id: 'thevenin', title: '4.6 Thévenin y Norton', render: () => <TheveninMode /> },
        { id: 'superposicion', title: '4.7 Superposición', render: () => <SuperpositionMode /> },
        { id: 'maxp', title: '4.8 Máxima transferencia', render: () => <TheveninMode maxP /> },
      ]}
      learn={<LearnView sections={LEARN} glossary={GLOSSARY} />}
      practice={<PracticeView gens={GENS} storageKey="sim4" />}
      templates={() => (
        <div className="grid2">
          {TEMPLATES.map((t, i) => (
            <div key={i} className="card">
              <b>{t.name}</b>
              <p className="small">{t.desc}</p>
              <CircuitPreview circuit={t.circuit()} height={150} showNodes={false} />
              <button className="primary" onClick={() => sendTemplate(t.key, t.circuit(), t.mode)}>
                Cargar en la ventanilla 1
              </button>
            </div>
          ))}
        </div>
      )}
    />
  );
}
