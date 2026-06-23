import * as vscode from 'vscode';
import { UsageSummary } from './types';
import { TooltipBuilder } from './tooltipBuilder';

const ICON = '✻';

export class StatusBarController {
    private readonly item: vscode.StatusBarItem;

    constructor(
        alignment: vscode.StatusBarAlignment,
        priority: number,
        private readonly tooltipBuilder: TooltipBuilder
    ) {
        this.item = vscode.window.createStatusBarItem(alignment, priority);
        this.item.command = 'claudeUsage.refresh';
    }

    show(): void {
        this.item.show();
    }

    update(summary: UsageSummary): void {
        if (summary.mode === 'api') {
            const today = `$${summary.todayCostUSD.toFixed(2)}`;
            const month = `$${summary.monthCostUSD.toFixed(2)}`;
            this.item.text = `${ICON} ` + vscode.l10n.t('Today: {0}  Month: {1}', today, month);
        } else {
            const fiveH = `${Math.round(summary.fiveHour.utilization)}%`;
            const sevenD = summary.sevenDay ? `${Math.round(summary.sevenDay.utilization)}%` : '-';
            this.item.text = `${ICON} ` + vscode.l10n.t('5h: {0}  7d: {1}', fiveH, sevenD);
        }
        this.item.tooltip = this.tooltipBuilder.build(summary);
    }

    setLoading(): void {
        this.item.text = `${ICON} $(sync~spin) ` + vscode.l10n.t('Loading...');
        this.item.tooltip = undefined;
    }

    setError(message: string): void {
        this.item.text =
            `${ICON} $(warning) ` + vscode.l10n.t('Claude Usage Live') + ': ' + vscode.l10n.t('Error');
        this.item.tooltip = this.tooltipBuilder.buildError(message);
    }

    setNoData(message: string): void {
        this.item.text = `${ICON} $(warning) ` + vscode.l10n.t('No Usage Data');
        this.item.tooltip = this.tooltipBuilder.buildError(message);
    }

    dispose(): void {
        this.item.dispose();
    }
}
