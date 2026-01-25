import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getArtifactDownloadUrl } from '@/api/client';
import { useArtifactPreview } from '@/api/hooks';
import type { ArtifactInfo } from '@/api/types';
import { Download, Eye, FileCode, FileImage, FileText, Package } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ArtifactListProps {
  runId: string;
  artifacts: ArtifactInfo[];
}

function getArtifactIcon(kind: string) {
  switch (kind) {
    case 'json':
      return FileCode;
    case 'numpy':
      return Package;
    case 'image':
      return FileImage;
    case 'text':
      return FileText;
    default:
      return FileText;
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactPreviewDialog({
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{artifact.name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading preview...</div>
          ) : preview?.preview?.json_content ? (
            <pre className="p-4 bg-muted rounded text-sm overflow-auto">
              {JSON.stringify(preview.preview.json_content, null, 2)}
            </pre>
          ) : preview?.preview?.numpy_info ? (
            <div className="p-4 space-y-2">
              <div className="text-sm text-muted-foreground">NumPy arrays:</div>
              {Object.entries(preview.preview.numpy_info.arrays).map(([name, info]) => (
                <div key={name} className="p-2 bg-muted rounded">
                  <span className="font-mono">{name}</span>: shape={JSON.stringify(info.shape)}, dtype={info.dtype}
                </div>
              ))}
            </div>
          ) : preview?.preview?.text_content ? (
            <pre className="p-4 bg-muted rounded text-sm overflow-auto whitespace-pre-wrap">
              {preview.preview.text_content}
            </pre>
          ) : preview?.preview?.image_thumbnail ? (
            <div className="p-4 flex justify-center">
              <img
                src={`data:image/${artifact.format};base64,${preview.preview.image_thumbnail}`}
                alt={artifact.name}
                className="max-w-full"
              />
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              No preview available for this artifact type
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function ArtifactList({ runId, artifacts }: ArtifactListProps) {
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactInfo | null>(null);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {artifacts.map((artifact) => {
              const Icon = getArtifactIcon(artifact.kind);
              return (
                <div
                  key={artifact.artifact_id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{artifact.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {artifact.kind} / {artifact.format} - {formatBytes(artifact.size_bytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
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
    </>
  );
}
