import React from 'react';
import { analyze } from '../core/engine/analyze';
import { pick, randomGridCircuit } from '../core/engine/generate';
import { maxPower, thevenin } from '../core/engine/methods/thevenin';
import { meshAnalysis } from '../core/engine/methods/mesh';
import { nodalAnalysis } from '../core/engine/methods/nodal';
import { texQ } from '../core/engine/units';
import { Tex } from '../core/ui/basic';
import { ExerciseGen, LearnSection } from '../core/ui/Practice';
import { BOX, P, T } from '../core/ui/panels';
import { CircuitPreview } from '../core/ui/CircuitPreview';
import { cuaderno10, cuaderno14, cuaderno4, cuadernoVDelta, soloDependientes, theveninEjemplo, tp4Nodos1 } from './calc';

export const LEARN: LearnSection[] = [
  { title: '4.1 Terminología', body: <p><b>Nodo:</b> unión de elementos. <b>Nodo esencial</b>: une 3 o más elementos. <b>Rama</b>: camino entre dos nodos; <b>rama esencial</b>: entre dos nodos esenciales sin pasar por otro. <b>Lazo</b>: camino cerrado; <b>malla</b>: lazo que no encierra otros. <b>Circuito planar</b>: se puede dibujar sin cruces (solo en ellos se usan mallas).</p> },
  {
    title: '4.2 Nodos y supernodos',
    body: (
      <>
        <ol>
          <li>Elegir la referencia y nombrar V₁, V₂…</li>
          <li>Dibujar en cada nodo las corrientes que SALEN.</li>
          <li>LCK en cada nodo (menos la referencia), con Ohm: <Tex tex="I = (V_i - V_j)/R" />.</li>
          <li>Fuente de voltaje entre dos nodos: ecuación <Tex tex="V_{(+)} - V_{(-)} = E" /> y supernodo.</li>
        </ol>
        <CircuitPreview circuit={tp4Nodos1()} height={200} />
        <p className="small">TP4, ejercicio 1: Iₐ = 0,84 A; V₁₅ = 12,54 V; P₁₅ = 10,48 W.</p>
      </>
    ),
  },
  {
    title: '4.3 Mallas y supermallas',
    body: (
      <>
        <p>Corrientes de malla en sentido horario; LVK en cada malla con las caídas de las resistencias positivas. Fuente de corriente en rama exterior: <Tex tex="I_m = \pm I_s" />; compartida: <Tex tex="I_a - I_b = I_s" /> y LVK en la supermalla.</p>
        <CircuitPreview circuit={cuaderno10()} height={200} showMeshes />
      </>
    ),
  },
  { title: '4.4 Fuentes dependientes', body: <p>La variable de control se escribe en función de las incógnitas (V de nodo o I de malla) y se sustituye. Ej.: <Tex tex="V_\Delta = 30 I_4" />, <Tex tex="i = I_y - I_z" />.</p> },
  { title: '4.5 Transformación de fuentes', body: <Tex block tex="E\ \text{en serie con } R \;\Longleftrightarrow\; I = E/R\ \text{en paralelo con } R" /> },
  { title: '4.6 Thévenin y Norton', body: <p>Retirar la carga, marcar a y b, E_TH en circuito abierto y R_TH: (1) solo independientes → apagar fuentes; (2) con dependientes → <Tex tex="R_{TH} = E_{TH}/I_{CC}" />; (3) solo dependientes → fuente de prueba de 1 V o 1 A. Norton: <Tex tex="I_N = E_{TH}/R_{TH}" />.</p> },
  { title: '4.7 Superposición', body: <p>Una fuente independiente a la vez (V → corto, I → abierto); las dependientes se quedan. Se suman las respuestas. La potencia NO se superpone.</p> },
  { title: '4.8 Máxima transferencia', body: <Tex block tex="R_L = R_{TH},\qquad P_{max} = \frac{E_{TH}^2}{4R_{TH}},\qquad \eta = 50\,\%" /> },
  { title: '4.9 Resolución del sistema', body: <p>Sustitución, Cramer (<Tex tex="x_k = \Delta_k/\Delta" />) o Gauss (eliminación hacia adelante y sustitución hacia atrás). En la ventanilla 2 puede elegir cuál mostrar.</p> },
];

export const GLOSSARY = [
  { term: 'Supernodo', def: 'Dos nodos unidos por una fuente de voltaje que se tratan juntos en la LCK.' },
  { term: 'Supermalla', def: 'Dos mallas que comparten una fuente de corriente; se escribe una LVK por el contorno exterior.' },
  { term: 'Fuente de prueba', def: 'Fuente de 1 V o 1 A colocada en los terminales para hallar R_TH cuando solo hay dependientes.' },
  { term: 'Circuito planar', def: 'Circuito que puede dibujarse sin que se crucen sus ramas.' },
];

