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
3. pilote ensuite la page comme un auditeur (voir ci-dessous) pour tester ce qu'axe-core ne sait pas tester ;
4. donne pour chaque étape les éléments en cause (sélecteur CSS), **ce qu'il faut faire** et le lien vers le critère officiel ;
5. liste les points à confirmer à la main, les critères **vérifiés automatiquement** (conformes ou non applicables) et les **vérifications manuelles** qui restent vraiment humaines.

### Tests complémentaires (au-delà d'axe-core)

Après axe-core, la commande manipule la page dans Chromium :

| Test | Critères |
|---|---|
| Tabulation dans toute la page, capture de chaque élément avec et sans focus | 10.7 focus visible, 12.8 ordre, 12.9 piège clavier, 7.4 changement de page au focus, WCAG 2.4.11 focus masqué par un élément fixe |
| Affichage à 320 px de large | 10.11 reflow |
| Fenêtre deux fois plus étroite (zoom 200 %) | 10.4 texte coupé |
| Interligne 1,5 et espacements WCAG forcés | 10.12 espacement du texte |
| Téléphone en portrait puis en paysage | 13.9 orientation |
| Analyse du DOM | 1.3 alternatives suspectes, 1.2 SVG, 7.3 éléments cliquables non focusables, 8.2 id dupliqués, 8.6 titre de page, 8.9 balises de mise en forme, 9.1 faux titres, 9.2/12.6 zones, 10.1 attributs de présentation, 11.5/11.6 regroupements, 11.9 intitulés de boutons, 11.10 champs obligatoires, 11.13 autocomplete, 12.7 lien d'évitement, 13.8 animations, 13.10 gestes |
| Analyse des feuilles de styles | 10.2 contenus générés, 10.3 ordre CSS, 10.5 couleur de fond, 10.13/10.14/12.11 contenus au survol |
| Détection des contenus absents | images, CAPTCHA, médias, tableaux, formulaires, mots de passe : les critères correspondants passent en « non applicable » |
| Comparaison des écrans d'un produit | 8.6 titres identiques, 12.2 menu à la même place |

Chaque critère tranché apparaît dans la section « Vérifié automatiquement » du rapport, avec la façon dont il a été vérifié, et sort de la liste des vérifications manuelles. Restent humains : la pertinence d'un texte (alternative, titre, intitulé), la compréhension sans CSS d'un contenu complexe, les contenus qui n'apparaissent qu'après une action (fenêtre, étape suivante d'un formulaire). Comptez quelques secondes de plus par écran ; `--rapide` désactive ces tests.

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

### Un produit de plusieurs écrans (un client, 100 écrans…)

Chaque produit a son fichier `produit.json`, rangé **hors du code** avec ses rapports, dans `~/access4all-rapports/<identifiant>/`. On le crée une fois :

```bash
npx access4all produit client1 https://client1.fr --nom "Client1 – Espace adhérent"
```

puis on complète la liste des écrans :

```json
{
  "nom": "Client1 – Espace adhérent",
  "pages": ["https://client1.fr/", "https://client1.fr/contact", "https://client1.fr/compte/factures"],
  "sitemap": "https://client1.fr/sitemap.xml",
  "exclure": ["\\.(pdf|jpg|jpeg|png|zip|docx?)$", "/blog/"],
  "max": 200
}
```

- `pages` : les écrans à scanner ; `sitemap` (facultatif) ajoute toutes les pages du sitemap ;
- `exclure` : expressions régulières des URL à ignorer ; `max` : nombre maximal d'écrans (200 par défaut).

Ensuite, à chaque passage :

```bash
npx access4all check --produit client1 --format html
```

Le script scanne tous les écrans (un écran en erreur n'arrête pas le scan), écrit **un seul rapport** dans `~/access4all-rapports/client1/<date>_<heure>.html` et l'ouvre dans le navigateur. Le rapport commence par les **problèmes communs à plusieurs écrans** (même élément, même code : en-tête, menu, pied de page, composant partagé), à corriger une seule fois, avec la liste des écrans concernés ; puis le détail propre à chaque écran. Les rapports successifs restent dans le dossier du produit pour suivre son évolution.

La variable d'environnement `ACCESS4ALL_RAPPORTS` permet de choisir un autre dossier que `~/access4all-rapports` (un dossier partagé de l'équipe par exemple).

Options utiles :

| Option | Effet |
|---|---|
| `--format html` | Rapport détaillé avec capture de chaque élément, ouvert dans le navigateur (voir ci-dessus) |
| `--format markdown -o rapport.md` | Rapport à joindre au ticket ou à la PR |
| `--format json` | Pour l'intégration dans d'autres outils |
| `--fail-on majeur` | Code de sortie 1 dès qu'un critère majeur ou bloquant échoue (défaut : `bloquant`) |
| `--manual tout` | Lister aussi les vérifications manuelles mineures (`aucun` pour les masquer) |
| `--rapide` | Sans les tests complémentaires : plus rapide, plus de vérifications manuelles |
| `--viewport 320x640` | Scanner avec axe-core en affichage étroit |
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
