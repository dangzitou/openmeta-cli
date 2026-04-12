import { simpleGit, type SimpleGit } from 'simple-git';
import { existsSync } from 'fs';
import { logger } from '../infra/logger.js';

export class GitService {
  private git: SimpleGit | null = null;
  private repoPath: string = '';

  async initialize(repoPath: string): Promise<boolean> {
    if (!existsSync(repoPath)) {
      logger.error(`Repository path does not exist: ${repoPath}`);
      return false;
    }

    try {
      this.git = simpleGit(repoPath);
      this.repoPath = repoPath;
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        logger.error(`Path is not a git repository: ${repoPath}`);
        return false;
      }
      logger.success(`Git repository initialized: ${repoPath}`);
      return true;
    } catch (error) {
      logger.error('Failed to initialize git:', error);
      return false;
    }
  }

  async addCommitPush(content: string, commitMessage: string): Promise<boolean> {
    if (!this.git) {
      throw new Error('Git service not initialized');
    }

    try {
      const fileName = `openmeta-daily-${new Date().toISOString().split('T')[0]}.md`;
      const { writeFileSync } = await import('fs');
      writeFileSync(`${this.repoPath}/${fileName}`, content, 'utf-8');

      logger.info(`File created: ${fileName}`);

      await this.git.add('.');
      logger.debug('Files staged');

      await this.git.commit(commitMessage);
      logger.debug(`Commit created: ${commitMessage}`);

      const remotes = await this.git.getRemotes();
      if (remotes.length > 0) {
        await this.git.push();
        logger.success('Changes pushed to remote');
      } else {
        logger.warn('No remote configured, skipping push');
      }

      return true;
    } catch (error) {
      logger.error('Git operation failed:', error);
      return false;
    }
  }

  async getStatus(): Promise<string> {
    if (!this.git) {
      throw new Error('Git service not initialized');
    }

    const status = await this.git.status();
    return JSON.stringify(status, null, 2);
  }

  async hasLocalChanges(): Promise<boolean> {
    if (!this.git) {
      throw new Error('Git service not initialized');
    }

    const status = await this.git.status();
    return status.files.length > 0;
  }
}

export const gitService = new GitService();
