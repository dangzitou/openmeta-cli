import { Command } from 'commander';
import { dailyOrchestrator } from '../orchestration/index.js';
import { runCommand } from './run-command.js';

export function registerDailyCommand(program: Command): void {
  program
    .command('daily')
    .description('Execute daily open source workflow: fetch issues, generate content, commit')
    .action(() => runCommand('OpenMeta Daily', () => dailyOrchestrator.execute()));
}
