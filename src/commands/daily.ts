import { Command, Option } from 'commander';
import { dailyOrchestrator } from '../orchestration/index.js';
import type { ContentType } from '../types/index.js';
import { runCommand } from './run-command.js';

export function registerDailyCommand(program: Command): void {
  program
    .command('daily')
    .description('Execute daily open source workflow: fetch issues, generate content, commit')
    .option('--headless', 'Run unattended using saved automation defaults')
    .option('--force', 'Run even if today already has a generated note')
    .option('--content-type <type>', 'Override generated content type: research_note | development_diary')
    .addOption(new Option('--scheduler-run', 'Internal flag for scheduled automation').hideHelp())
    .action((options: { headless?: boolean; force?: boolean; contentType?: string; schedulerRun?: boolean }) => runCommand(
      'OpenMeta Daily',
      () => dailyOrchestrator.execute({
        headless: options.headless,
        force: options.force,
        contentType: normalizeContentType(options.contentType),
        schedulerRun: options.schedulerRun,
      }),
    ));
}

function normalizeContentType(value?: string): ContentType | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'research_note' || value === 'development_diary') {
    return value;
  }

  throw new Error(`Unsupported content type "${value}". Use "research_note" or "development_diary".`);
}
