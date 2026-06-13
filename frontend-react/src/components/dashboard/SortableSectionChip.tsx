import type { CSSProperties } from 'react';
import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@/lib/utils';

interface Props {
  id: string;
  label: string;
}

/**
 * A compact, draggable stand-in for a dashboard section, shown only in
 * "arrange" mode. Reordering chips (rather than the full-height cards)
 * keeps the drag overlay small and — crucially — means the real cards,
 * including MinerGrid's own DnD context, are not mounted while
 * arranging, so there is no nested drag-and-drop to reconcile.
 *
 * The whole chip is the drag handle (it has no other interactive
 * content), so pointer and keyboard (Space/Enter + arrows) both work
 * via the dnd-kit listeners spread onto the node.
 */
export function SortableSectionChip({ id, label }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-dashed border-primary/50 bg-card px-3 py-3',
        'touch-manipulation cursor-grab active:cursor-grabbing',
        'transition-colors hover:bg-accent',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
