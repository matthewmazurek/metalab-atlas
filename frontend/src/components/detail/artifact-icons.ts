import { FileCode, FileImage, FileText, Package } from 'lucide-react';

export function getArtifactIcon(kind: string) {
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

