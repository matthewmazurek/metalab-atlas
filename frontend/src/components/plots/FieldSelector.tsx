import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { FieldIndex } from '@/api/types';

interface FieldSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fieldIndex: FieldIndex | undefined;
  placeholder?: string;
  filterNumeric?: boolean;
  allowEmpty?: boolean;
}

export function FieldSelector({
  label,
  value,
  onChange,
  fieldIndex,
  placeholder = 'Select field',
  filterNumeric = false,
  allowEmpty = false,
}: FieldSelectorProps) {
  const paramsFields = fieldIndex?.params_fields || {};
  const metricsFields = fieldIndex?.metrics_fields || {};

  const filterFields = (fields: Record<string, { type: string }>) => {
    if (!filterNumeric) return Object.keys(fields);
    return Object.keys(fields).filter((k) => fields[k].type === 'numeric');
  };

  const paramsOptions = filterFields(paramsFields).map((k) => `params.${k}`);
  const metricsOptions = filterFields(metricsFields).map((k) => `metrics.${k}`);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || '_empty'} onValueChange={(v) => onChange(v === '_empty' ? '' : v)}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value="_empty">None</SelectItem>}
          
          {paramsOptions.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Params (inputs)
              </div>
              {paramsOptions.map((field) => (
                <SelectItem key={field} value={field}>
                  {field}
                </SelectItem>
              ))}
            </>
          )}
          
          {metricsOptions.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Metrics (outputs)
              </div>
              {metricsOptions.map((field) => (
                <SelectItem key={field} value={field}>
                  {field}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
