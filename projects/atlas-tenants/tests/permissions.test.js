'use strict';

const perms = require('../src/permissions');
const { assert, assertEqual } = require('./helpers');

const tests = [
  ['owner has implicit "*" so every scope passes', () => {
    assertEqual(perms.roleHasScope('owner', 'tenant.update'), true, 'tenant.update');
    assertEqual(perms.roleHasScope('owner', 'something.totally.new'), true, 'unknown scope');
  }],

  ['admin can manage members and tokens but is not "*"', () => {
    assertEqual(perms.roleHasScope('admin', 'member.invite'), true, 'invite');
    assertEqual(perms.roleHasScope('admin', 'token.revoke'), true, 'revoke');
    assertEqual(perms.roleHasScope('admin', 'tenant.update'), true, 'update tenant');
    assertEqual(perms.roleHasScope('admin', 'nope.invented'), false, 'unknown denied');
  }],

  ['member can write projects but cannot administer members', () => {
    assertEqual(perms.roleHasScope('member', 'project.write'), true, 'project write');
    assertEqual(perms.roleHasScope('member', 'member.invite'), false, 'cannot invite');
    assertEqual(perms.roleHasScope('member', 'token.issue'), false, 'cannot issue tokens');
  }],

  ['viewer is read-only across the board', () => {
    assertEqual(perms.roleHasScope('viewer', 'project.read'), true, 'read');
    assertEqual(perms.roleHasScope('viewer', 'project.write'), false, 'no write');
    assertEqual(perms.roleHasScope('viewer', 'token.issue'), false, 'no token issue');
    assertEqual(perms.roleHasScope('viewer', 'tenant.update'), false, 'no tenant update');
  }],

  ['roleHasScopes treats the list as AND', () => {
    assertEqual(perms.roleHasScopes('admin', ['member.read', 'token.issue']), true, 'both yes');
    assertEqual(perms.roleHasScopes('member', ['project.read', 'token.issue']), false, 'one no');
  }],

  ['rankOf orders owner > admin > member > viewer', () => {
    assert(perms.rankOf('owner') > perms.rankOf('admin'), 'owner > admin');
    assert(perms.rankOf('admin') > perms.rankOf('member'), 'admin > member');
    assert(perms.rankOf('member') > perms.rankOf('viewer'), 'member > viewer');
    assertEqual(perms.rankOf('nope'), -1, 'unknown role rank');
  }],

  ['effectiveScopes intersects role grants with token scopes', () => {
    const eff = perms.effectiveScopes('member', ['project.read', 'token.issue']);
    assertEqual(eff, ['project.read'], 'token.issue dropped because member lacks it');
  }],

  ['effectiveScopes returns full role set when token is unrestricted', () => {
    const eff = perms.effectiveScopes('viewer', []);
    assert(eff.includes('project.read'), 'has viewer scope');
    assert(!eff.includes('project.write'), 'no write');
  }],

  ['tokenCovers honors "*" and domain wildcards', () => {
    assertEqual(perms.tokenCovers(['*'], ['project.read']), true, 'wildcard');
    assertEqual(perms.tokenCovers(['project.*'], ['project.read']), true, 'domain wildcard');
    assertEqual(perms.tokenCovers(['project.read'], ['project.write']), false, 'mismatch');
    assertEqual(perms.tokenCovers([], ['anything']), true, 'empty = unrestricted');
  }],
];

module.exports = tests;
