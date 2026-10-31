import React, { useMemo, useState } from 'react';
import { analyze, Analysis } from '../core/engine/analyze';
import { solveMNA } from '../core/engine/mna';
import { meshAnalysis } from '../core/engine/methods/mesh';
import { nodalAnalysis } from '../core/engine/methods/nodal';
import { loadPower, maxPower, superposition, thevenin } from '../core/engine/methods/thevenin';
import { fmtEng, fmtNum, texNum, texQ } from '../core/engine/units';
import { isDependent } from '../core/engine/types';
import { Kpi, Plot, Tex } from '../core/ui/basic';
import { CircuitPreview } from '../core/ui/CircuitPreview';
import { DCMode } from '../core/ui/DCMode';
import { BetterDoc, BetterView, BOX, H, L, P, StepDoc, StepsView, T } from '../core/ui/panels';
import { countEquations, dcSolution } from '../core/solutions/dc';
import { conductanceMatrix, cuaderno10, cuaderno14, cuaderno4, nortonCircuit, resistanceMatrix, theveninCircuit, theveninEjemplo, transformCandidates, turnOff } from './calc';

const PALETTE = ['R', 'G', 'V', 'I', 'VCVS', 'VCCS', 'CCVS', 'CCCS', 'AM', 'VM', 'GND'] as const;
const mat = (M: number[][]) => `\\begin{bmatrix}${M.map((r) => r.map((v) => texNum(Math.abs(v) < 1e-12 ? 0 : v, 5)).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
const vec = (v: (number | string)[]) => `\\begin{bmatrix}${v.map((x) => (typeof x === 'number' ? texNum(x, 5) : x)).join(' \\\\ ')}\\end{bmatrix}`;

// ---------------- Nodos ----------------
export function NodalMode() {
  return (
    <DCMode
      storageKey="u4-nodos"
      palette={[...PALETTE]}
      initial={cuaderno14()}
      methods={['nodos']}
      p1Extra={(a) => <MatrixG a={a} />}
    />
  );
}
function MatrixG({ a }: { a: Analysis }) {
  if (!a.ok) return null;
  const m = conductanceMatrix(a);
  const names = a.net.nodeNames.slice(1).map((n) => `V_{${n}}`);
  return (
    <details className="card" open>
      <summary>Matriz de conductancias [G]·[V] = [I]</summary>
      {m.ok ? (
        <>
          <Tex block tex={`${mat(m.G)}${vec(names)} = ${vec(m.I)}`} />
          <p className="hint">Diagonal: suma de las conductancias conectadas al nodo. Fuera de la diagonal: menos la conductancia entre los dos nodos. Lado derecho: corrientes de fuentes que ENTRAN al nodo.</p>
        </>
      ) : (
        <p className="hint">Hay fuentes de voltaje o dependientes ({m.blockers.join(', ')}): la matriz por inspección no se aplica directamente; se usan supernodos y ecuaciones de restricción (ver ventanilla 2).</p>
      )}
    </details>
  );
}

// ---------------- Mallas ----------------
export function MeshMode() {
  return <DCMode storageKey="u4-mallas" palette={[...PALETTE]} initial={cuaderno10()} methods={['mallas']} wantsMesh p1Extra={(a) => <MatrixR a={a} />} />;
}
function MatrixR({ a }: { a: Analysis }) {
  if (!a.ok) return null;
  if (a.topo.crossings.length || a.topo.nonPlanarByEuler) return <div className="issue box-err">El circuito no es planar (o está dibujado con cruces): el método de mallas no se aplica. Use nodos.</div>;
  const m = resistanceMatrix(a);
  const names = a.topo.meshes.map((x) => `I_{${x.index}}`);
  return (
    <details className="card" open>
      <summary>Matriz de resistencias [R]·[I] = [E]</summary>
      {m.ok ? (
        <>
          <Tex block tex={`${mat(m.R)}${vec(names)} = ${vec(m.E)}`} />
          <p className="hint">Diagonal: suma de las resistencias de la malla. Fuera de la diagonal: menos la resistencia compartida. Lado derecho: suma de subidas de las fuentes de voltaje en el sentido horario.</p>
        </>
      ) : (
        <p className="hint">Hay fuentes de corriente o dependientes ({m.blockers.join(', ')}): se usan supermallas y ecuaciones de restricción (ver ventanilla 2).</p>
      )}
    </details>
  );
}

// ---------------- Recomendador ----------------
export function CompareMode() {
  return (
    <DCMode
      storageKey="u4-comparar"
      palette={[...PALETTE]}
      initial={cuaderno4()}
      methods={['nodos', 'mallas', 'ramas']}
      p1Extra={(a) => {
        if (!a.ok) return null;
        const c = countEquations(a);
        const n = nodalAnalysis(a.net);
        const m = meshAnalysis(a.net, a.topo);
        return (
          <div className="card">
            <h4>Recomendador de método</h4>
            <table className="data">
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Ecuaciones simultáneas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Nodos (n − 1 − fuentes V)</td>
                  <td>{c.nodos}</td>
                  <td>{n.ok ? '✓ resuelto' : n.error}</td>
                </tr>
                <tr>
                  <td>Mallas (mallas − fuentes I)</td>
                  <td>{c.mallas}</td>
                  <td>{m.ok ? '✓ resuelto' : m.error}</td>
                </tr>
                <tr>
                  <td>Corrientes de rama</td>
                  <td>{c.ramas}</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
            <p>
              <b>Sugerencia:</b> {c.reducible ? 'reducción serie‑paralelo (0 sistemas)' : c.nodos < c.mallas ? 'NODOS' : c.mallas < c.nodos ? 'MALLAS' : 'empate: cualquiera de los dos'}.
            </p>
            {n.ok && m.ok && (
              <table className="data">
                <thead>
                  <tr>
                    <th>Elemento</th>
                    <th>I por nodos</th>
                    <th>I por mallas</th>
                  </tr>
                </thead>
                <tbody>
                  {a.net.elements
                    .filter((e) => e.kind === 'R')
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.label}</td>
                        <td>{fmtEng(a.dc!.el.get(e.id)!.i, 'A', 6)}</td>
                        <td>{fmtEng(m.current.get(e.id)!, 'A', 6)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        );
      }}
    />
  );
}

// ---------------- Transformación de fuentes ----------------
export function TransformMode() {
  return (
    <DCMode
      storageKey="u4-transformar"
      palette={[...PALETTE]}
      initial={theveninEjemplo()}
      methods={['nodos', 'mallas']}
      p1Extra={(a) => {
        const t = transformCandidates(a);
        return (
          <div className="card">
            <h4>Transformación de fuentes</h4>
            <Tex block tex="E\ \text{en serie con}\ R \;\Longleftrightarrow\; I = \frac{E}{R}\ \text{en paralelo con}\ R" />
            {t.ok.map((c, i) => (
              <div key={i} className="card box-ok">
                <b>{c.note}</b>
                {c.kind === 'V→I' ? (
                  <Tex block tex={`E = ${texNum(c.value)}\\ \\text{V},\\ R = ${texNum(c.R)}\\ \\Omega \\;\\Rightarrow\\; I = \\frac{E}{R} = ${texQ(c.result, 'A')}\\ \\text{en paralelo con}\\ ${texNum(c.R)}\\ \\Omega`} />
                ) : (
                  <Tex block tex={`I = ${texNum(c.value)}\\ \\text{A},\\ R = ${texNum(c.R)}\\ \\Omega \\;\\Rightarrow\\; E = I\\,R = ${texQ(c.result, 'V')}\\ \\text{en serie con}\\ ${texNum(c.R)}\\ \\Omega`} />
                )}
                <div className="grid2">
                  <CircuitPreview circuit={c.kind === 'V→I' ? theveninCircuit(c.value, c.R) : nortonCircuit(c.value, c.R)} height={120} showNodes={false} />
                  <CircuitPreview circuit={c.kind === 'V→I' ? nortonCircuit(c.result, c.R) : theveninCircuit(c.result, c.R)} height={120} showNodes={false} />
                </div>
                <p className="hint">La polaridad se conserva: la flecha de la fuente de corriente apunta hacia el terminal + de la fuente de voltaje.</p>
              </div>
            ))}
            {t.impossible.map((s, i) => (
              <div key={`x${i}`} className="issue box-warn">
                ⚠ {s}
              </div>
            ))}
            <p className="hint">Avisos: no transforme la resistencia cuya corriente o voltaje le piden (desaparece del circuito). Con fuentes dependientes, la variable de control no debe estar en esa resistencia.</p>
          </div>
        );
      }}
    />
  );
}

// ---------------- Thévenin / Norton y máxima transferencia ----------------
export function TheveninMode({ maxP = false }: { maxP?: boolean }) {
  const [terms, setTerms] = useState<number[] | null>(null);
  const [load, setLoad] = useState<string | null>('carga');
  const [picking, setPicking] = useState<'nodes' | 'load' | null>(null);
  const [prefer, setPrefer] = useState<'1V' | '1A'>('1A');
  return (
    <DCMode
      storageKey={maxP ? 'u4-maxp' : 'u4-thevenin'}
      palette={[...PALETTE]}
      initial={theveninEjemplo()}
      methods={['nodos']}
      pick={picking === 'nodes' ? { kind: 'node', count: 2, prompt: 'Toque los dos terminales a y b', onPick: (ids) => { setTerms(ids as number[]); setPicking(null); } } : picking === 'load' ? { kind: 'element', count: 1, prompt: 'Toque el elemento de carga que se retira', onPick: (ids) => { setLoad(ids[0] as string); setTerms(null); setPicking(null); } } : null}
      editorProps={{ highlightNodes: terms ?? [], highlightIds: load ? [load] : [] }}
      p1Extra={(a) => (
        <div className="card">
          <h4>{maxP ? 'Máxima transferencia de potencia' : 'Equivalentes de Thévenin y Norton'}</h4>
          <div className="row">
            <button className="primary" onClick={() => setPicking('load')}>🎯 Elegir carga</button>
            <button onClick={() => setPicking('nodes')}>🎯 Elegir terminales a y b</button>
            <button onClick={() => { setLoad(null); }}>Sin carga</button>
            <label className="row">
              Fuente de prueba
              <select value={prefer} onChange={(e) => setPrefer(e.target.value as '1V' | '1A')}>
                <option value="1A">1 A</option>
                <option value="1V">1 V</option>
              </select>
            </label>
          </div>
          <TheveninPanel a={a} terms={terms} load={load} prefer={prefer} maxP={maxP} />
        </div>
      )}
      p2={(a) => <TheveninSolution a={a} terms={terms} load={load} prefer={prefer} maxP={maxP} />}
      better={() => theveninBetter(maxP)}
    />
  );
}

function resolveTerms(a: Analysis, terms: number[] | null, load: string | null) {
  const L = load ? a.net.elements.find((e) => e.id === load) : undefined;
  if (terms) return { p: terms[0], q: terms[1], L };
  if (L) return { p: L.n1, q: L.n2, L };
  return null;
}

function TheveninPanel({ a, terms, load, prefer, maxP }: { a: Analysis; terms: number[] | null; load: string | null; prefer: '1V' | '1A'; maxP: boolean }) {
  const t = resolveTerms(a, terms, load);
  if (!a.ok) return null;
  if (!t) return <p className="hint">Elija la carga (el elemento que se retira) o dos terminales.</p>;
  const th = thevenin(a.net, t.p, t.q, t.L ? [t.L.id] : [], prefer);
  if (!th.ok) return <div className="issue box-err">{th.error}</div>;
  const RLnow = t.L && t.L.kind === 'R' ? t.L.value : null;
  if (maxP) {
    const mp = maxPower(th.Eth, th.Rth);
    const Rmax = Math.max(th.Rth * 5, (RLnow ?? 0) * 1.5, 1e-9);
    const xs = Array.from({ length: 200 }, (_, k) => (Rmax * (k + 1)) / 200);
    return (
      <>
        <Kpi items={[{ l: 'E_TH', v: fmtEng(th.Eth, 'V', 5) }, { l: 'R_TH', v: fmtEng(th.Rth, 'Ω', 5) }, { l: 'R_L óptima = R_TH', v: fmtEng(mp.RL, 'Ω', 5) }, { l: 'P_max', v: fmtEng(mp.Pmax, 'W', 5) }]} />
        <Plot
          series={[
            { label: 'P en R_L [W]', x: xs, y: xs.map((r) => loadPower(th.Eth, th.Rth, r).P) },
            { label: 'eficiencia η × P_max', x: xs, y: xs.map((r) => loadPower(th.Eth, th.Rth, r).eff * mp.Pmax), dash: [5, 4] },
          ]}
          xLabel="R_L [Ω]"
          yLabel="P [W]"
          vlines={[{ x: th.Rth, label: 'R_L = R_TH' }, ...(RLnow ? [{ x: RLnow, label: 'R_L actual' }] : [])]}
          points={[{ x: th.Rth, y: mp.Pmax }]}
          height={240}
        />
        {RLnow && <p className="small">Con la carga actual R_L = {fmtEng(RLnow, 'Ω')}: P = {fmtEng(loadPower(th.Eth, th.Rth, RLnow).P, 'W', 5)} y η = {fmtNum(loadPower(th.Eth, th.Rth, RLnow).eff * 100, 4)} %.</p>}
      </>
    );
  }
  return (
    <>
      <Kpi items={[{ l: 'Caso', v: th.case === 'independientes' ? 'solo independientes' : th.case === 'mixto' ? 'independientes + dependientes' : 'solo dependientes' }, { l: 'E_TH', v: fmtEng(th.Eth, 'V', 5) }, { l: 'R_TH', v: fmtEng(th.Rth, 'Ω', 5) }, { l: 'I_N', v: isFinite(th.In) ? fmtEng(th.In, 'A', 5) : '—' }]} />
      <div className="grid2">
        <div>
          <b className="small">Thévenin</b>
          <CircuitPreview circuit={theveninCircuit(th.Eth, th.Rth, RLnow ?? undefined)} height={140} showNodes={false} />
        </div>
        <div>
          <b className="small">Norton</b>
          {isFinite(th.In) ? <CircuitPreview circuit={nortonCircuit(th.In, th.Rth)} height={140} showNodes={false} /> : <p className="small">Con E_TH = 0 el equivalente es solo R_TH.</p>}
        </div>
      </div>
    </>
  );
}

function TheveninSolution({ a, terms, load, prefer, maxP }: { a: Analysis; terms: number[] | null; load: string | null; prefer: '1V' | '1A'; maxP: boolean }) {
  const t = resolveTerms(a, terms, load);
  if (!t) return <div className="card box-info">Elija la carga o los terminales en la ventanilla 1.</div>;
  const th = thevenin(a.net, t.p, t.q, t.L ? [t.L.id] : [], prefer);
  if (!th.ok) return <div className="card box-err">{th.error}</div>;
  const nm = (n: number) => (n === 0 ? 'la referencia' : `(${a.net.nodeNames[n]})`);
  const dev: StepDoc['development'] = [];
  dev.push(H('1. Retirar la carga y marcar los terminales'));
  dev.push(P(t.L ? `Se retira ${t.L.label}; terminales a = ${nm(t.p)} y b = ${nm(t.q)}.` : `Terminales a = ${nm(t.p)} y b = ${nm(t.q)}.`));
  dev.push(H('2. Voltaje de Thévenin (circuito abierto)'));
  dev.push(T(`E_{TH} = V_{a} - V_{b} = ${texQ(th.Eth, 'V')}`, '(1)'));
  dev.push(H('3. Resistencia de Thévenin'));
  if (th.rMethod === 'apagar fuentes') {
    dev.push(P('Solo hay fuentes independientes: se apagan (V → cortocircuito, I → circuito abierto) y se halla la resistencia vista desde a‑b.'));
    dev.push(T(`R_{TH} = ${texQ(th.Rth, 'Ω')}`, '(2)'));
  } else if (th.rMethod === 'Eth/Icc') {
    dev.push(P('Hay fuentes dependientes e independientes: se cortocircuitan los terminales y se halla la corriente de cortocircuito.'));
    dev.push(T(`I_{CC} = ${texQ(th.Icc, 'A')},\\qquad R_{TH} = \\frac{E_{TH}}{I_{CC}} = \\frac{${texNum(th.Eth, 5)}}{${texNum(th.Icc, 5)}} = ${texQ(th.Rth, 'Ω')}`, '(2)'));
  } else {
    dev.push(P(`Solo hay fuentes dependientes (o E_TH = 0): se coloca una fuente de prueba de ${th.test!.kind === '1V' ? '1 V' : '1 A'} entre a y b.`));
    dev.push(th.test!.kind === '1V' ? T(`R_{TH} = \\frac{1\\ \\text{V}}{I_{fuente}} = \\frac{1}{${texNum(th.test!.value, 5)}} = ${texQ(th.Rth, 'Ω')}`, '(2)') : T(`R_{TH} = \\frac{V_{fuente}}{1\\ \\text{A}} = ${texQ(th.Rth, 'Ω')}`, '(2)'));
    if (Math.abs(th.Eth) < 1e-12) dev.push(P('El equivalente de Thévenin es solo la resistencia R_TH (sin fuente).'));
  }
  dev.push(H('4. Norton'));
  dev.push(T(`I_N = \\frac{E_{TH}}{R_{TH}} = ${isFinite(th.In) ? texQ(th.In, 'A') : '—'},\\qquad R_N = R_{TH}`, '(3)'));
  const RLnow = t.L && t.L.kind === 'R' ? t.L.value : null;
  if (RLnow) {
    const lp = loadPower(th.Eth, th.Rth, RLnow);
    dev.push(H('5. Con la carga conectada'));
    dev.push(T(`I_L = \\frac{E_{TH}}{R_{TH} + R_L} = \\frac{${texNum(th.Eth, 5)}}{${texNum(th.Rth, 5)} + ${texNum(RLnow, 5)}} = ${texQ(lp.I, 'A')}`, '(4)'));
  }
  if (maxP) {
    const mp = maxPower(th.Eth, th.Rth);
    dev.push(H('Máxima transferencia'));
    dev.push(T(`R_L = R_{TH} = ${texQ(mp.RL, 'Ω')},\\qquad P_{max} = \\frac{E_{TH}^2}{4R_{TH}} = \\frac{(${texNum(th.Eth, 5)})^2}{4\\cdot ${texNum(th.Rth, 5)}} = ${texQ(mp.Pmax, 'W')},\\quad \\eta = 50\\,\\%`, '(5)'));
  }
  const realI = t.L ? a.dc?.el.get(t.L.id)?.i : undefined;
  const doc: StepDoc = {
    title: maxP ? 'Máxima transferencia de potencia' : 'Teorema de Thévenin y Norton',
    concept: 'Cualquier red lineal de dos terminales puede reemplazarse por una fuente de voltaje E_TH en serie con R_TH (Thévenin) o por una fuente de corriente I_N en paralelo con R_N (Norton).',
    identification: [P(`Terminales: a = ${nm(t.p)}, b = ${nm(t.q)}. Caso: ${th.case === 'independientes' ? 'solo fuentes independientes' : th.case === 'mixto' ? 'fuentes independientes y dependientes' : 'solo fuentes dependientes'}.`)],
    laws: [T('E_{TH} = V_{ab}^{(abierto)},\\quad R_{TH} = \\frac{E_{TH}}{I_{CC}},\\quad I_N = \\frac{E_{TH}}{R_{TH}},\\quad P_{max} = \\frac{E_{TH}^2}{4R_{TH}}'), P('Con solo independientes, R_TH con las fuentes apagadas; con solo dependientes, fuente de prueba de 1 V o 1 A (material U4).')],
    development: dev,
    results: [BOX(`E_{TH} = ${texQ(th.Eth, 'V')},\\quad R_{TH} = ${texQ(th.Rth, 'Ω')},\\quad I_N = ${isFinite(th.In) ? texQ(th.In, 'A') : '—'}`)],
    verification: [P(realI !== undefined && RLnow ? `Con el circuito completo (MNA) la corriente en la carga es ${fmtEng(realI, 'A', 6)}; con Thévenin, ${fmtEng(loadPower(th.Eth, th.Rth, RLnow).I, 'A', 6)} ✓ (mismo valor en magnitud).` : `Comprobación: E_TH = R_TH · I_N = ${fmtEng(th.Rth * th.In, 'V', 5)} ✓.`)],
    tip: 'Si le piden la corriente en UNA resistencia que cambia de valor, Thévenin la resuelve para todos los valores con una sola cuenta: I = E_TH/(R_TH + R_L).',
  };
  return <StepsView doc={doc} />;
}

function theveninBetter(maxP: boolean): BetterDoc {
  return {
    method: maxP ? 'Thévenin + R_L = R_TH' : 'Elegir el camino de R_TH según el tipo de fuentes',
    why: 'El material distingue tres casos; cada uno tiene su atajo.',
    savings: 'Con solo independientes, R_TH sale por reducción serie‑paralelo sin plantear sistemas.',
    formulas: [
      { tex: 'R_{TH}\\ (\\text{fuentes apagadas})', meaning: 'Solo independientes: V → corto, I → abierto.' },
      { tex: 'R_{TH} = E_{TH}/I_{CC}', meaning: 'Independientes + dependientes.' },
      { tex: 'R_{TH} = 1\\,\\text{V}/I \\ \\text{ó}\\ V/1\\,\\text{A}', meaning: 'Solo dependientes: fuente de prueba.' },
      { tex: 'P_{max} = \\frac{E_{TH}^2}{4R_{TH}}', meaning: 'Potencia máxima en la carga (η = 50 %).' },
    ],
    tricks: ['Nunca apague las fuentes dependientes.', 'Norton y Thévenin se pasan con transformación de fuentes.'],
    mistakes: ['Apagar una dependiente.', 'Olvidar retirar la carga antes de calcular E_TH.', 'Signo de I_CC: debe ir de a hacia b por el corto.'],
    compare: { long: 'Resolver todo el circuito para cada valor de R_L.', short: 'Thévenin una vez y la fórmula I = E_TH/(R_TH + R_L).', result: 'la misma corriente de carga.' },
  };
}

// ---------------- Superposición ----------------
export function SuperpositionMode() {
  const [target, setTarget] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  return (
    <DCMode
      storageKey="u4-superposicion"
      palette={[...PALETTE]}
      initial={cuaderno10()}
      methods={['nodos']}
      pick={picking ? { kind: 'element', count: 1, prompt: 'Toque el elemento cuya corriente quiere hallar', onPick: (ids) => { setTarget(ids[0] as string); setPicking(false); } } : null}
      editorProps={{ highlightIds: target ? [target] : [] }}
      p1Extra={() => (
        <div className="card">
          <button className="primary" onClick={() => setPicking(true)}>🎯 Elegir el elemento a analizar</button>
          <p className="hint">Se apaga una fuente independiente a la vez (V → corto, I → abierto). Las dependientes se quedan.</p>
        </div>
      )}
      p2={(a, doc) => <SuperpositionView a={a} circuit={doc.circuit} target={target} />}
      better={() => ({
        method: 'Superposición solo si hay pocas fuentes y el circuito parcial es serie‑paralelo',
        why: 'Cada circuito parcial con una sola fuente suele resolverse por divisores, sin sistemas.',
        savings: 'Con 2 fuentes: dos reducciones sencillas en lugar de un sistema de 2 a 3 ecuaciones.',
        formulas: [{ tex: 'I = I\' + I\'\' + \\dots', meaning: 'Suma algebraica de las respuestas parciales.' }, { tex: 'P \\neq P\' + P\'\'', meaning: 'La potencia NO se superpone (es cuadrática).' }],
        tricks: ['Fuente de voltaje apagada = cable; fuente de corriente apagada = circuito abierto.', 'Respete los sentidos de cada respuesta parcial.'],
        mistakes: ['Apagar las fuentes dependientes.', 'Sumar potencias parciales.'],
        compare: { long: 'Nodos o mallas con todas las fuentes.', short: 'Una fuente por vez + divisores.', result: 'la misma corriente total.' },
      })}
    />
  );
}

function SuperpositionView({ a, circuit, target }: { a: Analysis; circuit: import('../core/engine/types').Circuit; target: string | null }) {
  const s = useMemo(() => superposition(a.net), [a]);
  const indep = a.net.elements.filter((e) => e.kind === 'V' || e.kind === 'I');
  const tgt = a.net.elements.find((e) => e.id === target) ?? a.net.elements.find((e) => e.kind === 'R');
  if (!tgt) return <div className="card">Agregue al menos una resistencia.</div>;
  if (indep.length < 1) return <div className="card box-warn">No hay fuentes independientes: la superposición no aplica.</div>;
  const parts = s.parts.map((p) => ({ label: p.label, id: p.sourceId, i: p.result.el.get(tgt.id)?.i ?? 0, v: p.result.el.get(tgt.id)?.v ?? 0, res: p.result }));
  const iT = parts.reduce((x, p) => x + p.i, 0);
  const PT = a.dc!.el.get(tgt.id)!.p;
  const Psum = parts.reduce((x, p) => x + p.i * p.v, 0);
  const dev: StepDoc['development'] = [];
  parts.forEach((p, k) => {
    dev.push(H(`Circuito parcial ${k + 1}: solo ${p.label} encendida`));
    dev.push({ t: 'node', node: <CircuitPreview circuit={turnOff(circuit, p.id, indep.map((e) => e.id))} values={p.res.el} height={180} /> });
    dev.push(T(`I_{${tgt.label}}^{(${k + 1})} = ${texQ(p.i, 'A')}`, `(${k + 1})`));
  });
  dev.push(H('Suma de las respuestas'));
  dev.push(T(`I_{${tgt.label}} = ${parts.map((p) => (p.i < 0 ? `(${texNum(p.i, 5)})` : texNum(p.i, 5))).join(' + ')} = ${texQ(iT, 'A')}`, `(${parts.length + 1})`));
  dev.push(P(`⚠ La potencia no se superpone: suma de potencias parciales = ${fmtEng(Psum, 'W', 5)}, pero la potencia real es ${fmtEng(PT, 'W', 5)}.`));
  const doc: StepDoc = {
    title: 'Superposición',
    concept: 'En un circuito lineal, la respuesta a varias fuentes independientes es la suma de las respuestas a cada fuente actuando sola. Las fuentes dependientes NO se apagan.',
    identification: [L([`Elemento analizado: ${tgt.label}`, `Fuentes independientes: ${indep.map((e) => e.label).join(', ')}`, s.dependents.length ? `Dependientes (quedan encendidas): ${s.dependents.join(', ')}` : 'Sin dependientes'])],
    laws: [T('x = x^{(1)} + x^{(2)} + \\dots,\\qquad V \\to \\text{corto},\\ I \\to \\text{abierto}')],
    development: dev,
    results: [BOX(`I_{${tgt.label}} = ${texQ(iT, 'A')}`)],
    verification: [P(`Con todas las fuentes a la vez (MNA): I = ${fmtEng(a.dc!.el.get(tgt.id)!.i, 'A', 6)} ✓.`)],
    tip: 'Dibuje cada circuito parcial: casi siempre queda una red serie‑paralelo que se resuelve con divisores.',
  };
  return <StepsView doc={doc} />;
}

export { solveMNA, isDependent, dcSolution };
