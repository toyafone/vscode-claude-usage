import * as assert from 'assert';
import * as sinon from 'sinon';
import { UsageService, resolveBin } from '../usageService';
import { ApiUsageSummary, SubscriptionUsageSummary, EmptyDataError, CredentialsError, RateLimitError, CcusageNotFoundError } from '../types';

const FAKE_BIN = '/fake/bin/ccusage';
const FAKE_TOKEN = 'sk-ant-oat01-fake';
const FAKE_CREDS = JSON.stringify({ claudeAiOauth: { accessToken: FAKE_TOKEN } });
const RESET_5H = '2026-06-20T02:39:59.000Z';
const RESET_7D = '2026-06-23T04:59:59.000Z';
// The execStub in these tests serves ccusage. Pin the platform so that credential
// reads never reach `security`, even when the tests run on macOS.
const LINUX = { platform: 'linux' as const, env: {}, homedir: '/home/tester' };

suite('UsageService', () => {
    let execStub: sinon.SinonStub;
    let service: UsageService;

    setup(() => {
        execStub = sinon.stub();
        service = new UsageService(FAKE_BIN, execStub as any);
    });

    teardown(() => { sinon.restore(); });

    const todayStr = new Date().toLocaleDateString('en-CA');

    function stubDaily(data: unknown[]): void {
        execStub
            .withArgs(sinon.match.string, ['claude', 'daily', '--json'], sinon.match.any)
            .resolves({ stdout: JSON.stringify(data) });
    }
    function stubMonthly(data: unknown[]): void {
        execStub
            .withArgs(sinon.match.string, ['claude', 'monthly', '--json'], sinon.match.any)
            .resolves({ stdout: JSON.stringify(data) });
    }

    suite('API mode', () => {
        test("today entry found → todayCostUSD reflects totalCost", async () => {
            stubDaily([{ date: todayStr, totalCost: 1.23 }]);
            stubMonthly([{ totalCost: 5.0 }]);
            const r = await service.fetchUsage('api') as ApiUsageSummary;
            assert.strictEqual(r.todayCostUSD, 1.23);
        });

        test("monthly last entry → monthCostUSD reflects totalCost", async () => {
            stubDaily([{ date: todayStr, totalCost: 0 }]);
            stubMonthly([{ totalCost: 3.0 }, { totalCost: 5.0 }]);
            const r = await service.fetchUsage('api') as ApiUsageSummary;
            assert.strictEqual(r.monthCostUSD, 5.0);
        });

        test("no today entry → todayCostUSD is 0", async () => {
            stubDaily([{ date: '2000-01-01', totalCost: 9.99 }]);
            stubMonthly([{ totalCost: 2.0 }]);
            const r = await service.fetchUsage('api') as ApiUsageSummary;
            assert.strictEqual(r.todayCostUSD, 0);
        });

        test("both daily and monthly empty → throws EmptyDataError", async () => {
            stubDaily([]);
            stubMonthly([]);
            await assert.rejects(service.fetchUsage('api'), EmptyDataError);
        });

        test("timeout → throws with timed out message", async () => {
            execStub.rejects(Object.assign(new Error('timeout'), { killed: true }));
            await assert.rejects(
                service.fetchUsage('api'),
                (err: Error) => err.message.includes('timed out')
            );
        });

        test("startup failure → throws with npm install message", async () => {
            execStub.rejects(Object.assign(new Error('not found'), { code: 'ENOENT' }));
            await assert.rejects(
                service.fetchUsage('api'),
                (err: Error) => err.message.includes('npm install')
            );
        });

        test("empty bin → throws CcusageNotFoundError", async () => {
            const svc = new UsageService('', execStub as any);
            await assert.rejects(svc.fetchUsage('api'), CcusageNotFoundError);
        });
    });

    suite('Subscription mode', () => {
        let fetchStub: sinon.SinonStub;

        setup(() => {
            service = new UsageService(FAKE_BIN, execStub as any, () => FAKE_CREDS, LINUX);
            fetchStub = sinon.stub(globalThis, 'fetch');
        });

        function stubOk(data: object): void {
            fetchStub.resolves({ ok: true, status: 200, json: async () => data } as Response);
        }

        test("returns fiveHour utilization from API", async () => {
            stubOk({ five_hour: { utilization: 10, resets_at: RESET_5H }, seven_day: null });
            const r = await service.fetchUsage('subscription') as SubscriptionUsageSummary;
            assert.strictEqual(r.fiveHour.utilization, 10);
            assert.ok(r.fiveHour.resetsAt instanceof Date);
        });

        test("returns sevenDay when present", async () => {
            stubOk({
                five_hour: { utilization: 10, resets_at: RESET_5H },
                seven_day: { utilization: 13, resets_at: RESET_7D },
            });
            const r = await service.fetchUsage('subscription') as SubscriptionUsageSummary;
            assert.strictEqual(r.sevenDay?.utilization, 13);
        });

        test("sevenDay is null when API returns null", async () => {
            stubOk({ five_hour: { utilization: 5, resets_at: RESET_5H }, seven_day: null });
            const r = await service.fetchUsage('subscription') as SubscriptionUsageSummary;
            assert.strictEqual(r.sevenDay, null);
        });

        test("missing credentials → throws CredentialsError", async () => {
            service = new UsageService(FAKE_BIN, execStub as any, () => { throw new Error('ENOENT'); }, LINUX);
            await assert.rejects(service.fetchUsage('subscription'), CredentialsError);
        });

        test("401 response → throws CredentialsError with the refresh hint, no retry", async () => {
            fetchStub.resolves({ ok: false, status: 401, json: async () => ({}) } as Response);
            await assert.rejects(
                service.fetchUsage('subscription'),
                (err: Error) => err instanceof CredentialsError && err.message.includes('Start Claude Code')
            );
            assert.strictEqual(fetchStub.callCount, 1);
        });

        test("credentials unavailable → API is not called, error propagates", async () => {
            service = new UsageService(FAKE_BIN, execStub as any, () => { throw new Error('ENOENT'); }, LINUX);
            await assert.rejects(service.fetchUsage('subscription'), CredentialsError);
            assert.ok(fetchStub.notCalled);
        });

        test("calls the API with the Bearer token read from credentials", async () => {
            stubOk({ five_hour: { utilization: 7, resets_at: RESET_5H }, seven_day: null });
            const r = await service.fetchUsage('subscription') as SubscriptionUsageSummary;
            assert.strictEqual(r.fiveHour.utilization, 7);
            const headers = fetchStub.firstCall.args[1].headers as Record<string, string>;
            assert.strictEqual(headers['Authorization'], `Bearer ${FAKE_TOKEN}`);
        });

        test("network timeout → throws with timed out message", async () => {
            fetchStub.rejects(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
            await assert.rejects(
                service.fetchUsage('subscription'),
                (err: Error) => err.message.includes('timed out')
            );
        });

        test("429 response → throws RateLimitError", async () => {
            fetchStub.resolves({ ok: false, status: 429, json: async () => ({}) } as Response);
            await assert.rejects(service.fetchUsage('subscription'), RateLimitError);
        });

        test("500 response → throws Error containing status code", async () => {
            fetchStub.resolves({ ok: false, status: 500, json: async () => ({}) } as Response);
            await assert.rejects(
                service.fetchUsage('subscription'),
                (err: Error) => err.message.includes('500')
            );
        });

        test("non-timeout network error → throws containing 'Network error'", async () => {
            fetchStub.rejects(new Error('ECONNRESET'));
            await assert.rejects(
                service.fetchUsage('subscription'),
                (err: Error) => err.message.includes('Network error')
            );
        });

        test("empty bin → subscription mode still succeeds", async () => {
            const svc = new UsageService('', execStub as any, () => FAKE_CREDS, LINUX);
            stubOk({ five_hour: { utilization: 20, resets_at: RESET_5H }, seven_day: null });
            const r = await svc.fetchUsage('subscription') as SubscriptionUsageSummary;
            assert.strictEqual(r.fiveHour.utilization, 20);
        });
    });

    suite('runCcusage parsing', () => {
        const todayStr = new Date().toLocaleDateString('en-CA');

        test("stdout is a JSON object with array at key → extracts the array", async () => {
            execStub
                .withArgs(sinon.match.string, ['claude', 'daily', '--json'], sinon.match.any)
                .resolves({ stdout: JSON.stringify({ daily: [{ date: todayStr, totalCost: 1.5 }] }) });
            execStub
                .withArgs(sinon.match.string, ['claude', 'monthly', '--json'], sinon.match.any)
                .resolves({ stdout: JSON.stringify([{ totalCost: 0 }]) });
            const r = await service.fetchUsage('api') as ApiUsageSummary;
            assert.strictEqual(r.todayCostUSD, 1.5);
        });

        test("stdout is invalid JSON → throws containing 'Failed to parse'", async () => {
            execStub
                .withArgs(sinon.match.string, ['claude', 'daily', '--json'], sinon.match.any)
                .resolves({ stdout: 'not-json{{' });
            execStub
                .withArgs(sinon.match.string, ['claude', 'monthly', '--json'], sinon.match.any)
                .resolves({ stdout: '[]' });
            await assert.rejects(
                service.fetchUsage('api'),
                (err: Error) => err.message.includes('Failed to parse')
            );
        });
    });

    suite('resolveBin', () => {
        test('custom path is returned as-is', () => {
            assert.strictEqual(resolveBin('/usr/local/bin/ccusage', () => true), '/usr/local/bin/ccusage');
        });

        test('custom path with whitespace is trimmed', () => {
            assert.strictEqual(resolveBin('  /usr/local/bin/ccusage  ', () => true), '/usr/local/bin/ccusage');
        });

        test('empty custom path → scans PATH dirs', () => {
            const result = resolveBin('', () => true, ['/usr/local/bin']);
            assert.ok(result.endsWith(process.platform === 'win32' ? 'ccusage.cmd' : 'ccusage'));
            assert.ok(result.includes('usr'));
        });

        test('nothing found in PATH → returns empty string', () => {
            assert.strictEqual(resolveBin('', () => false, ['/usr/local/bin']), '');
        });
    });
});
