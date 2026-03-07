import type { ChannelDeliveryPayload, ChannelDeliveryResult } from '@openclaw/shared';

/**
 * Job types for the channel-delivery queue.
 * Re-exports shared payload type and defines the job result shape.
 */
export type { ChannelDeliveryPayload };

export interface ChannelDeliveryJobResult {
  success: boolean;
  externalMessageId: string | null;
  error: string | null;
}

export function toDeliveryResult(result: ChannelDeliveryResult): ChannelDeliveryJobResult {
  return {
    success: result.success,
    externalMessageId: result.externalMessageId,
    error: result.error,
  };
}

export function toDeliveryError(error: Error): ChannelDeliveryJobResult {
  return {
    success: false,
    externalMessageId: null,
    error: error.message,
  };
}
