import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Github, Heart, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CHANGELOG_URL,
  GITHUB_URL,
  LS_STAR_DONE,
  LS_WHATSNEW_SEEN,
  lsGet,
  lsSet,
} from '@/lib/support';
import { useMiners, useWhatsNew } from '@/api/hooks';

/**
 * Once-per-version "What's new" dialog, mounted in AppShell so it
 * greets the first page the user lands on after an update. Content is
 * the bold changelog leads served by /api/whatsnew; below them ride
 * the star/donate CTAs — the news is the protagonist, the ask travels
 * with it.
 *
 * Client-side gate: localStorage remembers the last version shown.
 * When the key is missing we can't tell "fresh install" from "existing
 * user updating to the release that introduced this dialog", so we use
 * the fleet as the tell: zero miners = fresh install, seed silently
 * (nothing is "new" to a new user); miners present = a real user whose
 * update deserves its news. After that, every version bump shows the
 * dialog exactly once per browser; closing it in any way marks the
 * version as seen.
 *
 * Starring from here sets the same mw.star.done flag the dashboard
 * banner uses, so the two surfaces never double-ask.
 */
export function WhatsNewDialog() {
  const { data } = useWhatsNew();
  const { data: minersData } = useMiners();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data?.version || !minersData) return;
    const seen = lsGet(LS_WHATSNEW_SEEN);
    if (seen === data.version) return;
    if (seen === null && minersData.miners.length === 0) {
      lsSet(LS_WHATSNEW_SEEN, data.version);
      return;
    }
    setOpen(true);
  }, [data, minersData]);

  if (!data?.version) return null;

  const close = () => {
    lsSet(LS_WHATSNEW_SEEN, data.version);
    setOpen(false);
  };
  const starClick = () => {
    window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
    lsSet(LS_STAR_DONE, '1');
    close();
  };
  const supportClick = () => {
    close();
    navigate('/donations');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            What's new in MinerWatch
          </DialogTitle>
          <DialogDescription>Updated to v{data.version}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {data.highlights.map((h) => (
            <li key={h.title} className="text-sm">
              <span className="font-medium">{h.title}</span>
              {h.body && (
                <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{h.body}</p>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-border pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={starClick}>
                <Github className="h-3.5 w-3.5" />
                Star on GitHub
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-pink-500/40 text-pink-400 hover:bg-pink-500/10 hover:text-pink-300"
                onClick={supportClick}
              >
                <Heart className="h-3.5 w-3.5" />
                Support development
              </Button>
            </div>
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Full changelog
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Shown once per version. MinerWatch is free and open source — these two buttons are how
            it grows.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
