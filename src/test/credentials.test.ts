import * as assert from 'assert';
import * as sinon from 'sinon';
import {
    readClaudeCredentials,
    keychainServiceName,
    keychainAccountName,
} from '../credentials';
import { CredentialsError, KeychainAccessError } from '../types';

const KEYCHAIN_TOKEN = 'sk-ant-oat01-keychain';
const FILE_TOKEN = 'sk-ant-oat01-file';
const HOME = '/home/tester';
const json = (token: unknown) => JSON.stringify({ claudeAiOauth: { accessToken: token } });

function exitError(code: number | string): Error {
    return Object.assign(new Error(`exit ${code}`), { code });
}

suite('readClaudeCredentials', () => {
    let execStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;

    setup(() => {
        execStub = sinon.stub();
        readFileStub = sinon.stub();
    });
    teardown(() => { sinon.restore(); });

    function read(overrides: Record<string, unknown> = {}): Promise<string> {
        return readClaudeCredentials({
            platform: 'darwin',
            env: { USER: 'alice' },
            homedir: HOME,
            username: 'os-user',
            execFn: execStub as any,
            readFileFn: readFileStub as any,
            ...overrides,
        });
    }

    suite('lookup order and errors', () => {
        test('darwin, valid Keychain JSON → uses Keychain, does not read the file', async () => {
            execStub.resolves({ stdout: json(KEYCHAIN_TOKEN) });
            assert.strictEqual(await read(), KEYCHAIN_TOKEN);
            assert.ok(readFileStub.notCalled);
        });

        test('darwin, Keychain fails with non-44 exit → falls back to the file', async () => {
            execStub.rejects(exitError(36));
            readFileStub.returns(json(FILE_TOKEN));
            assert.strictEqual(await read(), FILE_TOKEN);
        });

        test('darwin, Keychain output is invalid JSON → falls back to the file', async () => {
            execStub.resolves({ stdout: 'not-json{{' });
            readFileStub.returns(json(FILE_TOKEN));
            assert.strictEqual(await read(), FILE_TOKEN);
        });

        test('darwin, Keychain 44 and no file → CredentialsError naming both places', async () => {
            execStub.rejects(exitError(44));
            readFileStub.throws(new Error('ENOENT'));
            await assert.rejects(read(), (err: Error) => {
                assert.ok(err instanceof CredentialsError);
                assert.ok(!(err instanceof KeychainAccessError));
                assert.ok(err.message.includes('Keychain'));
                assert.ok(err.message.includes('~/.claude/.credentials.json'));
                return true;
            });
        });

        test('non-darwin, valid file → does not run security', async () => {
            readFileStub.returns(json(FILE_TOKEN));
            assert.strictEqual(await read({ platform: 'linux' }), FILE_TOKEN);
            assert.ok(execStub.notCalled);
        });

        test('non-darwin, no file → CredentialsError naming the file path', async () => {
            readFileStub.throws(new Error('ENOENT'));
            await assert.rejects(read({ platform: 'linux' }), (err: Error) => {
                assert.ok(err instanceof CredentialsError);
                assert.ok(!(err instanceof KeychainAccessError));
                assert.ok(err.message.includes('.credentials.json'));
                assert.ok(!err.message.includes('Keychain'));
                return true;
            });
        });

        test('empty accessToken is treated as a failure', async () => {
            readFileStub.returns(json(''));
            await assert.rejects(read({ platform: 'linux' }), CredentialsError);
        });

        test('darwin, Keychain non-44 failure and no file → KeychainAccessError', async () => {
            execStub.rejects(exitError(1));
            readFileStub.throws(new Error('ENOENT'));
            await assert.rejects(read(), KeychainAccessError);
        });

        test('darwin, Keychain timeout (killed) and no file → KeychainAccessError', async () => {
            execStub.rejects(Object.assign(new Error('timeout'), { killed: true, code: null }));
            readFileStub.throws(new Error('ENOENT'));
            await assert.rejects(read(), KeychainAccessError);
        });

        test("darwin, security cannot start (code 'ENOENT') and no file → KeychainAccessError", async () => {
            execStub.rejects(exitError('ENOENT'));
            readFileStub.throws(new Error('ENOENT'));
            await assert.rejects(read(), KeychainAccessError);
        });
    });

    suite('execution conditions', () => {
        test('security is run with a 10 s timeout and no shell', async () => {
            execStub.resolves({ stdout: json(KEYCHAIN_TOKEN) });
            await read();
            const [file, args, opts] = execStub.firstCall.args;
            assert.strictEqual(file, '/usr/bin/security');
            assert.deepStrictEqual(args.slice(0, 1), ['find-generic-password']);
            assert.strictEqual(opts.timeout, 10000);
            assert.ok(!opts.shell);
        });

        test('no caching → security runs on every call and picks up a changed token', async () => {
            execStub.onFirstCall().resolves({ stdout: json('token-1') });
            execStub.onSecondCall().resolves({ stdout: json('token-2') });
            assert.strictEqual(await read(), 'token-1');
            assert.strictEqual(await read(), 'token-2');
            assert.strictEqual(execStub.callCount, 2);
        });
    });

    suite('CLAUDE_CONFIG_DIR and account name', () => {
        function serviceArg(): string {
            const args: string[] = execStub.firstCall.args[1];
            return args[args.indexOf('-s') + 1];
        }
        function accountArg(): string {
            const args: string[] = execStub.firstCall.args[1];
            return args[args.indexOf('-a') + 1];
        }

        test('CLAUDE_CONFIG_DIR unset → default service name, account passed with -a', async () => {
            execStub.resolves({ stdout: json(KEYCHAIN_TOKEN) });
            await read();
            assert.strictEqual(serviceArg(), 'Claude Code-credentials');
            assert.strictEqual(accountArg(), 'alice');
        });

        test('CLAUDE_CONFIG_DIR empty → same as unset', async () => {
            execStub.rejects(exitError(44));
            readFileStub.returns(json(FILE_TOKEN));
            await read({ env: { USER: 'alice', CLAUDE_CONFIG_DIR: '' } });
            assert.strictEqual(serviceArg(), 'Claude Code-credentials');
            assert.strictEqual(readFileStub.firstCall.args[0], '/home/tester/.claude/.credentials.json');
        });

        test('CLAUDE_CONFIG_DIR=/path/x → fixed test vector', () => {
            // Expected value is hard-coded on purpose; do not recompute it here.
            assert.strictEqual(
                keychainServiceName({ CLAUDE_CONFIG_DIR: '/path/x' }),
                'Claude Code-credentials-41aca056'
            );
        });

        test('NFC and NFD spellings of /tmp/café give the same service name', () => {
            const nfc = '/tmp/caf\u00e9';   // é (U+00E9)
            const nfd = '/tmp/cafe\u0301';  // e + combining acute accent (U+0301)
            assert.notStrictEqual(nfc, nfd);
            assert.strictEqual(keychainServiceName({ CLAUDE_CONFIG_DIR: nfc }), 'Claude Code-credentials-0873cca0');
            assert.strictEqual(keychainServiceName({ CLAUDE_CONFIG_DIR: nfd }), 'Claude Code-credentials-0873cca0');
        });

        test('CLAUDE_CONFIG_DIR=/path/x, non-darwin → reads /path/x/.credentials.json, no security', async () => {
            readFileStub.returns(json(FILE_TOKEN));
            await read({ platform: 'linux', env: { CLAUDE_CONFIG_DIR: '/path/x' } });
            assert.strictEqual(readFileStub.firstCall.args[0], '/path/x/.credentials.json');
            assert.ok(execStub.notCalled);
        });

        test('CLAUDE_CONFIG_DIR=/path/x, darwin, no Keychain item → falls back to /path/x file', async () => {
            execStub.rejects(exitError(44));
            readFileStub.returns(json(FILE_TOKEN));
            assert.strictEqual(await read({ env: { USER: 'alice', CLAUDE_CONFIG_DIR: '/path/x' } }), FILE_TOKEN);
            assert.strictEqual(readFileStub.firstCall.args[0], '/path/x/.credentials.json');
        });

        test('unsafe USER, or unset USER with an unsafe injected username → claude-code-user', () => {
            assert.strictEqual(keychainAccountName({ USER: 'bad user;rm' }, 'os-user'), 'claude-code-user');
            assert.strictEqual(keychainAccountName({}, 'bad user;rm'), 'claude-code-user');
        });

        test('unset USER with a normal injected username → uses the username', async () => {
            execStub.resolves({ stdout: json(KEYCHAIN_TOKEN) });
            await read({ env: {}, username: 'os-user' });
            assert.strictEqual(accountArg(), 'os-user');
        });

        test('CLAUDE_CONFIG_DIR set and only the default entry exists → default entry is not read', async () => {
            execStub.callsFake(async (_file: string, args: string[]) => {
                const service = args[args.indexOf('-s') + 1];
                if (service === 'Claude Code-credentials') { return { stdout: json(KEYCHAIN_TOKEN) }; }
                throw exitError(44);
            });
            readFileStub.throws(new Error('ENOENT'));
            await assert.rejects(
                read({ env: { USER: 'alice', CLAUDE_CONFIG_DIR: '/path/x' } }),
                CredentialsError
            );
            assert.ok(execStub.alwaysCalledWith('/usr/bin/security', sinon.match.array, sinon.match.object));
            assert.ok(execStub.firstCall.args[1].includes('Claude Code-credentials-41aca056'));
        });
    });
});
