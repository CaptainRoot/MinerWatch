import { ArchiveRestore } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtDifficulty, fmtRelative } from '@/lib/format';
import { useBlockFinds, useSetBlockFindHidden } from '@/api/hooks';

/**
 * Restore list for block trophies dismissed from the dashboard with
 * the per-row X. Self-contained (own queries, not part of the settings
 * form / Save all flow) and renders nothing while no trophy is hidden,
 * which for most installs means never.
 *
 * Restore is per-row, mirroring hide: one trophy per click.
 */
export function HiddenTrophiesCard() {
  const { data } = useBlockFinds(true);
  const setHidden = useSetBlockFindHidden();

  const hidden = (data?.block_finds ?? []).filter((f) => f.hidden === 1);
  if (!hidden.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Hidden block trophies</CardTitle>
        <CardDescription>
          Blocks dismissed from the dashboard card. They still count everywhere else; restore
          brings them back to the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {hidden.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{f.miner_name}</span>
                <span className="ml-2 text-muted-foreground">
                  share {fmtDifficulty(f.share_difficulty)}
                  {f.block_height !== null && <> · block #{f.block_height}</>}
                  {' · '}
                  {fmtRelative(f.ts)}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setHidden.mutate({ id: f.id, hidden: false })}
                disabled={setHidden.isPending}
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
