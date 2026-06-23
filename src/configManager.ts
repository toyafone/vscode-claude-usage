import * as vscode from 'vscode';
import { DisplayMode } from './types';

export class ConfigManager {
    private get config() {
        return vscode.workspace.getConfiguration('claudeUsage');
    }

    getDisplayMode(): DisplayMode {
        return this.config.get<DisplayMode>('displayMode', 'api');
    }

    getRefreshInterval(): number {
        return this.config.get<number>('refreshIntervalSeconds', 60);
    }

    getAlignment(): 'left' | 'right' {
        return this.config.get<'left' | 'right'>('statusBarAlignment', 'right');
    }

    getPriority(): number {
        return this.config.get<number>('statusBarPriority', 100);
    }

    isEnabled(): boolean {
        return this.config.get<boolean>('enabled', true);
    }

    getCcusagePath(): string {
        return this.config.get<string>('ccusagePath', '');
    }
}
