import { RESOURCES, type ResourceId } from '../../data/shelter';
import { RECRUITS } from '../../data/survivors';
import { chance, nextRandom, pick, randInt } from '../rng';
import { addResources, aliveSurvivors, changeMood, log } from './core';
import type { Dilemma, ShelterState, VisitorKind } from './types';

const VISIT_HOURS = 6;
const TRADE_WANTS: readonly ResourceId[] = ['scrap', 'wood', 'parts', 'food', 'water', 'fuel', 'ammo'];
const TRADE_GIVES: readonly ResourceId[] = ['meds', 'bandages', 'water', 'food', 'parts', 'components', 'ammo', 'wood'];

/** Durante o dia, às vezes alguém bate na porta. */
export function maybeSpawnVisitor(s: ShelterState, h: number): void {
  if (h < 9 || h > 18 || s.dilemmas.length > 0 || !chance(s, 0.07)) return;
  const kinds: VisitorKind[] = ['beggar', 'trader', 'trader', 'conman', 'bandits'];
  const freeRecruits = RECRUITS.filter((r) => !s.usedRecruits.includes(r.id));
  if (freeRecruits.length && aliveSurvivors(s).length < 6) kinds.push('refugee', 'refugee');
  const kind = pick(s, kinds);
  const d = buildDilemma(s, kind);
  if (d) {
    s.dilemmas.push(d);
    log(s, `Batem na porta: ${d.title.toLowerCase()}.`, 'warn');
  }
}

function buildDilemma(s: ShelterState, kind: VisitorKind): Dilemma | null {
  const base = { id: s.nextId++, kind, expiresHour: s.hour + VISIT_HOURS };
  switch (kind) {
    case 'beggar':
      return {
        ...base,
        title: 'Uma mãe com uma criança',
        text: 'Uma mulher magra segura uma criança pela mão. Pede qualquer coisa para comer. A criança não diz nada.',
        options: [
          { id: 'give', label: 'Dar 1 comida e 1 água' },
          { id: 'refuse', label: 'Mandar embora' },
        ],
      };
    case 'refugee': {
      const r = pick(s, RECRUITS.filter((x) => !s.usedRecruits.includes(x.id)));
      return {
        ...base,
        title: `${r.name} pede abrigo`,
        text: `${r.bio} Está ferido(a) e sozinho(a). Mais uma boca para alimentar, mas também mais um par de mãos.`,
        options: [
          { id: 'accept', label: `Acolher ${r.name}` },
          { id: 'refuse', label: 'Recusar' },
        ],
        recruitId: r.id,
      };
    }
    case 'trader':
    case 'conman': {
      const wants = TRADE_WANTS.filter((r) => s.resources[r] >= 2);
      if (!wants.length) return null;
      const giveRes = pick(s, wants);
      const getRes = pick(s, TRADE_GIVES.filter((r) => r !== giveRes));
      const giveAmount = randInt(s, 2, Math.min(4, Math.floor(s.resources[giveRes])));
      const fair = kind === 'trader' ? randInt(s, 1, 3) : randInt(s, 4, 6);
      return {
        ...base,
        title: kind === 'trader' ? 'Um comerciante' : 'Um homem com uma proposta',
        text:
          kind === 'trader'
            ? `Uma comerciante com uma carroça improvisada. Quer ${giveAmount} de ${RESOURCES[giveRes].name.toLowerCase()} e oferece ${fair} de ${RESOURCES[getRes].name.toLowerCase()}.`
            : `Ele sorri demais. Oferece ${fair} de ${RESOURCES[getRes].name.toLowerCase()} por apenas ${giveAmount} de ${RESOURCES[giveRes].name.toLowerCase()}. Mostra a mercadoria de longe.`,
        options: [
          { id: 'accept', label: 'Aceitar a troca' },
          { id: 'refuse', label: 'Recusar' },
        ],
        give: { resource: giveRes, amount: giveAmount },
        get: { resource: getRes, amount: fair },
      };
    }
    case 'bandits':
      return {
        ...base,
        title: 'Homens armados no portão',
        text: 'Três homens, um com espingarda. Exigem 2 comida e 2 água. "Ou a gente volta hoje à noite pra buscar."',
        options: [
          { id: 'pay', label: 'Pagar 2 comida e 2 água' },
          { id: 'refuse', label: 'Recusar e se preparar' },
        ],
      };
  }
}

