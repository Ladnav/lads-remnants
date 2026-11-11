// Chaves dos avisos (VAPID).
//   npm run vapid            gera o par e grava no .env.local, se ainda não houver
//   npm run vapid -- --secrets   escreve o arquivo temporário usado para mandar o par ao Supabase
//
//   VITE_VAPID_PUBLIC_KEY  pública, vai embutida no jogo
//   VAPID_KEYS_JSON        par completo, secreto: só no .env.local e nos secrets do Supabase
// Trocar as chaves invalida as inscrições de aviso de todo mundo.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

let env = readFileSync('.env.local', 'utf8');
if (/^VAPID_KEYS_JSON=/m.test(env)) {
  console.log('As chaves já existem no .env.local.');
} else {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwks = { publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey), privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey) };
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  appendFileSync('.env.local', `\n# Avisos (web push) — o JSON é secreto, NÃO commitar\nVITE_VAPID_PUBLIC_KEY=${raw}\nVAPID_KEYS_JSON=${JSON.stringify(jwks)}\n`);
  env = readFileSync('.env.local', 'utf8');
  console.log('Chaves geradas e gravadas no .env.local.');
}

if (process.argv.includes('--secrets')) {
  // Arquivo fora do git, só com o que a função "tick" precisa. Apague depois de usar.
  const line = env.split(/\r?\n/).find((l) => l.startsWith('VAPID_KEYS_JSON='));
  writeFileSync('.push-secrets.env', `${line}\nPUSH_CONTACT=https://ladnav.github.io/lads-remnants/\n`);
  console.log('Escrito .push-secrets.env. Envie com:\n  supabase secrets set --env-file .push-secrets.env --project-ref <ref>\ne apague o arquivo em seguida.');
}
