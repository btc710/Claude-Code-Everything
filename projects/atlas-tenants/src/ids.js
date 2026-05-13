'use strict';

const crypto = require('crypto');

function id(prefix = 'x') {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'tenant';
}

function normalizeEmail(s) {
  return String(s).trim().toLowerCase();
}

// SHA-256 of plaintext token; we never store plaintext.
function hashToken(plaintext) {
  return crypto.createHash('sha256').update(String(plaintext)).digest('hex');
}

// Plaintext token returned to the caller exactly once. Prefixed for easy log scanning.
function newTokenPlaintext(prefix = 'atk') {
  return prefix + '_' + crypto.randomBytes(24).toString('hex');
}

module.exports = { id, slugify, normalizeEmail, hashToken, newTokenPlaintext };
