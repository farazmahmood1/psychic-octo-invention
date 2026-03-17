import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ConversationDetail, MessageRecord, PaginatedResponse } from '@openclaw/shared';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { ErrorPanel } from '@/components/error-panel';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api-query';
import { useRealtime } from '@/lib/realtime-context';
import { apiClient } from '@/api/client';
import { ArrowLeft, User, Bot, Paperclip, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const EMPTY_DETAIL: { data: ConversationDetail } = {
  data: {
    id: '',
    channel: 'telegram',
    title: null,
    status: 'active',
    messageCount: 0,
    lastMessagePreview: null,
    lastMessageAt: null,
    metadata: null,
    participants: [],
    createdAt: '',
    updatedAt: '',
  },
};

const EMPTY_MESSAGES: PaginatedResponse<MessageRecord> = {
  data: [],
  meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
};

function formatChannel(channel: string): string {
  const map: Record<string, string> = { telegram: 'Telegram', email: 'Email', admin_portal: 'Admin Portal' };
  return map[channel] ?? channel;
}

function MessageBubble({ message }: { message: MessageRecord }) {
  const isInbound = message.direction === 'inbound';
  const attachments = (message.attachments ?? []).filter(
    (att): att is Record<string, unknown> => typeof att === 'object' && att !== null,
  );
  const metadata = message.metadata ?? {};

  const routing = (metadata['routing'] as Record<string, unknown> | undefined) ?? null;
  const memory = (metadata['memory'] as Record<string, unknown> | undefined) ?? null;
  const usage = (metadata['usage'] as Record<string, unknown> | undefined) ?? null;
  const execution = (metadata['execution'] as Record<string, unknown> | undefined) ?? null;

  const model = typeof routing?.['model'] === 'string' ? routing['model'] : null;
  const tier = typeof routing?.['tier'] === 'string' ? routing['tier'] : null;
  const retrievedCount = typeof memory?.['retrievedCount'] === 'number' ? memory['retrievedCount'] : null;
  const writtenCount = typeof memory?.['writtenCount'] === 'number' ? memory['writtenCount'] : null;
  const totalTokens = typeof usage?.['totalTokens'] === 'number'
    ? usage['totalTokens']
    : message.tokenUsage;
  const toolCallsRequested = typeof execution?.['toolCallsRequested'] === 'number'
    ? execution['toolCallsRequested']
    : null;

  return (
    <div className={cn('flex', isInbound ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[70%] space-y-1')}>
        <div
          className={cn(
            'rounded-lg px-4 py-2.5 text-sm',
            isInbound
              ? 'bg-muted text-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            {isInbound ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            <span className="text-xs font-medium opacity-70">
              {isInbound ? 'User' : 'Assistant'}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>

          {attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs opacity-80">
                  <Paperclip className="h-3 w-3" />
                  <span>{String(att['fileName'] ?? att['type'] ?? `Attachment ${i + 1}`)}</span>
                  {att['sizeBytes'] != null && (
                    <span className="opacity-60">
                      ({Math.round((att['sizeBytes'] as number) / 1024)}KB)
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isInbound && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] opacity-85">
              {tier && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]" style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.3)' }}>
                  {tier}
                </Badge>
              )}
              {model && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]" style={{ color: 'inherit', borderColor: 'rgba(200, 67, 67, 0.3)' }}>
                  {model}
                </Badge>
              )}
              {totalTokens != null && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]" style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.3)' }}>
                  {totalTokens.toLocaleString()} tokens
                </Badge>
              )}
              {toolCallsRequested != null && toolCallsRequested > 0 && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]" style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.3)' }}>
                  {toolCallsRequested} tool call{toolCallsRequested === 1 ? '' : 's'}
                </Badge>
              )}
              {retrievedCount != null && retrievedCount > 0 && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]" style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.3)' }}>
                  memory +{retrievedCount}
                </Badge>
              )}
              {writtenCount != null && writtenCount > 0 && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]" style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.3)' }}>
                  saved {writtenCount}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className={cn('flex items-center gap-2 text-[10px] text-muted-foreground', !isInbound && 'justify-end')}>
          <span>{new Date(message.createdAt).toLocaleString()}</span>
          <StatusBadge status={message.status} className="text-[10px] h-4" />
        </div>
      </div>
    </div>
  );
}

