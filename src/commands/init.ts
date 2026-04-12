import { Command } from 'commander';
import { initOrchestrator } from '../orchestration/index.js';
import { logger } from '../infra/index.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize OpenMeta CLI configuration')
    .action(async () => {
      try {
        await initOrchestrator.execute();
      } catch (error) {
        logger.error('Initialization failed:', error);
        process.exit(1);
      }
    });
}
