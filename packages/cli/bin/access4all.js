#!/usr/bin/env node
// Lanceur versionné : npm crée la commande `access4all` dès `npm install`,
// même si `dist/` (ignoré par git) n'a pas encore été compilé.
let cli;
try {
  cli = await import("../dist/index.js");
} catch (err) {
  if (err && err.code === "ERR_MODULE_NOT_FOUND") {
    process.stderr.write("access4all n'est pas encore compilé. Lancez `npm run build` à la racine du dépôt.\n");
    process.exit(2);
  }
  throw err;
}
cli.main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`Erreur : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  },
);
