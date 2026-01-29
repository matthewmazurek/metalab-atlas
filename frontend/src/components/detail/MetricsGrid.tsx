import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

interface MetricsGridProps {
  title: string;
  data: Record<string, unknown>;
  icon?: LucideIcon;
}

export function MetricsGrid({ title, data, icon: Icon }: MetricsGridProps) {
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return null;
  }

  const formatValue = (value: unknown): string => {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(6);
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    return String(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {entries.map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="text-sm text-muted-foreground">{key}</div>
              <div className="font-mono text-sm">{formatValue(value)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
