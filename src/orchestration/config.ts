import inquirer from 'inquirer';
import { configService, logger } from '../infra/index.js';
import type { AppConfig } from '../types/index.js';

export class ConfigOrchestrator {
  async view(): Promise<void> {
    const config = await configService.get();

    console.log('\n=== Current Configuration ===\n');
    console.log(`Config Path: ${configService.getConfigPath()}\n`);

    console.log('User Profile:');
    console.log(`  Tech Stack: ${config.userProfile.techStack.join(', ') || '(not set)'}`);
    console.log(`  Focus Areas: ${config.userProfile.focusAreas.join(', ') || '(not set)'}`);

    console.log('\nGitHub:');
    console.log(`  Username: ${config.github.username || '(not set)'}`);
    console.log(`  PAT: ${config.github.pat ? '***' + config.github.pat.slice(-4) : '(not set)'}`);
    console.log(`  Target Repo: ${config.github.targetRepoPath || '(not set)'}`);

    console.log('\nLLM:');
    console.log(`  Base URL: ${config.llm.apiBaseUrl}`);
    console.log(`  Model: ${config.llm.modelName}`);
    console.log(`  API Key: ${config.llm.apiKey ? '***' + config.llm.apiKey.slice(-4) : '(not set)'}`);

    console.log('\nCommit Template:');
    console.log(`  ${config.commitTemplate}`);
  }

  async set(key: string, value: string): Promise<void> {
    const config = await configService.get();
    const keys = key.split('.');
    const validPaths = ['userProfile.techStack', 'userProfile.proficiency', 'userProfile.focusAreas',
                       'github.username', 'github.targetRepoPath', 'llm.apiBaseUrl', 'llm.modelName',
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
    } else if (key === 'commitTemplate') {
      updated = await configService.update({ commitTemplate: value });
    } else {
      return;
    }

    logger.success(`Updated ${key}`);
  }

  async reset(): Promise<void> {
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset all configuration to defaults?',
        default: false,
      },
    ]);

    if (confirm) {
      await configService.reset();
      logger.success('Configuration reset to defaults');
    } else {
      logger.info('Reset cancelled');
    }
  }
}

export const configOrchestrator = new ConfigOrchestrator();
