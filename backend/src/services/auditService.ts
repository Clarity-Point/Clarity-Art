// Security events share the JSON transport; route module=audit to a protected sink.
// A raised operational log level must not suppress successful security events.
import { logger, requestContext } from '../config/logger';

export const auditLogger = logger.child(
  { module: 'audit' },
  {
    level: logger.level === 'silent' ? 'silent' : 'info',
  },
);

/**
 * Actions worth an audit entry. Kept as a union so a typo becomes a compile
 * error rather than a silently unqueryable string in the logs.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.register'
  | 'auth.password_changed'
  | 'auth.password_reset'
  | 'admin.gallery_moderated'
  | 'admin.gallery_restored'
  | 'account.exported'
  | 'account.deleted'
  | 'consent.ai_granted'
  | 'consent.ai_revoked'
  | 'privacy.therapist_access_granted'
  | 'privacy.therapist_access_revoked'
  | 'privacy.image_published'
  | 'privacy.image_unpublished'
  | 'org.joined'
  | 'org.left'
  | 'org.invite_rotated'
  | 'org.created'
  | 'org.admin_transferred'
  | 'admin.course_archived'
  | 'content.diary_deleted'
  | 'admin.course_deleted'
  | 'admin.submission_graded';

export interface AuditEntry {
  action: AuditAction;
  /** The acting user, when authenticated. */
  actorId?: string;
  /** The subject of the action, when it differs from the actor. */
  subjectId?: string;
  /** Correlation id of the originating request, to tie the entry to a request log. */
  requestId?: string;
  ip?: string;
  /** Additional, non-sensitive context. Never free-text user content. */
  meta?: Record<string, string | number | boolean | undefined>;
  outcome: 'success' | 'denied' | 'failure';
}

/**
 * Writes one audit entry.
 *
 * Failures are swallowed on purpose: an audit write must never turn a
 * successful user action into a 500. The `catch` still reports through the
 * operational logger so a broken audit pipeline is visible.
 */
export function recordAudit(entry: AuditEntry): void {
  try {
    const level = entry.outcome === 'success' ? 'info' : 'warn';
    auditLogger[level](
      {
        auditAction: entry.action,
        outcome: entry.outcome,
        actorId: entry.actorId,
        subjectId: entry.subjectId,
        requestId: entry.requestId ?? requestContext.getStore()?.requestId,
        ip: entry.ip,
        ...entry.meta,
      },
      `audit ${entry.action} (${entry.outcome})`,
    );
  } catch (error) {
    auditLogger.error({ err: error }, 'Failed to write audit entry');
  }
}
