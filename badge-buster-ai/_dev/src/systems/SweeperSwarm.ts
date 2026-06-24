import { SweeperBug, type CrawlBounds } from '../objects/SweeperBug';
import type { Phone } from '../objects/Phone';
import type { AppIcon } from '../objects/AppIcon';

const MAX_VISIBLE = 6; // cap on-screen bugs; more sweepers just sweep faster

// Manages the visible 点红点小帮手 bugs: keeps their count in sync with how many
// the player owns, and dispatches a free bug to physically poke a red dot when
// the auto-sweeper fires — so the player can see who clears the badges.
export class SweeperSwarm {
  private bugs: SweeperBug[] = [];
  private bounds: CrawlBounds;

  constructor(private phone: Phone) {
    // crawl area = the phone screen interior (phone-local coords), below the notch
    const hw = phone.screenW / 2 - 24;
    this.bounds = { x0: -hw, x1: hw, y0: -phone.screenH / 2 + 64, y1: phone.screenH / 2 - 26 };
  }

  /** keep the visible bug count equal to min(owned, MAX_VISIBLE). */
  sync(owned: number) {
    const target = Math.min(owned, MAX_VISIBLE);
    while (this.bugs.length < target) {
      const bug = new SweeperBug(this.bounds);
      this.phone.addChild(bug);
      this.bugs.push(bug);
    }
    while (this.bugs.length > target) {
      const bug = this.bugs.pop();
      bug?.destroy();
    }
  }

  /** send a free bug to poke an icon's badge; `pop` runs when it arrives.
   *  returns false if every bug is mid-crawl (caller can retry next tick). */
  trySweep(icon: AppIcon, pop: () => void): boolean {
    const bug = this.bugs.find((b) => !b.busy);
    if (!bug) return false;
    // badge position in phone-local space (bugs are children of the phone too)
    const tx = icon.x + icon.badge.x;
    const ty = icon.y + icon.badge.y;
    bug.sweep(tx, ty, pop);
    return true;
  }
}
