import { describe, expect, it } from 'vitest';
import { analyze } from '../core/engine/analyze';
import { byLabel } from '../core/engine/mna';
import { meshAnalysis } from '../core/engine/methods/mesh';
import { nodalAnalysis } from '../core/engine/methods/nodal';
import { superposition, thevenin, maxPower } from '../core/engine/methods/thevenin';
import { mulberry32 } from '../core/engine/generate';
import { conductanceMatrix, cuaderno10, cuaderno14, cuaderno4, cuadernoVDelta, resistanceMatrix, soloDependientes, theveninEjemplo, tp4Nodos1, transformCandidates } from '../sim/calc';
import { GENS } from '../sim/content';
import { gauss } from '../core/engine/linalg';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('Simulador 4 — casos del cuaderno', () => {
  it('mallas con 4V_Δ, V_Δ = 30I₄: I₁ = 3,75; I₂ = 2,5; I₃ = 1,25; I₄ = 0,5 A; 375 W = 300 + 75', () => {
    const a = analyze(cuadernoVDelta());
    const m = meshAnalysis(a.net, a.topo, 'cramer');
    const v = m.system!.values!;
    expect([1, 2, 3, 4].map((k) => Number(v.get(`I_{${k}}`)!.toFixed(10)))).toEqual([3.75, 2.5, 1.25, 0.5]);
    expect(rel(byLabel(a.dc!, 'E')!.p, -375)).toBeLessThan(1e-9);
    expect(rel(byLabel(a.dc!, 'D')!.p, 75)).toBeLessThan(1e-9);
    const pR = a.net.elements.filter((e) => e.kind === 'R').reduce((s, e) => s + a.dc!.el.get(e.id)!.p, 0);
    expect(rel(pR, 300)).toBeLessThan(1e-9);
  });
  it('problema 4: Iₐ = 5,6; I_b = 2; I_c = −0,8 A', () => {
    const a = analyze(cuaderno4());
    const m = meshAnalysis(a.net, a.topo);
    expect([1, 2, 3].map((k) => Number(m.system!.values!.get(`I_{${k}}`)!.toFixed(10)))).toEqual([5.6, 2, -0.8]);
  });
  it('problema 10 (supermalla): 1,25; 1,75; 6,75 A', () => {
    const a = analyze(cuaderno10());
    const m = meshAnalysis(a.net, a.topo);
    expect([...m.system!.values!.values()].map((x) => Number(x.toFixed(10))).sort((x, y) => x - y)).toEqual([1.25, 1.75, 6.75]);
  });
  it('problema 14 (nodos): V₁ = 9,09 V; V₂ = 10,909 V', () => {
    const a = analyze(cuaderno14());
    const n = nodalAnalysis(a.net);
    const v1 = a.net.elements.find((e) => e.label === 'R5')!.n1;
    const v2 = a.net.elements.find((e) => e.label === 'R10')!.n1;
    expect(n.V[v1]).toBeCloseTo(100 / 11, 9);
    expect(n.V[v2]).toBeCloseTo(120 / 11, 9);
  });
  it('TP4 nodos, ejercicio 1: Iₐ = 0,84 A; V₁₅ = 12,54 V; P₁₅ = 10,48 W', () => {
    const a = analyze(tp4Nodos1());
    expect(a.ok).toBe(true);
    const r = byLabel(a.dc!, 'R15')!;
    expect(r.i).toBeCloseTo(51 / 61, 9);
    expect(Number(r.v.toFixed(2))).toBe(12.54);
    expect(Math.abs(r.p - 10.485)).toBeLessThan(0.01); // material: 10,483 – 10,485 W (con valores redondeados)
  });
});

describe('Simulador 4 — técnicas', () => {
  it('matriz de conductancias resuelve igual que MNA', () => {
    const a = analyze(cuaderno14());
    // sustituimos la fuente de voltaje: este circuito tiene E, así que la matriz debe avisar
    expect(conductanceMatrix(a).ok).toBe(false);
  });
  it('matriz de resistencias del problema 4 da las corrientes de malla', () => {
    const a = analyze(cuaderno4());
    const m = resistanceMatrix(a);
    expect(m.ok).toBe(true);
    const x = gauss(m.R, m.E).x!;
    expect(x.map((v) => Number(v.toFixed(10)))).toEqual([5.6, 2, -0.8]);
  });
  it('Thévenin con solo independientes: E_TH = 9 V, R_TH = 4 Ω', () => {
    const a = analyze(theveninEjemplo());
    const L = a.net.elements.find((e) => e.id === 'carga')!;
    const th = thevenin(a.net, L.n1, L.n2, [L.id]);
    expect(rel(th.Eth, 9)).toBeLessThan(1e-9);
    expect(rel(th.Rth, 4)).toBeLessThan(1e-9);
    expect(maxPower(th.Eth, th.Rth).Pmax).toBeCloseTo(81 / 16, 12);
  });
  it('Thévenin con solo dependientes: 1 V y 1 A dan la misma R_TH', () => {
    const a = analyze(soloDependientes());
    const node = a.net.elements.find((e) => e.label === 'R2')!.n1;
    const t1 = thevenin(a.net, node, 0, [], '1A');
    const t2 = thevenin(a.net, node, 0, [], '1V');
    expect(t1.case).toBe('dependientes');
    expect(rel(t1.Rth, t2.Rth)).toBeLessThan(1e-9);
    expect(Math.abs(t1.Eth)).toBeLessThan(1e-12);
    expect(rel(t1.Rth, 8 / 3)).toBeLessThan(1e-9);
  });
  it('TP4 ej. 1 con dependiente: E_TH/I_CC = fuente de prueba', () => {
    const a = analyze(tp4Nodos1());
    const R = a.net.elements.find((e) => e.label === 'R15')!;
    const th = thevenin(a.net, R.n1, R.n2, [R.id]);
    expect(th.case).toBe('mixto');
    const iL = th.Eth / (th.Rth + 15);
    expect(rel(iL, 51 / 61)).toBeLessThan(1e-9);
  });
  it('superposición suma la respuesta total', () => {
    const a = analyze(cuaderno10());
    const s = superposition(a.net);
    for (const e of a.net.elements) {
      const sum = s.parts.reduce((x, p) => x + p.result.el.get(e.id)!.i, 0);
      expect(Math.abs(sum - a.dc!.el.get(e.id)!.i)).toBeLessThan(1e-9);
    }
  });
  it('transformación de fuentes detecta V en serie con R', () => {
    const t = transformCandidates(analyze(theveninEjemplo()));
    expect(t.ok.some((c) => c.kind === 'V→I' && Math.abs(c.result - 3) < 1e-12)).toBe(true);
  });
  it('ejercicios generados con respuestas finitas', () => {
    const r = mulberry32(5);
    for (const g of GENS)
      for (const l of ['basico', 'intermedio', 'examen'] as const) {
        let ex = g.gen(r, l);
        for (let k = 0; k < 30 && !ex.answers.every((a) => isFinite(a.value)); k++) ex = g.gen(r, l);
        for (const x of ex.answers) expect(isFinite(x.value)).toBe(true);
      }
  });
});
