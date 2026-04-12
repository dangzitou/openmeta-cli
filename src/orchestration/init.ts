import inquirer from 'inquirer';
import select from '@inquirer/select';
import chalk from 'chalk';
import type { AppConfig } from '../types/index.js';
import { githubService, llmService } from '../services/index.js';
import { configService, logger } from '../infra/index.js';

interface LLMProviderOption {
  name: string;
  value: string;
  baseUrl: string;
  models: Array<{ name: string; value: string }>;
}

const BANNER = `
${chalk.bold.cyan('  ╔═══════════════════════════════════════╗')}
${chalk.bold.cyan('  ║         Welcome to OpenMeta CLI       ║')}
${chalk.bold.cyan('  ╚═══════════════════════════════════════╝')}
`;

const WELCOME_TEXT = `
  ${chalk.cyan('◆')} ${chalk.white('Your daily open source growth companion')}

  This tool helps you:
  ${chalk.gray('  •')} Find relevant GitHub issues to contribute
  ${chalk.gray('  •')} Generate meaningful daily commits automatically
  ${chalk.gray('  •')} Track your open source contribution journey

${chalk.gray('─'.repeat(50))}
${chalk.bold.cyan("  Let's get started!")}
${chalk.gray('─'.repeat(50))}
`;

const SUCCESS_BANNER = `
${chalk.green('  ╔═══════════════════════════════════════╗')}
${chalk.green('  ║         ✅  Setup Complete!           ║')}
${chalk.green('  ╚═══════════════════════════════════════╝')}
`;

const STEP_DIVIDER = (step: string) => `
${chalk.cyan('─'.repeat(50))}
${chalk.bold.cyan(step)}
${chalk.cyan('─'.repeat(50))}
`;

const LLM_PROVIDERS: LLMProviderOption[] = [
  {
    name: 'OpenAI',
    value: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { name: 'GPT-4o-mini', value: 'gpt-4o-mini' },
      { name: 'GPT-4o', value: 'gpt-4o' },
      { name: 'GPT-4-turbo', value: 'gpt-4-turbo' },
    ],
  },
  {
    name: 'MiniMax',
    value: 'minimax',
    baseUrl: 'https://api.minimaxi.com/v1',
    models: [
      { name: 'MiniMax-M2.7', value: 'MiniMax-M2.7' },
      { name: 'MiniMax-M2.5', value: 'MiniMax-M2.5' },
      { name: 'MiniMax-M2.1', value: 'MiniMax-M2.1' },
      { name: 'MiniMax-M2', value: 'MiniMax-M2' },
    ],
  },
];

