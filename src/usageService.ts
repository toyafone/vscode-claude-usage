import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import {
    DisplayMode,
    UsageSummary,
    ApiUsageSummary,
    SubscriptionUsageSummary,
    EmptyDataError,
    CredentialsError,
    RateLimitError,
    CcusageNotFoundError,
    ExecFn,
} from './types';
import { readClaudeCredentials } from './credentials';

const execFileAsync = promisify(execFile);

export type TokenProvider = () => Promise<string>;

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export function resolveBin(
    customPath: string,
    existsFn: (p: string) => boolean = fs.existsSync,
    pathDirs: string[] = (process.env.PATH ?? '').split(path.delimiter)
): string {
    if (customPath.trim() !== '') { return customPath.trim(); }
    const name = process.platform === 'win32' ? 'ccusage.cmd' : 'ccusage';
    for (const dir of pathDirs) {
        const candidate = path.join(dir, name);
        if (existsFn(candidate)) { return candidate; }
    }
    return '';
}

interface OAuthUsageWindow {
    utilization: number;
    resets_at: string;
}

interface OAuthUsageResponse {
    five_hour: OAuthUsageWindow | null;
    seven_day: OAuthUsageWindow | null;
}

export class UsageService {
    private readonly bin: string;
    private readonly useShell: boolean;
    private readonly execFn: ExecFn;
    private readonly tokenProvider: TokenProvider;

    constructor(
        bin: string,
        execFn?: ExecFn,
        tokenProvider: TokenProvider = () => readClaudeCredentials()
    ) {
        this.bin = bin;
        this.useShell = process.platform === 'win32' && bin.endsWith('.cmd');
        this.execFn = execFn ?? ((file, args, opts) => execFileAsync(file, args, opts));
        this.tokenProvider = tokenProvider;
    }

    async fetchUsage(mode: DisplayMode): Promise<UsageSummary> {
        if (mode === 'api') {
            return this.fetchApiUsage();
        }
        return this.fetchSubscriptionUsage();
    }

    private async fetchApiUsage(): Promise<ApiUsageSummary> {
        if (!this.bin) {
            throw new CcusageNotFoundError(
                vscode.l10n.t('ccusage not found. Install it with: npm install -g ccusage')
            );
        }
        const [dailyData, monthlyData] = await Promise.all([
            this.runCcusage(['claude', 'daily', '--json']),
            this.runCcusage(['claude', 'monthly', '--json']),
        ]);

        if (dailyData.length === 0 && monthlyData.length === 0) {
            throw new EmptyDataError(
                vscode.l10n.t('No log files found. Claude Code may not have been used yet.')
            );
        }

        const todayStr = new Date().toLocaleDateString('en-CA');
        const todayEntry = dailyData.find((e: any) => e.date === todayStr);
        const monthEntry = monthlyData[monthlyData.length - 1] as any;

        return {
            mode: 'api',
            todayCostUSD: todayEntry?.totalCost ?? 0,
            monthCostUSD: monthEntry?.totalCost ?? 0,
            lastUpdated: new Date(),
        };
    }

    private async fetchSubscriptionUsage(): Promise<SubscriptionUsageSummary> {
        const token = await this.tokenProvider();
        const data = await this.callOAuthApi(token);

        if (!data.five_hour) {
            throw new Error(vscode.l10n.t('No usage data returned from API.'));
        }

        const toWindow = (w: OAuthUsageWindow) => ({ utilization: w.utilization, resetsAt: new Date(w.resets_at) });
        return {
            mode: 'subscription',
            fiveHour: toWindow(data.five_hour),
            sevenDay: data.seven_day ? toWindow(data.seven_day) : null,
            lastUpdated: new Date(),
        };
    }

    private async callOAuthApi(token: string): Promise<OAuthUsageResponse> {
        let response: Response;
        try {
            response = await fetch(OAUTH_USAGE_URL, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'TimeoutError') {
                throw new Error(vscode.l10n.t('Request timed out (10s). Please try again.'));
            }
            throw new Error(vscode.l10n.t('Network error: {0}', String(err instanceof Error ? err.message : err)));
        }

        if (response.status === 401) {
            throw new CredentialsError(
                vscode.l10n.t('Authentication failed. Start Claude Code to refresh it, or run `claude login` again.')
            );
        }
        if (response.status === 429) {
            throw new RateLimitError(
                vscode.l10n.t('Rate limit exceeded. Will retry at next refresh interval.')
            );
        }
        if (!response.ok) {
            throw new Error(
                vscode.l10n.t('API request failed with status {0}.', response.status.toString())
            );
        }

        return response.json() as Promise<OAuthUsageResponse>;
    }

    private async runCcusage(args: string[]): Promise<any[]> {
        let stdout: string;
        try {
            ({ stdout } = await this.execFn(this.bin, args, {
                timeout: 10000,
                shell: this.useShell,
            }));
        } catch (err: any) {
            if (err.killed === true) {
                throw new Error(vscode.l10n.t('ccusage timed out (10s). Please try again.'));
            }
            if (err.code !== undefined && err.code !== null) {
                throw new Error(
                    vscode.l10n.t('Failed to run ccusage. Try: npm install -g ccusage')
                );
            }
            throw new Error(
                vscode.l10n.t(
                    'ccusage exited with an error: {0}',
                    String(err.stderr ?? err.message)
                )
            );
        }

        try {
            const parsed: unknown = JSON.parse(stdout);
            if (Array.isArray(parsed)) { return parsed; }
            const key = args[1] as string;
            const arr = (parsed as Record<string, unknown>)[key];
            return Array.isArray(arr) ? arr : [];
        } catch (e: any) {
            throw new Error(
                vscode.l10n.t('Failed to parse ccusage output: {0}', e.message)
            );
        }
    }
}
