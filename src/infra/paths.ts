import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { configService } from './config.js';

/** Return the OpenMeta home directory, respecting the `OPENMETA_HOME` env override. */
export function getOpenMetaHomePath(): string {
	return process.env['OPENMETA_HOME'] || join(homedir(), '.openmeta');
}

/** Return the root directory where cloned workspaces are stored. */
export function getOpenMetaWorkspaceRoot(): string {
	return join(getOpenMetaHomePath(), 'workspaces');
}

/** Return the root directory where generated artifacts are written. */
export function getOpenMetaArtifactRoot(): string {
	return join(getOpenMetaHomePath(), 'artifacts');
}

/** Return the directory that holds OpenMeta state files (config, logs, etc.). */
export function getOpenMetaStateDir(): string {
	return dirname(configService.getConfigPath());
}

/** Ensure *path* exists as a directory, creating parents as needed, then return it. */
export function ensureDirectory(path: string): string {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}

	return path;
}
