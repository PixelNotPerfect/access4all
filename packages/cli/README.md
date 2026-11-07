# @access4all/cli

Vérification d'accessibilité **avant la recette**, fondée sur le RGAA 4.1.2 et les WCAG 2.2.

## Installation

Le paquet n'est pas publié sur npm : on l'installe depuis la racine du dépôt.

```bash
npm install
npx -w @access4all/cli playwright install chromium   # une seule fois, télécharge le navigateur
npm run build
```

`npx access4all …` fonctionne alors depuis le dépôt. Pour avoir la commande partout (dans le projet que vous testez par exemple) : `npm link -w @access4all/cli`, puis `access4all check …`. Comme le lien pointe vers le dépôt, un `npm run build` suffit ensuite pour profiter des mises à jour.

## Pour les développeurs : `check`

```bash
npx access4all check http://localhost:3000 http://localhost:3000/contact
```

Pour chaque page, l'outil :

1. ouvre la page dans Chromium et lance axe-core (94 règles reliées au RGAA) ;
2. regroupe les erreurs **par critère RGAA** et les classe **du plus grave au plus rapide à corriger** ;
3. donne pour chaque étape les éléments en cause (sélecteur CSS), **ce qu'il faut faire** et le lien vers le critère officiel ;
4. liste les points qu'axe n'a pas pu trancher, puis les **vérifications manuelles** restantes (un outil automatique ne détecte qu'une partie des problèmes).

### Rapport HTML détaillé, élément par élément

```bash
npx access4all check https://client1.fr https://client1.fr/contact --format html
```

Le script produit une page HTML autonome (images incluses, un seul fichier à partager ou joindre à un ticket) et **l'ouvre dans le navigateur**. Elle est rangée **hors de votre code**, un dossier par site : `~/access4all-rapports/client1.fr/2026-11-07_09h05.html`. Les rapports précédents restent dans ce dossier, ce qui permet de suivre l'évolution d'un site. Pour **chaque élément à corriger**, elle montre :

- une **capture d'écran** de l'élément, encadré en rose dans son contexte ;
- son **état actuel** : sélecteur CSS et code HTML (et, pour un contraste, les couleurs mesurées et le ratio) ;
- le **problème**, en langage clair, avec le détail technique d'axe-core ;
- **ce qu'il faut faire**, avec une **proposition de code corrigé** (ou de couleur conforme la plus proche pour un contraste) ;
- **pourquoi** : qui est gêné et comment, avec les références RGAA et WCAG.

Le rapport est lui-même accessible (structure de titres, sommaire, tableau de synthèse, gravité indiquée en texte et pas seulement en couleur, mode sombre, lisible sur mobile et à l'impression). `-o chemin.html` choisit un autre emplacement, `--no-open` évite l'ouverture du navigateur (jamais ouvert en CI), `--no-screenshots` donne un rapport plus léger, sans captures.

Options utiles :

| Option | Effet |
|---|---|
| `--format html` | Rapport détaillé avec capture de chaque élément, ouvert dans le navigateur (voir ci-dessus) |
| `--format markdown -o rapport.md` | Rapport à joindre au ticket ou à la PR |
| `--format json` | Pour l'intégration dans d'autres outils |
| `--fail-on majeur` | Code de sortie 1 dès qu'un critère majeur ou bloquant échoue (défaut : `bloquant`) |
| `--manual tout` | Lister aussi les vérifications manuelles mineures (`aucun` pour les masquer) |
| `--viewport 320x640` | Tester l'affichage étroit (reflow, critère 10.11) |
| `--wait 2000` | Laisser le temps à une application JavaScript de s'afficher |
| `--no-wcag22` | Se limiter strictement au RGAA 4.1.2 |

Fonctionne aussi sur un fichier HTML local : `npx access4all check build/index.html`.

### En intégration continue (GitHub Actions)

```yaml
- run: npx playwright install --with-deps chromium
- run: npm start & npx wait-on http://localhost:3000
- run: npx access4all check http://localhost:3000 --format html -o a11y.html --fail-on bloquant
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: rapport-accessibilite, path: a11y.html }
```

## Pour les designers et les BA : `checklist`

```bash
npx access4all checklist --role design --format markdown -o revue-maquettes.md
npx access4all checklist --role ba --format markdown -o grille-recette.md
npx access4all checklist --role dev
```

- **design** : les critères dont la conception est responsable (contrastes, couleur seule, focus visible, cibles, titres, formulaires…) avec un conseil concret pour chacun.
- **ba** : tous les critères avec leurs tests officiels, à cocher pendant la recette.
- **dev** : les critères à vérifier à la main, que le scan ne couvre pas entièrement.
