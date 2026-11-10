// Balanceamento: quantos dias uma comunidade sobrevive em cada estilo de jogo?
// Rodar: npm run balance
import { RECIPES, type RecipeId } from '../src/data/shelter';
import { aliveSurvivors, dayOf, emotionOf, homeSurvivors, hourOfDay } from '../src/sim/shelter/core';
import { sendExpedition } from '../src/sim/shelter/expeditions';
import { createShelter, isGameOver, queueProject, setStanding, setTask, startProject, tickHour } from '../src/sim/shelter/shelter';
import type { ShelterState } from '../src/sim/shelter/types';
import { resolveDilemma } from '../src/sim/shelter/visitors';

type Policy = (s: ShelterState) => void;

/** Ninguém entra no jogo: tudo no automático. */
const afk: Policy = () => {};

/** Uma única visita no dia 1: deixa ordens permanentes e some. */
const afkOrders: Policy = (s) => {
  if (s.hour !== 8) return;
  setStanding(s, { locationId: 'market', ids: ['iuri'], risk: 'balanced' });
  startProject(s, 'workbench');
  for (const r of ['rainCollector', 'garden', 'latrine'] as const) queueProject(s, r);
  setTask(s, 'lena', 'garden');
};

const BUILD_ORDER: RecipeId[] = ['workbench', 'rainCollector', 'garden', 'latrine', 'filter', 'stove', 'bed', 'barricade', 'garden', 'bed'];

/** Jogador casual: entra às 12h e às 20h, constrói, manda uma expedição, resolve visitantes com bom senso. */
const casual: Policy = (s) => {
  const h = hourOfDay(s.hour);
  if (h !== 12 && h !== 20) return;
  s.lastSeenHour = s.hour;
  for (const d of [...s.dilemmas]) {
    const opt = d.kind === 'bandits' ? 'pay' : d.kind === 'trader' ? 'accept' : d.kind === 'refugee' ? 'accept' : 'refuse';
    resolveDilemma(s, d.id, opt);
  }
  if (!s.project) {
    // Segue a ordem à risca: espera juntar material para o próximo item em vez de pular.
    const seen: Partial<Record<RecipeId, number>> = {};
    for (const r of BUILD_ORDER) {
      seen[r] = (seen[r] ?? 0) + 1;
      if (r !== 'weapon' && s.buildings[r as Exclude<RecipeId, 'weapon'>] >= Math.min(seen[r]!, RECIPES[r].max)) continue;
      startProject(s, r);
      break;
    }
  }
  const home = homeSurvivors(s);
  for (const v of home) {
    if (v.task === 'garden' && !s.buildings.garden) setTask(s, v.id, 'craft');
  }
  if (s.buildings.garden && !home.some((v) => v.task === 'garden') && home.length > 2) {
    const helper = home.find((v) => v.task === 'rest' || v.task === 'craft');
    if (helper) setTask(s, helper.id, 'garden');
  }
  if (s.resources.waste > 6 && !home.some((v) => v.task === 'clean')) {
    const helper = home.find((v) => v.task !== 'guard' && v.task !== 'garden') ?? home[0];
    if (helper) setTask(s, helper.id, 'clean');
  }
  if (h === 20 && !s.expeditions.length) {
    const fit = home.filter((v) => v.expeditionId === null && v.health > 50 && emotionOf(v.mood) !== 'quebrado').sort((a, b) => b.health - a.health);
    if (fit.length >= 2) {
      const loc =
        s.resources.food < 6 || s.resources.water + s.resources.dirtyWater < 4
          ? 'market'
          : s.resources.scrap < 3 || s.resources.parts < 2 || s.resources.wood < 3
            ? 'garage'
            : s.resources.meds < 1
              ? 'pharmacy'
              : 'market';
      sendExpedition(s, loc, [fit[0].id], 'balanced');
    }
  }
};

function run(policy: Policy, seed: number, maxDays: number) {
  const s = createShelter(seed, 0);
  while (!isGameOver(s) && dayOf(s.hour) <= maxDays) {
    policy(s);
    tickHour(s);
  }
  return { days: dayOf(s.hour), alive: aliveSurvivors(s).length, s };
}

const SEEDS = 40;
const MAX_DAYS = 30;
for (const [name, policy] of [['AFK (ninguém joga)', afk], ['AFK com ordens permanentes (1 visita)', afkOrders], ['Casual (2 visitas/dia)', casual]] as const) {
  const results = Array.from({ length: SEEDS }, (_, i) => run(policy, i + 1, MAX_DAYS));
  const days = results.map((r) => r.days).sort((a, b) => a - b);
  const survived = results.filter((r) => r.alive > 0).length;
  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  console.log(`\n${name}`);
  console.log(`  dias: média ${avg.toFixed(1)} · mediana ${days[Math.floor(days.length / 2)]} · mín ${days[0]} · máx ${days[days.length - 1]}`);
  console.log(`  chegaram ao dia ${MAX_DAYS} com alguém vivo: ${survived}/${SEEDS}`);
  const causes = new Map<string, number>();
  for (const r of results) {
    for (const e of r.s.diary) {
      if (e.tone !== 'bad') continue;
      const key = /De fome/.test(e.text) ? 'fome' : /De sede/.test(e.text) ? 'sede' : /doença/.test(e.text) ? 'doença'
        : /não voltou/.test(e.text) ? 'expedição' : /foi embora/.test(e.text) ? 'deserção' : /morreu\./.test(e.text) ? 'outros' : null;
      if (key) causes.set(key, (causes.get(key) ?? 0) + 1);
    }
  }
  console.log(`  perdas: ${[...causes].map(([k, n]) => `${k} ${n}`).join(' · ') || 'nenhuma'}`);
  const sample = results[0].s;
  console.log(`  exemplo (semente 1): construções ${JSON.stringify(sample.buildings)}`);
  console.log(`  recursos finais: ${Object.entries(sample.resources).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ')}`);
}
