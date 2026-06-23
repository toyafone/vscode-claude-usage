import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { StatusBarController } from '../statusBarController';
import { TooltipBuilder } from '../tooltipBuilder';
import { ApiUsageSummary, SubscriptionUsageSummary } from '../types';

suite('StatusBarController', () => {
    let fakeItem: {
        text: string;
        tooltip: vscode.MarkdownString | undefined;
        command: string;
        show: sinon.SinonStub;
        dispose: sinon.SinonStub;
    };
    let controller: StatusBarController;
    const tooltipBuilder = new TooltipBuilder();

    const apiSummary: ApiUsageSummary = {
        mode: 'api', todayCostUSD: 1.23, monthCostUSD: 45.67,
        lastUpdated: new Date(),
    };
    const subSummary: SubscriptionUsageSummary = {
        mode: 'subscription',
        fiveHour: { utilization: 10, resetsAt: new Date('2026-06-20T02:39:59') },
        sevenDay: { utilization: 13, resetsAt: new Date('2026-06-23T04:59:59') },
        lastUpdated: new Date(),
    };

    setup(() => {
        fakeItem = { text: '', tooltip: undefined, command: '', show: sinon.stub(), dispose: sinon.stub() };
        sinon.stub(vscode.window, 'createStatusBarItem').returns(fakeItem as any);
        controller = new StatusBarController(vscode.StatusBarAlignment.Right, 100, tooltipBuilder);
    });

    teardown(() => { sinon.restore(); });

    test('update() API mode - text includes today and month costs', () => {
        controller.update(apiSummary);
        assert.ok(fakeItem.text.includes('$1.23'), `text: ${fakeItem.text}`);
        assert.ok(fakeItem.text.includes('$45.67'), `text: ${fakeItem.text}`);
        assert.ok(fakeItem.tooltip !== undefined);
    });

    test('update() Subscription mode - text includes 5h and 7d percentages', () => {
        controller.update(subSummary);
        assert.ok(fakeItem.text.includes('10%'), `text: ${fakeItem.text}`);
        assert.ok(fakeItem.text.includes('13%'), `text: ${fakeItem.text}`);
        assert.ok(fakeItem.tooltip !== undefined);
    });

    test('update() Subscription mode - shows - when sevenDay is null', () => {
        controller.update({ ...subSummary, sevenDay: null });
        assert.ok(fakeItem.text.includes('-'), `text: ${fakeItem.text}`);
    });

    test('setLoading() - text starts with $(sync~spin) and tooltip is cleared', () => {
        controller.setLoading();
        assert.ok(fakeItem.text.includes('$(sync~spin)'), `text: ${fakeItem.text}`);
        assert.strictEqual(fakeItem.tooltip, undefined);
    });

    test('setError() - text starts with $(warning) and tooltip is set', () => {
        controller.setError('Something failed');
        assert.ok(fakeItem.text.includes('$(warning)'), `text: ${fakeItem.text}`);
        assert.ok(fakeItem.tooltip !== undefined);
    });

    test('setNoData() - text contains $(warning) and tooltip is set', () => {
        controller.setNoData('No log files found.');
        assert.ok(fakeItem.text.includes('$(warning)'), `text: ${fakeItem.text}`);
        assert.ok(fakeItem.tooltip !== undefined);
    });

    test('dispose() - calls StatusBarItem.dispose()', () => {
        controller.dispose();
        assert.ok(fakeItem.dispose.calledOnce);
    });
});
