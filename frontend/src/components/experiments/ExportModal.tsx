import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getExportUrl } from '@/api/client';
import { cn } from '@/lib/utils';

interface ExportModalProps {
  experimentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'csv' | 'parquet';

export function ExportModal({ experimentId, open, onOpenChange }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('parquet');
  const [includeParams, setIncludeParams] = useState(true);
  const [includeMetrics, setIncludeMetrics] = useState(true);
  const [includeDerived, setIncludeDerived] = useState(true);
  const [includeRecord, setIncludeRecord] = useState(true);

  const handleExport = () => {
    const url = getExportUrl(experimentId, {
      format,
      include_params: includeParams,
      include_metrics: includeMetrics,
      include_derived: includeDerived,
      include_record: includeRecord,
    });
    window.open(url, '_blank');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Results</DialogTitle>
          <DialogDescription>
            Download experiment results as a tabular file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Format</Label>
            <div className="grid grid-cols-2 gap-2">
              <FormatButton
                format="parquet"
                selected={format === 'parquet'}
                onClick={() => setFormat('parquet')}
                icon={<FileSpreadsheet className="h-4 w-4" />}
                label="Parquet"
                description="With metadata"
              />
              <FormatButton
                format="csv"
                selected={format === 'csv'}
                onClick={() => setFormat('csv')}
                icon={<FileText className="h-4 w-4" />}
                label="CSV"
                description="Universal"
              />
            </div>
          </div>

          {/* Parquet metadata note */}
          {format === 'parquet' && (
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md text-sm">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-muted-foreground">
                Parquet files include embedded metadata (experiment ID, version, fingerprint, export timestamp) for provenance tracking.
              </p>
            </div>
          )}

          {/* Column Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Include Columns</Label>
            <div className="space-y-3">
              <CheckboxOption
                id="include-record"
                checked={includeRecord}
                onCheckedChange={(checked) => setIncludeRecord(checked === true)}
                label="Record fields"
                description="run_id, status, duration, timestamps"
              />
              <CheckboxOption
                id="include-params"
                checked={includeParams}
                onCheckedChange={(checked) => setIncludeParams(checked === true)}
                label="Parameters"
                description="param_* columns"
              />
              <CheckboxOption
                id="include-metrics"
                checked={includeMetrics}
                onCheckedChange={(checked) => setIncludeMetrics(checked === true)}
                label="Metrics"
                description="Captured metrics"
              />
              <CheckboxOption
                id="include-derived"
                checked={includeDerived}
                onCheckedChange={(checked) => setIncludeDerived(checked === true)}
                label="Derived metrics"
                description="derived_* columns"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FormatButtonProps {
  format: ExportFormat;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function FormatButton({ selected, onClick, icon, label, description }: FormatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 p-3 rounded-md border-2 transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
      )}
    >
      <div className={cn('flex items-center gap-2', selected ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

interface CheckboxOptionProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  label: string;
  description: string;
}

function CheckboxOption({ id, checked, onCheckedChange, label, description }: CheckboxOptionProps) {
  return (
    <div className="flex items-start space-x-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
      />
      <div className="grid gap-0.5 leading-none">
        <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
