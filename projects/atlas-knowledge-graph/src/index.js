'use strict';

const triples = require('./triples');
const ingest = require('./ingest');
const query = require('./query');
const store = require('./store');
const ids = require('./ids');

module.exports = {
  ...triples,
  ...ingest,
  ...query,
  store,
  ids,
};
