// Cálculos propios del Simulador 4.
import { Analysis } from '../core/engine/analyze';
import { cb } from '../core/engine/builder';
import { pinsOf } from '../core/engine/netlist';
import { Circuit, NetElement, isDependent } from '../core/engine/types';

/** Matriz de conductancias (solo R/G y fuentes de corriente independientes) */
export function conductanceMatrix(a: Analysis) {
  const N = a.net.nodeCount - 1;
  const G = Array.from({ length: N }, () => new Array(N).fill(0));
  const I = new Array(N).fill(0);
  const blockers: string[] = [];
  for (const e of a.net.elements) {
    const g = e.kind === 'R' ? 1 / e.value : e.kind === 'G' ? e.value : 0;
    if (g) {
      if (e.n1) G[e.n1 - 1][e.n1 - 1] += g;
      if (e.n2) G[e.n2 - 1][e.n2 - 1] += g;
      if (e.n1 && e.n2) {
        G[e.n1 - 1][e.n2 - 1] -= g;
        G[e.n2 - 1][e.n1 - 1] -= g;
      }
    } else if (e.kind === 'I') {
      // la corriente entra al nodo b
      if (e.n2) I[e.n2 - 1] += e.value;
      if (e.n1) I[e.n1 - 1] -= e.value;
    } else if (e.kind !== 'VM') blockers.push(e.label);
  }
  return { G, I, ok: blockers.length === 0, blockers };
}

/** Matriz de resistencias de malla (solo R y fuentes de voltaje independientes) */
export function resistanceMatrix(a: Analysis) {
  const M = a.topo.meshes.length;
  const R = Array.from({ length: M }, () => new Array(M).fill(0));
  const E = new Array(M).fill(0);
  const blockers: string[] = [];
  const byId = new Map(a.net.elements.map((e) => [e.id, e]));
  const inc = new Map<string, Map<number, number>>();
  a.topo.meshes.forEach((m, k) => m.items.forEach((it) => {
    if (!inc.has(it.id)) inc.set(it.id, new Map());
    inc.get(it.id)!.set(k, it.dir);
  }));
  for (const [id, ms] of inc) {
    const e = byId.get(id)!;
    const entries = [...ms.entries()];
    if (e.kind === 'R' || e.kind === 'G') {
      const r = e.kind === 'R' ? e.value : 1 / e.value;
      for (const [i, di] of entries) for (const [j, dj] of entries) R[i][j] += r * di * dj;
    } else if (e.kind === 'V') {
      // subida en el sentido de la malla: entra por − (dir = −1 recorre de b a a)
      for (const [i, di] of entries) E[i] += -di * e.value;
    } else if (e.kind !== 'AM') blockers.push(e.label);
  }
  return { R, E, ok: blockers.length === 0, blockers };
}

export interface TransformCandidate {
  kind: 'V→I' | 'I→V';
  source: NetElement;
  resistor: NetElement;
  value: number;
  R: number;
  result: number;
  note: string;
}

/** Busca pares fuente‑resistencia transformables (V en serie con R, I en paralelo con R) */
export function transformCandidates(a: Analysis): { ok: TransformCandidate[]; impossible: string[] } {
  const out: TransformCandidate[] = [];
  const impossible: string[] = [];
  const els = a.net.elements;
  const deg = (n: number) => els.filter((e) => e.n1 === n || e.n2 === n).length;
  for (const s of els.filter((e) => e.kind === 'V' || e.kind === 'I' || isDependent(e.kind))) {
    if (s.kind === 'V' || s.kind === 'VCVS' || s.kind === 'CCVS') {
      const series = els.find((r) => r.kind === 'R' && r !== s && [s.n1, s.n2].some((n) => n !== 0 && deg(n) === 2 && (r.n1 === n || r.n2 === n)));
      if (series && s.kind === 'V') out.push({ kind: 'V→I', source: s, resistor: series, value: s.value, R: series.value, result: s.value / series.value, note: `${s.label} en serie con ${series.label}` });
      else if (series) out.push({ kind: 'V→I', source: s, resistor: series, value: s.value, R: series.value, result: s.value / series.value, note: `${s.label} (dependiente) en serie con ${series.label}: se transforma igual si su variable de control no está en ${series.label}` });
      else impossible.push(`${s.label}: fuente de voltaje sin una resistencia en serie (fuente ideal): no se puede transformar.`);
    } else {
      const par = els.find((r) => r.kind === 'R' && ((r.n1 === s.n1 && r.n2 === s.n2) || (r.n1 === s.n2 && r.n2 === s.n1)));
      if (par) out.push({ kind: 'I→V', source: s, resistor: par, value: s.value, R: par.value, result: s.value * par.value, note: `${s.label} en paralelo con ${par.label}${isDependent(s.kind) ? ' (dependiente: válido si el control no está en esa resistencia)' : ''}` });
      else impossible.push(`${s.label}: fuente de corriente sin una resistencia en paralelo: no se puede transformar.`);
    }
  }
  return { ok: out, impossible };
}

