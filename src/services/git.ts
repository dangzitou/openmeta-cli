import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { type SimpleGit, simpleGit } from 'simple-git';
import { getDailyNoteFileName } from '../infra/date.js';
import { logger } from '../infra/logger.js';

/** Result returned after publishing files to a git repository. */
export interface GitPublishResult {
	/** The branch that was checked out for the publish. */
	branch: string;
	/** Relative file paths that were written. */
	fileNames: string[];
	/** Absolute file paths that were written. */
	filePaths: string[];
	/** Whether the changes were pushed to a remote. */
	pushed: boolean;
}

/** A single file to be written into the repository. */
export interface FileWriteRequest {
	/** Relative path within the repository. */
	path: string;
	/** UTF-8 content to write. */
	content: string;
}

/** Options for controlling branch behaviour during publish. */
export interface PublishOptions {
	/** Target branch name (defaults to `'main'`). */
	branchName?: string;
	/** Base branch to create the target from if it doesn't exist (defaults to `'main'`). */
	baseBranch?: string;
}

/**
 * Manages git operations for writing and publishing generated content
 * to a target repository.
 *
 * Wraps `simple-git` to provide higher-level helpers for staging,
 * committing, and pushing files — used by the daily-note and artifact
 * publishing workflows.
 */
export class GitService {
	private git: SimpleGit | null = null;
	private repoPath: string = '';

	/**
	 * Bind the service to a local repository path.
	 *
	 * @param repoPath - Absolute path to an existing git repository.
	 * @returns `true` if the repository was successfully initialised,
	 *   `false` if the path is missing or not a git repo.
	 */
	async initialize(repoPath: string): Promise<boolean> {
		if (!existsSync(repoPath)) {
			logger.warn(`Target repository path does not exist: ${repoPath}`);
			return false;
		}

		try {
			this.git = simpleGit(repoPath);
			this.repoPath = repoPath;
			const isRepo = await this.git.checkIsRepo();
			if (!isRepo) {
				logger.warn(`Target path is not a git repository: ${repoPath}`);
				return false;
			}
			logger.success(`Git repository initialized: ${repoPath}`);
			return true;
		} catch (error) {
			logger.debug('Failed to initialize git', error);
			logger.warn('Unable to access the target repository.');
			return false;
		}
	}

	/**
	 * Generate a daily note file, commit it, and push to the remote.
	 *
	 * @param content - Markdown content for the daily note.
	 * @param commitMessage - Git commit message.
	 * @returns A {@link GitPublishResult} on success, or `null` on failure.
	 */
	async addCommitPush(content: string, commitMessage: string): Promise<GitPublishResult | null> {
		if (!this.git) {
			throw new Error('Git service not initialized');
		}

		try {
			const fileName = getDailyNoteFileName();
			return this.writeAndPublish([{ path: fileName, content }], commitMessage);
		} catch (error) {
			logger.debug('Git operation failed', error);
			logger.warn('Unable to write, commit, or push the generated note.');
			return null;
		}
	}

	/**
	 * Write one or more files, commit them, and optionally push.
	 *
	 * Creates intermediate directories as needed. Uses an atomic
	 * `--set-upstream` push when a remote is configured.
	 *
	 * @param files - Files to write and stage.
	 * @param commitMessage - Git commit message.
	 * @param options - Optional branch overrides.
	 * @returns A {@link GitPublishResult} on success, or `null` on failure.
	 */
	async writeAndPublish(
		files: FileWriteRequest[],
		commitMessage: string,
		options: PublishOptions = {},
	): Promise<GitPublishResult | null> {
		if (!this.git) {
			throw new Error('Git service not initialized');
		}

		try {
			const branch = await this.ensurePublishBranch(options);

			for (const file of files) {
				const filePath = join(this.repoPath, file.path);
				mkdirSync(dirname(filePath), { recursive: true });
				writeFileSync(filePath, file.content, 'utf-8');
				await this.git.add(file.path);
			}

			logger.debug('Files staged');
			await this.git.commit(commitMessage);
			logger.debug(`Commit created: ${commitMessage}`);

			const remotes = await this.git.getRemotes();
			const pushed = remotes.length > 0;
			if (pushed) {
				await this.git.raw(['push', '--set-upstream', 'origin', branch]);
				logger.success('Changes pushed to remote');
			} else {
				logger.warn('No remote configured, skipping push');
			}

			return {
				branch,
				fileNames: files.map((file) => file.path),
				filePaths: files.map((file) => join(this.repoPath, file.path)),
				pushed,
			};
		} catch (error) {
			logger.debug('Git operation failed', error);
			logger.warn('Unable to write, commit, or push generated files.');
			return null;
		}
	}

	/** Return a JSON-formatted summary of the current git status. */
	async getStatus(): Promise<string> {
		if (!this.git) {
			throw new Error('Git service not initialized');
		}

		const status = await this.git.status();
		return JSON.stringify(status, null, 2);
	}

	/** Check whether the working tree has any uncommitted changes. */
	async hasLocalChanges(): Promise<boolean> {
		if (!this.git) {
			throw new Error('Git service not initialized');
		}

		const status = await this.git.status();
		return status.files.length > 0;
	}

	private async ensurePublishBranch(options: PublishOptions): Promise<string> {
		if (!this.git) {
			throw new Error('Git service not initialized');
		}

		const branchName = options.branchName || 'main';
		const baseBranch = options.baseBranch || 'main';
		const localBranches = await this.git.branchLocal();

		if (localBranches.all.includes(branchName)) {
			await this.git.checkout(branchName);
			return branchName;
		}

		await this.checkoutBaseBranch(baseBranch, localBranches.all);

		try {
			await this.git.checkoutLocalBranch(branchName);
		} catch {
			await this.git.checkout(['-B', branchName]);
		}

		return branchName;
	}

	private async checkoutBaseBranch(baseBranch: string, localBranches: string[]): Promise<void> {
		if (!this.git) {
			throw new Error('Git service not initialized');
		}

		if (localBranches.includes(baseBranch)) {
			await this.git.checkout(baseBranch);
			return;
		}

		try {
			await this.git.fetch('origin', baseBranch);
			await this.git.checkout(['-B', baseBranch, `origin/${baseBranch}`]);
			return;
		} catch (error) {
			logger.debug(
				`Unable to align local repository with origin/${baseBranch} before publishing`,
				error,
			);
		}

		const status = await this.git.status();
		if (status.current) {
			await this.git.checkout(status.current);
			return;
		}

		await this.git.checkout(['-B', baseBranch]);
	}
}

export const gitService = new GitService();
