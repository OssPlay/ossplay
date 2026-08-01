import { auditLogs, getDb } from '@ossplay/db';
import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { getClientIp } from '../auth/request-info';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

// Called from route handlers after an audit-worthy action succeeds. Only a
// deliberately short, fixed list of actions calls this (instance settings
// changes, root-initiated user management, SSH key/server CRUD, org
// create/delete) — see MEMORY.md and PRD.md §2.3's amended note. This is
// not a general-purpose event bus, so don't wire it into read paths or
// org-member-level actions.
export async function logAudit(c: Context<AppEnv>, entry: AuditEntry): Promise<void> {
  const user = c.get('user');
  await getDb()
    .insert(auditLogs)
    .values({
      actorUserId: user.id,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      ipAddress: getClientIp(c),
    });
}
