import { describe, expect, it } from 'vitest';
import { openShelter, tickShelter } from '../src/server/game';
import { sendExpedition } from '../src/sim/shelter/expeditions';

const NOW = 1_000_000;
const HOUR_MS = 30 * 60 * 1000; // 1 dia de jogo = 12h reais

describe('avisos do servidor (tick)', () => {
  it('sem passar uma hora de jogo, nada muda e ninguém é avisado', () => {
    const s = openShelter(null, NOW, 5);
    const r = tickShelter(s, NOW + 60_000);
    expect(r.changed).toBe(false);
    expect(r.notice).toBeNull();
  });

  it('avança o abrigo com o jogador fora e avisa quando a expedição se resolve', () => {
    const s = openShelter(null, NOW, 5);
    s.resources.food = 99;
    s.resources.water = 99;
    expect(sendExpedition(s, 'market', ['iuri', 'lena'], 'cautious')).toBeNull();
    const r = tickShelter(s, NOW + 24 * HOUR_MS);
    expect(r.changed).toBe(true);
    expect(r.state.hour).toBe(s.hour);
    expect(r.notice).not.toBeNull();
    expect(['expedicao', 'emergencia', 'perda', 'porta']).toContain(r.notice!.tag);
    expect(r.notice!.title.length).toBeGreaterThan(3);
  });

  it('não mexe em quem está no meio de uma incursão', () => {
    const s = openShelter(null, NOW, 5);
    s.activeRaid = { id: 1 } as never;
    const hour = s.hour;
    const r = tickShelter(s, NOW + 48 * HOUR_MS);
    expect(r.changed).toBe(false);
    expect(r.state.hour).toBe(hour);
  });

  it('história encerrada não gera aviso', () => {
    const s = openShelter(null, NOW, 5);
    s.ended = { hour: s.hour, saved: ['marta'] };
    expect(tickShelter(s, NOW + 48 * HOUR_MS).notice).toBeNull();
  });
});