function MessageComposer({
  conversationId,
  onMessageSent,
}: {
  conversationId: string;
  onMessageSent: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    try {
      await apiClient.post(`/conversations/${conversationId}/send`, { text: trimmed });
      setText('');
      onMessageSent();
      // Focus back on textarea
      textareaRef.current?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={sending}
          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button
          onClick={() => void handleSend()}
          disabled={!text.trim() || sending}
          className="self-end"
          size="sm"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Messages are processed through the AI orchestration pipeline.
      </p>
    </div>
  );
}

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [msgPage, setMsgPage] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { subscribe } = useRealtime();

  const detail = useApiQuery<{ data: ConversationDetail }>(
    id ? `/conversations/${id}` : null,
    EMPTY_DETAIL,
  );

  const msgParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(msgPage));
    p.set('pageSize', '50');
    return p.toString();
  }, [msgPage]);

  const messages = useApiQuery<PaginatedResponse<MessageRecord>>(
    id ? `/conversations/${id}/messages?${msgParams}` : null,
    EMPTY_MESSAGES,
  );

  const refetchMessages = messages.refetch;

  // Auto-refresh messages when we get an SSE event for this conversation
  const handleRealtimeMessage = useCallback(
    (data: unknown) => {
      const event = data as { conversationId?: string };
      if (event.conversationId === id) {
        refetchMessages();
      }
    },
    [id, refetchMessages],
  );

  useEffect(() => {
    const unsub = subscribe('conversation:message', handleRealtimeMessage);
    return unsub;
  }, [subscribe, handleRealtimeMessage]);

  // Scroll to bottom when new messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.data?.data?.length]);

  const conv = detail.data?.data;
  const msgList = messages.data?.data ?? [];
  const msgMeta = messages.data?.meta ?? EMPTY_MESSAGES.meta;

  if (detail.error) {
    return <ErrorPanel message={detail.error} onRetry={detail.refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/chats')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      {detail.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      ) : conv ? (
        <>
          <PageHeader
            title={conv.title ?? `Conversation ${conv.id.slice(0, 8)}`}
            description={`${formatChannel(conv.channel)} conversation with ${conv.messageCount} messages`}
          />

          {/* Conversation info */}
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={conv.status} />
            <Badge variant="outline">{formatChannel(conv.channel)}</Badge>
            <span className="text-sm text-muted-foreground">
              Started {new Date(conv.createdAt).toLocaleDateString()}
            </span>
            {conv.participants.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Participants: {conv.participants.map((p) => p.displayName ?? p.externalId ?? 'Unknown').join(', ')}
              </span>
            )}
          </div>

          {/* Message timeline */}
          <Card>
            <CardContent className="p-6">
              {messages.loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                      <Skeleton className="h-16 w-[60%] rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : msgList.length === 0 ? (
                <EmptyState
                  title="No messages"
                  description="Send a message below to start the conversation."
                />
              ) : (
                <div className="space-y-4">
                  {msgList.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {msgMeta.total > msgMeta.pageSize && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {msgMeta.page} of {msgMeta.totalPages} ({msgMeta.total} messages)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={msgPage <= 1}
                      onClick={() => setMsgPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={msgPage >= msgMeta.totalPages}
                      onClick={() => setMsgPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Composer */}
          {conv.status === 'active' && (
            <Card>
              <CardContent className="p-4">
                <MessageComposer
                  conversationId={conv.id}
                  onMessageSent={() => messages.refetch()}
                />
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
