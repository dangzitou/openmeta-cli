import chalk from 'chalk';

type Tone = 'info' | 'success' | 'warning' | 'error';

interface PanelOptions {
  label?: string;
  title: string;
  subtitle?: string;
  lines?: string[];
  tone?: Tone;
}

const PANEL_WIDTH = 64;

const toneColors: Record<Tone, typeof chalk.cyan> = {
  info: chalk.cyanBright,
  success: chalk.greenBright,
  warning: chalk.yellowBright,
  error: chalk.redBright,
};

function wrapLine(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let remaining = word;
    while (remaining.length > width) {
      lines.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    current = remaining;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function printPanel({ label, title, subtitle, lines = [], tone = 'info' }: PanelOptions): void {
  const color = toneColors[tone];
  const content = [
    ...(label ? [label.toUpperCase()] : []),
    title,
    ...(subtitle ? wrapLine(subtitle, PANEL_WIDTH) : []),
    ...lines.flatMap((line) => wrapLine(line, PANEL_WIDTH)),
  ];

  const top = `┏${'━'.repeat(PANEL_WIDTH + 2)}┓`;
  const bottom = `┗${'━'.repeat(PANEL_WIDTH + 2)}┛`;

  console.log('');
  console.log(color(top));
  for (const line of content) {
    console.log(color(`┃ ${line.padEnd(PANEL_WIDTH)} ┃`));
  }
  console.log(color(bottom));
}

function printSection(title: string, subtitle?: string): void {
  console.log('');
  console.log(chalk.cyan(`── ${title}`));
  if (subtitle) {
    console.log(chalk.gray(subtitle));
  }
}

function printList(lines: string[]): void {
  for (const line of lines) {
    console.log(chalk.gray(`  • ${line}`));
  }
}

export const ui = {
  banner(options: PanelOptions): void {
    printPanel(options);
  },

  section(title: string, subtitle?: string): void {
    printSection(title, subtitle);
  },

  list(lines: string[]): void {
    printList(lines);
  },

  commandCancelled(commandName: string): void {
    printPanel({
      label: commandName,
      title: 'Session closed',
      subtitle: 'No changes were made because the flow was cancelled by the user.',
      tone: 'warning',
    });
  },

  commandFailed(commandName: string, message: string): void {
    printPanel({
      label: commandName,
      title: 'Command failed',
      subtitle: message,
      tone: 'error',
    });
  },

  emptyState(commandName: string, title: string, subtitle: string): void {
    printPanel({
      label: commandName,
      title,
      subtitle,
      tone: 'warning',
    });
  },
};
