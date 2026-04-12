import inquirer from 'inquirer';
import type { AppConfig, UserProfile, ProficiencyLevel } from '../types/index.js';
import { githubService, llmService } from '../services/index.js';
import { configService, logger } from '../infra/index.js';

export class InitOrchestrator {
  async execute(): Promise<void> {
    logger.info('Starting OpenMeta CLI initialization...');

    const config = await configService.get();

    console.log('\n=== Step 1: GitHub Configuration ===\n');

    const { pat } = await inquirer.prompt<{ pat: string }>([
      {
        type: 'password',
        name: 'pat',
        message: 'Enter your GitHub Personal Access Token (PAT):',
        validate: (input) => input.length > 0 || 'PAT is required',
      },
    ]);

    const { username } = await inquirer.prompt<{ username: string }>([
      {
        type: 'input',
        name: 'username',
        message: 'Enter your GitHub username:',
        validate: (input) => input.length > 0 || 'Username is required',
      },
    ]);

    githubService.initialize(pat, username);
    const ghValid = await githubService.validateCredentials();
    if (!ghValid) {
      throw new Error('GitHub credentials validation failed. Please check your PAT.');
    }

    console.log('\n=== Step 2: LLM API Configuration ===\n');

    const { apiBaseUrl } = await inquirer.prompt<{ apiBaseUrl: string }>([
      {
        type: 'input',
        name: 'apiBaseUrl',
        message: 'Enter LLM API Base URL:',
        default: 'https://api.openai.com/v1',
        validate: (input) => input.length > 0 || 'Base URL is required',
      },
    ]);

    const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your LLM API Key:',
        validate: (input) => input.length > 0 || 'API Key is required',
      },
    ]);

    const { modelName } = await inquirer.prompt<{ modelName: string }>([
      {
        type: 'input',
        name: 'modelName',
        message: 'Enter model name:',
        default: 'gpt-4o-mini',
      },
    ]);

    llmService.initialize(apiKey, apiBaseUrl);
    const llmValid = await llmService.validateConnection();
    if (!llmValid) {
      throw new Error('LLM API connection failed. Please check your API key and base URL.');
    }

    console.log('\n=== Step 3: User Profile ===\n');

    const { techStack } = await inquirer.prompt<{ techStack: string }>([
      {
        type: 'input',
        name: 'techStack',
        message: 'Enter your tech stack (comma-separated, e.g., TypeScript, React, Node.js):',
        default: '',
      },
    ]);

    const { proficiency } = await inquirer.prompt<{ proficiency: ProficiencyLevel }>([
      {
        type: 'list',
        name: 'proficiency',
        message: 'Select your proficiency level:',
        choices: [
          { name: 'Beginner', value: 'beginner' },
          { name: 'Intermediate', value: 'intermediate' },
          { name: 'Advanced', value: 'advanced' },
        ],
      },
    ]);

    const { focusAreas } = await inquirer.prompt<{ focusAreas: string }>([
      {
        type: 'input',
        name: 'focusAreas',
        message: 'Enter your focus areas (comma-separated, e.g., web-dev, devops, ai):',
        default: '',
      },
    ]);

    console.log('\n=== Step 4: Target Repository ===\n');

    const { targetRepoPath } = await inquirer.prompt<{ targetRepoPath: string }>([
      {
        type: 'input',
        name: 'targetRepoPath',
        message: 'Enter the absolute path to your target private repository for commits:',
        validate: async (input) => {
          if (input.length === 0) return 'Path is required';
          const { existsSync } = await import('fs');
          if (!existsSync(input)) return 'Path does not exist';
          return true;
        },
      },
    ]);

    const newConfig: AppConfig = {
      ...config,
      userProfile: {
        techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
        proficiency,
        focusAreas: focusAreas.split(',').map(s => s.trim()).filter(Boolean),
      },
      github: {
        pat,
        username,
        targetRepoPath,
      },
      llm: {
        apiBaseUrl,
        apiKey,
        modelName,
      },
    };

    await configService.save(newConfig);

    logger.success('\nInitialization completed successfully!');
    console.log(`\nConfiguration saved to: ${configService.getConfigPath()}`);
    console.log('\nYou can now run "openmeta daily" to start your daily contribution.');
  }
}

export const initOrchestrator = new InitOrchestrator();
