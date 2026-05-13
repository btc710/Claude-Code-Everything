'use strict';

const crypto = require('crypto');

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'project';
}

function id(prefix = 'p') {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function planHash(plan) {
  return crypto.createHash('sha256').update(String(plan)).digest('hex').slice(0, 16);
}

function isoDay(date = new Date()) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

module.exports = { slugify, id, planHash, isoDay, addDays };
