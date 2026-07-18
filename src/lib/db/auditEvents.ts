import type PocketBase from 'pocketbase';
import { generatePocketBaseId } from './churchConnectDB';
import type { AuthUser } from './PocketBaseProvider';

export interface AuditEventInput {
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Adds an actor-bound, append-only operational event. It never blocks the
 * business action that already succeeded; this is an operational history,
 * not a forensic substitute for PocketBase server logs.
 */
export async function recordAuditEvent(
  pb: PocketBase,
  user: Pick<AuthUser, 'id' | 'name'>,
  input: AuditEventInput
): Promise<void> {
  if (!pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  const id = generatePocketBaseId();
  try {
    await pb.collection('audit_logs').create({
      id,
      actor: user.id,
      actorName: user.name,
      action: input.action,
      summary: input.summary.slice(0, 500),
      entityType: input.entityType?.slice(0, 50) || '',
      entityId: input.entityId?.slice(0, 80) || '',
      source: 'client',
      operationId: id
    });
  } catch (error) {
    console.warn('[Audit] Operational event was not recorded:', error);
  }
}
