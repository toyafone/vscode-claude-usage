import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigManager } from '../configManager';

suite('ConfigManager', () => {
    let configGetStub: sinon.SinonStub;

    setup(() => {
        configGetStub = sinon.stub();
        sinon.stub(vscode.workspace, 'getConfiguration').returns({ get: configGetStub } as any);
    });

    teardown(() => { sinon.restore(); });

    suite('default values', () => {
        setup(() => {
            configGetStub.callsFake((_key: string, defaultValue: unknown) => defaultValue);
        });

        test('getDisplayMode() returns "api"', () => {
            assert.strictEqual(new ConfigManager().getDisplayMode(), 'api');
        });
        test('getRefreshInterval() returns 60', () => {
            assert.strictEqual(new ConfigManager().getRefreshInterval(), 60);
        });
        test('getAlignment() returns "right"', () => {
            assert.strictEqual(new ConfigManager().getAlignment(), 'right');
        });
        test('getPriority() returns 100', () => {
            assert.strictEqual(new ConfigManager().getPriority(), 100);
        });
        test('isEnabled() returns true', () => {
            assert.strictEqual(new ConfigManager().isEnabled(), true);
        });
        test('getCcusagePath() returns empty string', () => {
            assert.strictEqual(new ConfigManager().getCcusagePath(), '');
        });
    });

    suite('custom values', () => {
        test('getDisplayMode() returns configured value', () => {
            configGetStub.withArgs('displayMode', 'api').returns('subscription');
            assert.strictEqual(new ConfigManager().getDisplayMode(), 'subscription');
        });
        test('getRefreshInterval() returns configured value', () => {
            configGetStub.withArgs('refreshIntervalSeconds', 60).returns(30);
            assert.strictEqual(new ConfigManager().getRefreshInterval(), 30);
        });
        test('getAlignment() returns configured value', () => {
            configGetStub.withArgs('statusBarAlignment', 'right').returns('left');
            assert.strictEqual(new ConfigManager().getAlignment(), 'left');
        });
        test('getPriority() returns configured value', () => {
            configGetStub.withArgs('statusBarPriority', 100).returns(50);
            assert.strictEqual(new ConfigManager().getPriority(), 50);
        });
        test('isEnabled() returns configured value', () => {
            configGetStub.withArgs('enabled', true).returns(false);
            assert.strictEqual(new ConfigManager().isEnabled(), false);
        });
        test('getCcusagePath() returns configured value', () => {
            configGetStub.withArgs('ccusagePath', '').returns('/usr/local/bin/ccusage');
            assert.strictEqual(new ConfigManager().getCcusagePath(), '/usr/local/bin/ccusage');
        });
    });
});
