#!/usr/bin/env bun
import { Command } from 'commander';
import { registerInitCommand, registerDailyCommand, registerConfigCommand } from './commands/index.js';
import { logger } from './infra/index.js';

const VERSION = '1.0.0';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('openmeta')
    .description("OpenMeta CLI - Developer's daily open source growth companion")
    .version(VERSION, '-v, --version', 'Show version')
    .helpOption('-h, --help', 'Show help');

  registerInitCommand(program);
  registerDailyCommand(program);
  registerConfigCommand(program);

  program.on('command:*', () => {
    console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
    process.exit(1);
  });

  if (process.argv.length === 2) {
    program.help();
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
