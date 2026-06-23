import * as assert from 'assert';
import * as vscode from 'vscode';
import { TooltipBuilder } from '../tooltipBuilder';
import { ApiUsageSummary, SubscriptionUsageSummary } from '../types';

suite('TooltipBuilder', () => {
    const builder = new TooltipBuilder();

    const apiSummary: ApiUsageSummary = {
        mode: 'api',
        todayCostUSD: 1.23,
        monthCostUSD: 45.67,
        lastUpdated: new Date('2024-01-15T14:32:10'),
    };

    const subSummary: SubscriptionUsageSummary = {
        mode: 'subscription',
        fiveHour: { utilization: 10, resetsAt: new Date(Date.now() + 2.5 * 60 * 60 * 1000) },
        sevenDay: { utilization: 13, resetsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
        lastUpdated: new Date(),
    };

    const subSummaryNoSevenDay: SubscriptionUsageSummary = {
        mode: 'subscription',
        fiveHour: { utilization: 10, resetsAt: new Date(Date.now() + 2.5 * 60 * 60 * 1000) },
        sevenDay: null,
        lastUpdated: new Date(),
    };

    suite('build - API mode', () => {
        test('returns MarkdownString with supportThemeIcons', () => {
            const md = builder.build(apiSummary);
            assert.ok(md instanceof vscode.MarkdownString);
            assert.strictEqual(md.supportThemeIcons, true);
        });

        test('contains today and month costs formatted as $X.XX', () => {
            const md = builder.build(apiSummary);
            assert.ok(md.value.includes('$1.23'), 'should contain today cost');
            assert.ok(md.value.includes('$45.67'), 'should contain month cost');
        });

        test('contains calendar, graph, and clock icons', () => {
            const md = builder.build(apiSummary);
            assert.ok(md.value.includes('$(calendar)'));
            assert.ok(md.value.includes('$(graph)'));
            assert.ok(md.value.includes('$(clock)'));
        });

        test('does not contain subscription watch icon', () => {
            const md = builder.build(apiSummary);
            assert.ok(!md.value.includes('$(watch)'));
        });
    });

    suite('build - Subscription mode', () => {
        test('returns MarkdownString with supportThemeIcons', () => {
            const md = builder.build(subSummary);
            assert.ok(md instanceof vscode.MarkdownString);
            assert.strictEqual(md.supportThemeIcons, true);
        });

        test('contains 5h and 7d utilization as %', () => {
            const md = builder.build(subSummary);
            assert.ok(md.value.includes('10%'), 'should contain 5h utilization');
            assert.ok(md.value.includes('13%'), 'should contain 7d utilization');
        });

        test('contains watch and calendar icons', () => {
            const md = builder.build(subSummary);
            assert.ok(md.value.includes('$(watch)'));
            assert.ok(md.value.includes('$(calendar)'));
        });

        test('contains clock icon for last updated', () => {
            const md = builder.build(subSummary);
            assert.ok(md.value.includes('$(clock)'));
        });

        test('7d section absent when sevenDay is null', () => {
            const md = builder.build(subSummaryNoSevenDay);
            assert.ok(!md.value.includes('13%'));
            assert.ok(!md.value.includes('$(calendar)'));
        });
    });

    suite('buildError', () => {
        test('returns MarkdownString with warning icon and message', () => {
            const md = builder.buildError('Something went wrong');
            assert.ok(md instanceof vscode.MarkdownString);
            assert.strictEqual(md.supportThemeIcons, true);
            assert.ok(md.value.includes('$(warning)'));
            assert.ok(md.value.includes('Something went wrong'));
        });
    });
});
