#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`strait: unexpected error: ${e?.stack ?? e}\n`);
    process.exit(1);
  },
);