export const GENS: ExerciseGen[] = [
  {
    id: 'Nodos',
    subtopic: '4.2 Nodos',
    gen: (r, l) => {
      const c = randomGridCircuit(r, { cols: 2, rows: 1, vSources: 1, iSources: l === 'basico' ? 0 : 1, dependent: l === 'examen' });
      const a = analyze(c);
      const n = nodalAnalysis(a.net);
      const k = 1 + Math.floor(r() * (a.net.nodeCount - 1));
      return { prompt: `Resuelva por nodos (referencia ⏚) y halle el voltaje del nodo (${a.net.nodeNames[k]}).`, circuit: c, answers: [{ label: `V_{${a.net.nodeNames[k]}}`, value: a.dc!.V[k], unit: 'V' }], hints: ['Escriba las corrientes que salen de cada nodo con Ohm.', 'Si hay una fuente de voltaje a la referencia, ese nodo es conocido.'], solution: [...n.eqs.map((e) => T(e.raw, `(${e.n})`)), BOX(`V_{${a.net.nodeNames[k]}} = ${texQ(a.dc!.V[k], 'V')}`)] };
    },
  },
  {
    id: 'Mallas',
    subtopic: '4.3 Mallas',
    gen: (r, l) => {
      const c = randomGridCircuit(r, { cols: l === 'basico' ? 2 : 3, rows: 1, vSources: 2, iSources: l === 'examen' ? 1 : 0 });
      const a = analyze(c);
      const m = meshAnalysis(a.net, a.topo);
      const name = pick(r, m.meshNames);
      return { prompt: `Resuelva por mallas (corrientes en sentido horario) y halle $${name}$.`, circuit: c, answers: [{ label: name, value: m.system!.values!.get(name)!, unit: 'A' }], hints: ['Numere las mallas de izquierda a derecha.', 'Si hay una fuente de corriente compartida, forme una supermalla.'], solution: [...m.eqs.map((e) => T(e.raw, `(${e.n})`)), BOX(`${name} = ${texQ(m.system!.values!.get(name)!, 'A')}`)] };
    },
  },
  {
    id: 'Thévenin',
    subtopic: '4.6 Thévenin',
    gen: (r) => {
      const c = randomGridCircuit(r, { cols: 2, rows: 1, vSources: 1, iSources: pick(r, [0, 1]) });
      const a = analyze(c);
      const RL = pick(r, a.net.elements.filter((e) => e.kind === 'R'));
      const th = thevenin(a.net, RL.n1, RL.n2, [RL.id]);
      return { prompt: `Halle el equivalente de Thévenin visto por ${RL.label} (se retira ${RL.label}; terminal a = su lado +).`, circuit: c, answers: [{ label: 'E_{TH}', value: th.Eth, unit: 'V' }, { label: 'R_{TH}', value: th.Rth, unit: 'Ω' }], hints: ['E_TH con la carga retirada.', 'R_TH con las fuentes apagadas.'], solution: [T(`E_{TH} = ${texQ(th.Eth, 'V')},\\ R_{TH} = ${texQ(th.Rth, 'Ω')}`)] };
    },
  },
  {
    id: 'Máxima transferencia',
    subtopic: '4.8 Máxima potencia',
    gen: (r) => {
      const E = pick(r, [10, 12, 20, 24, 30]);
      const R = pick(r, [2, 4, 5, 8, 10, 50]);
      const m = maxPower(E, R);
      return { prompt: `Un equivalente de Thévenin tiene E_TH = ${E} V y R_TH = ${R} Ω. ¿Qué R_L recibe la máxima potencia y cuánto vale?`, answers: [{ label: 'R_L', value: m.RL, unit: 'Ω' }, { label: 'P_{max}', value: m.Pmax, unit: 'W' }], hints: ['R_L = R_TH', '$P = E^2/(4R)$'], solution: [T(`P_{max} = \\frac{${E}^2}{4\\cdot${R}} = ${texQ(m.Pmax, 'W')}`)] };
    },
  },
  {
    id: 'Transformación de fuentes',
    subtopic: '4.5 Transformación',
    gen: (r) => {
      const E = pick(r, [6, 10, 12, 24]);
      const R = pick(r, [2, 3, 4, 6, 8]);
      return { prompt: `Transforme una fuente de ${E} V en serie con ${R} Ω en su equivalente de corriente.`, answers: [{ label: 'I', value: E / R, unit: 'A' }], hints: ['I = E/R, en paralelo con la misma R.'], solution: [T(`I = ${E}/${R} = ${texQ(E / R, 'A')}`)] };
    },
  },
];

export const TEMPLATES = [
  { name: 'Cuaderno: mallas con 4V_Δ (V_Δ = 30 I₄)', desc: 'I₁ = 3,75; I₂ = 2,5; I₃ = 1,25; I₄ = 0,5 A; la fuente entrega 375 W y la dependiente absorbe 75 W (375 = 300 + 75). Geometría deducida de los resultados.', circuit: cuadernoVDelta, mode: 'mallas', key: 'u4-mallas' },
  { name: 'Cuaderno, problema 10 (supermalla)', desc: 'I₁ = 1,25 A; I₂ = 1,75 A; I₃ = 6,75 A; V = 88 V.', circuit: cuaderno10, mode: 'mallas', key: 'u4-mallas' },
  { name: 'Cuaderno, problema 4 (mallas)', desc: 'Iₐ = 5,6 A; I_b = 2 A; I_c = −0,8 A; V₀ = 28,8 V.', circuit: cuaderno4, mode: 'mallas', key: 'u4-mallas' },
  { name: 'Cuaderno, problema 14 (nodos)', desc: 'V₁ = 9,09 V; V₂ = 10,909 V.', circuit: cuaderno14, mode: 'nodos', key: 'u4-nodos' },
  { name: 'TP4 nodos, ejercicio 1 (dependiente 4i)', desc: 'Iₐ = 0,84 A; V₁₅ = 12,54 V; P₁₅ = 10,48 W.', circuit: tp4Nodos1, mode: 'nodos', key: 'u4-nodos' },
  { name: 'Thévenin con carga R_L', desc: 'Retire R_L y halle E_TH = 9 V y R_TH = 4 Ω.', circuit: theveninEjemplo, mode: 'thevenin', key: 'u4-thevenin' },
  { name: 'Solo fuentes dependientes', desc: 'R_TH por fuente de prueba de 1 V o 1 A.', circuit: soloDependientes, mode: 'thevenin', key: 'u4-thevenin' },
];
export const P__ = P;
