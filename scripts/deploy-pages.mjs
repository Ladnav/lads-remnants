// Publica o jogo no GitHub Pages: faz o build e envia a pasta dist/ para o ramo gh-pages.
//   npm run deploy:pages
// O build embute VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do .env.local; as duas são
// públicas por natureza (quem protege os dados é o servidor).
import { execSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const out = (cmd) => execSync(cmd).toString().trim();

if (out('git status --porcelain')) {
  console.error('Há alterações sem commit. Commite antes de publicar, para o que está no ar bater com o repositório.');
  process.exit(1);
}
const origin = out('git remote get-url origin');
const rev = out('git rev-parse --short HEAD');

sh('npm run build');
// Sem isto o Pages ignora arquivos e pastas que começam com "_".
writeFileSync('dist/.nojekyll', '');
if (existsSync('dist/.git')) rmSync('dist/.git', { recursive: true, force: true });
sh('git init -q -b gh-pages', 'dist');
sh('git add -A', 'dist');
sh(`git -c user.name="${out('git config user.name')}" -c user.email="${out('git config user.email')}" commit -q -m "Publicação de ${rev}"`, 'dist');
sh(`git push -q -f "${origin}" gh-pages`, 'dist');
rmSync('dist/.git', { recursive: true, force: true });
console.log(`Publicado ${rev} no ramo gh-pages.`);
