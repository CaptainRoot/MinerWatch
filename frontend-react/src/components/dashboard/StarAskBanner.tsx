import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Github, Heart, Star, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  GITHUB_URL,
  LS_BEST_SEEN,
  LS_BLOCK_SEEN_TS,
  LS_DONATE_DONE,
  LS_LAST_ASK_TS,
  LS_STAR_DONE,
  lsFlag as flag,
  lsNum as num,
  lsSet,
} from '@/lib/support';
import { useBlockFinds, useDonations, useFleetBest } from '@/api/hooks';

/**
 * Project-support ask, shown inside BestSharesCard. Three triggers,
 * one CTA each (simultaneous asks cannibalise conversion):
 *
 *   1. star   — new all-time best share, until the user stars the repo
 *               (or says they already did). Rate-limited to one ask
 *               per 30 days.
 *   2. donate — later records, once the star is settled. Same cap.
 *   3. block  — the fleet found a block: the donate ask fires
 *               immediately, bypassing both the 30-day cap and the
 *               star→donate sequence. A block outranks everything.
 *
 * Every variant respects donors: once the user has donated (flag set
 * on click, or an active donation detected via their own backend's
 * /api/donations) the donate/block asks never show again.
 *
 * No telemetry, no cloud: state lives in this browser's localStorage.
 * First load seeds silently (both the best-share value and the latest
 * block ts), so upgrading MinerWatch never triggers asks for old
 * milestones. Records or blocks that land while an ask is suppressed
 * are swallowed by bumping the seen markers — nothing stale can
 * resurrect a banner later.
 */

const ASK_COOLDOWN_MS = 30 * 24 * 3600 * 1000;

type Variant = 'star' | 'donate' | 'block';

const COPY: Record<Variant, { text: string; fineprint: string }> = {
  star: {
    text: 'New all-time record — nice one! If MinerWatch makes solo mining more fun, a star on GitHub helps other home miners find it.',
    fineprint: 'Shown on new records, at most once a month — never again after you star.',
  },
  donate: {
    text: 'Another record! Moments like this are why MinerWatch exists. If it earns its keep, you can support development — even by lending some hashrate for a few hours.',
    fineprint: "Shown on new records, at most once a month — never again once you've donated.",
  },
  block: {
    text: "Your fleet found a block! That's the moment MinerWatch was built for. If it earned its keep today, consider supporting its development.",
    fineprint: "Shown because your fleet found a block — never again once you've donated.",
  },
};

export function StarAskBanner() {
  const { data } = useFleetBest();
  const { data: findsData } = useBlockFinds();
  const alltime = data?.alltime ?? null;

  const [variant, setVariant] = useState<Variant | null>(null);
  const [starDone, setStarDone] = useState(() => flag(LS_STAR_DONE));
  const [donateDone, setDonateDone] = useState(() => flag(LS_DONATE_DONE));

  // While a donate-flavoured ask is pending or possible, watch the
  // user's own backend for an active donation and settle silently if
  // one exists. The query stays off for everyone else.
  const { data: donations } = useDonations(
    !donateDone && (starDone || variant === 'block'),
  );
  const hasActiveDonation = (donations?.count ?? 0) > 0;
  useEffect(() => {
    if (hasActiveDonation && !donateDone) {
      lsSet(LS_DONATE_DONE, '1');
      setDonateDone(true);
      setVariant((v) => (v === 'donate' || v === 'block' ? null : v));
    }
  }, [hasActiveDonation, donateDone]);

  // Trigger 1+2: new all-time best share → star (or donate) ask.
  useEffect(() => {
    if (!alltime) return;
    const value = alltime.value;
    const bestSeen = num(LS_BEST_SEEN);

    if (Number.isNaN(bestSeen)) {
      // First visit ever: seed silently, exactly like the backend
      // seeds its first best-share record without notifying.
      lsSet(LS_BEST_SEEN, String(value));
      return;
    }
    if (value <= bestSeen || variant !== null) return;

    const settled = starDone && donateDone;
    const lastAsk = num(LS_LAST_ASK_TS);
    const coolingDown =
      !Number.isNaN(lastAsk) && Date.now() - lastAsk < ASK_COOLDOWN_MS;

    if (settled || coolingDown) {
      lsSet(LS_BEST_SEEN, String(value));
      return;
    }
    setVariant(starDone ? 'donate' : 'star');
  }, [alltime, variant, starDone, donateDone]);

  // Trigger 3: a block find. Declared after the record effect on
  // purpose — it overrides whatever the record picked in the same
  // render pass. No cooldown, no star→donate sequencing: only donors
  // are exempt.
  useEffect(() => {
    const finds = findsData?.block_finds;
    if (!finds) return;
    const maxTs = finds.reduce((m, f) => Math.max(m, f.ts), 0);
    const seenTs = num(LS_BLOCK_SEEN_TS);

    if (Number.isNaN(seenTs)) {
      lsSet(LS_BLOCK_SEEN_TS, String(maxTs));
      return;
    }
    if (maxTs <= seenTs) return;
    if (donateDone || hasActiveDonation) {
      lsSet(LS_BLOCK_SEEN_TS, String(maxTs));
      return;
    }
    setVariant('block');
  }, [findsData, donateDone, hasActiveDonation]);

  if (!variant) return null;
  const isStar = variant === 'star';

  const settle = () => {
    if (alltime) lsSet(LS_BEST_SEEN, String(alltime.value));
    const finds = findsData?.block_finds;
    if (finds && finds.length) {
      lsSet(LS_BLOCK_SEEN_TS, String(finds.reduce((m, f) => Math.max(m, f.ts), 0)));
    }
    lsSet(LS_LAST_ASK_TS, String(Date.now()));
    setVariant(null);
  };
  const settleStar = () => {
    lsSet(LS_STAR_DONE, '1');
    setStarDone(true);
    settle();
  };
  const settleDonate = () => {
    lsSet(LS_DONATE_DONE, '1');
    setDonateDone(true);
    settle();
  };
  const openRepo = () => {
    window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
    settleStar();
  };

  return (
    <div
      className={cn(
        'mt-3 rounded-md border p-3',
        isStar ? 'border-primary/30 bg-primary/5' : 'border-pink-500/30 bg-pink-500/5',
      )}
    >
      <div className="flex items-start gap-2.5">
        {isStar ? (
          <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Heart className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug">{COPY[variant].text}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {isStar ? (
              <>
                <Button size="sm" onClick={openRepo}>
                  <Github className="h-3.5 w-3.5" />
                  Star on GitHub
                </Button>
                <Button size="sm" variant="outline" onClick={settleStar}>
                  Already starred
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  asChild
                  className="bg-pink-600 text-white hover:bg-pink-600/90"
                  onClick={settleDonate}
                >
                  <Link to="/donations">
                    <Heart className="h-3.5 w-3.5" />
                    Support MinerWatch
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={settle}>
                  Maybe later
                </Button>
              </>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">{COPY[variant].fineprint}</p>
        </div>
        <button
          type="button"
          onClick={settle}
          aria-label="Dismiss"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
