export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface UserProfile {
  techStack: string[];
  proficiency: ProficiencyLevel;
  focusAreas: string[];
}

export interface GitHubConfig {
  pat: string;
  username: string;
  targetRepoPath: string;
}

export interface LLMConfig {
  apiBaseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface AppConfig {
  userProfile: UserProfile;
  github: GitHubConfig;
  llm: LLMConfig;
  commitTemplate: string;
}
