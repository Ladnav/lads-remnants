import '@fontsource/special-elite/latin-400.css';
import Phaser from 'phaser';
import { RESOURCES, type ResourceId } from './data/shelter';
import { banner, faceLargeUrl, faceUrl } from './game/art';
import { GalleryScene } from './game/GalleryScene';
import { iconUrl, iconize } from './game/icons';
import { RES, TILE, WALL_H } from './game/oblique';
import { RaidScene } from './game/RaidScene';
import { RaidUi } from './game/raidUi';
import { RegionScene } from './game/RegionScene';
import { ShelterScene } from './game/ShelterScene';
import { isMuted, setAmbience, sfx, toggleMute, unlockOnGesture } from './game/sound';
import { ensureLook, survivorLook } from './game/sprites';
import { SHOWN_RESOURCES, ShelterUi, clock, diaryHtml, fmt, groupHtml, profileHtml, type View } from './game/shelterUi';
import { LocalBackend, type Backend } from './net/backend';
import { SupabaseBackend } from './net/supabase';
import { applyCommand, type RaidRequest } from './server/game';
import { MAP_H, MAP_W } from './sim/raid/mapgen';
import type { Action } from './sim/raid/types';
import { aliveSurvivors, dayOf, hourOfDay, isNight } from './sim/shelter/core';
import { pendingEmergencies } from './sim/shelter/expeditions';
import { advanceTo, isFinished, markSeen } from './sim/shelter/shelter';
import type { ShelterState } from './sim/shelter/types';

const hud = document.getElementById('hud')!;
const overlay = document.getElementById('overlay')!;
const hint = document.getElementById('hint')!;
const topbar = document.getElementById('topbar')!;
const ticker = document.getElementById('ticker')!;

/** Online quando o Supabase está configurado (.env.local); `?offline` força o modo local. */
function pickBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const forceOffline = new URLSearchParams(location.search).has('offline');
  return url && key && !forceOffline ? new SupabaseBackend(url, key) : new LocalBackend();
}

let backend = pickBackend();
let shelter!: ShelterState;
let mode: View | 'raid' = 'shelter';
let busy = false;

const shelterScene = new ShelterScene(() => render());
const regionScene = new RegionScene(() => render());
const raidScene = new RaidScene(() => raidUi.render());

const portraits = new Map<string, string>();
/** Recorta o quadro de frente do sprite para usar como retrato no painel. */
function portrait(id: string): string | null {
  const painted = faceUrl(id);
  if (painted) return painted;
  const cached = portraits.get(id);
  if (cached) return cached;
  if (!shelterScene.ready) return null;
  try {
    const url = game.textures.getBase64(ensureLook(shelterScene, survivorLook(id)), 'down0');
    if (url) portraits.set(id, url);
    return url || null;
  } catch {
    return null;
  }
}

const shelterUi = new ShelterUi({ hud, top: topbar, ticker }, {
  changed: () => render(),
  command: async (cmd) => {
    // Otimista: aplica já (mesmas regras do servidor) e troca pelo estado oficial na resposta.
    if (backend.online) applyCommand(shelter, cmd, Date.now());
    render();
    try {
      const r = await backend.command(cmd);
      adopt(r.state);
      if (shelter.ended) showGameOver();
      return r.error ?? null;
    } catch (e) {
      return (e as Error).message;
    }
  },
  setView: (v) => switchTo(v),
  startRaid: (survivorId, locationId, loadout) => void playRaid({ survivorId, locationId, loadout }),
  takeOver: (expId) => {
    const e = shelter.expeditions.find((x) => x.id === expId);
    if (e?.emergency) void playRaid({ survivorId: e.emergency.survivorId, locationId: e.locationId, emergencyExpId: expId });
  },
  skip: async (hours) => {
    try {
      const r = await backend.skip(hours);
      adopt(r.state);
      if (r.error) shelterUi.setError(r.error);
    } catch (e) {
      shelterUi.setError((e as Error).message);
    }
    render();
  },
  account: () => backend.account(),
  linkEmail: (email) => backend.linkEmail(email),
  portrait,
  profile: (id) => showProfile(id),
  group: () => showGroup(),
});
const raidUi = new RaidUi(raidScene, hud, overlay, topbar, ticker);
regionScene.setSelectHandler((id) => shelterUi.select(id));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: MAP_W * TILE * RES,
  height: (MAP_H * TILE + WALL_H) * RES,
  backgroundColor: '#070707',
  // A pintura usa filtro suave; os bonecos de pixel art pedem o filtro deles (ver sprites.ts).
  pixelArt: false,
  scene: [],
  callbacks: {
    postBoot: (g) => {
      g.scene.add('raid', raidScene, false);
      g.scene.add('shelter', shelterScene, false);
      g.scene.add('region', regionScene, false);
      // `?sprites`: só a galeria de personagens, sem abrir o abrigo.
      if (new URLSearchParams(location.search).has('sprites')) {
        hud.style.display = 'none';
        topbar.style.display = 'none';
        hint.textContent = 'Galeria de personagens. Tire o ?sprites do endereço para voltar ao jogo.';
        g.scene.add('gallery', new GalleryScene(), true);
        return;
      }
      void boot();
    },
  },
});

