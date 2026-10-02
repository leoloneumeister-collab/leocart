/** In-match HUD: bars, ability bar, items, score, kill feed, announcements, scoreboard. */
import { CHAMPIONS } from '../data/champions.ts';
import type { AbilityDef } from '../data/champions.ts';
import { CONFIG } from '../data/config.ts';
import { ITEMS, INVENTORY_SIZE } from '../data/items.ts';
import { abilityDef, cooldownFor, valueAt } from '../sim/abilities.ts';
import { canLevelSlot } from '../sim/economy.ts';
import type { SimEvent, Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { attachTip, el, fmtNum, fmtTime } from './dom.ts';
import { abilityIconSvg, champIconSvg, itemIconSvg } from './icons.ts';
import { itemTipHtml } from './shop.ts';

const KEYS = ['Q', 'W', 'E', 'R'];

export interface HudCallbacks {
  levelUp: (slot: number) => void;
  recall: () => void;
  openShop: () => void;
  sell: (index: number) => void;
}

function abilityTip(u: Unit, def: AbilityDef, slot: number): string {
  const c = u.champ!;
  const rank = c.ranks[slot];
  const r = Math.max(1, rank);
  const cd = cooldownFor(u, def, r).toFixed(1);
  const mana = valueAt(def.mana, r);
  const dmg = def.effects.find((e) => e.type === 'damage');
  let dmgLine = '';
  if (dmg) {
    const parts: string[] = [];
    parts.push(String(Math.round(valueAt(dmg.base, r))));
    if (dmg.ap) parts.push(`+${Math.round(dmg.ap * 100)}% AP`);
    if (dmg.ad) parts.push(`+${Math.round(dmg.ad * 100)}% AD`);
    if (dmg.bonusAd) parts.push(`+${Math.round(dmg.bonusAd * 100)}% bonus AD`);
    if (dmg.ownMaxHpPct) parts.push(`+${Math.round(dmg.ownMaxHpPct * 100)}% max HP`);
    dmgLine = `<div class="tip-dmg">${dmg.dmgType === 'magic' ? 'Magic' : dmg.dmgType === 'true' ? 'True' : 'Physical'} damage: ${parts.join(' ')}</div>`;
  }
  const next = rank < (slot === 3 ? 3 : 5) ? `<div class="tip-sub">Rank ${rank}/${slot === 3 ? 3 : 5}. Ctrl+${KEYS[slot]} to level up</div>` : `<div class="tip-sub">Max rank</div>`;
  return `<div class="tip-title">${def.name} <span class="tip-key">${KEYS[slot]}</span></div><div class="tip-body">${def.desc}</div>${dmgLine}<div class="tip-sub">Cooldown ${cd}s &middot; Mana ${mana}${def.range ? ` &middot; Range ${def.range}` : ''}</div>${next}`;
}

export class Hud {
  readonly root: HTMLElement;
  private cb: HudCallbacks;
  private timerEl!: HTMLElement;
  private scoreBlue!: HTMLElement;
  private scoreRed!: HTMLElement;
  private towersBlue!: HTMLElement;
  private towersRed!: HTMLElement;
  private csEl!: HTMLElement;
  private kdaEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private feed!: HTMLElement;
  private banner!: HTMLElement;
  private msgEl!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private mpFill!: HTMLElement;
  private mpText!: HTMLElement;
  private xpFill!: HTMLElement;
  private levelEl!: HTMLElement;
  private portrait!: HTMLElement;
  private statsEl!: HTMLElement;
  private goldEl!: HTMLElement;
  private abilityEls: { root: HTMLElement; cd: HTMLElement; cdText: HTMLElement; pips: HTMLElement; plus: HTMLElement; icon: HTMLElement }[] = [];
  private passiveEl!: HTMLElement;
  private itemEls: HTMLElement[] = [];
  private respawnEl!: HTMLElement;
  private recallEl!: HTMLElement;
  private recallFill!: HTMLElement;
  private scoreboard!: HTMLElement;
  private shopHint!: HTMLElement;
  private bannerT = 0;
  private msgT = 0;
  private statTimer = 0;
  private builtFor = 0;
  private itemKey = '';
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.cb = cb;
    this.root = el('div', 'hud hidden', '', parent);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  build(u: Unit) {
    this.root.innerHTML = '';
    this.abilityEls = [];
    this.itemEls = [];
    this.builtFor = u.id;
    const def = CHAMPIONS[u.defId];

    // Top bar
    const top = el('div', 'hud-top', '', this.root);
    const score = el('div', 'score', '', top);
    this.towersBlue = el('span', 'tw blue', '0', score);
    this.scoreBlue = el('span', 'kills blue', '0', score);
    this.timerEl = el('span', 'timer', '0:00', score);
    this.scoreRed = el('span', 'kills red', '0', score);
    this.towersRed = el('span', 'tw red', '0', score);
    const right = el('div', 'hud-topright', '', this.root);
    this.kdaEl = el('span', 'kda', '0 / 0 / 0', right);
    this.csEl = el('span', 'cs', '0 CS', right);
    this.speedEl = el('span', 'speed hidden', '', right);
    this.fpsEl = el('span', 'fps', '', right);
    this.feed = el('div', 'feed', '', this.root);
    this.banner = el('div', 'banner', '', this.root);
    this.msgEl = el('div', 'msg', '', this.root);

    // Bottom panel
    const bottom = el('div', 'hud-bottom', '', this.root);
    const left = el('div', 'hud-left', '', bottom);
    this.portrait = el('div', 'portrait', champIconSvg(def.name[0], def.look.primary, def.look.accent), left);
    this.levelEl = el('div', 'lvl', '1', this.portrait);
    const xpBar = el('div', 'xpbar', '', left);
    this.xpFill = el('div', 'fill', '', xpBar);

    const mid = el('div', 'hud-mid', '', bottom);
    const abil = el('div', 'abilities', '', mid);
    // Passive
    this.passiveEl = el('div', 'passive', '', abil);
    this.passiveEl.innerHTML = abilityIconSvg('passive', def.look.accent);
    attachTip(this.passiveEl, () => `<div class="tip-title">${def.passive.name} <span class="tip-key">Passive</span></div><div class="tip-body">${def.passive.desc}</div>`);
    for (let i = 0; i < 4; i++) {
      const ad = def.abilities[i];
      const root = el('div', 'ability', '', abil);
      const plus = el('button', 'plus hidden', '+', root);
      plus.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.levelUp(i);
      });
      const icon = el('div', 'a-icon', abilityIconSvg(ad.icon, ad.color), root);
      const cd = el('div', 'a-cd', '', root);
      const cdText = el('div', 'a-cdtext', '', root);
      el('div', 'a-key', KEYS[i], root);
      const pips = el('div', 'pips', '', root);
      const max = i === 3 ? 3 : 5;
      for (let k = 0; k < max; k++) el('i', '', '', pips);
      attachTip(root, () => abilityTip(this.curUnit!, abilityDef(this.curUnit!, i), i));
      this.abilityEls.push({ root, cd, cdText, pips, plus, icon });
    }
    const bars = el('div', 'bars', '', mid);
    const hpBar = el('div', 'bar hp', '', bars);
    this.hpFill = el('div', 'fill', '', hpBar);
    this.hpText = el('div', 'bar-text', '', hpBar);
    const mpBar = el('div', 'bar mp', '', bars);
    this.mpFill = el('div', 'fill', '', mpBar);
    this.mpText = el('div', 'bar-text', '', mpBar);
    this.statsEl = el('div', 'stats', '', mid);

    const rightPanel = el('div', 'hud-right', '', bottom);
    const items = el('div', 'items', '', rightPanel);
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = el('div', 'item-slot empty', '', items);
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.cb.sell(i);
      });
      this.itemEls.push(slot);
    }
    this.goldEl = el('div', 'gold', '', rightPanel);
    const btns = el('div', 'hud-btns', '', rightPanel);
    const recall = el('button', 'hbtn', 'Recall <kbd>B</kbd>', btns);
    recall.addEventListener('click', () => this.cb.recall());
    const shop = el('button', 'hbtn', 'Shop <kbd>P</kbd>', btns);
    shop.addEventListener('click', () => this.cb.openShop());
    this.shopHint = el('div', 'shop-hint hidden', 'In base: press P to open the shop', this.root);

    this.respawnEl = el('div', 'respawn hidden', '', this.root);
    this.recallEl = el('div', 'recall hidden', 'Recalling...', this.root);
    this.recallFill = el('div', 'fill', '', el('div', 'recall-bar', '', this.recallEl));
    this.scoreboard = el('div', 'scoreboard hidden', '', this.root);
    this.itemKey = '';
  }

  private curUnit: Unit | null = null;

  /** Slot area for external widgets (minimap) */
  get container(): HTMLElement {
    return this.root;
  }

  showMessage(text: string, secs = 1.6) {
    this.msgEl.textContent = text;
    this.msgEl.classList.add('on');
    this.msgT = secs;
  }

  announce(text: string, team: number) {
    this.banner.textContent = text;
    this.banner.className = 'banner on ' + (team === 0 ? 'blue' : team === 1 ? 'red' : '');
    this.bannerT = 3.2;
  }

  onEvent(ev: SimEvent, w: World, viewerTeam: number) {
    if (ev.t === 'kill') {
      const killer = w.get(ev.killer);
      const victim = w.get(ev.victim);
      if (!victim) return;
      const kn = killer ? (killer.kind === 'champion' ? CHAMPIONS[killer.defId].name : killer.name) : 'Execution';
      const row = el('div', 'feed-row ' + (victim.team === viewerTeam ? 'bad' : 'good'), '', this.feed);
      const kc = el('span', killer && killer.team === 0 ? 'blue' : 'red', kn, row);
      void kc;
      el('span', 'sw', '⚔', row);
      el('span', victim.team === 0 ? 'blue' : 'red', CHAMPIONS[victim.defId].name, row);
      setTimeout(() => row.remove(), 7000);
      while (this.feed.children.length > 6) this.feed.firstElementChild!.remove();
    } else if (ev.t === 'announce') {
      this.announce(ev.text, ev.team);
    } else if (ev.t === 'msg') {
      if (ev.unit === this.builtFor) this.showMessage(ev.text);
    } else if (ev.t === 'levelUp') {
      if (ev.id === this.builtFor) this.showMessage(`Level ${ev.level}! Spend your skill point (Ctrl + Q/W/E/R or click +)`);
    }
  }

  update(w: World, u: Unit, dt: number, fps: number, speed: number, scoreboardOn: boolean) {
    this.curUnit = u;
    if (this.builtFor !== u.id) this.build(u);
    const c = u.champ!;
    const def = CHAMPIONS[u.defId];
    this.timerEl.textContent = fmtTime(w.time);
    this.scoreBlue.textContent = String(w.teamKills[0]);
    this.scoreRed.textContent = String(w.teamKills[1]);
    this.towersBlue.textContent = String(w.teamTowers[0]);
    this.towersRed.textContent = String(w.teamTowers[1]);
    this.kdaEl.textContent = `${c.kills} / ${c.deaths} / ${c.assists}`;
    this.csEl.textContent = `${c.cs} CS`;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps`;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    void fps;
    this.speedEl.classList.toggle('hidden', speed === 1);
    this.speedEl.textContent = `x${speed}`;

    // Bars
    this.hpFill.style.width = `${Math.max(0, (u.hp / u.s.maxHp) * 100)}%`;
    this.hpText.textContent = `${Math.ceil(u.hp)} / ${Math.ceil(u.s.maxHp)}`;
    this.mpFill.style.width = `${Math.max(0, (u.mana / Math.max(1, u.s.maxMana)) * 100)}%`;
    this.mpText.textContent = `${Math.ceil(u.mana)} / ${Math.ceil(u.s.maxMana)}`;
    this.levelEl.textContent = String(c.level);
    const need = 190 + 85 * (c.level - 1);
    this.xpFill.style.width = c.level >= CONFIG.maxLevel ? '100%' : `${(c.xp / need) * 100}%`;
    this.goldEl.textContent = `${fmtNum(c.gold)} g`;

    this.statTimer -= dt;
    if (this.statTimer <= 0) {
      this.statTimer = 0.2;
      const s = u.s;
      this.statsEl.innerHTML = `<span title="Attack Damage">AD <b>${Math.round(s.ad)}</b></span><span title="Ability Power">AP <b>${Math.round(s.ap)}</b></span><span title="Armor">AR <b>${Math.round(s.armor)}</b></span><span title="Magic Resist">MR <b>${Math.round(s.mr)}</b></span><span title="Attack Speed">AS <b>${s.as.toFixed(2)}</b></span><span title="Move Speed">MS <b>${Math.round(s.ms * 50)}</b></span>`;
    }

    // Abilities
    for (let i = 0; i < 4; i++) {
      const a = this.abilityEls[i];
      const ad = def.abilities[i];
      const rank = c.ranks[i];
      const cdLeft = c.cooldowns[i];
      const total = rank > 0 ? Math.max(0.1, cooldownFor(u, ad, rank)) : 1;
      a.root.classList.toggle('locked', rank === 0);
      a.root.classList.toggle('nomana', rank > 0 && u.mana < valueAt(ad.mana, rank) && cdLeft <= 0);
      a.cd.style.height = rank > 0 ? `${Math.min(100, (cdLeft / total) * 100)}%` : '100%';
      a.cdText.textContent = cdLeft > 0 ? (cdLeft >= 10 ? String(Math.ceil(cdLeft)) : cdLeft.toFixed(1)) : '';
      const pips = a.pips.children;
      for (let k = 0; k < pips.length; k++) pips[k].classList.toggle('on', k < rank);
      a.plus.classList.toggle('hidden', !canLevelSlot(u, i));
    }

    // Items
    const key = c.items.join(',');
    if (key !== this.itemKey) {
      this.itemKey = key;
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const id = c.items[i];
        const slot = this.itemEls[i];
        slot.classList.toggle('empty', !id);
        slot.innerHTML = id ? itemIconSvg(ITEMS[id].category, ITEMS[id].color, ITEMS[id].tier) : '';
        if (id) {
          const d = ITEMS[id];
          attachTip(slot, () => itemTipHtml(d));
        }
      }
    }

    // Respawn / recall / shop hint
    if (!u.alive) {
      this.respawnEl.classList.remove('hidden');
      this.respawnEl.textContent = `Respawning in ${Math.max(0, Math.ceil(c.respawnAt - w.time))}s`;
    } else this.respawnEl.classList.add('hidden');
    if (u.order.t === 'recall') {
      this.recallEl.classList.remove('hidden');
      this.recallFill.style.width = `${(1 - u.order.left / CONFIG.recallTime) * 100}%`;
    } else this.recallEl.classList.add('hidden');
    this.shopHint.classList.toggle('hidden', !(c.inShop && u.alive) || document.querySelector('.shop:not(.hidden)') !== null);

    // Banner and message timers
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('on');
    }
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.msgEl.classList.remove('on');
    }

    this.scoreboard.classList.toggle('hidden', !scoreboardOn);
    if (scoreboardOn) this.renderScoreboard(w, u);
    this.passiveEl.classList.toggle('active', c.stacks > 0);
  }

  private renderScoreboard(w: World, viewer: Unit) {
    const rows = (team: 0 | 1) =>
      w.champions
        .filter((c) => c.team === team)
        .map((c) => {
          const cc = c.champ!;
          const items = cc.items.map((i) => (i ? `<span class="sb-item">${itemIconSvg(ITEMS[i].category, ITEMS[i].color, ITEMS[i].tier)}</span>` : '<span class="sb-item empty"></span>')).join('');
          const you = c === viewer ? ' you' : '';
          const dead = c.alive ? '' : ' dead';
          return `<tr class="${you}${dead}"><td class="sb-champ"><span class="sb-ico">${champIconSvg(CHAMPIONS[c.defId].name[0], CHAMPIONS[c.defId].look.primary, CHAMPIONS[c.defId].look.accent)}</span>${CHAMPIONS[c.defId].name}</td><td>${cc.level}</td><td>${cc.kills}/${cc.deaths}/${cc.assists}</td><td>${cc.cs}</td><td class="sb-items">${items}</td><td>${team === viewer.team ? fmtNum(cc.totalGold) : '-'}</td></tr>`;
        })
        .join('');
    const head = '<tr><th>Champion</th><th>Lv</th><th>K/D/A</th><th>CS</th><th>Items</th><th>Gold</th></tr>';
    this.scoreboard.innerHTML = `<div class="sb-title">Scoreboard <span>${fmtTime(w.time)}</span></div><table class="sb blue"><caption>Blue team (${w.teamKills[0]} kills, ${w.teamTowers[0]} towers)</caption>${head}${rows(0)}</table><table class="sb red"><caption>Red team (${w.teamKills[1]} kills, ${w.teamTowers[1]} towers)</caption>${head}${rows(1)}</table>`;
  }
}
