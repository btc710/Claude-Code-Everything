'use strict';

// Role-based permission matrix. Roles are ordered from most → least privileged.
// Each role's permission set is a strict superset of the role below it.
//
// Permissions are dotted scope strings of the shape `<domain>.<verb>`. Callers
// either request a single scope or a list, and we treat the list as AND.
//
// Wildcard "*" matches any scope and is implicitly granted to `owner`.

const ROLES = ['owner', 'admin', 'member', 'viewer'];

const PERMISSIONS = {
  owner: ['*'],
  admin: [
    'tenant.read',
    'tenant.update',
    'member.read',
    'member.invite',
    'member.update',
    'member.remove',
    'token.read',
    'token.issue',
    'token.revoke',
    'project.read',
    'project.write',
    'backtest.read',
    'backtest.write',
    'usage.read',
    'audit.read',
  ],
  member: [
    'tenant.read',
    'member.read',
    'project.read',
    'project.write',
    'backtest.read',
    'backtest.write',
    'usage.read',
  ],
  viewer: [
    'tenant.read',
    'member.read',
    'project.read',
    'backtest.read',
    'usage.read',
  ],
};

function isRole(r) {
  return ROLES.includes(r);
}

// Higher rank = more privileged. Useful for "an admin cannot demote an owner" checks.
function rankOf(role) {
  const idx = ROLES.indexOf(role);
  return idx === -1 ? -1 : ROLES.length - idx;
}

function granted(role) {
  return PERMISSIONS[role] || [];
}

function roleHasScope(role, scope) {
  const g = granted(role);
  if (!scope) return true;
  if (g.includes('*')) return true;
  if (g.includes(scope)) return true;
  // Allow `<domain>.*` wildcard if ever added to the matrix.
  const dot = scope.indexOf('.');
  if (dot > 0) {
    const wildcard = scope.slice(0, dot) + '.*';
    if (g.includes(wildcard)) return true;
  }
  return false;
}

function roleHasScopes(role, scopes) {
  const list = Array.isArray(scopes) ? scopes : (scopes ? [scopes] : []);
  return list.every(s => roleHasScope(role, s));
}

// Intersection of role-granted and token-granted scopes is what an actor can do.
// Token scopes default to all role scopes when not specified.
function effectiveScopes(role, tokenScopes) {
  const roleSet = new Set(granted(role));
  if (!tokenScopes || tokenScopes.length === 0 || tokenScopes.includes('*')) {
    return [...roleSet];
  }
  if (roleSet.has('*')) return [...tokenScopes];
  return tokenScopes.filter(s => roleSet.has(s));
}

function tokenCovers(tokenScopes, required) {
  if (!tokenScopes || tokenScopes.length === 0) return true;          // unrestricted
  if (tokenScopes.includes('*')) return true;
  const list = Array.isArray(required) ? required : (required ? [required] : []);
  return list.every(scope => {
    if (tokenScopes.includes(scope)) return true;
    const dot = scope.indexOf('.');
    if (dot > 0 && tokenScopes.includes(scope.slice(0, dot) + '.*')) return true;
    return false;
  });
}

module.exports = {
  ROLES,
  PERMISSIONS,
  isRole,
  rankOf,
  granted,
  roleHasScope,
  roleHasScopes,
  effectiveScopes,
  tokenCovers,
};
