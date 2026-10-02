/** Item shop modal. Opens with P, works only while the champion is in base. */
import { INVENTORY_SIZE, ITEMS, priceWith } from '../data/items.ts';
import type { ItemCategory, ItemDef } from '../data/items.ts';
import { canBuy } from '../sim/economy.ts';
import type { Unit } from '../sim/types.ts';
import { attachTip, el, fmtNum } from './dom.ts';
import { itemIconSvg } from './icons.ts';

const TABS: { id: ItemCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'damage', label: 'Attack' },
  { id: 'speed', label: 'Attack Speed' },
  { id: 'magic', label: 'Magic' },
  { id: 'defense', label: 'Defense' },
  { id: 'health', label: 'Health' },
  { id: 'boots', label: 'Boots' },
];

export function itemTipHtml(def: ItemDef): string {
  const comps = def.from.length ? `<div class="tip-sub">Builds from: ${def.from.map((c) => ITEMS[c].name).join(', ')}</div>` : '';
  return `<div class="tip-title">${def.name} <span class="tip-gold">${fmtNum(def.cost)}g</span></div><div class="tip-body">${def.desc}</div>${comps}`;
}

export class Shop {
  readonly root: HTMLElement;
  private grid: HTMLElement;
  private detail: HTMLElement;
  private inv: HTMLElement;
  private goldEl: HTMLElement;
  private tab: ItemCategory | 'all' = 'all';
  private selected: string | null = null;
  private opened = false;
  private onBuy: (id: string) => void;
  private onSell: (i: number) => void;
  private lastKey = '';

  constructor(parent: HTMLElement, onBuy: (id: string) => void, onSell: (i: number) => void) {
    this.onBuy = onBuy;
    this.onSell = onSell;
    this.root = el('div', 'shop hidden', '', parent);
    const head = el('div', 'shop-head', '<span class="shop-title">Item Shop</span>', this.root);
    this.goldEl = el('span', 'shop-gold', '', head);
    const close = el('button', 'shop-close', '×', head);
    close.addEventListener('click', () => this.close());
    const tabs = el('div', 'shop-tabs', '', this.root);
    for (const t of TABS) {
      const b = el('button', 'shop-tab', t.label, tabs);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => {
        this.tab = t.id;
        this.lastKey = '';
        this.render(this.lastUnit!);
      });
    }
    const body = el('div', 'shop-body', '', this.root);
    this.grid = el('div', 'shop-grid', '', body);
    this.detail = el('div', 'shop-detail', '', body);
    this.inv = el('div', 'shop-inv', '', this.root);
  }

  private lastUnit: Unit | null = null;

  get isOpen() {
    return this.opened;
  }

  open(u: Unit) {
    this.opened = true;
    this.root.classList.remove('hidden');
    this.lastKey = '';
    this.render(u);
  }

  close() {
    this.opened = false;
    this.root.classList.add('hidden');
  }

  toggle(u: Unit) {
    if (this.opened) this.close();
    else if (u.champ?.inShop) this.open(u);
  }

  update(u: Unit) {
    this.lastUnit = u;
    if (!this.opened) return;
    if (!u.champ!.inShop || !u.alive) {
      this.close();
      return;
    }
    this.render(u);
  }

  private render(u: Unit) {
    this.lastUnit = u;
    const c = u.champ!;
    const key = `${this.tab}|${this.selected}|${Math.floor(c.gold / 10)}|${c.items.join(',')}`;
    this.goldEl.textContent = `${fmtNum(c.gold)} gold`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const b of this.root.querySelectorAll<HTMLElement>('.shop-tab')) b.classList.toggle('active', b.dataset.tab === this.tab);
    // Grid
    this.grid.innerHTML = '';
    const list = Object.values(ITEMS)
      .filter((i) => this.tab === 'all' || i.category === this.tab)
      .sort((a, b) => a.tier - b.tier || a.cost - b.cost);
    for (const def of list) {
      const { cost } = priceWith(def.id, c.items);
      const chk = canBuy(u, def.id);
      const card = el('div', 'item-card' + (chk.ok ? '' : ' unaffordable') + (this.selected === def.id ? ' sel' : ''), '', this.grid);
      el('div', 'item-ico', itemIconSvg(def.category, def.color, def.tier), card);
      el('div', 'item-name', def.name, card);
      el('div', 'item-cost', `${fmtNum(cost)}g`, card);
      card.addEventListener('click', () => {
        this.selected = def.id;
        this.lastKey = '';
        this.render(u);
      });
      card.addEventListener('dblclick', () => this.onBuy(def.id));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onBuy(def.id);
      });
      attachTip(card, () => itemTipHtml(def));
    }
    // Detail
    this.detail.innerHTML = '';
    const sel = this.selected ? ITEMS[this.selected] : null;
    if (!sel) {
      el('div', 'detail-empty', 'Select an item. Double click or right click to buy.', this.detail);
    } else {
      const { cost } = priceWith(sel.id, c.items);
      const chk = canBuy(u, sel.id);
      el('div', 'detail-ico', itemIconSvg(sel.category, sel.color, sel.tier), this.detail);
      el('div', 'detail-name', sel.name, this.detail);
      el('div', 'detail-desc', sel.desc, this.detail);
      if (sel.from.length) {
        const r = el('div', 'detail-recipe', '<span>Recipe</span>', this.detail);
        for (const comp of sel.from) {
          const cd = ITEMS[comp];
          const have = c.items.includes(comp);
          const chip = el('div', 'recipe-chip' + (have ? ' have' : ''), '', r);
          el('div', 'chip-ico', itemIconSvg(cd.category, cd.color, cd.tier), chip);
          el('span', '', cd.name, chip);
          chip.addEventListener('click', () => {
            this.selected = comp;
            this.lastKey = '';
            this.render(u);
          });
        }
      }
      const btn = el('button', 'buy-btn', `Buy for ${fmtNum(cost)}g`, this.detail);
      btn.disabled = !chk.ok;
      if (!chk.ok) btn.title = chk.reason === 'gold' ? 'Not enough gold' : chk.reason === 'full' ? 'Inventory full' : chk.reason === 'boots' ? 'You already own boots' : '';
      btn.addEventListener('click', () => this.onBuy(sel.id));
    }
    // Inventory
    this.inv.innerHTML = '<span class="inv-label">Inventory</span>';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const id = c.items[i];
      const slot = el('div', 'inv-slot' + (id ? '' : ' empty'), '', this.inv);
      if (id) {
        const d = ITEMS[id];
        slot.innerHTML = itemIconSvg(d.category, d.color, d.tier);
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.onSell(i);
        });
        slot.addEventListener('dblclick', () => this.onSell(i));
        attachTip(slot, () => itemTipHtml(d) + '<div class="tip-sub">Double click to sell for ' + Math.floor(d.cost * 0.7) + 'g</div>');
      }
    }
  }
}
