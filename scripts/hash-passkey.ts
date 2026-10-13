import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { hashPasskey } from '../src/lib/auth/passkey';

/** Usage: npm run auth:hash  -> prompts (input is not echoed) and prints the two env values. */
function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = rl as unknown as { _writeToOutput: (s: string) => void };
    w._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a);
    });
  });
}

async function main() {
  const p1 = await ask('New passkey (min 12 chars): ');
  if (p1.length < 12) throw new Error('Passkey must be at least 12 characters');
  const p2 = await ask('Repeat passkey: ');
  if (p1 !== p2) throw new Error('Passkeys do not match');
  console.log('\nAdd these to .env.local and to Vercel (Production + Preview). Never commit them.\n');
  console.log(`AUTH_PASSKEY_HASH=${hashPasskey(p1)}`);
  console.log(`SESSION_SECRET=${randomBytes(32).toString('hex')}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
