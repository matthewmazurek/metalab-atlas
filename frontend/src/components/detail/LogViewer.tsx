import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLog } from '@/api/hooks';
import { Search } from 'lucide-react';

interface LogViewerProps {
  runId: string;
}

function LogContent({ runId, logName }: { runId: string; logName: string }) {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useLog(runId, logName);

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading...</div>;
  }

  if (isError || !data?.exists) {
    return <div className="p-4 text-muted-foreground">No {logName} log available</div>;
  }

  const lines = data.content.split('\n');
  const filteredLines = search
    ? lines.filter((line) => line.toLowerCase().includes(search.toLowerCase()))
    : lines;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <ScrollArea className="h-64 border rounded">
        <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
          {filteredLines.length > 0 ? filteredLines.join('\n') : 'No matching lines'}
        </pre>
      </ScrollArea>
    </div>
  );
}

export function LogViewer({ runId }: LogViewerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stdout">
          <TabsList>
            <TabsTrigger value="stdout">stdout</TabsTrigger>
            <TabsTrigger value="stderr">stderr</TabsTrigger>
          </TabsList>
          <TabsContent value="stdout">
            <LogContent runId={runId} logName="stdout" />
          </TabsContent>
          <TabsContent value="stderr">
            <LogContent runId={runId} logName="stderr" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
