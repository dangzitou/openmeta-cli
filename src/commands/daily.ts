import { Command } from 'commander';
import { dailyOrchestrator } from '../orchestration/index.js';
import { logger } from '../infra/index.js';

export function registerDailyCommand(program: Command): void {
  program
    .command('daily')
    .description('Execute daily open source workflow: fetch issues, generate content, commit')
    .action(async () => {
      try {
        await dailyOrchestrator.execute();
      } catch (error) {
        logger.error('Daily workflow failed:', error);
        process.exit(1);
      }
    });
}
