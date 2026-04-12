import { Command } from 'commander';
import { configOrchestrator } from '../orchestration/index.js';
import { logger } from '../infra/index.js';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('View and modify OpenMeta CLI configuration');

  config
    .command('view')
    .description('View current configuration')
    .action(async () => {
      try {
        await configOrchestrator.view();
      } catch (error) {
        logger.error('Failed to view config:', error);
        process.exit(1);
      }
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      try {
        await configOrchestrator.set(key, value);
      } catch (error) {
        logger.error('Failed to set config:', error);
        process.exit(1);
      }
    });

  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
      try {
        await configOrchestrator.reset();
      } catch (error) {
        logger.error('Failed to reset config:', error);
        process.exit(1);
      }
    });
}