function adopt(s: ShelterState): void {
  shelter = s;
  if (mode !== 'raid') shelterUi.attach(shelter);
}

async function boot(): Promise<void> {
  modal(`${banner('title', 'hero')}<h1>LADS REMNANTS</h1><p>${backend.online ? 'Conectando ao abrigo…' : 'Abrindo o abrigo…'}</p>`);
  try {
    shelter = await backend.load();
  } catch (e) {
    modal(`${banner('title', 'hero')}<h1>LADS REMNANTS</h1>
      <p class="bad">Não foi possível falar com o servidor: ${(e as Error).message}</p>
      <div class="actions"><button class="primary" id="retry">Tentar de novo</button><button id="offline">Jogar offline</button></div>`);
    document.getElementById('retry')!.addEventListener('click', () => void boot());
    document.getElementById('offline')!.addEventListener('click', () => {
      backend = new LocalBackend();
      void boot();
    });
    return;
  }
  overlay.classList.add('hidden');
  const seenBefore = shelter.lastSeenHour;
  const resBefore = shelter.seenResources;
  const aliveBefore = shelter.seenAlive;
  shelterUi.attach(shelter);
  if (shelterScene.ready) render();
  else game.scene.start('shelter');
  if (shelter.hour > seenBefore) showReport(seenBefore, resBefore, aliveBefore);
  else if (isFinished(shelter)) showGameOver();
}

const SCENE_OF: Record<View, string> = { shelter: 'shelter', map: 'region' };

function switchTo(v: View): void {
  if (mode === 'raid') return;
  if (mode !== v) {
    game.scene.stop(SCENE_OF[mode]);
    mode = v;
    game.scene.start(SCENE_OF[v]);
  } else {
    render();
  }
}

// ---------- Som ----------
unlockOnGesture();
const muteBtn = document.getElementById('mute')!;
const paintMute = () => {
  muteBtn.innerHTML = `<img class="ico" src="${iconUrl(isMuted() ? 'mute' : 'sound')}" alt=""/>`;
  muteBtn.title = isMuted() ? 'Ligar o som' : 'Desligar o som';
};
paintMute();
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
  paintMute();
});
// Todo botão do painel responde com um clique.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button, select, input[type=checkbox]')) sfx('click');
});

function ambience(): void {
  if (shelter) setAmbience({ rain: shelter.raining, night: isNight(hourOfDay(shelter.hour)), raid: mode === 'raid' });
}

function render(): void {
  ambience();
  if (mode === 'raid' || !shelter) return;
  markSeen(shelter);
  if (mode === 'shelter') {
    hint.textContent = 'Defina tarefas, construa e cuide do grupo. A comunidade segue viva com a aba fechada.';
    if (shelterScene.ready) shelterScene.draw(shelter);
  } else {
    hint.textContent = 'Clique num local para planejar uma expedição noturna ou entrar numa incursão ativa.';
    if (regionScene.ready) regionScene.draw(shelter, shelterUi.selected);
  }
  shelterUi.render();
}

