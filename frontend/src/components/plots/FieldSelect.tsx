/**
 * FieldSelect - Dropdown for selecting fields from the field index.
 * Groups fields by namespace (params, metrics, derived).
 */

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { FieldIndex, FieldInfo } from '@/api/types';

interface FieldSelectProps {
  /** Label for the select */
  label: string;
  /** Currently selected field (e.g., "params.lr") */
  value: string | null;
  /** Callback when selection changes */
  onChange: (value: string | null) => void;
  /** Field index from the API */
  fieldIndex: FieldIndex | undefined;
  /** Placeholder text when no selection */
  placeholder?: string;
  /** Only show numeric fields */
  numericOnly?: boolean;
  /** Allow clearing the selection */
  allowClear?: boolean;
}

export function FieldSelect({
  label,
  value,
  onChange,
  fieldIndex,
  placeholder = 'Select field',
  numericOnly = false,
  allowClear = false,
}: FieldSelectProps) {
  // Filter fields by type if numericOnly
  const filterFields = (fields: Record<string, FieldInfo>): string[] => {
    return Object.entries(fields)
      .filter(([_, info]) => !numericOnly || info.type === 'numeric')
      .map(([name]) => name)
      .sort();
  };

  // Get filtered fields for each namespace
  const paramsFields = filterFields(fieldIndex?.params_fields || {});
  const metricsFields = filterFields(fieldIndex?.metrics_fields || {});
  const derivedFields = filterFields(fieldIndex?.derived_fields || {});

  // Handle selection change
  const handleChange = (newValue: string) => {
    if (newValue === '__clear__') {
      onChange(null);
    } else {
      onChange(newValue);
    }
  };

  // Check if we have any fields to show
  const hasFields = paramsFields.length > 0 || metricsFields.length > 0 || derivedFields.length > 0;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || ''}
        onValueChange={handleChange}
        disabled={!hasFields}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowClear && (
            <SelectItem value="__clear__">
              <span className="text-muted-foreground">None</span>
            </SelectItem>
          )}

          {paramsFields.length > 0 && (
            <SelectGroup>
              <SelectLabel>Params (inputs)</SelectLabel>
              {paramsFields.map((field) => (
                <SelectItem key={`params.${field}`} value={`params.${field}`}>
                  params.{field}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {metricsFields.length > 0 && (
            <SelectGroup>
              <SelectLabel>Metrics (outputs)</SelectLabel>
              {metricsFields.map((field) => (
                <SelectItem key={`metrics.${field}`} value={`metrics.${field}`}>
                  metrics.{field}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {derivedFields.length > 0 && (
            <SelectGroup>
              <SelectLabel>Derived (computed)</SelectLabel>
              {derivedFields.map((field) => (
                <SelectItem key={`derived.${field}`} value={`derived.${field}`}>
                  derived.{field}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {!hasFields && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No fields available
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
