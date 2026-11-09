// Uso: node tools/make-manifest.js ./mods https://github.com/USUARIO/REPO/releases/download/mods/
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [dir, base] = process.argv.slice(2);
if (!dir || !base) { console.log('Uso: node tools/make-manifest.js <carpeta-de-mods> <url-base>'); process.exit(1); }
const mods = fs.readdirSync(dir).filter(f => f.endsWith('.jar')).map(f => ({
  file: f,
  url: base.replace(/\/?$/, '/') + encodeURIComponent(f),
  sha1: crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex')
}));
const old = fs.existsSync('manifest.json') ? JSON.parse(fs.readFileSync('manifest.json')) : JSON.parse(fs.readFileSync('manifest.local.json'));
fs.writeFileSync('manifest.json', JSON.stringify({ ...old, mods }, null, 2));
console.log(`manifest.json listo con ${mods.length} mods. Súbelo a tu repo.`);