/** Circuito con una fuente apagada (V → corto, I → abierto), para dibujar la superposición */
export function turnOff(c: Circuit, keepId: string, indepIds: string[]): Circuit {
  const out: Circuit = JSON.parse(JSON.stringify(c));
  for (const id of indepIds) {
    if (id === keepId) continue;
    const e = out.elements.find((x) => x.id === id)!;
    const { a, b } = pinsOf(e);
    out.elements = out.elements.filter((x) => x.id !== id);
    if (e.kind === 'V') out.wires.push({ id: `corto-${id}`, a, b });
  }
  return out;
}

export function theveninCircuit(Eth: number, Rth: number, RL?: number): Circuit {
  const b = cb();
  b.el('V', 'E_TH', fmt(Eth), [0, 0], [0, 8]);
  b.el('R', 'R_TH', fmt(Rth), [0, 0], [8, 0]);
  b.name([8, 0], 'a');
  if (RL) b.el('R', 'R_L', fmt(RL), [8, 0], [8, 8]);
  b.wire([0, 8], [8, 8]);
  b.name([8, 8], 'b');
  b.gnd([0, 8]);
  return b.build();
}
export function nortonCircuit(In: number, Rn: number): Circuit {
  const b = cb();
  b.el('I', 'I_N', fmt(In), [0, 8], [0, 0]);
  b.wire([0, 0], [8, 0]);
  b.el('R', 'R_N', fmt(Rn), [8, 0], [8, 8]);
  b.wire([0, 8], [8, 8]);
  b.name([8, 0], 'a');
  b.gnd([0, 8]);
  return b.build();
}
const fmt = (x: number) => String(Number(x.toPrecision(6)));