// O relógio anda na tela; o servidor confirma a cada comando e a cada poucos minutos.
setInterval(() => {
  if (!shelter || mode === 'raid') return;
  // O que aconteceu nesta virada de hora decide o som: batida na porta, alarme, notícia boa ou ruim.
  const before = { diary: shelter.diary.length, doors: shelter.dilemmas.length, alarms: pendingEmergencies(shelter).length };
  if (!advanceTo(shelter, Date.now())) return;
  const news = shelter.diary.slice(before.diary);
  if (pendingEmergencies(shelter).length > before.alarms) sfx('alert');
  else if (shelter.dilemmas.length > before.doors) sfx('knock');
  else if (news.some((e) => e.tone === 'bad')) sfx('bad');
  else if (news.some((e) => e.tone === 'good')) sfx('good');
  if (isFinished(shelter)) showGameOver();
  render();
}, 1000);

setInterval(() => {
  if (!backend?.online || !shelter || mode === 'raid' || busy) return;
  backend
    .load()
    .then((s) => {
      if (mode !== 'raid') {
        adopt(s);
        render();
      }
    })
    .catch(() => {});
}, 5 * 60 * 1000);

async function playRaid(req: RaidRequest): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const r = await backend.startRaid(req);
    adopt(r.state);
    const ticket = r.value;
    if (!ticket) {
      shelterUi.setError(r.error ?? 'Não foi possível começar a incursão.');
      render();
      return;
    }
    const back: View = mode === 'raid' ? 'shelter' : mode;
    game.scene.stop(SCENE_OF[back]);
    mode = 'raid';
    shelterUi.detach();
    hint.textContent = 'Setas/WASD ou o direcional para mover · andar até uma porta abre · andar até um zumbi ataca · toque num container vizinho para procurar';
    raidUi.begin(ticket, (actions) => void endRaid(ticket.id, actions, back));
    ambience();
    game.scene.start('raid');
  } catch (e) {
    shelterUi.setError((e as Error).message);
    render();
  } finally {
    busy = false;
  }
}

async function endRaid(raidId: number, actions: Action[], back: View): Promise<void> {
  modal('<p>Voltando para o abrigo…</p>');
  let error: string | undefined;
  try {
    const r = await backend.finishRaid(raidId, actions);
    shelter = r.state;
    error = r.error;
  } catch (e) {
    error = (e as Error).message;
  }
  overlay.classList.add('hidden');
  game.scene.stop('raid');
  mode = back;
  shelterUi.attach(shelter);
  if (error) shelterUi.setError(error);
  game.scene.start(SCENE_OF[back]);
  if (isFinished(shelter)) showGameOver();
}

window.addEventListener('keydown', (e) => {
  if (mode === 'raid') raidUi.key(e);
});

// Marca o que já foi visto ao sair, para o relatório não repetir o que já foi lido.
window.addEventListener('pagehide', () => backend.leaving());

function modal(inner: string): void {
  overlay.innerHTML = `<div class="modal">${inner}</div>`;
  iconize(overlay);
  overlay.classList.remove('hidden');
}

function showReport(since: number, resBefore: ShelterState['seenResources'], aliveBefore: string[]): void {
  const entries = shelter.diary.filter((e) => e.hour > since);
  const hours = shelter.hour - since;
  const deltas = resBefore
    ? SHOWN_RESOURCES.filter((r: ResourceId) => Math.abs(shelter.resources[r] - resBefore[r]) >= 0.5)
        .map((r) => {
          const d = shelter.resources[r] - resBefore[r];
          const good = r === 'waste' ? d < 0 : d > 0;
          return `<span class="res ${good ? 'good' : 'bad'}">${RESOURCES[r].icon} ${d > 0 ? '+' : ''}${fmt(Math.round(d * 10) / 10)}</span>`;
        })
        .join('')
    : '';
  const aliveNow = aliveSurvivors(shelter).map((v) => v.id);
  const lost = shelter.survivors.filter((v) => aliveBefore.includes(v.id) && !aliveNow.includes(v.id));
  const joined = shelter.survivors.filter((v) => aliveBefore.length && !aliveBefore.includes(v.id) && aliveNow.includes(v.id));
  modal(`
      ${banner('title', 'hero')}
      <h1>LADS REMNANTS</h1>
      <h2>Enquanto você esteve fora</h2>
      <p>Passaram ${hours} horas no abrigo (${clock(since)} → ${clock(shelter.hour)}).</p>
      ${lost.length ? `<p class="bad">Perdidos: ${lost.map((v) => `<strong>${v.name}</strong> (${v.status === 'dead' ? 'morto(a)' : 'partiu'})`).join(', ')}.</p>` : ''}
      ${joined.length ? `<p class="good">Chegaram: ${joined.map((v) => `<strong>${v.name}</strong>`).join(', ')}.</p>` : ''}
      ${deltas ? `<div class="resgrid" style="margin-bottom:10px">${deltas}</div>` : ''}
      <div class="log report">${entries.length ? diaryHtml(entries.slice(-40)) : '<div class="muted">Nada de importante. Só o silêncio e os gemidos ao longe.</div>'}</div>
      <div class="actions" style="margin-top:12px"><button class="primary" id="report-ok">Voltar ao abrigo</button></div>`);
  document.getElementById('report-ok')!.addEventListener('click', () => {
    overlay.classList.add('hidden');
    if (isFinished(shelter)) showGameOver();
    render();
    void backend
      .command({ type: 'seen' })
      .then((r) => adopt(r.state))
      .catch(() => {});
  });
}

