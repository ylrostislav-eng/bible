import { apiClient } from './api';

/**
 * Leaves a room from a screen that isn't necessarily connected to that
 * room's own WebSocket — e.g. accepting a different invite/challenge while
 * sitting in your own not-yet-started room prompts leaving it first, from
 * whatever popup the accept happened in. `RoomsController.leave` notifies
 * the gateway afterwards so anyone still actually in the room sees it live.
 */
export async function leaveActiveRoom(sessionId: string): Promise<void> {
  await apiClient.post(`/rooms/${sessionId}/leave`);
}
