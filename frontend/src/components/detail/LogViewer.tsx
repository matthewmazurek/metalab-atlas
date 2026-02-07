import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLog, useLogsList } from '@/api/hooks';
import { Search, FileText, RefreshCw, ScrollText } from 'lucide-react';

interface LogViewerProps {
  runId: string;
  isRunning?: boolean;
}

function LogContent({ runId, logName, isRunning = false }: { runId: string; logName: string; isRunning?: boolean }) {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useLog(runId, logName, isRunning);

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

export function LogViewer({ runId, isRunning = false }: LogViewerProps) {
  const { data: logsData, isLoading, isError } = useLogsList(runId, isRunning);
  const logs = logsData?.logs || [];

  // If no logs available, show placeholder
  if (!isLoading && (isError || logs.length === 0)) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mb-2 opacity-50" />
            <p>No logs available for this run</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 text-muted-foreground">Loading logs...</div>
        </CardContent>
      </Card>
    );
  }

  // Default to first available log
  const defaultLog = logs[0];
  const showTabs = logs.length > 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          Logs
          {isRunning && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Auto-refresh
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {showTabs ? (
          <Tabs defaultValue={defaultLog}>
            <TabsList>
              {logs.map((logName) => (
                <TabsTrigger key={logName} value={logName}>
                  {logName}
                </TabsTrigger>
              ))}
            </TabsList>
            {logs.map((logName) => (
              <TabsContent key={logName} value={logName}>
                <LogContent runId={runId} logName={logName} isRunning={isRunning} />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <LogContent runId={runId} logName={defaultLog} isRunning={isRunning} />
        )}
      </CardContent>
    </Card>
  );
}
