import { useEffect, useRef, useCallback } from 'react';
import { useRealtime } from '@/lib/realtime-context';
import { useToast } from '@/components/toast';

interface ConversationMessageEvent {
  conversationId?: string;
  messageId?: string;
  model?: string;
}

interface JobUpdatedEvent {
  id?: string;
  name?: string;
  status?: string;
  queueName?: string;
}

interface SkillUpdatedEvent {
  id?: string;
  slug?: string;
  action?: string;
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

function sendBrowserNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      // Notification API may not be available in all contexts
    }
  }
}

/**
 * Listens to real-time SSE events and shows toast + browser notifications
 * for important events. Renders nothing — mount once inside the layout.
 */
export function NotificationListener() {
  const { subscribe } = useRealtime();
  const { toast } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => {
    requestNotificationPermission();
    return () => { mountedRef.current = false; };
  }, []);

  const onNewConversation = useCallback(() => {
    toast('info', 'New conversation started');
    sendBrowserNotification('OpenClaw', 'A new conversation has been started.');
  }, [toast]);

  const onConversationMessage = useCallback((data: unknown) => {
    const evt = data as ConversationMessageEvent;
    const id = evt.conversationId?.slice(0, 8) ?? '';
    toast('info', `New message in conversation ${id}...`);
  }, [toast]);

  const onJobUpdated = useCallback((data: unknown) => {
    const evt = data as JobUpdatedEvent;
    if (evt.status === 'failed') {
      const name = evt.queueName ?? evt.name ?? 'Unknown';
      toast('error', `Job failed: ${name}`);
      sendBrowserNotification('OpenClaw — Job Failed', `Job "${name}" has failed.`);
    } else if (evt.status === 'completed') {
      toast('success', `Job completed: ${evt.queueName ?? evt.name ?? 'Unknown'}`);
    }
  }, [toast]);

  const onSkillUpdated = useCallback((data: unknown) => {
    const evt = data as SkillUpdatedEvent;
    if (evt.action === 'ingestion_blocked' || evt.action === 'execution_blocked') {
      toast('error', `Skill blocked: ${evt.slug ?? evt.id ?? 'Unknown'}`);
      sendBrowserNotification('OpenClaw — Skill Blocked', `Skill "${evt.slug ?? ''}" was blocked.`);
    } else {
      toast('info', `Skill updated: ${evt.slug ?? evt.id ?? 'Unknown'}`);
    }
  }, [toast]);

  const onIntegrationHealth = useCallback((data: unknown) => {
    const evt = data as { key?: string; status?: string };
    if (evt.status === 'error' || evt.status === 'degraded') {
      toast('error', `Integration issue: ${evt.key ?? 'Unknown'} is ${evt.status}`);
      sendBrowserNotification('OpenClaw — Integration Issue', `${evt.key ?? 'Integration'} is ${evt.status}.`);
    }
  }, [toast]);

  useEffect(() => {
    const unsubs = [
      subscribe('conversation:new', onNewConversation),
      subscribe('conversation:message', onConversationMessage),
      subscribe('job:updated', onJobUpdated),
      subscribe('skill:updated', onSkillUpdated),
      subscribe('integration:health', onIntegrationHealth),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [subscribe, onNewConversation, onConversationMessage, onJobUpdated, onSkillUpdated, onIntegrationHealth]);

  return null;
}
