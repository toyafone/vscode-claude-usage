export type DisplayMode = 'api' | 'subscription';

export interface ApiUsageSummary {
    mode: 'api';
    todayCostUSD: number;
    monthCostUSD: number;
    lastUpdated: Date;
}

export interface WindowUsage {
    utilization: number; // 0–100
    resetsAt: Date;
}

export interface SubscriptionUsageSummary {
    mode: 'subscription';
    fiveHour: WindowUsage;
    sevenDay: WindowUsage | null;
    lastUpdated: Date;
}

export type UsageSummary = ApiUsageSummary | SubscriptionUsageSummary;

export class EmptyDataError extends Error {}
export class CredentialsError extends Error {}
export class KeychainAccessError extends CredentialsError {}
export class RateLimitError extends Error {}
export class CcusageNotFoundError extends Error {}

export type ExecFn = (
    file: string,
    args: string[],
    opts: object
) => Promise<{ stdout: string }>;