// ---------------- plantillas ----------------
/** TP4 nodos, ejercicio resuelto 1: Iₐ = 0,84 A; V₁₅ = 12,54 V; P₁₅ = 10,48 W */
export function tp4Nodos1(): Circuit {
  const b = cb();
  b.el('I', 'Is', '2', [0, 8], [0, 0]);
  b.wire([0, 0], [8, 0]);
  b.el('R', 'R7', '7', [8, 0], [8, 8]);
  b.el('V', 'E', '3', [8, 8], [8, 16]);
  b.el('R', 'R15', '15', [8, 0], [20, 0], { varName: 'Iₐ' });
  b.el('R', 'R5', '5', [20, 0], [20, 16], { id: 'r5', varName: 'i' });
  b.wire([20, 0], [28, 0]);
  b.el('CCCS', 'F', '4', [28, 16], [28, 0], { ctrlRef: 'r5' });
  b.wire([0, 8], [0, 16], [28, 16]);
  b.gnd([0, 16]);
  b.name([8, 0], '1');
  b.name([20, 0], '2');
  return b.build();
}
/** Cuaderno, problema 4 (mallas): Iₐ = 5,6 A; I_b = 2 A; I_c = −0,8 A; V₀ = 28,8 V */
export function cuaderno4(): Circuit {
  const b = cb();
  b.el('V', 'E1', '40', [0, 0], [0, 8]);
  b.el('R', 'R2', '2', [0, 0], [8, 0]);
  b.el('R', 'R8', '8', [8, 0], [8, 8], { varName: 'V₀' });
  b.el('R', 'R6a', '6', [8, 0], [16, 0]);
  b.el('R', 'R6b', '6', [16, 0], [16, 8]);
  b.el('R', 'R4', '4', [16, 0], [24, 0]);
  b.el('V', 'E2', '20', [24, 0], [24, 8]);
  b.wire([0, 8], [24, 8]);
  b.gnd([0, 8]);
  return b.build();
}
/** Cuaderno, problema 10 (supermalla): I₁ = 1,25; I₂ = 1,75; I₃ = 6,75 A; V = 88 V */
export function cuaderno10(): Circuit {
  const b = cb();
  b.wire([0, 0], [0, 6]);
  b.wire([16, 0], [16, 6]);
  b.el('R', 'R10', '10', [0, 0], [16, 0]);
  b.el('R', 'R3', '3', [0, 6], [8, 6]);
  b.el('R', 'R2', '2', [8, 6], [16, 6]);
  b.el('V', 'E100', '100', [0, 6], [0, 12]);
  b.el('I', 'I5', '5', [8, 12], [8, 6]);
  b.el('V', 'E50', '50', [16, 6], [16, 12]);
  b.el('R', 'R6', '6', [0, 12], [8, 12]);
  b.el('R', 'R4', '4', [8, 12], [16, 12]);
  b.gnd([8, 12]);
  return b.build();
}
/** Mallas con 4V_Δ, V_Δ = 30·I₄ (geometría deducida de los resultados del cuaderno) */
export function cuadernoVDelta(): Circuit {
  const b = cb();
  b.el('V', 'E', '100', [0, 0], [0, 8]);
  b.el('R', 'R80', '80', [8, 0], [8, 8]);
  b.wire([0, 0], [8, 0]);
  b.el('R', 'R10', '10', [8, 0], [16, 0]);
  b.el('R', 'R60', '60', [16, 0], [16, 8]);
  b.el('VCVS', 'D', '4', [16, 0], [24, 0], { ctrlRef: 'r30' });
  b.el('R', 'R20', '20', [24, 0], [24, 8]);
  b.wire([24, 0], [32, 0]);
  b.el('R', 'R30', '30', [32, 0], [32, 8], { id: 'r30', varName: 'V_Δ' });
  b.wire([0, 8], [32, 8]);
  b.gnd([0, 8]);
  return b.build();
}
/** Cuaderno, problema 14 (nodos): V₁ = 9,09 V; V₂ = 10,909 V */
export function cuaderno14(): Circuit {
  const b = cb();
  b.el('V', 'E', '10', [0, 0], [0, 8]);
  b.el('R', 'R1', '1', [0, 0], [8, 0]);
  b.el('R', 'R5', '5', [8, 0], [8, 8]);
  b.el('R', 'R2', '2', [8, 0], [16, 0]);
  b.el('R', 'R10', '10', [16, 0], [16, 8]);
  b.wire([16, 0], [24, 0]);
  b.el('I', 'Is', '2', [24, 8], [24, 0]);
  b.wire([0, 8], [24, 8]);
  b.gnd([0, 8]);
  return b.build();
}
/** Thévenin con carga R_L (fuente con divisor) */
export function theveninEjemplo(): Circuit {
  const b = cb();
  b.el('V', 'E', '12', [0, 0], [0, 8]);
  b.el('R', 'R1', '4', [0, 0], [8, 0]);
  b.el('R', 'R2', '12', [8, 0], [8, 8]);
  b.el('R', 'R3', '1', [8, 0], [16, 0]);
  b.el('R', 'RL', '3', [16, 0], [16, 8], { id: 'carga' });
  b.wire([0, 8], [16, 8]);
  b.gnd([0, 8]);
  return b.build();
}
/** Solo dependientes: R_TH por fuente de prueba (R_TH = 8/3 Ω) */
export function soloDependientes(): Circuit {
  const b = cb();
  b.el('R', 'R1', '2', [8, 0], [8, 8], { id: 'rx', varName: 'Iₓ' });
  b.el('R', 'R2', '4', [8, 0], [16, 0]);
  b.el('CCVS', 'H', '3', [16, 0], [16, 8], { ctrlRef: 'rx' });
  b.wire([8, 8], [16, 8]);
  b.gnd([8, 8]);
  b.name([8, 0], 'a');
  return b.build();
}
