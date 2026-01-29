import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ExperimentTagProps {
  tag: string;
  /** Variant for the badge styling */
  variant?: 'default' | 'secondary' | 'outline';
  /** Additional CSS classes */
  className?: string;
  /** If false, clicking won't navigate (useful when tag is already filtered) */
  clickable?: boolean;
}

/**
 * A clickable tag badge that navigates to the experiments page filtered by that tag.
 */
export function ExperimentTag({
  tag,
  variant = 'secondary',
  className,
  clickable = true,
}: ExperimentTagProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/experiments?tags=${encodeURIComponent(tag)}`);
  };

  // When clickable, render as a button for proper click handling
  if (clickable) {
    return (
      <Badge
        asChild
        variant={variant}
        className={cn(
          'text-xs cursor-pointer hover:bg-secondary/80',
          className
        )}
      >
        <button type="button" onClick={handleClick}>
          {tag}
        </button>
      </Badge>
    );
  }

  return (
    <Badge
      variant={variant}
      className={cn('text-xs', className)}
    >
      {tag}
    </Badge>
  );
}

/**
 * Display a list of tags with overflow handling.
 */
interface ExperimentTagListProps {
  tags: string[];
  /** Maximum number of tags to show before collapsing */
  maxVisible?: number;
  /** If false, tags won't be clickable */
  clickable?: boolean;
  className?: string;
}

export function ExperimentTagList({
  tags,
  maxVisible = 3,
  clickable = true,
  className,
}: ExperimentTagListProps) {
  if (!tags || tags.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const visibleTags = tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {visibleTags.map((tag) => (
        <ExperimentTag key={tag} tag={tag} clickable={clickable} />
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs">
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}
