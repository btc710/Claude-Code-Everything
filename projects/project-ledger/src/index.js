'use strict';

const projects = require('./projects');
const backtests = require('./backtests');
const followups = require('./followups');
const reviews = require('./reviews');
const store = require('./store');
const ids = require('./ids');

module.exports = {
  ...projects,
  ...backtests,
  ...followups,
  ...reviews,
  store,
  ids,
};
