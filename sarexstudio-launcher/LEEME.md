# Sarex Studio Launcher

Minecraft 1.21.1 + Fabric, con tus mods, en un solo botón.

## Probarlo
1. Instala Node.js (nodejs.org).
2. En esta carpeta: `npm install` y luego `npm start`.

## Crear el instalador (.exe) para tus amigos
`npm run dist` -> queda en la carpeta `dist/`. Ese instalador se lo pasas a todos.

## Cómo se instalan los mods
El launcher lee un `manifest.json` desde internet (por eso todos quedan idénticos y se actualizan solos).
1. Junta tus .jar de mods (1.21.1 Fabric) en una carpeta, por ejemplo `mods/`.
2. Súbelos a un GitHub Release (o cualquier enlace de descarga directa).
3. `node tools/make-manifest.js ./mods https://github.com/USUARIO/REPO/releases/download/mods/`
4. Sube el `manifest.json` generado a tu repo.
5. En `config.json` pon su enlace raw en `manifestUrl`.

Cuando cambies mods, repite 3 y 4: a tus amigos se les actualiza al pulsar JUGAR.
`"strict": true` borra los mods que no estén en el manifest (así nadie queda desincronizado).

## Anuncios y novedades
Se editan en el mismo `manifest.json` (`ads` y `news`). Sale una franja discreta abajo, rota cada 45 segundos y se puede cerrar con la ×.

## Notas
- Java 21 se descarga solo. Fabric y Minecraft también.
- Cuenta Microsoft (premium) o nombre sin cuenta (solo sirve en servidores sin online-mode, como Aternos en modo no premium).