/** Ficha do personagem, com setas para passar pelos outros. */
function showProfile(id: string): void {
  const list = shelter.survivors;
  const i = list.findIndex((v) => v.id === id);
  if (i < 0) return;
  const v = list[i];
  modal(`${profileHtml(shelter, v, faceLargeUrl(v.id) ?? portrait(v.id))}
      <div class="actions profile-nav"><button id="p-group">👥 Grupo</button><button id="p-prev">◀ ${list[(i + list.length - 1) % list.length].name}</button><button class="primary" id="p-close">Fechar</button><button id="p-next">${list[(i + 1) % list.length].name} ▶</button></div>`);
  overlay.querySelector('.modal')!.classList.add('wide');
  const close = () => overlay.classList.add('hidden');
  document.getElementById('p-close')!.addEventListener('click', close);
  document.getElementById('p-group')!.addEventListener('click', () => showGroup());
  document.getElementById('p-prev')!.addEventListener('click', () => showProfile(list[(i + list.length - 1) % list.length].id));
  document.getElementById('p-next')!.addEventListener('click', () => showProfile(list[(i + 1) % list.length].id));
  overlay.onclick = (e) => {
    if (e.target === overlay && document.getElementById('p-close')) close();
  };
}

/** Tela do grupo: todos os retratos; clicar em um abre a ficha. */
function showGroup(): void {
  modal(`${groupHtml(shelter, (id) => faceLargeUrl(id) ?? portrait(id))}
      <div class="actions profile-nav"><span></span><button class="primary" id="p-close">Fechar</button><span></span></div>`);
  overlay.querySelector('.modal')!.classList.add('wide');
  const close = () => overlay.classList.add('hidden');
  document.getElementById('p-close')!.addEventListener('click', close);
  overlay.querySelectorAll<HTMLElement>('[data-profile]').forEach((el) => el.addEventListener('click', () => showProfile(el.dataset.profile!)));
  overlay.onclick = (e) => {
    if (e.target === overlay && document.getElementById('p-close')) close();
  };
}

function showGameOver(): void {
  if (!overlay.classList.contains('hidden')) return;
  const fate = (v: ShelterState['survivors'][number]) => `${v.name} (${v.status === 'dead' ? 'morto(a)' : 'partiu'})`;
  const end = shelter.ended;
  const behind = shelter.survivors.filter((v) => v.status === 'dead' || v.status === 'gone').map(fate).join(', ');
  const head = end
    ? `<h2 class="good">Eles saíram da cidade</h2>
      <p>No dia ${dayOf(end.hour)}, ${end.saved.join(', ')} ${end.saved.length > 1 ? 'chegaram' : 'chegou'} ao cais velho e o barco partiu.
      ${behind ? `Ficaram pelo caminho: ${behind}.` : 'Ninguém ficou para trás.'}</p>`
    : `<h2 class="bad">A comunidade acabou</h2>
      <p>Resistiram até o dia ${dayOf(shelter.hour)}. ${shelter.survivors.map(fate).join(', ')}.</p>`;
  modal(`
      ${banner(end ? 'ending-boat' : 'ending-dead', 'hero')}
      ${head}
      <div class="log report">${diaryHtml(shelter.diary.slice(-15))}</div>
      <div class="actions" style="margin-top:12px"><button class="primary" id="restart">${end ? 'Começar outra história' : 'Começar de novo'}</button></div>`);
  document.getElementById('restart')!.addEventListener('click', async () => {
    adopt(await backend.reset());
    overlay.classList.add('hidden');
    render();
  });
}
