'use strict';

const slack = require('./slack');
const email = require('./email');
const webhook = require('./webhook');

const SINKS = { slack, email, webhook };

function resolveSink(name) {
  const s = SINKS[name];
  if (!s) throw new Error(`unknown sink: ${name}`);
  return s;
}

module.exports = { SINKS, resolveSink, slack, email, webhook };
