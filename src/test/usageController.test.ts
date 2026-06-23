import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { UsageService } from '../usageService';
import { UsageController, UsageServiceFactory } from '../usageController';
import { TooltipBuilder } from '../tooltipBuilder';
import { ConfigManager } from '../configManager';
import { CredentialsError, RateLimitError, CcusageNotFoundError } from '../types';

const FAKE_BIN = '/fake/bin/ccusage';

suite('UsageController', () => {
    let execStub: sinon.SinonStub;
    let configGetStub: sinon.SinonStub;
    let fakeItem: {
        text: string;
        tooltip: vscode.MarkdownString | undefined;
        command: string;
        show: sinon.SinonStub;
        dispose: sinon.SinonStub;
    };
    let clock: sinon.SinonFakeTimers;

    setup(() => {
        clock = sinon.useFakeTimers();
        execStub = sinon.stub();
        fakeItem = { text: '', tooltip: undefined, command: '', show: sinon.stub(), dispose: sinon.stub() };
        sinon.stub(vscode.window, 'createStatusBarItem').returns(fakeItem as any);
        configGetStub = sinon.stub();
        sinon.stub(vscode.workspace, 'getConfiguration').returns({ get: configGetStub } as any);
        configGetStub.callsFake((_: string, def: unknown) => def);
    });

    teardown(() => {
        clock.restore();
        sinon.restore();
    });

    function makeController(
        factory: UsageServiceFactory = () => new UsageService(FAKE_BIN, execStub as any)
    ): UsageController {
        return new UsageController(new ConfigManager(), factory, new TooltipBuilder());
    }

    async function drainMicrotasks(n = 5): Promise<void> {
        for (let i = 0; i < n; i++) { await Promise.resolve(); }
    }

    test('enabled:false on startup → createStatusBarItem not called', () => {
        configGetStub.withArgs('enabled', true).returns(false);
        const controller = makeController();
        // start() is not called when isEnabled() is false (as activate() does)
        assert.ok((vscode.window.createStatusBarItem as sinon.SinonStub).notCalled,
            'createStatusBarItem should not be called');
        assert.ok(fakeItem.show.notCalled, 'show() should not be called');
        controller.dispose();
    });

    test('config change enabled→false → calls dispose()', async () => {
        execStub.resolves({ stdout: '[]' });
        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        configGetStub.withArgs('enabled', true).returns(false);
        const event = { affectsConfiguration: (k: string) => k === 'claudeUsage' };
        controller.onConfigChange(event as any);

        assert.ok(fakeItem.dispose.calledOnce, 'dispose() should be called');
        controller.dispose();
    });

    test('config change statusBarAlignment → disposes old item and shows new item', async () => {
        execStub.resolves({ stdout: '[]' });

        const fakeItem2 = { text: '', tooltip: undefined, command: '', show: sinon.stub(), dispose: sinon.stub() };
        const items = [fakeItem, fakeItem2];
        let createCount = 0;
        (vscode.window.createStatusBarItem as sinon.SinonStub).callsFake(() => items[createCount++] as any);

        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const event = {
            affectsConfiguration: (k: string) => k === 'claudeUsage' || k === 'claudeUsage.statusBarAlignment',
        };
        controller.onConfigChange(event as any);

        assert.ok(fakeItem.dispose.calledOnce, 'old item dispose() should be called');
        assert.ok(fakeItem2.show.calledOnce, 'new item show() should be called');
        controller.dispose();
    });

    test('config change statusBarPriority → disposes old item and shows new item', async () => {
        execStub.resolves({ stdout: '[]' });

        const fakeItem2 = { text: '', tooltip: undefined, command: '', show: sinon.stub(), dispose: sinon.stub() };
        const items = [fakeItem, fakeItem2];
        let createCount = 0;
        (vscode.window.createStatusBarItem as sinon.SinonStub).callsFake(() => items[createCount++] as any);

        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const event = {
            affectsConfiguration: (k: string) => k === 'claudeUsage' || k === 'claudeUsage.statusBarPriority',
        };
        controller.onConfigChange(event as any);

        assert.ok(fakeItem.dispose.calledOnce, 'old item dispose() should be called');
        assert.ok(fakeItem2.show.calledOnce, 'new item show() should be called');
        controller.dispose();
    });

    test('config change refreshIntervalSeconds → triggers a fetch', async () => {
        execStub.resolves({ stdout: '[]' });
        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const callsBefore = execStub.callCount;
        const event = {
            affectsConfiguration: (k: string) => k === 'claudeUsage' || k === 'claudeUsage.refreshIntervalSeconds',
        };
        controller.onConfigChange(event as any);
        await drainMicrotasks();

        assert.ok(execStub.callCount > callsBefore, 'fetch should run after refreshIntervalSeconds change');
        controller.dispose();
    });

    test('refresh() → triggers a fetch', async () => {
        execStub.resolves({ stdout: '[]' });
        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const callsBefore = execStub.callCount;
        await controller.refresh();

        assert.ok(execStub.callCount > callsBefore, 'fetch should run after refresh()');
        controller.dispose();
    });

    test('transient error → retries after 3000ms', async () => {
        const fetchUsageStub = sinon.stub(UsageService.prototype, 'fetchUsage');
        fetchUsageStub.onFirstCall().rejects(new Error('ECONNRESET'));
        fetchUsageStub.resolves({ mode: 'api', todayCostUSD: 0, monthCostUSD: 0, lastUpdated: new Date() } as any);

        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const callsBefore = fetchUsageStub.callCount;
        await clock.tickAsync(3000);
        await drainMicrotasks();

        assert.ok(fetchUsageStub.callCount > callsBefore, 'fetchUsage should be called again after 3000ms');
        controller.dispose();
    });

    test('CredentialsError on first attempt → retries once after 3000ms', async () => {
        const fetchUsageStub = sinon.stub(UsageService.prototype, 'fetchUsage');
        fetchUsageStub.onFirstCall().rejects(new CredentialsError('bad creds'));
        fetchUsageStub.resolves({ mode: 'api', todayCostUSD: 0, monthCostUSD: 0, lastUpdated: new Date() } as any);

        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const callsBefore = fetchUsageStub.callCount;
        await clock.tickAsync(3000);
        await drainMicrotasks();

        assert.ok(fetchUsageStub.callCount > callsBefore,
            'fetchUsage should be called again after CredentialsError on first attempt');
        controller.dispose();
    });

    test('CredentialsError on second attempt → no further retry', async () => {
        const fetchUsageStub = sinon.stub(UsageService.prototype, 'fetchUsage')
            .rejects(new CredentialsError('bad creds'));

        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        await clock.tickAsync(3000);
        await drainMicrotasks();

        const callsBefore = fetchUsageStub.callCount;
        await clock.tickAsync(30000);
        await drainMicrotasks();

        assert.strictEqual(fetchUsageStub.callCount, callsBefore,
            'fetchUsage should NOT be called again after CredentialsError on second attempt');
        controller.dispose();
    });

    test('RateLimitError → no retry', async () => {
        const fetchUsageStub = sinon.stub(UsageService.prototype, 'fetchUsage')
            .rejects(new RateLimitError('rate limited'));

        const controller = makeController();
        controller.start();
        await drainMicrotasks();

        const callsBefore = fetchUsageStub.callCount;
        await clock.tickAsync(30000);
        await drainMicrotasks();

        assert.strictEqual(fetchUsageStub.callCount, callsBefore,
            'fetchUsage should NOT be called again after RateLimitError');
        controller.dispose();
    });

    test('ccusage not found → sets error state and shows notification once', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined as any);
        const factory: UsageServiceFactory = () => { throw new CcusageNotFoundError('not found'); };

        const controller = makeController(factory);
        controller.start();
        await drainMicrotasks();

        assert.ok(fakeItem.text.includes('$(warning)'), `status bar should show error: ${fakeItem.text}`);
        assert.ok(showWarningStub.calledOnce, 'notification should be shown once');
        controller.dispose();
    });

    test('ccusage not found → notification not shown again on second fetch', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined as any);
        const factory: UsageServiceFactory = () => { throw new CcusageNotFoundError('not found'); };

        const controller = makeController(factory);
        controller.start();
        await drainMicrotasks();

        await controller.refresh();
        await drainMicrotasks();

        assert.strictEqual(showWarningStub.callCount, 1, 'notification should only appear once');
        controller.dispose();
    });

    test('ccusage not found → Install button opens terminal with npm command', async () => {
        const installLabel = vscode.l10n.t('Install');
        sinon.stub(vscode.window, 'showWarningMessage').resolves(installLabel as any);
        const fakeTerminal = { show: sinon.stub(), sendText: sinon.stub() };
        sinon.stub(vscode.window, 'createTerminal').returns(fakeTerminal as any);
        const factory: UsageServiceFactory = () => { throw new CcusageNotFoundError('not found'); };

        const controller = makeController(factory);
        controller.start();
        await drainMicrotasks();
        await Promise.resolve(); // let the .then() on showWarningMessage run

        assert.ok((vscode.window.createTerminal as sinon.SinonStub).calledOnce, 'terminal should be created');
        assert.ok(fakeTerminal.sendText.calledWithMatch('npm install -g ccusage'), 'npm install command should be sent');
        controller.dispose();
    });

    test('ccusage not found → Set Path button opens settings', async () => {
        const setPathLabel = vscode.l10n.t('Set Path');
        sinon.stub(vscode.window, 'showWarningMessage').resolves(setPathLabel as any);
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const factory: UsageServiceFactory = () => { throw new CcusageNotFoundError('not found'); };

        const controller = makeController(factory);
        controller.start();
        await drainMicrotasks();
        await Promise.resolve();

        assert.ok(
            executeCommandStub.calledWith('workbench.action.openSettings', 'claudeUsage.ccusagePath'),
            'settings should open focused on ccusagePath'
        );
        controller.dispose();
    });

    test('ccusagePath config change → invalidates service and resets notification flag', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined as any);
        const factory: UsageServiceFactory = () => { throw new CcusageNotFoundError('not found'); };

        const controller = makeController(factory);
        controller.start();
        await drainMicrotasks();
        assert.strictEqual(showWarningStub.callCount, 1, 'first notification shown');

        const event = {
            affectsConfiguration: (k: string) =>
                k === 'claudeUsage' || k === 'claudeUsage.ccusagePath',
        };
        controller.onConfigChange(event as any);
        await drainMicrotasks();

        assert.strictEqual(showWarningStub.callCount, 2, 'notification should show again after ccusagePath changes');
        controller.dispose();
    });
});