export class InitOrchestrator {
  async execute(): Promise<void> {
    console.log(BANNER);
    console.log(WELCOME_TEXT);

    const config = await configService.get();

    console.log(STEP_DIVIDER('STEP 1  ·  GitHub Configuration'));

    let pat = '';
    let username = '';
    let ghValid = false;

    while (!ghValid) {
      pat = await this.promptGitHubPAT();
      username = await this.promptUsername();

      githubService.initialize(pat, username);
      ghValid = await githubService.validateCredentials();

      if (!ghValid) {
        console.log(`\n  ${chalk.red('✖')} ${chalk.red('GitHub token validation failed')}\n`);
        console.log(`  ${chalk.gray('→')} ${chalk.white('Make sure your PAT has permissions:')}`);
        console.log(`    ${chalk.gray('•')} repo (Full repository access)`);
        console.log(`    ${chalk.gray('•')} user (Read user profile info)\n`);
        const { retry } = await inquirer.prompt<{ retry: boolean }>([
          {
            type: 'confirm',
            name: 'retry',
            message: '  Try again?',
            default: true,
          },
        ]);
        if (!retry) {
          console.log(`\n  ${chalk.gray('›')} ${chalk.gray('Initialization cancelled')}\n`);
          return;
        }
      }
    }

    console.log(STEP_DIVIDER('STEP 2  ·  LLM API Configuration'));

    let providerValue = '';
    let selectedProvider: LLMProviderOption | undefined;
    let modelValue = '';
    let apiKey = '';
    let llmValid = false;

    while (!llmValid) {
      // Step 2a: Select provider
      providerValue = await select({
        message: '  Select LLM provider:',
        choices: LLM_PROVIDERS.map(p => ({
          name: p.name,
          value: p.value,
        })),
      });

      selectedProvider = LLM_PROVIDERS.find(p => p.value === providerValue);
      if (!selectedProvider) {
        throw new Error(`Provider not found: ${providerValue}`);
      }

      // Step 2b: Select model
      modelValue = await select({
        message: '  Select model:',
        choices: selectedProvider.models.map(m => ({
          name: m.name,
          value: m.value,
        })),
      });

      // Step 2c: Enter API key
      apiKey = await this.promptAPIKey();

      // Step 2d: Validate connection
      llmService.initialize(apiKey, selectedProvider.baseUrl, modelValue);
      llmValid = await llmService.validateConnection();

      if (!llmValid) {
        console.log(`\n  ${chalk.red('✖')} ${chalk.red('LLM API connection failed')}`);
        console.log(`  ${chalk.gray('→')} ${chalk.white('Please check your API key and try again')}\n`);
        const { retry } = await inquirer.prompt<{ retry: boolean }>([
          {
            type: 'confirm',
            name: 'retry',
            message: '  Try again?',
            default: true,
          },
        ]);
        if (!retry) {
          console.log(`\n  ${chalk.gray('›')} ${chalk.gray('Initialization cancelled')}\n`);
          return;
        }
      }
    }

    console.log(STEP_DIVIDER('STEP 3  ·  User Profile'));

    const techStack = await select({
      message: '  Select your tech stack:',
      choices: [
        { name: 'TypeScript, React, Node.js', value: 'TypeScript,React,Node.js' },
        { name: 'Python, Django, FastAPI', value: 'Python,Django,FastAPI' },
        { name: 'Go, Gin, Echo', value: 'Go,Gin,Echo' },
        { name: 'Rust, Actix, Tokio', value: 'Rust,Actix,Tokio' },
        { name: 'Java, Spring Boot', value: 'Java,Spring Boot' },
        { name: 'C++, CMake', value: 'C++,CMake' },
        { name: 'Swift, SwiftUI', value: 'Swift,SwiftUI' },
        { name: 'Kotlin, Jetpack Compose', value: 'Kotlin,Jetpack Compose' },
      ],
    });

    const focusAreas = await select({
      message: '  Select your focus areas:',
      choices: [
        { name: 'Web Development', value: 'web-dev' },
        { name: 'Backend / API', value: 'backend' },
        { name: 'DevOps / Infrastructure', value: 'devops' },
        { name: 'AI / Machine Learning', value: 'ai-ml' },
        { name: 'Mobile Development', value: 'mobile' },
        { name: 'Security', value: 'security' },
        { name: 'Data Engineering', value: 'data' },
        { name: 'Open Source', value: 'open-source' },
      ],
    });

    console.log(STEP_DIVIDER('STEP 4  ·  Target Repository (Optional)'));

    const { targetRepoPath } = await inquirer.prompt<{ targetRepoPath: string }>([
      {
        type: 'input',
        name: 'targetRepoPath',
        message: '  Enter path to your private repository (optional):',
        default: '',
      },
    ]);

    const newConfig: AppConfig = {
      ...config,
      userProfile: {
        techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
        focusAreas: focusAreas.split(',').map(s => s.trim()).filter(Boolean),
      },
      github: {
        pat,
        username,
        targetRepoPath: targetRepoPath || undefined,
      },
      llm: {
        provider: providerValue as 'openai' | 'minimax',
        apiBaseUrl: selectedProvider!.baseUrl,
        apiKey,
        modelName: modelValue,
      },
    };

    await configService.save(newConfig);

    console.log(SUCCESS_BANNER);
    console.log(`  ${chalk.green('✔')} ${chalk.white('Configuration saved to:')} ${chalk.gray(configService.getConfigPath())}`);
    console.log(`\n  ${chalk.white('Run')} ${chalk.cyan('openmeta daily')} ${chalk.white('to start your daily contribution!')}\n`);
  }

  private async promptGitHubPAT(): Promise<string> {
    const { pat } = await inquirer.prompt<{ pat: string }>([
      {
        type: 'password',
        name: 'pat',
        message: 'Enter your GitHub Personal Access Token (PAT):',
        mask: '*',
        validate: (input) => input.length > 0 || 'PAT is required',
      },
    ]);
    return pat;
  }

  private async promptAPIKey(): Promise<string> {
    const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your LLM API Key:',
        mask: '*',
        validate: (input) => input.length > 0 || 'API Key is required',
      },
    ]);
    return apiKey;
  }

  private async promptUsername(): Promise<string> {
    const { username } = await inquirer.prompt<{ username: string }>([
      {
        type: 'input',
        name: 'username',
        message: 'Enter your GitHub username:',
        validate: (input) => input.length > 0 || 'Username is required',
      },
    ]);
    return username;
  }
}

export const initOrchestrator = new InitOrchestrator();
