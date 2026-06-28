import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { UsageService, resolveBin } from './usageService';
import { TooltipBuilder } from './tooltipBuilder';
import { UsageController, UsageServiceFactory } from './usageController';

export function activate(
    context: vscode.ExtensionContext,
    _testFactory?: UsageServiceFactory
): void {
    const configManager = new ConfigManager();
    const factory: UsageServiceFactory = _testFactory ?? (() => {
        const bin = resolveBin(configManager.getCcusagePath());
        return new UsageService(bin);
    });

    const controller = new UsageController(configManager, factory, new TooltipBuilder());

    if (configManager.isEnabled()) {
        controller.start();
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('claudeUsage.refresh', () => controller.refresh()),
        vscode.workspace.onDidChangeConfiguration(e => controller.onConfigChange(e)),
        controller
    );
}

export function deactivate() {}
