import { Link } from 'react-router-dom';
import { Heart, PartyPopper, X } from 'lucide-react';

import { fmtDifficulty, fmtRelative } from '@/lib/format';
import { useBlockFinds, useSetBlockFindHidden } from '@/api/hooks';

/**
 * Permanent trophy card for solo-mined blocks. Statistically rare for
 * home gear (years between events on a 1-TH/s fleet) so the card is
 * tuned for that kind of "once in a lifetime" celebration: gold glow,
 * never collapsed.
 *
 * Hidden when the block_finds table is empty — most home installs will
 * never see this, and that's the intended outcome.
 */
export function BlockFindsCard() {
  const { data } = useBlockFinds();
  const setHidden = useSetBlockFindHidden();
  const finds = data?.block_finds ?? [];
  if (!finds.length) return null;

  return (
    <div
      className="rounded-lg border border-yellow-500/40 p-4 shadow-[0_0_0_1px_rgba(255,215,0,0.05)_inset]"
      style={{
        background:
          'radial-gradient(120% 80% at 0% 0%, rgba(255,215,0,0.18), transparent 60%), radial-gradient(120% 80% at 100% 100%, rgba(255,140,0,0.10), transparent 60%), hsl(var(--card))',
      }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-yellow-400">
          <PartyPopper className="h-4 w-4" />
          <span className="text-sm font-bold uppercase tracking-wider">Blocks found</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {finds.length === 1 ? '1 block' : `${finds.length} blocks`} mined by this fleet — kept forever
        </span>
      </header>
      <ul className="space-y-2">
        {finds.map((f) => (
          <li
            key={f.id}
            className="flex items-baseline justify-between gap-3 rounded-md border border-yellow-500/20 bg-card/60 px-3 py-2 text-sm"
          >
            <div>
              <Link to={`/miner/${f.miner_id}`} className="font-semibold text-yellow-300 hover:underline">
                {f.miner_name}
              </Link>
              <span className="ml-2 text-muted-foreground">
                share {fmtDifficulty(f.share_difficulty)} vs network {fmtDifficulty(f.network_difficulty)}
              </span>
              {f.block_height !== null && (
                <span className="ml-2 text-muted-foreground">· block #{f.block_height}</span>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">{fmtRelative(f.ts)}</span>
              {/* One trophy per click, on purpose: no hide-all. Restore lives in Settings. */}
              <button
                type="button"
                aria-label="Hide this trophy from the dashboard"
                title="Hide this trophy (restore from Settings)"
                onClick={() => setHidden.mutate({ id: f.id, hidden: true })}
                disabled={setHidden.isPending}
                className="text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-yellow-500/20 pt-2.5">
        <span className="text-xs leading-snug text-yellow-200/60">
          Found with MinerWatch — free and open source. If this dashboard earned its keep, you
          can tip its development.
        </span>
        <Link
          to="/donations"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-yellow-500/40 px-3 py-1 text-xs text-yellow-300 transition-colors hover:bg-yellow-500/10"
        >
          <Heart className="h-3.5 w-3.5" />
          Donate
        </Link>
      </footer>
    </div>
  );
}
