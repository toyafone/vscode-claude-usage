import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { UsageService } from './usageService';
import { StatusBarController } from './statusBarController';
import { TooltipBuilder } from './tooltipBuilder';
import { EmptyDataError, CredentialsError, RateLimitError, CcusageNotFoundError } from './types';

const RETRY_DELAYS_MS = [3000, 10000, 30000];

function isTransientError(err: unknown): boolean {
    return !(err instanceof EmptyDataError) &&
           !(err instanceof CredentialsError) &&
           !(err instanceof RateLimitError);
}

export type UsageServiceFactory = () => UsageService;

export class UsageController implements vscode.Disposable {
    private usageService: UsageService | null = null;
    private statusBarController: StatusBarController | null = null;
    private timerId: ReturnType<typeof setInterval> | null = null;
    private retryTimerId: ReturnType<typeof setTimeout> | null = null;
    private notifiedNotFound = false;

    constructor(
        private readonly configManager: ConfigManager,
        private readonly factory: UsageServiceFactory,
        private readonly tooltipBuilder: TooltipBuilder
    ) {}

    start(): void {
        this.statusBarController = this.createStatusBarController();
        this.statusBarController.setLoading();
        this.statusBarController.show();
        this.fetchAndUpdate();
        this.startTimer();
    }

    async refresh(): Promise<void> {
        if (!this.statusBarController) { return; }
        this.statusBarController.setLoading();
        await this.fetchAndUpdate();
    }

    onConfigChange(event: vscode.ConfigurationChangeEvent): void {
        if (!event.affectsConfiguration('claudeUsage')) { return; }

        if (event.affectsConfiguration('claudeUsage.ccusagePath')) {
            this.invalidateService();
            this.notifiedNotFound = false;
        }

        if (!this.configManager.isEnabled()) {
            this.statusBarController?.dispose();
            this.statusBarController = null;
            this.stopTimer();
            this.stopRetryTimer();
            return;
        }

        const needsRecreate =
            event.affectsConfiguration('claudeUsage.statusBarAlignment') ||
            event.affectsConfiguration('claudeUsage.statusBarPriority');

        if (needsRecreate) {
            this.statusBarController?.dispose();
            this.statusBarController = this.createStatusBarController();
            this.statusBarController.show();
        }

        if (event.affectsConfiguration('claudeUsage.refreshIntervalSeconds')) {
            this.startTimer();
        }

        this.statusBarController!.setLoading();
        this.fetchAndUpdate();
    }

    dispose(): void {
        this.statusBarController?.dispose();
        this.stopTimer();
        this.stopRetryTimer();
    }

    private getOrCreateService(): UsageService {
        if (!this.usageService) {
            this.usageService = this.factory();
        }
        return this.usageService;
    }

    private invalidateService(): void {
        this.usageService = null;
    }

    private async fetchAndUpdate(retryIndex = 0): Promise<void> {
        if (!this.statusBarController) { return; }
        this.stopRetryTimer();

        const service = this.getOrCreateService();

        try {
            const summary = await service.fetchUsage(this.configManager.getDisplayMode());
            this.statusBarController.update(summary);
        } catch (err: unknown) {
            if (err instanceof EmptyDataError) {
                this.statusBarController.setNoData(err.message);
            } else if (err instanceof CcusageNotFoundError) {
                this.statusBarController.setError(vscode.l10n.t('ccusage not found'));
                if (!this.notifiedNotFound) {
                    this.notifiedNotFound = true;
                    this.showCcusageNotFoundNotification();
                }
            } else {
                this.statusBarController.setError(
                    err instanceof Error ? err.message : String(err)
                );
                const retryable = isTransientError(err) ||
                    (err instanceof CredentialsError && retryIndex === 0);
                if (retryable && retryIndex < RETRY_DELAYS_MS.length) {
                    this.retryTimerId = setTimeout(
                        () => this.fetchAndUpdate(retryIndex + 1),
                        RETRY_DELAYS_MS[retryIndex]
                    );
                }
            }
        }
    }

    private startTimer(): void {
        this.stopTimer();
        this.timerId = setInterval(
            () => this.fetchAndUpdate(),
            this.configManager.getRefreshInterval() * 1000
        );
    }

    private stopTimer(): void {
        if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    }

    private stopRetryTimer(): void {
        if (this.retryTimerId !== null) { clearTimeout(this.retryTimerId); this.retryTimerId = null; }
    }

    private createStatusBarController(): StatusBarController {
        const alignment = this.configManager.getAlignment() === 'left'
            ? vscode.StatusBarAlignment.Left
            : vscode.StatusBarAlignment.Right;
        return new StatusBarController(
            alignment,
            this.configManager.getPriority(),
            this.tooltipBuilder
        );
    }

    private showCcusageNotFoundNotification(): void {
        const installLabel = vscode.l10n.t('Install');
        const setPathLabel = vscode.l10n.t('Set Path');
        vscode.window.showWarningMessage(
            vscode.l10n.t('ccusage not found. Install it with: npm install -g ccusage'),
            installLabel,
            setPathLabel,
            vscode.l10n.t('Dismiss')
        ).then(selection => {
            if (selection === installLabel) {
                const terminal = vscode.window.createTerminal('ccusage install');
                terminal.show();
                terminal.sendText('npm install -g ccusage');
            } else if (selection === setPathLabel) {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'claudeUsage.ccusagePath'
                );
            }
        });
    }
}
