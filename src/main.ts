import Phaser from 'phaser';
import { RaidScene, TILE } from './game/RaidScene';
import { RaidUi } from './game/raidUi';
import { ShelterScene } from './game/ShelterScene';
import { ShelterUi, clock, diaryHtml } from './game/shelterUi';
import { clearSave, loadSave, loadSpeed, saveGame, saveSpeed } from './game/save';
import { MAP_H, MAP_W } from './sim/raid/mapgen';
import { REAL_MS_PER_GAME_HOUR, dayOf } from './sim/shelter/core';
import { advanceTo, applyRaidResult, createShelter, isGameOver, raidHp, tickHour } from './sim/shelter/shelter';
import type { ShelterState } from './sim/shelter/types';

const hud = document.getElementById('hud')!;
const overlay = document.getElementById('overlay')!;
const hint = document.getElementById('hint')!;

let shelter: ShelterState = loadSave() ?? createShelter((Math.random() * 2 ** 31) | 0, Date.now());
let speed = loadSpeed();
let mode: 'shelter' | 'raid' = 'shelter';

const msPerHour = () => REAL_MS_PER_GAME_HOUR / speed;

const shelterScene = new ShelterScene(() => renderShelter());
const raidScene = new RaidScene(() => raidUi.render());

const shelterUi = new ShelterUi(hud, {
  changed: () => {
    saveGame(shelter);
    renderShelter();
  },
  startRaid,
  setSpeed: (v) => {
    advanceTo(shelter, Date.now(), msPerHour());
    speed = v;
    shelter.lastRealMs = Date.now();
    saveSpeed(v);
  },
  skip: (hours) => {
    for (let i = 0; i < hours && !isGameOver(shelter); i++) tickHour(shelter);
    saveGame(shelter);
    renderShelter();
  },
  speed: () => speed,
});
const raidUi = new RaidUi(raidScene, hud, overlay);

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
      boot();
    },
  },
});

function boot(): void {
  // O que aconteceu enquanto a aba esteve fechada.
  const seenBefore = shelter.lastSeenHour;
  advanceTo(shelter, Date.now(), msPerHour());
  saveGame(shelter);
  shelterUi.attach(shelter);
  game.scene.start('shelter');
  if (shelter.hour > seenBefore) showReport(seenBefore);
  else if (isGameOver(shelter)) showGameOver();
}

function renderShelter(): void {
  if (mode !== 'shelter') return;
  shelter.lastSeenHour = shelter.hour;
  hint.textContent = 'Defina tarefas, construa, mande expedições à noite. A comunidade segue viva com a aba fechada.';
  shelterScene.draw(shelter);
  shelterUi.render();
}

setInterval(() => {
  const passed = advanceTo(shelter, Date.now(), msPerHour());
  if (!passed) return;
  saveGame(shelter);
  if (isGameOver(shelter)) showGameOver();
  renderShelter();
}, 1000);

function startRaid(id: string): void {
  const v = shelter.survivors.find((x) => x.id === id);
  if (!v || v.status !== 'home') return;
  mode = 'raid';
  shelterUi.detach();
  hint.textContent = 'Setas/WASD mover · andar até uma porta abre · andar até um zumbi ataca · E procurar · Espaço esperar · X extrair';
  raidUi.begin({ id: v.id, name: v.name, bio: v.bio, traits: v.traits, maxHp: 3 }, raidHp(v), (outcome) => {
    applyRaidResult(shelter, id, outcome);
    saveGame(shelter);
    mode = 'shelter';
    shelterUi.attach(shelter);
    game.scene.stop('raid');
    game.scene.start('shelter');
    if (isGameOver(shelter)) showGameOver();
  });
  game.scene.stop('shelter');
  game.scene.start('raid');
}

window.addEventListener('keydown', (e) => {
  if (mode === 'raid') raidUi.key(e);
});

function showReport(since: number): void {
  const entries = shelter.diary.filter((e) => e.hour > since);
  const hours = shelter.hour - since;
  overlay.innerHTML = `
    <div class="modal">
      <h1>LADS REMNANTS</h1>
      <h2>Enquanto você esteve fora</h2>
      <p>Passaram ${hours} horas no abrigo (${clock(since)} → ${clock(shelter.hour)}).</p>
      <div class="log report">${entries.length ? diaryHtml(entries.slice(-40)) : '<div class="muted">Nada de importante. Só o silêncio e os gemidos ao longe.</div>'}</div>
      <div class="actions" style="margin-top:12px"><button class="primary" id="report-ok">Voltar ao abrigo</button></div>
    </div>`;
  overlay.classList.remove('hidden');
  document.getElementById('report-ok')!.addEventListener('click', () => {
    overlay.classList.add('hidden');
    if (isGameOver(shelter)) showGameOver();
    renderShelter();
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
    game.scene.stop('shelter');
    game.scene.start('shelter');
  });
}
