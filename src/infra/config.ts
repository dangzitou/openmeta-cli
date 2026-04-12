import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import type { AppConfig } from '../types/index.js';
import { CryptoService } from './crypto.js';
import { logger } from './logger.js';

const CONFIG_MODULE_NAME = 'openmeta';
const CONFIG_DIR = join(homedir(), '.config', 'openmeta');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  userProfile: {
    techStack: [],
    proficiency: 'beginner',
    focusAreas: [],
  },
  github: {
    pat: '',
    username: '',
    targetRepoPath: '',
  },
  llm: {
    provider: 'openai',
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: 'gpt-4o-mini',
  },
  commitTemplate: 'feat(daily): {{title}}\n\n{{content}}',
};

export class ConfigService {
  private config: AppConfig | null = null;

  async load(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    if (existsSync(CONFIG_FILE)) {
      try {
        const fileContent = readFileSync(CONFIG_FILE, 'utf-8');
        this.config = this.decryptConfig(JSON.parse(fileContent) as AppConfig);
      } catch (error) {
        logger.warn('Failed to load config, using defaults');
        this.config = { ...DEFAULT_CONFIG };
      }
    } else {
      this.config = { ...DEFAULT_CONFIG };
    }

    return this.config;
  }

  async save(config: AppConfig): Promise<void> {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const encryptedConfig = this.encryptConfig(config);
    writeFileSync(CONFIG_FILE, JSON.stringify(encryptedConfig, null, 2), 'utf-8');
    this.config = config;
    logger.success('Configuration saved successfully');
  }

  async get(): Promise<AppConfig> {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  async update(partial: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.get();
    const updated = { ...current, ...partial };
    await this.save(updated);
    return updated;
  }

  async reset(): Promise<void> {
    if (existsSync(CONFIG_FILE)) {
      const backupPath = `${CONFIG_FILE}.backup`;
      const currentContent = readFileSync(CONFIG_FILE, 'utf-8');
      writeFileSync(backupPath, currentContent, 'utf-8');
      logger.info(`Backup created at ${backupPath}`);
    }
    await this.save(DEFAULT_CONFIG);
    logger.success('Configuration reset to defaults');
  }

  private encryptConfig(config: AppConfig): AppConfig {
    const encrypted = { ...config };
    if (encrypted.github.pat) {
      encrypted.github = { ...encrypted.github, pat: CryptoService.encrypt(encrypted.github.pat) };
    }
    if (encrypted.llm.apiKey) {
      encrypted.llm = { ...encrypted.llm, apiKey: CryptoService.encrypt(encrypted.llm.apiKey) };
    }
    return encrypted;
  }

  private decryptConfig(config: AppConfig): AppConfig {
    const decrypted = { ...config };
    if (decrypted.github.pat && CryptoService.isEncrypted(decrypted.github.pat)) {
      decrypted.github = { ...decrypted.github, pat: CryptoService.decrypt(decrypted.github.pat) };
    }
    if (decrypted.llm.apiKey && CryptoService.isEncrypted(decrypted.llm.apiKey)) {
      decrypted.llm = { ...decrypted.llm, apiKey: CryptoService.decrypt(decrypted.llm.apiKey) };
    }
    return decrypted;
  }

  getConfigPath(): string {
    return CONFIG_FILE;
  }
}

export const configService = new ConfigService();
