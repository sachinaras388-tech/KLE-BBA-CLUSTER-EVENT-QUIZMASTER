const AuditLog = require('../models/AuditLog');

/**
 * Record an important action. Never throws - auditing must not break the request.
 * audit(req, 'COMPETITION_CREATED', { entityType: 'Competition', entityId, meta })
 */
async function audit(req, action, { entityType, entityId, meta, actor, actorLabel } = {}) {
  try {
    const user = actor || req?.user;
    await AuditLog.create({
      actor: user?._id || (typeof actor === 'string' ? actor : undefined),
      actorLabel: actorLabel || user?.participantId || user?.email || undefined,
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      meta,
      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 300),
    });
  } catch (err) {
    console.error('[audit] failed to write log:', err.message);
  }
}

module.exports = audit;
