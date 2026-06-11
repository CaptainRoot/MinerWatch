// Shared bits of the project-support surfaces (StarAskBanner, the
// What's-new dialog): public URLs, localStorage keys and fail-soft
// storage helpers. Everything is local-first — these keys are the only
// state the support asks ever keep, and they never leave the browser.

export const GITHUB_URL = 'https://github.com/imlenti/MinerWatch';
export const CHANGELOG_URL = 'https://github.com/imlenti/MinerWatch/blob/main/CHANGELOG.md';

export const LS_BEST_SEEN = 'mw.star.bestSeen';
export const LS_LAST_ASK_TS = 'mw.star.lastAskTs';
export const LS_STAR_DONE = 'mw.star.done';
export const LS_DONATE_DONE = 'mw.donate.done';
export const LS_BLOCK_SEEN_TS = 'mw.blockFind.lastSeenTs';
export const LS_WHATSNEW_SEEN = 'mw.whatsnew.lastSeen';

// localStorage can throw (private mode, disabled storage); a support
// ask is never worth a crash, so every access is fail-soft.
export function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const lsFlag = (key: string) => lsGet(key) === '1';

export const lsNum = (key: string) => {
  const v = Number(lsGet(key));
  return Number.isFinite(v) ? v : NaN;
};
