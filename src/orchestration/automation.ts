import { configService, prompt, ui } from '../infra/index.js';
import { schedulerService } from '../services/index.js';

export class AutomationOrchestrator {
  async status(): Promise<void> {
    const config = await configService.get();

    ui.banner({
      label: 'OpenMeta Automation',
      title: config.automation.enabled ? 'Automation enabled' : 'Automation disabled',
      subtitle: config.automation.enabled
        ? 'A persistent system scheduler is configured for unattended daily runs.'
        : 'No unattended scheduler is currently active.',
      lines: [
        `Scheduler: ${config.automation.scheduler}`,
        `Schedule: ${config.automation.scheduleTime} (${config.automation.timezone})`,
        `Content type: ${config.automation.contentType}`,
        'Disable command: openmeta automation disable',
      ],
      tone: config.automation.enabled ? 'warning' : 'info',
    });
  }

  async enable(): Promise<void> {
    const config = await configService.get();

    if (config.automation.enabled) {
      ui.banner({
        label: 'OpenMeta Automation',
        title: 'Automation already enabled',
        subtitle: 'The persistent scheduler is already configured.',
        lines: [
          `Schedule: ${config.automation.scheduleTime} (${config.automation.timezone})`,
          'Disable command: openmeta automation disable',
        ],
        tone: 'info',
      });
      return;
    }

    ui.banner({
      label: 'OpenMeta Automation',
      title: 'Persistent automation warning',
      subtitle: 'Enabling this installs a long-running scheduled task that will execute OpenMeta every day until disabled.',
      lines: [
        `Schedule: ${config.automation.scheduleTime} (${config.automation.timezone})`,
        'Scheduled runs use headless mode and can commit and push without interactive review.',
        'Disable command: openmeta automation disable',
      ],
      tone: 'warning',
    });

    const { acknowledgePersistence } = await prompt<{ acknowledgePersistence: boolean }>([
      {
        type: 'confirm',
        name: 'acknowledgePersistence',
        message: 'Do you understand that this creates a persistent scheduled task on your machine?',
        default: false,
      },
    ]);

    if (!acknowledgePersistence) {
      ui.banner({
        label: 'OpenMeta Automation',
        title: 'Automation not enabled',
        subtitle: 'The persistent scheduler was not installed.',
        tone: 'warning',
      });
      return;
    }

    const { finalConsent } = await prompt<{ finalConsent: boolean }>([
      {
        type: 'confirm',
        name: 'finalConsent',
        message: 'Enable unattended daily automation now?',
        default: false,
      },
    ]);

    if (!finalConsent) {
      ui.banner({
        label: 'OpenMeta Automation',
        title: 'Automation not enabled',
        subtitle: 'The persistent scheduler was not installed.',
        tone: 'warning',
      });
      return;
    }

    const updated = {
      ...config,
      automation: {
        ...config.automation,
        enabled: true,
      },
    };

    await configService.save(updated);
    const result = await schedulerService.sync(updated);

    ui.banner({
      label: 'OpenMeta Automation',
      title: result.status === 'installed' ? 'Automation enabled' : 'Automation needs attention',
      subtitle: result.detail,
      lines: [
        `Schedule: ${updated.automation.scheduleTime} (${updated.automation.timezone})`,
        'Disable command: openmeta automation disable',
      ],
      tone: result.status === 'installed' ? 'success' : 'warning',
    });
  }

  async disable(): Promise<void> {
    const config = await configService.get();

    ui.banner({
      label: 'OpenMeta Automation',
      title: 'Disable persistent automation',
      subtitle: 'This removes the system scheduler so OpenMeta stops running automatically.',
      lines: [
        `Current schedule: ${config.automation.scheduleTime} (${config.automation.timezone})`,
        'Manual runs via "openmeta daily" will still work.',
      ],
      tone: 'warning',
    });

    const { confirmDisable } = await prompt<{ confirmDisable: boolean }>([
      {
        type: 'confirm',
        name: 'confirmDisable',
        message: 'Disable unattended daily automation?',
        default: false,
      },
    ]);

    if (!confirmDisable) {
      ui.banner({
        label: 'OpenMeta Automation',
        title: 'Automation unchanged',
        subtitle: 'The persistent scheduler is still in its previous state.',
        tone: 'info',
      });
      return;
    }

    const updated = {
      ...config,
      automation: {
        ...config.automation,
        enabled: false,
      },
    };

    await configService.save(updated);
    const result = await schedulerService.sync(updated);

    ui.banner({
      label: 'OpenMeta Automation',
      title: result.status === 'removed' ? 'Automation disabled' : 'Automation disable needs attention',
      subtitle: result.detail,
      lines: ['You can re-enable it later with "openmeta automation enable".'],
      tone: result.status === 'removed' ? 'success' : 'warning',
    });
  }
}

export const automationOrchestrator = new AutomationOrchestrator();
