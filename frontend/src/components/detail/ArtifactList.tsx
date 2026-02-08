import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getArtifactDownloadUrl } from '@/api/client';
import { useArtifactPreview, useDataList, useDataEntry } from '@/api/hooks';
import type { ArtifactInfo, DataEntryInfo } from '@/api/types';
import { Database, Download, Eye, Package } from 'lucide-react';
import { SECTION_HEADING_CLASS } from '@/lib/styles';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrayChart } from './ArrayChart';
import { getArtifactIcon } from './artifact-icons';

interface ArtifactListProps {
  runId: string;
  artifacts: ArtifactInfo[];
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShape(shape: number[] | null | undefined): string {
  if (!shape || shape.length === 0) return '';
  return `[${shape.join(' × ')}]`;
}

// =========================================================================
// Artifact Preview Dialog (existing)
// =========================================================================

export function ArtifactPreviewDialog({
  runId,
  artifact,
  open,
  onClose,
}: {
  runId: string;
  artifact: ArtifactInfo;
  open: boolean;
  onClose: () => void;
}) {
  const { data: preview, isLoading } = useArtifactPreview(runId, artifact.name);

  // For images, load the full image directly instead of the thumbnail
  const isImage = artifact.kind === 'image';
  const imageUrl = isImage ? getArtifactDownloadUrl(runId, artifact.name) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={isImage ? "sm:max-w-[90vw] max-h-[90vh]" : "sm:max-w-3xl max-h-[80vh]"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {artifact.name}
            <span className="text-xs text-muted-foreground font-normal">
              ({artifact.kind} / {artifact.format})
            </span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className={isImage ? "max-h-[75vh]" : "max-h-[60vh]"}>
          {isImage && imageUrl ? (
            <div className="p-4 flex justify-center items-center">
              <img
                src={imageUrl}
                alt={artifact.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          ) : isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading preview...</div>
          ) : preview?.preview?.json_content ? (
            <pre className="p-4 bg-muted rounded text-sm overflow-auto">
              {JSON.stringify(preview.preview.json_content, null, 2)}
            </pre>
          ) : preview?.preview?.numpy_info ? (
            <div className="p-4 space-y-4">
              {Object.entries(preview.preview.numpy_info.arrays).map(([name, info]) => (
                <ArrayChart key={name} name={name} info={info} />
              ))}
            </div>
          ) : preview?.preview?.text_content ? (
            <pre className="p-4 bg-muted rounded text-sm overflow-auto whitespace-pre-wrap">
              {preview.preview.text_content}
            </pre>
          ) : preview?.preview?.image_thumbnail ? (
            <div className="p-4 flex justify-center items-center">
              <img
                src={`data:image/${artifact.format};base64,${preview.preview.image_thumbnail}`}
                alt={artifact.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              No preview available for this artifact type
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a
              href={getArtifactDownloadUrl(runId, artifact.name)}
              download={artifact.name}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// Data Preview Dialog (new — for capture.data() entries)
// =========================================================================

function DataPreviewContent({ runId, dataName }: { runId: string; dataName: string }) {
  const { data: entry, isLoading } = useDataEntry(runId, dataName);

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading data...</div>;
  }

  if (!entry) {
    return <div className="p-4 text-center text-muted-foreground">Data not found</div>;
  }

  const { data, shape, dtype, metadata } = entry;

  // Stepped metric: shape [N, 2] with metadata.type === "stepped_metric"
  // Data is a list of [step, value] pairs
  if (
    metadata?.type === 'stepped_metric' &&
    shape &&
    shape.length === 2 &&
    shape[1] === 2 &&
    Array.isArray(data)
  ) {
    const values = (data as [number, number][]).map(([, v]) => v);
    return (
      <div className="p-4">
        <ArrayChart
          name={dataName}
          info={{ shape: [values.length], dtype: dtype || 'float64', values }}
        />
      </div>
    );
  }

  // 1D array: shape [N] — render as line chart
  if (shape && shape.length === 1 && Array.isArray(data)) {
    const values = data as number[];
    // Only chart if values are numeric
    if (values.length > 0 && typeof values[0] === 'number') {
      return (
        <div className="p-4">
          <ArrayChart
            name={dataName}
            info={{ shape, dtype: dtype || 'float64', values }}
          />
        </div>
      );
    }
  }

  // Fallback: pretty-printed JSON
  return (
    <pre className="p-4 bg-muted rounded text-sm overflow-auto">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function DataPreviewDialog({
  runId,
  entry,
  open,
  onClose,
}: {
  runId: string;
  entry: DataEntryInfo;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry.name}
            <span className="text-xs text-muted-foreground font-normal">
              (data{entry.dtype ? ` / ${entry.dtype}` : ''}{entry.shape ? ` ${formatShape(entry.shape)}` : ''})
            </span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <DataPreviewContent runId={runId} dataName={entry.name} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// ArtifactList (artifacts + captured data in one card)
// =========================================================================

export function ArtifactList({ runId, artifacts }: ArtifactListProps) {
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactInfo | null>(null);
  const [previewData, setPreviewData] = useState<DataEntryInfo | null>(null);

  // Fetch captured data entries
  const { data: dataList } = useDataList(runId);
  const dataEntries = dataList?.entries ?? [];

  const hasArtifacts = artifacts.length > 0;
  const hasData = dataEntries.length > 0;

  if (!hasArtifacts && !hasData) {
    return null;
  }

  const sectionTitle = hasData && hasArtifacts
    ? 'Artifacts & Data'
    : hasData
      ? 'Data'
      : 'Artifacts';

  return (
    <div className="space-y-3">
      <h2 className={SECTION_HEADING_CLASS}>{sectionTitle}</h2>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Package className="h-4 w-4" />
            {sectionTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
            {/* Artifact entries */}
            {artifacts.map((artifact) => {
              const Icon = getArtifactIcon(artifact.kind);
              return (
                <div
                  key={artifact.artifact_id}
                  className="flex items-center justify-between p-3 border rounded-lg min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{artifact.name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {artifact.kind} / {artifact.format} - {formatBytes(artifact.size_bytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewArtifact(artifact)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={getArtifactDownloadUrl(runId, artifact.name)}
                        download={artifact.name}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Captured data entries */}
            {dataEntries.map((entry) => (
              <div
                key={`data-${entry.name}`}
                className="flex items-center justify-between p-3 border rounded-lg min-w-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Database className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{entry.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      data{entry.dtype ? ` / ${entry.dtype}` : ''}
                      {entry.shape ? ` ${formatShape(entry.shape)}` : ''}
                      {entry.metadata?.type === 'stepped_metric' ? ' · stepped' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewData(entry)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {previewArtifact && (
        <ArtifactPreviewDialog
          runId={runId}
          artifact={previewArtifact}
          open={!!previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      )}

      {previewData && (
        <DataPreviewDialog
          runId={runId}
          entry={previewData}
          open={!!previewData}
          onClose={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}
