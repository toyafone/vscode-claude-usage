import * as vscode from 'vscode';
import { UsageSummary } from './types';

function formatTimeUntil(date: Date): string {
    const minutes = Math.max(0, Math.floor((date.getTime() - Date.now()) / 60000));
    if (minutes < 60) { return `${minutes}m`; }
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export class TooltipBuilder {
    build(summary: UsageSummary): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;

        md.appendMarkdown(`**${vscode.l10n.t('Claude Usage Live')}**\n\n---\n\n`);

        if (summary.mode === 'api') {
            md.appendMarkdown(
                `$(calendar) ${vscode.l10n.t("Today's cost")} \`$${summary.todayCostUSD.toFixed(2)}\`\n\n`
            );
            md.appendMarkdown(
                `$(graph) ${vscode.l10n.t("This month's cost")} \`$${summary.monthCostUSD.toFixed(2)}\`\n\n`
            );
        } else {
            const windowLine = (icon: string, label: string, utilization: number, resetsAt: Date) =>
                `$(${icon}) ${label} \`${Math.round(utilization)}%\`  \n${vscode.l10n.t('Resets in')} ${formatTimeUntil(resetsAt)}\n\n`;
            md.appendMarkdown(windowLine('watch', vscode.l10n.t('5h window'), summary.fiveHour.utilization, summary.fiveHour.resetsAt));
            if (summary.sevenDay) {
                md.appendMarkdown(windowLine('calendar', vscode.l10n.t('7d window'), summary.sevenDay.utilization, summary.sevenDay.resetsAt));
            }
        }

        const timeStr = summary.lastUpdated.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        md.appendMarkdown(`$(clock) ${vscode.l10n.t('Last updated')} ${timeStr}`);

        return md;
    }

    buildError(message: string): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.appendMarkdown(`$(warning) ${message}`);
        return md;
    }
}
