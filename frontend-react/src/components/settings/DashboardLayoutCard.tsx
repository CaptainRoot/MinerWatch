import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useResetDashboardLayout } from '@/api/hooks';
import { clearDashboardLayoutCache } from '@/lib/useDashboardLayout';

/**
 * Entry point for the dashboard's "arrange" mode (see DashboardPage).
 * Self-contained — not part of the settings form / Save all flow.
 *
 *   - "Customize layout" navigates to the Dashboard with `?arrange=1`,
 *     which swaps the movable cards for draggable chips. The user exits
 *     with the "Done" bar there, so nothing extra clutters the Dashboard
 *     in normal use.
 *   - "Reset to default" clears the stored section order (and the local
 *     cache, since this page never mounts useDashboardLayout).
 */
export function DashboardLayoutCard() {
  const navigate = useNavigate();
  const reset = useResetDashboardLayout();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dashboard layout</CardTitle>
        <CardDescription>
          Reorder the cards on your Dashboard. The toolbar, alert banners and the block-find
          trophy stay fixed at the top.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/?arrange=1')}>
            <LayoutDashboard className="h-4 w-4" />
            Customize layout
          </Button>
          <Button
            variant="subtle"
            onClick={() => {
              clearDashboardLayoutCache();
              reset.mutate();
            }}
            disabled={reset.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            {reset.isPending ? 'Resetting…' : 'Reset to default'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Customize layout opens the Dashboard with drag handles enabled — click Done there to
          finish. Reset to default restores the original order.
        </p>
      </CardContent>
    </Card>
  );
}
