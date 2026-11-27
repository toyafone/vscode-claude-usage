import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { UsageService } from '../usageService';
import { StatusBarController } from '../statusBarController';
import { TooltipBuilder } from '../tooltipBuilder';
import { ConfigManager } from '../configManager';
import { EmptyDataError } from '../types';
import { activate } from '../extension';

const TODAY = new Date().toLocaleDateString('en-CA');
const RESET_5H = '2026-06-20T02:39:59.000Z';
const RESET_7D = '2026-06-23T04:59:59.000Z';

suite('Integration', () => {
    let execStub: sinon.SinonStub;
    let configGetStub: sinon.SinonStub;
    let fakeItem: {
        text: string;
        tooltip: vscode.MarkdownString | undefined;
        command: string;
        show: sinon.SinonStub;
        dispose: sinon.SinonStub;
    };

    setup(() => {
        execStub = sinon.stub();
        fakeItem = { text: '', tooltip: undefined, command: '', show: sinon.stub(), dispose: sinon.stub() };
        sinon.stub(vscode.window, 'createStatusBarItem').returns(fakeItem as any);
        configGetStub = sinon.stub();
        sinon.stub(vscode.workspace, 'getConfiguration').returns({ get: configGetStub } as any);
        configGetStub.callsFake((_: string, def: unknown) => def);
    });

    teardown(() => { sinon.restore(); });

    function makeContext(): vscode.ExtensionContext {
        return { subscriptions: [] } as any;
    }

    async function runPipeline(mode: 'api' | 'subscription', tokenProvider?: () => Promise<string>): Promise<{ text: string; tooltip: vscode.MarkdownString | undefined }> {
        configGetStub.withArgs('displayMode', 'api').returns(mode);
        const service = new UsageService('/fake/bin', execStub as any, tokenProvider);
        const controller = new StatusBarController(vscode.StatusBarAlignment.Right, 100, new TooltipBuilder());
        try {
            const summary = await service.fetchUsage(new ConfigManager().getDisplayMode());
            controller.update(summary);
        } catch (err) {
            if (err instanceof EmptyDataError) { controller.setNoData(err.message); }
            else { controller.setError(err instanceof Error ? err.message : String(err)); }
        }
        return { text: fakeItem.text, tooltip: fakeItem.tooltip };
    }

    function stubApi(todayCost: number, monthCost: number) {
        execStub.withArgs(sinon.match.string, ['claude', 'daily', '--json'], sinon.match.any)
            .resolves({ stdout: JSON.stringify([{ date: TODAY, totalCost: todayCost }]) });
        execStub.withArgs(sinon.match.string, ['claude', 'monthly', '--json'], sinon.match.any)
            .resolves({ stdout: JSON.stringify([{ month: '2026-06', totalCost: monthCost }]) });
    }

    test('activate - status bar is shown in loading state', () => {
        sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: sinon.stub() } as any);
        sinon.stub(vscode.workspace, 'onDidChangeConfiguration').returns({ dispose: sinon.stub() } as any);
        execStub.resolves({ stdout: '[]' });
        activate(makeContext(), () => new UsageService('/fake/bin', execStub as any));
        assert.ok(fakeItem.show.calledOnce, 'show() should be called');
        assert.ok(fakeItem.text.includes('$(sync~spin)'), `text: ${fakeItem.text}`);
    });

    test('API mode - status bar shows Today/Month costs', async () => {
        stubApi(1.23, 45.67);
        const { text } = await runPipeline('api');
        assert.ok(text.includes('$1.23'), `text: ${text}`);
        assert.ok(text.includes('$45.67'), `text: ${text}`);
    });

    test('Subscription mode - status bar shows 5h/7d utilization', async () => {
        sinon.stub(globalThis, 'fetch').resolves({
            ok: true, status: 200,
            json: async () => ({
                five_hour: { utilization: 10, resets_at: RESET_5H },
                seven_day: { utilization: 13, resets_at: RESET_7D },
            }),
        } as Response);
        const { text } = await runPipeline('subscription', () => Promise.resolve('sk-ant-oat01-fake'));
        assert.ok(text.includes('10%'), `text: ${text}`);
        assert.ok(text.includes('13%'), `text: ${text}`);
    });

    test('No usage data - shows warning and No Usage Data text', async () => {
        execStub.resolves({ stdout: '[]' });
        const { text } = await runPipeline('api');
        assert.ok(text.includes('$(warning)'), `text: ${text}`);
        assert.ok(text.includes('No Usage Data'), `text: ${text}`);
    });

    test('ccusage failure - shows error state', async () => {
        execStub.rejects(Object.assign(new Error('not found'), { code: 1 }));
        const { text } = await runPipeline('api');
        assert.ok(text.includes('$(warning)'), `text: ${text}`);
        assert.ok(text.includes('Error'), `text: ${text}`);
    });

    test('Tooltip - API mode contains calendar icon and costs', async () => {
        stubApi(1.23, 45.67);
        const { tooltip } = await runPipeline('api');
        assert.ok(tooltip instanceof vscode.MarkdownString);
        assert.ok((tooltip as vscode.MarkdownString).value.includes('$(calendar)'));
        assert.ok((tooltip as vscode.MarkdownString).value.includes('$1.23'));
    });
});