export function resolveDilemma(s: ShelterState, dilemmaId: number, optionId: string): void {
  const d = s.dilemmas.find((x) => x.id === dilemmaId);
  if (!d) return;
  s.dilemmas = s.dilemmas.filter((x) => x !== d);
  switch (d.kind) {
    case 'beggar':
      if (optionId === 'give') {
        addResources(s, { food: 1, water: 1 }, -1);
        changeMood(s, 6);
        log(s, 'Vocês dividiram o pouco que tinham. A criança acenou ao ir embora.', 'good');
      } else {
        changeMood(s, -5);
        log(s, 'A mulher foi embora sem dizer nada. Ninguém conseguiu olhar para a porta por um tempo.', 'warn');
      }
      break;
    case 'refugee': {
      const r = RECRUITS.find((x) => x.id === d.recruitId);
      if (optionId === 'accept' && r) {
        s.usedRecruits.push(r.id);
        s.survivors.push({
          id: r.id,
          name: r.name,
          bio: r.bio,
          traits: [...r.traits],
          health: 45,
          hunger: 60,
          thirst: 60,
          fatigue: 50,
          mood: 45,
          sick: false,
          task: 'rest',
          status: 'home',
          expeditionId: null,
          talkedDay: 0,
          brokenHours: 0,
        });
        changeMood(s, 3);
        log(s, `${r.name} agora faz parte do grupo.`, 'good');
      } else {
        changeMood(s, -6);
        log(s, `Vocês fecharam a porta para ${r?.name ?? 'o refugiado'}. Ninguém comentou.`, 'warn');
      }
      break;
    }
    case 'trader':
    case 'conman':
      if (optionId === 'accept' && d.give && d.get) {
        if (s.resources[d.give.resource] < d.give.amount) {
          log(s, 'Vocês não tinham mais o que foi combinado. A troca não aconteceu.', 'warn');
          break;
        }
        addResources(s, { [d.give.resource]: d.give.amount }, -1);
        if (d.kind === 'conman' && nextRandom(s) < 0.6) {
          changeMood(s, -4);
          log(s, `O homem pegou ${d.give.amount} de ${RESOURCES[d.give.resource].name.toLowerCase()} e sumiu. A mercadoria era pedra embrulhada.`, 'bad');
        } else {
          addResources(s, { [d.get.resource]: d.get.amount });
          log(s, `Troca feita: +${d.get.amount} ${RESOURCES[d.get.resource].name.toLowerCase()}.`, 'good');
        }
      }
      break;
    case 'bandits':
      if (optionId === 'pay') {
        addResources(s, { food: 2, water: 2 }, -1);
        changeMood(s, -3);
        log(s, 'Vocês pagaram. Eles riram e foram embora. Por enquanto.', 'warn');
      } else {
        s.banditThreat += 3;
        log(s, 'Os homens foram embora prometendo voltar à noite. Melhor ter alguém vigiando.', 'bad');
      }
      break;
  }
}

/** Visitante ignorado vai embora; recusar por omissão também pesa. */
export function expireDilemmas(s: ShelterState): void {
  for (const d of [...s.dilemmas]) {
    if (s.hour < d.expiresHour) continue;
    const fallback = d.kind === 'bandits' ? 'refuse' : d.kind === 'beggar' || d.kind === 'refugee' ? 'refuse' : 'ignore';
    if (fallback === 'ignore') {
      s.dilemmas = s.dilemmas.filter((x) => x !== d);
      log(s, `${d.title} cansou de esperar e foi embora.`);
    } else {
      resolveDilemma(s, d.id, fallback);
    }
  }
}
