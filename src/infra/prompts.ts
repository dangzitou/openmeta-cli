import inquirer from 'inquirer';
import { isPromptAbortError, UserCancelledError } from './errors.js';

export async function prompt<T extends object>(questions: unknown): Promise<T> {
  try {
    return await inquirer.prompt<T>(questions as Parameters<typeof inquirer.prompt>[0]);
  } catch (error) {
    if (isPromptAbortError(error)) {
      throw new UserCancelledError();
    }

    throw error;
  }
}
