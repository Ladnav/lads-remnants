import Phaser from 'phaser';
import { RESOURCES, locationById, type ResourceId } from './data/shelter';
import { RaidScene, TILE } from './game/RaidScene';
import { RaidUi } from './game/raidUi';
import { RegionScene } from './game/RegionScene';
import { ShelterScene } from './game/ShelterScene';
import { SHOWN_RESOURCES, ShelterUi, clock, diaryHtml, fmt, type View } from './game/shelterUi';
import { clearSave, loadSave, loadSpeed, saveGame, saveSpeed } from './game/save';
import { MAP_H, MAP_W } from './sim/raid/mapgen';
import { REAL_MS_PER_GAME_HOUR, aliveSurvivors, dayOf } from './sim/shelter/core';
import { takeOverEmergency } from './sim/shelter/expeditions';
import {
  advanceTo,
  applyRaidResult,
  createShelter,
  hasUndiscovered,
  isGameOver,
  markSeen,
  raidHp,
  tickHour,
} from './sim/shelter/shelter';
import type { ShelterState, ShelterSurvivor } from './sim/shelter/types';

const hud = document.getElementById('hud')!;
const overlay = document.getElementById('overlay')!;
const hint = document.getElementById('hint')!;

let shelter: ShelterState = loadSave() ?? createShelter((Math.random() * 2 ** 31) | 0, Date.now());
let speed = loadSpeed();
let mode: View | 'raid' = 'shelter';

const msPerHour = () => REAL_MS_PER_GAME_HOUR / speed;

const shelterScene = new ShelterScene(() => render());
const regionScene = new RegionScene(() => render());
const raidScene = new RaidScene(() => raidUi.render());

const shelterUi = new ShelterUi(hud, {
  changed: () => {
    saveGame(shelter);
    render();
  },
  setView: (v) => switchTo(v),
  startRaid: (id, loc) => {
    const v = shelter.survivors.find((x) => x.id === id);
    if (v && v.status === 'home') startRaid(v, loc, false);
  },
  takeOver: (expId) => {
    const taken = takeOverEmergency(shelter, expId);
    if (taken) startRaid(taken.survivor, taken.locationId, true);
  },
  setSpeed: (v) => {
    advanceTo(shelter, Date.now(), msPerHour());
    speed = v;
    shelter.lastRealMs = Date.now();
    saveSpeed(v);
  },
  skip: (hours) => {
    for (let i = 0; i < hours && !isGameOver(shelter); i++) tickHour(shelter);
    saveGame(shelter);
    render();
  },
  speed: () => speed,
});
const raidUi = new RaidUi(raidScene, hud, overlay);
regionScene.setSelectHandler((id) => shelterUi.select(id));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: MAP_W * TILE,
  height: MAP_H * TILE,
  backgroundColor: '#0a0908',
  pixelArt: true,
  scene: [],
  callbacks: {
    postBoot: (g) => {
      g.scene.add('raid', raidScene, false);
      g.scene.add('shelter', shelterScene, false);
      g.scene.add('region', regionScene, false);
      boot();
    },
  },
});

function boot(): void {
  // O que aconteceu enquanto a aba esteve fechada.
  const seenBefore = shelter.lastSeenHour;
  const resBefore = shelter.seenResources;
  const aliveBefore = shelter.seenAlive;
  advanceTo(shelter, Date.now(), msPerHour());
  saveGame(shelter);
  shelterUi.attach(shelter);
  game.scene.start('shelter');
  if (shelter.hour > seenBefore) showReport(seenBefore, resBefore, aliveBefore);
  else if (isGameOver(shelter)) showGameOver();
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

function render(): void {
  if (mode === 'raid') return;
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

setInterval(() => {
  const passed = advanceTo(shelter, Date.now(), msPerHour());
  if (!passed) return;
  saveGame(shelter);
  if (isGameOver(shelter)) showGameOver();
  render();
}, 1000);

function startRaid(v: ShelterSurvivor, locationId: string, emergency: boolean): void {
  const loc = locationById(locationId);
  const back = mode === 'raid' ? 'shelter' : mode;
  game.scene.stop(SCENE_OF[back]);
  mode = 'raid';
  shelterUi.detach();
  hint.textContent = 'Setas/WASD mover · andar até uma porta abre · andar até um zumbi ataca · E procurar · Espaço esperar · X extrair';
  raidUi.begin(
    { id: v.id, name: v.name, bio: v.bio, traits: v.traits, maxHp: 3 },
    {
      site: loc.name,
      loot: loc.loot,
      zombies: loc.zombies,
      startHp: raidHp(v),
      emergency,
      mapNote: hasUndiscovered(shelter),
    },
    (outcome) => {
      applyRaidResult(shelter, v.id, outcome, locationId);
      saveGame(shelter);
      game.scene.stop('raid');
      mode = back;
      shelterUi.attach(shelter);
      game.scene.start(SCENE_OF[back]);
      if (isGameOver(shelter)) showGameOver();
    },
  );
  game.scene.start('raid');
}

window.addEventListener('keydown', (e) => {
  if (mode === 'raid') raidUi.key(e);
});

// Guarda o "visto por último" ao sair, para o relatório não repetir o que já foi lido.
window.addEventListener('pagehide', () => saveGame(shelter));

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
  overlay.innerHTML = `
    <div class="modal">
      <h1>LADS REMNANTS</h1>
      <h2>Enquanto você esteve fora</h2>
      <p>Passaram ${hours} horas no abrigo (${clock(since)} → ${clock(shelter.hour)}).</p>
      ${lost.length ? `<p class="bad">Perdidos: ${lost.map((v) => `<strong>${v.name}</strong> (${v.status === 'dead' ? 'morto(a)' : 'partiu'})`).join(', ')}.</p>` : ''}
      ${joined.length ? `<p class="good">Chegaram: ${joined.map((v) => `<strong>${v.name}</strong>`).join(', ')}.</p>` : ''}
      ${deltas ? `<div class="resgrid" style="margin-bottom:10px">${deltas}</div>` : ''}
      <div class="log report">${entries.length ? diaryHtml(entries.slice(-40)) : '<div class="muted">Nada de importante. Só o silêncio e os gemidos ao longe.</div>'}</div>
      <div class="actions" style="margin-top:12px"><button class="primary" id="report-ok">Voltar ao abrigo</button></div>
    </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('report-ok')!.addEventListener('click', () => {
    overlay.classList.add('hidden');
    if (isGameOver(shelter)) showGameOver();
    render();
    saveGame(shelter);
  });
}

function showGameOver(): void {
  if (!overlay.classList.contains('hidden')) return;
  const lost = shelter.survivors.map((v) => `${v.name} (${v.status === 'dead' ? 'morto(a)' : 'partiu'})`).join(', ');
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="bad">A comunidade acabou</h2>
      <p>Resistiram até o dia ${dayOf(shelter.hour)}. ${lost}.</p>
      <div class="log report">${diaryHtml(shelter.diary.slice(-15))}</div>
      <div class="actions" style="margin-top:12px"><button class="primary" id="restart">Começar de novo</button></div>
    </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('restart')!.addEventListener('click', () => {
    clearSave();
    shelter = createShelter((Math.random() * 2 ** 31) | 0, Date.now());
    shelterUi.attach(shelter);
    overlay.classList.add('hidden');
    saveGame(shelter);
    render();
  });
}
