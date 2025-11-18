#!/usr/bin/env node

import { SimpleCLI } from './cli/SimpleCLI';

async function main() {
  const cli = new SimpleCLI();

  try {
    // Pass all arguments except 'node' and script name
    const args = process.argv.slice(2);
    const exitCode = await cli.run(args);
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
