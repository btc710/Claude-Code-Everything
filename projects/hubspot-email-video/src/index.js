#!/usr/bin/env node
'use strict';

const { load } = require('./config');
const { scheduleProjectDiscussion } = require('./orchestrator');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        args[a.slice(2)] = argv[i + 1];
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function usage() {
  return [
    'hev — schedule a Google Meet from a HubSpot contact',
    '',
    'Usage:',
    '  hev schedule --contact <email> --start <ISO8601> [--minutes 30] [--subject "..."] [--notes "..."]',
    '',
    'Examples:',
    '  hev schedule --contact alex@acme.com --start 2026-05-20T15:00:00-05:00',
    '  hev schedule --contact alex@acme.com --start 2026-05-20T15:00:00-05:00 \\',
    '    --minutes 45 --subject "Acme onboarding" --notes "Discuss scope and timeline"',
  ].join('\n');
}

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || args.help) {
    console.log(usage());
    return 0;
  }

  if (cmd !== 'schedule') {
    console.error(`Unknown command: ${cmd}`);
    console.error(usage());
    return 1;
  }

  if (!args.contact) {
    console.error('Missing required --contact <email>');
    return 1;
  }
  if (!args.start) {
    console.error('Missing required --start <ISO8601>');
    return 1;
  }

  const config = load();
  const result = await scheduleProjectDiscussion({
    config,
    contactEmail: args.contact,
    startTime: args.start,
    durationMinutes: args.minutes ? parseInt(args.minutes, 10) : undefined,
    subject: args.subject,
    notes: args.notes,
  });

  console.log('Meeting scheduled.');
  console.log(`  Google Meet : ${result.event.meetUrl}`);
  console.log(`  Calendar    : ${result.event.htmlLink}`);
  console.log(`  Email id    : ${result.email && result.email.id}`);
  if (result.contact) {
    console.log(`  HubSpot     : contact ${result.contact.id}, note ${result.note && result.note.id}`);
  } else {
    console.log(`  HubSpot     : no contact found for ${args.contact} (no note logged)`);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code || 0),
    (err) => {
      console.error(err.stack || err.message || err);
      process.exit(1);
    },
  );
}

module.exports = { main, parseArgs, usage };
