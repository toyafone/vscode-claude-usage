import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { CredentialsError, ExecFn, KeychainAccessError } from './types';

const execFileAsync = promisify(execFile);

const SECURITY_BIN = '/usr/bin/security';
const KEYCHAIN_SERVICE_BASE = 'Claude Code-credentials';
const KEYCHAIN_TIMEOUT_MS = 10000;
const KEYCHAIN_ITEM_NOT_FOUND = 44;
const FALLBACK_ACCOUNT = 'claude-code-user';
const SAFE_ACCOUNT = /^[a-zA-Z0-9._-]+$/;

export type ReadFileFn = (path: string, encoding: BufferEncoding) => string;

export interface CredentialsOptions {
    platform?: NodeJS.Platform;
    env?: Record<string, string | undefined>;
    homedir?: string;
    username?: string;
    execFn?: ExecFn;
    readFileFn?: ReadFileFn;
}

type KeychainResult =
    | { kind: 'ok'; token: string }
    | { kind: 'not-found' }
    | { kind: 'unreachable' };

function defaultUsername(): string {
    try {
        return os.userInfo().username;
    } catch {
        return '';
    }
}

export function resolveConfigDir(
    env: Record<string, string | undefined>,
    homedir: string
): string {
    const dir = env.CLAUDE_CONFIG_DIR;
    return dir ? dir : path.join(homedir, '.claude');
}

/**
 * Keychain service name used by Claude Code. When CLAUDE_CONFIG_DIR is set, the
 * name carries the first 8 hex digits of the SHA-256 of the (NFC-normalized) value.
 * This rule is derived from the official VS Code extension; keep it in this one place.
 */
export function keychainServiceName(env: Record<string, string | undefined>): string {
    const dir = env.CLAUDE_CONFIG_DIR;
    if (!dir) { return KEYCHAIN_SERVICE_BASE; }
    const hash = crypto.createHash('sha256').update(dir.normalize('NFC')).digest('hex').substring(0, 8);
    return `${KEYCHAIN_SERVICE_BASE}-${hash}`;
}

export function keychainAccountName(
    env: Record<string, string | undefined>,
    username: string
): string {
    const name = env.USER || username;
    return SAFE_ACCOUNT.test(name) ? name : FALLBACK_ACCOUNT;
}

function extractToken(json: string): string | null {
    try {
        const creds = JSON.parse(json) as { claudeAiOauth?: { accessToken?: unknown } };
        const token = creds?.claudeAiOauth?.accessToken;
        return typeof token === 'string' && token !== '' ? token : null;
    } catch {
        return null;
    }
}

async function readFromKeychain(
    execFn: ExecFn,
    service: string,
    account: string
): Promise<KeychainResult> {
    let stdout: string;
    try {
        ({ stdout } = await execFn(
            SECURITY_BIN,
            ['find-generic-password', '-a', account, '-w', '-s', service],
            { timeout: KEYCHAIN_TIMEOUT_MS }
        ));
    } catch (err: any) {
        // 44 = item not found. Everything else (denied, locked, timed out, cannot start) = unreachable.
        return err?.code === KEYCHAIN_ITEM_NOT_FOUND ? { kind: 'not-found' } : { kind: 'unreachable' };
    }
    const token = extractToken(stdout);
    return token ? { kind: 'ok', token } : { kind: 'not-found' };
}

function readFromFile(readFileFn: ReadFileFn, configDir: string): string | null {
    try {
        return extractToken(readFileFn(path.join(configDir, '.credentials.json'), 'utf-8'));
    } catch {
        return null;
    }
}

function displayPath(dir: string, homedir: string): string {
    if (!homedir) { return dir; }
    if (dir === homedir) { return '~'; }
    return dir.startsWith(homedir + path.sep) ? `~${dir.slice(homedir.length)}` : dir;
}

/**
 * Reads the Claude Code OAuth access token. Nothing is cached: every call reads
 * the Keychain (macOS only) and then the credentials file, so a token refreshed
 * by Claude Code is picked up on the next call.
 */
export async function readClaudeCredentials(options: CredentialsOptions = {}): Promise<string> {
    const platform = options.platform ?? process.platform;
    const env = options.env ?? process.env;
    const homedir = options.homedir ?? os.homedir();
    const execFn = options.execFn ?? ((file, args, opts) => execFileAsync(file, args, opts));
    const readFileFn = options.readFileFn ?? ((p, enc) => fs.readFileSync(p, enc));

    const configDir = resolveConfigDir(env, homedir);
    const isDarwin = platform === 'darwin';
    let keychainUnreachable = false;

    if (isDarwin) {
        const account = keychainAccountName(env, options.username ?? defaultUsername());
        const result = await readFromKeychain(execFn, keychainServiceName(env), account);
        if (result.kind === 'ok') { return result.token; }
        keychainUnreachable = result.kind === 'unreachable';
    }

    const fileToken = readFromFile(readFileFn, configDir);
    if (fileToken) { return fileToken; }

    if (keychainUnreachable) {
        throw new KeychainAccessError(
            vscode.l10n.t('Could not read the Keychain (denied, locked, or timed out). Unlock the Keychain, or run `claude login` again.')
        );
    }
    const shownDir = displayPath(configDir, homedir);
    if (isDarwin) {
        throw new CredentialsError(
            vscode.l10n.t('Claude Code credentials not found in Keychain or {0}/.credentials.json. Please run `claude login`.', shownDir)
        );
    }
    throw new CredentialsError(
        vscode.l10n.t('Claude Code credentials not found at {0}/.credentials.json. Please run `claude login`.', shownDir)
    );
}
