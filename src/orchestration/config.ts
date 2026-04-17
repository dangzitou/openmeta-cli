import { configService, logger, prompt, ui } from '../infra/index.js';
import { schedulerService } from '../services/index.js';
import type { AppConfig } from '../types/index.js';

export class ConfigOrchestrator {
  async view(): Promise<void> {
    const config = await configService.get();

    console.log('\n=== Current Configuration ===\n');
    console.log(`Config Path: ${configService.getConfigPath()}\n`);

    console.log('User Profile:');
    console.log(`  Tech Stack: ${config.userProfile.techStack.join(', ') || '(not set)'}`);
    console.log(`  Proficiency: ${config.userProfile.proficiency || '(not set)'}`);
    console.log(`  Focus Areas: ${config.userProfile.focusAreas.join(', ') || '(not set)'}`);

    console.log('\nGitHub:');
    console.log(`  Username: ${config.github.username || '(not set)'}`);
    console.log(`  PAT: ${config.github.pat ? '***' + config.github.pat.slice(-4) : '(not set)'}`);
    console.log(`  Target Repo: ${config.github.targetRepoPath || '(not set)'}`);

    console.log('\nLLM:');
    console.log(`  Provider: ${config.llm.provider}`);
    console.log(`  Base URL: ${config.llm.apiBaseUrl}`);
    console.log(`  Model: ${config.llm.modelName}`);
    console.log(`  API Key: ${config.llm.apiKey ? '***' + config.llm.apiKey.slice(-4) : '(not set)'}`);

    console.log('\nAutomation:');
    console.log(`  Enabled: ${config.automation.enabled}`);
    console.log(`  Schedule Time: ${config.automation.scheduleTime}`);
    console.log(`  Timezone: ${config.automation.timezone}`);
    console.log(`  Content Type: ${config.automation.contentType}`);
    console.log(`  Scheduler: ${config.automation.scheduler}`);
    console.log(`  Min Match Score: ${config.automation.minMatchScore}`);
    console.log(`  Skip If Already Generated Today: ${config.automation.skipIfAlreadyGeneratedToday}`);

    console.log('\nCommit Template:');
    console.log(`  ${config.commitTemplate}`);
  }

  async set(key: string, value: string): Promise<void> {
    const config = await configService.get();
    const validPaths = ['userProfile.techStack', 'userProfile.proficiency', 'userProfile.focusAreas',
                       'github.username', 'github.targetRepoPath', 'llm.apiBaseUrl', 'llm.modelName',
                       'automation.enabled', 'automation.scheduleTime', 'automation.contentType',
                       'automation.minMatchScore', 'automation.skipIfAlreadyGeneratedToday',
                       'commitTemplate'];

    if (!validPaths.includes(key)) {
      logger.warn(`Unknown config key: ${key}`);
      console.log('\nValid keys:');
      validPaths.forEach(k => console.log(`  - ${k}`));
      return;
    }

    let updated: AppConfig;

    if (key === 'userProfile.techStack') {
      updated = await configService.update({
        userProfile: { ...config.userProfile, techStack: value.split(',').map(s => s.trim()).filter(Boolean) }
      });
    } else if (key === 'userProfile.focusAreas') {
      updated = await configService.update({
        userProfile: { ...config.userProfile, focusAreas: value.split(',').map(s => s.trim()).filter(Boolean) }
      });
    } else if (key === 'userProfile.proficiency') {
      updated = await configService.update({
        userProfile: { ...config.userProfile, proficiency: value as 'beginner' | 'intermediate' | 'advanced' }
      });
    } else if (key === 'github.username') {
      updated = await configService.update({ github: { ...config.github, username: value } });
    } else if (key === 'github.targetRepoPath') {
      updated = await configService.update({ github: { ...config.github, targetRepoPath: value } });
    } else if (key === 'llm.apiBaseUrl') {
      updated = await configService.update({ llm: { ...config.llm, apiBaseUrl: value } });
    } else if (key === 'llm.modelName') {
      updated = await configService.update({ llm: { ...config.llm, modelName: value } });
    } else if (key === 'automation.enabled') {
      updated = await configService.update({
        automation: {
          ...config.automation,
          enabled: this.parseBoolean(value, key),
        },
      });
    } else if (key === 'automation.scheduleTime') {
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
        throw new Error('automation.scheduleTime must use HH:mm format.');
      }
      updated = await configService.update({
        automation: {
          ...config.automation,
          scheduleTime: value,
        },
      });
    } else if (key === 'automation.contentType') {
      if (value !== 'research_note' && value !== 'development_diary') {
        throw new Error('automation.contentType must be "research_note" or "development_diary".');
      }
      updated = await configService.update({
        automation: {
          ...config.automation,
          contentType: value,
        },
      });
    } else if (key === 'automation.minMatchScore') {
      const minMatchScore = Number.parseInt(value, 10);
      if (Number.isNaN(minMatchScore) || minMatchScore < 0 || minMatchScore > 100) {
        throw new Error('automation.minMatchScore must be an integer between 0 and 100.');
      }
      updated = await configService.update({
        automation: {
          ...config.automation,
          minMatchScore,
        },
      });
    } else if (key === 'automation.skipIfAlreadyGeneratedToday') {
      updated = await configService.update({
        automation: {
          ...config.automation,
          skipIfAlreadyGeneratedToday: this.parseBoolean(value, key),
        },
      });
    } else if (key === 'commitTemplate') {
      updated = await configService.update({ commitTemplate: value });
    } else {
      return;
    }

    logger.success(`Updated ${key}`);

    if (key.startsWith('automation.')) {
      const syncResult = await schedulerService.sync(updated);
      if (syncResult.status === 'installed' || syncResult.status === 'removed') {
        logger.info(syncResult.detail);
      } else {
        logger.warn(syncResult.detail);
      }
    }
  }

  async reset(): Promise<void> {
    const { confirm } = await prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset all configuration to defaults?',
        default: false,
      },
    ]);

    if (confirm) {
      await configService.reset();
      ui.banner({
        label: 'OpenMeta Config',
        title: 'Configuration reset',
        subtitle: 'Local settings were restored to their defaults.',
        lines: [`Config file: ${configService.getConfigPath()}`],
        tone: 'success',
      });
    } else {
      logger.info('Reset cancelled');
    }
  }

  private parseBoolean(value: string, key: string): boolean {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    throw new Error(`${key} must be a boolean value.`);
  }
}

export const configOrchestrator = new ConfigOrchestrator();
