import type { DevtoolsEntry, DevtoolsSource } from "./devtools.js";

/**
 * Pas à pas de correction des erreurs vues dans les DevTools : cause probable,
 * où regarder, comment corriger et comment vérifier, avec l'impact éventuel
 * sur l'accessibilité.
 */
export interface DevtoolsGuide {
  id: string;
  title: string;
  /** Pourquoi cette erreur apparaît, le plus souvent. */
  cause: string;
  /** Où chercher dans le code ou la configuration. */
  where: string[];
  /** Comment corriger, étape par étape. */
  fix: string[];
  /** Comment vérifier que c'est corrigé. */
  check: string;
  /** Impact sur l'accessibilité : direct (fort) ou selon le contexte (possible). */
  a11y?: { level: "fort" | "possible"; why: string; criteria?: string[] };
  /** Priorité d'affichage, de 0 (à traiter d'abord) à 3. */
  priority: number;
}

const RELOAD_STEP = "Rechargez l'écran avec les DevTools ouverts : l'erreur ne doit plus apparaître.";

/** Première étape commune : où retrouver l'entrée dans les DevTools. */
export function reproduceStep(e: Pick<DevtoolsEntry, "source" | "resource">): string {
  const name = e.resource ? fileName(e.resource) : "";
  switch (e.source) {
    case "network":
      return `Ouvrez l'écran dans Chrome, puis les DevTools (F12 ou Cmd+Option+I), onglet Réseau (Network). Rechargez la page, tapez « ${name} » dans le filtre et cliquez sur la ligne en rouge : la colonne Initiator indique quelle balise ou quel script demande cette ressource.`;
    case "exception":
      return "Ouvrez l'écran dans Chrome, puis les DevTools (F12 ou Cmd+Option+I), onglet Console. Cliquez sur le lien fichier:ligne à droite du message pour ouvrir le code fautif. Pour voir l'état des variables au moment du plantage, cochez « Pause on uncaught exceptions » dans l'onglet Sources et rechargez.";
    case "issue":
      return "Ouvrez l'écran dans Chrome, puis les DevTools (F12 ou Cmd+Option+I), onglet Problèmes (Issues ; sinon menu ⋮ > More tools > Issues). Dépliez le problème : le lien « Elements » sélectionne l'élément en cause.";
    default:
      return "Ouvrez l'écran dans Chrome, puis les DevTools (F12 ou Cmd+Option+I), onglet Console. Cliquez sur le lien fichier:ligne à droite du message pour ouvrir le code qui l'a écrit.";
  }
}

export function fileName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.host;
  } catch {
    return url;
  }
}

const SCRIPT_BROKEN = "Un script en erreur s'arrête à cet endroit : tout ce qu'il devait faire ensuite (ouvrir un menu, une fenêtre modale, valider un formulaire, gérer le focus, annoncer un message) ne se fait pas. Les personnes au clavier ou avec un lecteur d'écran sont les premières bloquées, car les solutions de contournement à la souris n'existent pas pour elles.";

type Rule = { test: (e: DevtoolsEntry) => boolean; guide: Omit<DevtoolsGuide, "id"> & { id: string } };

const net = (e: DevtoolsEntry) => e.source === "network";
const notFound = (e: DevtoolsEntry) => net(e) && (e.status === 404 || e.status === 410 || /ERR_FILE_NOT_FOUND/.test(e.message));
const text = (re: RegExp) => (e: DevtoolsEntry) => re.test(e.message);

const RULES: Rule[] = [
  // --- Accessibilité directe ---
  {
    test: (e) => e.source === "issue" && e.code === "GenericIssue" && /label|aria-labelledby|étiquette/i.test(e.message),
    guide: {
      id: "form-label",
      title: "Champ de formulaire mal étiqueté (onglet Problèmes)",
      cause: "Chrome a trouvé un <label> qui n'est relié à aucun champ, un attribut for qui pointe vers un id inexistant, ou un champ sans étiquette. Souvent après un renommage d'id, un composant dupliqué ou un id généré différemment côté serveur et côté client.",
      where: ["Le code HTML de l'élément est donné ci-dessus : cherchez-le dans le gabarit ou le composant de formulaire.", "Comparez l'attribut for du <label> avec l'id du champ réellement rendu (dans l'onglet Elements, pas dans le code source)."],
      fix: [
        "Donnez au champ un id unique et mettez exactement la même valeur dans l'attribut for de son <label> (ou placez le champ à l'intérieur du <label>).",
        "Si l'id est généré (React useId, Angular, Vue…), utilisez la même variable pour le for et pour l'id.",
        "Un <label> qui ne sert à rien (texte décoratif) doit devenir un simple <span> ou <p>.",
      ],
      check: "Onglet Problèmes vide pour ce formulaire, et un clic sur le texte de l'étiquette place le curseur dans le champ.",
      a11y: { level: "fort", why: "Un lecteur d'écran annonce le champ sans son nom : la personne ne sait pas quoi saisir.", criteria: ["11.1", "11.2", "11.13"] },
      priority: 0,
    },
  },
  {
    test: (e) => (e.source === "issue" && /DuplicateId/.test(e.message + (e.code ?? ""))) || text(/non-unique id|plusieurs champs de formulaire ont le même id|duplicate id/i)(e),
    guide: {
      id: "duplicate-id",
      title: "Identifiants (id) en double",
      cause: "Le même id est présent plusieurs fois dans la page, souvent parce qu'un composant (champ, modale, menu) est affiché deux fois, par exemple en version mobile et bureau, avec un id écrit en dur.",
      where: ["Dans l'onglet Elements, Ctrl+F (Cmd+F) avec #mon-id pour retrouver tous les éléments qui portent cet id.", "Cherchez l'id écrit en dur dans le composant concerné."],
      fix: ["Générez un id unique par instance du composant (préfixe ou identifiant généré).", "Mettez à jour tous les attributs qui y font référence : for, aria-labelledby, aria-describedby, aria-controls, href=\"#…\"."],
      check: "Dans la console, document.querySelectorAll('#mon-id').length vaut 1.",
      a11y: { level: "fort", why: "Les étiquettes et descriptions reliées par id (for, aria-labelledby, aria-describedby) pointent vers le mauvais élément : le lecteur d'écran annonce un mauvais nom, ou aucun.", criteria: ["8.2", "11.1"] },
      priority: 0,
    },
  },
  {
    test: text(/aria-hidden/i),
    guide: {
      id: "aria-hidden-focus",
      title: "aria-hidden posé sur un élément qui contient le focus",
      cause: "Un conteneur reçoit aria-hidden=\"true\" alors qu'un élément à l'intérieur a encore le focus, typiquement le contenu de la page masqué à l'ouverture d'une modale, ou un menu fermé alors que son bouton est encore actif.",
      where: ["Cherchez dans le code les setAttribute('aria-hidden', …) ou les props ariaHidden / aria-hidden liées à l'ouverture d'une modale, d'un menu ou d'un tiroir.", "Le message de la console indique l'élément bloqué et l'élément qui avait le focus."],
      fix: [
        "Déplacez d'abord le focus (dans la modale, ou sur le bouton qui rouvre le menu), puis seulement ensuite masquez le reste avec aria-hidden.",
        "Mieux : utilisez l'attribut inert sur le contenu à masquer (il retire aussi le focus), ou un <dialog> ouvert avec showModal().",
      ],
      check: "Ouvrez et fermez le composant au clavier : le message n'apparaît plus et le focus reste visible et logique.",
      a11y: { level: "fort", why: "Le lecteur d'écran se retrouve sur un élément déclaré « caché » : il n'annonce rien, ou des contenus incohérents. Chrome bloque aria-hidden dans ce cas, ce qui laisse visible pour les lecteurs d'écran le contenu que vous vouliez masquer.", criteria: ["10.8", "12.8", "7.1"] },
      priority: 0,
    },
  },
  {
    test: (e) => text(/autocomplete/i)(e) || (e.code === "GenericIssue" && /ni id ni name/.test(e.message)),
    guide: {
      id: "autocomplete",
      title: "Champ mal préparé pour le remplissage automatique",
      cause: "Chrome ne sait pas quelle donnée attend le champ : pas d'attribut autocomplete (ou une valeur invalide), valeur d'autocomplete mise dans l'id ou le name à la place, ou champ sans id ni name.",
      where: ["L'élément est donné ci-dessus (ou dans le message [DOM], avec la valeur suggérée) : cherchez-le dans le composant de formulaire."],
      fix: [
        "Ajoutez l'attribut autocomplete avec la valeur officielle correspondant à la donnée (name, given-name, family-name, email, tel, street-address, postal-code, username, current-password, new-password…).",
        "Garder id=\"email\" ou name=\"email\" est possible : ajoutez simplement autocomplete=\"email\" sur le même champ.",
        "Donnez un name à chaque champ envoyé avec le formulaire.",
      ],
      check: "L'onglet Problèmes ne signale plus le champ et le navigateur propose le remplissage automatique.",
      a11y: { level: "fort", why: "Le remplissage automatique évite de tout ressaisir : c'est une aide importante pour les personnes ayant des troubles moteurs, cognitifs ou de mémoire.", criteria: ["11.13"] },
      priority: 2,
    },
  },
  {
    test: (e) => e.code === "LowTextContrastIssue",
    guide: {
      id: "low-contrast",
      title: "Contraste de texte insuffisant (onglet Problèmes)",
      cause: "La couleur du texte est trop proche de celle du fond.",
      where: ["Sélectionnez l'élément (lien Elements dans l'onglet Problèmes), puis dans le panneau Styles cliquez sur la pastille de couleur : Chrome affiche le ratio et la ligne AA."],
      fix: ["Foncez (ou éclaircissez) la couleur du texte jusqu'à 4,5:1 (3:1 pour un texte de 24 px, ou 18,5 px en gras).", "Modifiez la variable de couleur dans le thème plutôt que l'élément seul."],
      check: "Le sélecteur de couleur de Chrome affiche une coche à côté de AA.",
      a11y: { level: "fort", why: "Un texte peu contrasté est illisible pour les personnes malvoyantes ou en plein soleil.", criteria: ["3.2"] },
      priority: 1,
    },
  },
  // --- Ressources introuvables ---
  {
    test: (e) => notFound(e) && /favicon/i.test(e.resource ?? ""),
    guide: {
      id: "favicon",
      title: "Icône du site (favicon) introuvable",
      cause: "Le navigateur demande /favicon.ico par défaut et le serveur n'en a pas.",
      where: ["Dans le <head> : la balise <link rel=\"icon\">, ou son absence."],
      fix: ["Ajoutez un fichier favicon.ico à la racine du site, ou déclarez l'icône existante avec <link rel=\"icon\" href=\"/chemin/icone.svg\">."],
      check: RELOAD_STEP,
      priority: 3,
    },
  },
  {
    test: (e) => notFound(e) && (e.resourceType === "document" || e.resourceType === "iframe"),
    guide: {
      id: "404-document",
      title: "Page ou cadre introuvable (404)",
      cause: "L'adresse de l'écran, ou d'un cadre (iframe) intégré, n'existe pas ou plus : lien cassé, route renommée, contenu supprimé.",
      where: ["Vérifiez l'adresse dans la liste des écrans du produit ou le sitemap.", "Pour un iframe : l'attribut src de la balise <iframe> dans le gabarit."],
      fix: ["Corrigez l'adresse, ou mettez en place une redirection 301 depuis l'ancienne.", "Si le contenu n'existe plus, retirez le lien et l'écran de la liste à scanner."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: "Le contenu attendu est absent pour tout le monde ; un cadre vide reste en plus annoncé par les lecteurs d'écran.", criteria: ["2.1"] },
      priority: 0,
    },
  },
  {
    test: (e) => notFound(e) && e.resourceType === "script",
    guide: {
      id: "404-script",
      title: "Script introuvable (404)",
      cause: "Un fichier JavaScript n'est pas trouvé : chemin erroné, fichier non déployé, ou nom de fichier avec empreinte (main.3f2a.js) qui a changé après un nouveau build alors que le HTML en cache pointe encore sur l'ancien.",
      where: ["La colonne Initiator de l'onglet Réseau montre la balise <script src> qui le demande.", "Vérifiez le dossier de build déployé et la configuration du chemin public (base, publicPath, assetPrefix)."],
      fix: ["Corrigez le chemin dans la balise <script> ou la configuration du bundler.", "Redéployez le build complet (HTML et fichiers JS ensemble) et videz le cache du CDN si nécessaire.", "Si le script n'est plus utilisé, retirez la balise."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1", "7.3", "12.8"] },
      priority: 0,
    },
  },
  {
    test: (e) => notFound(e) && e.resourceType === "stylesheet",
    guide: {
      id: "404-css",
      title: "Feuille de styles introuvable (404)",
      cause: "Un fichier CSS n'est pas trouvé : chemin erroné, fichier non déployé ou nom avec empreinte qui a changé après un build.",
      where: ["La balise <link rel=\"stylesheet\"> ou l'@import qui le demande (colonne Initiator).", "La configuration du chemin public du bundler."],
      fix: ["Corrigez le chemin ou redéployez le build complet.", "Si la feuille n'est plus utilisée, retirez la balise."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: "Sans ses styles, la page peut perdre l'indicateur de focus, les contrastes, la mise en forme des messages d'erreur ou le masquage des contenus : la navigation au clavier et la lecture deviennent difficiles.", criteria: ["10.7", "3.2", "10.1"] },
      priority: 0,
    },
  },
  {
    test: (e) => notFound(e) && e.resourceType === "font",
    guide: {
      id: "404-font",
      title: "Police introuvable (404)",
      cause: "Un fichier de police n'est pas trouvé : chemin relatif faux dans @font-face (relatif au fichier CSS, pas à la page), ou fichier non déployé.",
      where: ["La règle @font-face dans le CSS (onglet Sources), propriété src."],
      fix: ["Corrigez l'URL dans @font-face (en chemin absolu depuis la racine du site si besoin) et vérifiez que le fichier est déployé.", "Prévoyez une police de repli dans font-family."],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Si c'est une police d'icônes, les icônes des boutons disparaissent ou deviennent des carrés : un bouton sans texte visible n'a alors plus de sens à l'écran.", criteria: ["1.1", "11.9"] },
      priority: 1,
    },
  },
  {
    test: (e) => notFound(e) && e.resourceType === "image",
    guide: {
      id: "404-image",
      title: "Image introuvable (404)",
      cause: "Une image n'est pas trouvée : chemin faux, fichier non déployé, image supprimée d'un CMS ou d'un CDN.",
      where: ["La balise <img src> (ou srcset) ou le background-image CSS indiqués dans la colonne Initiator.", "Dans un CMS : le média référencé dans le contenu."],
      fix: ["Corrigez le chemin ou remettez le fichier en place.", "Si l'image n'existe plus, retirez la balise ou remplacez l'image."],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Si l'image porte une information (schéma, texte dans l'image, icône seule dans un bouton), cette information est perdue à l'écran ; seule l'alternative textuelle reste.", criteria: ["1.1", "1.3"] },
      priority: 2,
    },
  },
  {
    test: (e) => notFound(e) && (e.resourceType === "fetch" || e.resourceType === "xhr"),
    guide: {
      id: "404-api",
      title: "Appel d'API introuvable (404)",
      cause: "Le front appelle une adresse d'API qui n'existe pas dans cet environnement : variable d'URL d'API mal configurée, route renommée côté back, ou paramètre manquant dans l'URL.",
      where: ["La colonne Initiator montre le fichier JS et la ligne qui lance l'appel.", "La configuration d'URL d'API de l'environnement (.env, variables du déploiement)."],
      fix: ["Corrigez l'URL appelée ou la route côté serveur.", "Prévoyez dans le front un message d'erreur visible et annoncé (role=\"alert\") quand l'appel échoue, plutôt qu'un écran vide."],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Le contenu ou la fonction qui dépend de cet appel ne s'affiche pas ; si l'échec est silencieux, une personne aveugle ne sait pas qu'il manque quelque chose.", criteria: ["7.5"] },
      priority: 1,
    },
  },
  {
    test: notFound,
    guide: {
      id: "404-other",
      title: "Ressource introuvable (404)",
      cause: "Un fichier demandé par la page n'existe pas à cette adresse.",
      where: ["La colonne Initiator de l'onglet Réseau montre ce qui demande la ressource."],
      fix: ["Corrigez le chemin, remettez le fichier en place, ou retirez la référence s'il n'est plus utilisé."],
      check: RELOAD_STEP,
      priority: 2,
    },
  },
  {
    test: (e) => net(e) && (e.status === 401 || e.status === 403),
    guide: {
      id: "http-auth",
      title: "Accès refusé (401 / 403)",
      cause: "Le serveur refuse la ressource : l'écran demande d'être connecté, un jeton a expiré, ou un pare-feu (WAF, protection anti-robots) bloque le scanner.",
      where: ["Les en-têtes de la réponse dans l'onglet Réseau (WWW-Authenticate, en-têtes du CDN).", "Les règles d'accès du serveur ou du CDN."],
      fix: ["Si l'écran est derrière une connexion, c'est attendu pendant un scan sans session : à ignorer ou à scanner connecté.", "Sinon, corrigez les droits d'accès à la ressource ou autorisez le scanner dans le pare-feu."],
      check: RELOAD_STEP,
      priority: 2,
    },
  },
  {
    test: (e) => net(e) && (e.status ?? 0) >= 500,
    guide: {
      id: "http-5xx",
      title: "Erreur serveur (5xx)",
      cause: "Le serveur a planté en traitant la requête (500), ou un service en amont ne répond pas (502, 503, 504).",
      where: ["Les journaux (logs) du serveur ou de l'API à l'heure du scan.", "L'onglet Réseau > Response peut contenir le message d'erreur."],
      fix: ["Corrigez l'erreur serveur à partir des logs.", "Côté front, affichez un message d'erreur clair et annoncé (role=\"alert\") quand une requête échoue."],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Un contenu ou une action qui échoue sans message visible et annoncé laisse les personnes aveugles sans aucune information.", criteria: ["7.5"] },
      priority: 0,
    },
  },
  {
    test: (e) => net(e) && (e.status ?? 0) >= 400,
    guide: {
      id: "http-4xx",
      title: "Requête refusée par le serveur (4xx)",
      cause: "Le serveur a refusé la requête : paramètres invalides (400), méthode non autorisée (405), trop de requêtes (429)…",
      where: ["L'onglet Réseau : onglets Payload et Response de la requête.", "La colonne Initiator pour le code qui l'envoie."],
      fix: ["Corrigez les paramètres envoyés ou la route côté serveur."],
      check: RELOAD_STEP,
      priority: 2,
    },
  },
  {
    test: (e) => net(e) && /ERR_CERT|ERR_SSL/.test(e.message),
    guide: {
      id: "net-cert",
      title: "Certificat HTTPS invalide",
      cause: "Le certificat du domaine est expiré, auto-signé ou ne correspond pas au nom de domaine.",
      where: ["Cliquez sur le cadenas dans la barre d'adresse en ouvrant directement la ressource."],
      fix: ["Renouvelez ou corrigez le certificat du domaine concerné (Let's Encrypt, CDN…)."],
      check: RELOAD_STEP,
      priority: 0,
    },
  },
  {
    test: (e) => net(e) && /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TUNNEL|ERR_ADDRESS|ERR_INTERNET|ERR_TIMED_OUT|ERR_PROXY/.test(e.message),
    guide: {
      id: "net-unreachable",
      title: "Serveur injoignable",
      cause: "Le domaine n'existe pas, ne répond pas, ou n'est pas accessible depuis le poste qui a lancé le scan (réseau d'entreprise, VPN, proxy, environnement local arrêté).",
      where: ["Le domaine de la ressource : est-ce un service tiers, un ancien domaine, une URL de recette restée dans le code de production ?", "La configuration des URL par environnement (.env)."],
      fix: ["Si le domaine est obsolète, remplacez-le ou retirez l'appel.", "Si le service est seulement inaccessible depuis votre réseau, relancez le scan depuis un poste qui y a accès avant de conclure."],
      check: RELOAD_STEP,
      priority: 1,
    },
  },
  {
    test: (e) => net(e) && /ERR_BLOCKED/.test(e.message),
    guide: {
      id: "net-blocked",
      title: "Requête bloquée par le navigateur",
      cause: "Le navigateur a bloqué la ressource : politique de sécurité de la réponse (CORP, COEP, ORB), extension, ou type de contenu incohérent.",
      where: ["L'onglet Problèmes donne le motif exact.", "Les en-têtes Cross-Origin-Resource-Policy et Content-Type de la réponse."],
      fix: ["Servez la ressource avec le bon Content-Type et, pour une ressource d'un autre domaine, l'en-tête Cross-Origin-Resource-Policy adapté."],
      check: RELOAD_STEP,
      priority: 1,
    },
  },
  {
    test: net,
    guide: {
      id: "net-failed",
      title: "Requête réseau en échec",
      cause: "La ressource n'a pas pu être chargée.",
      where: ["L'onglet Réseau donne le code d'erreur net::… ; la colonne Initiator montre ce qui la demande."],
      fix: ["Recherchez le code net::… indiqué : il précise la cause (réseau, sécurité, serveur)."],
      check: RELOAD_STEP,
      priority: 2,
    },
  },
  // --- Sécurité du navigateur ---
  {
    test: text(/blocked by CORS policy/i),
    guide: {
      id: "cors",
      title: "Requête bloquée par CORS",
      cause: "Le front appelle un autre domaine (API, CDN, service tiers) qui n'autorise pas l'origine du site dans sa réponse.",
      where: ["Le message indique l'URL appelée et l'origine du site.", "La configuration CORS du serveur appelé (en-tête Access-Control-Allow-Origin), ou du proxy/CDN devant lui."],
      fix: [
        "Sur le serveur appelé, ajoutez l'origine du site (ex. https://www.client.fr) dans Access-Control-Allow-Origin, et les méthodes et en-têtes nécessaires.",
        "Si l'API n'est pas la vôtre, passez par votre propre back-end ou un proxy.",
        "Vérifiez que l'URL appelée est celle du bon environnement (recette ou production).",
      ],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Le contenu ou la fonction qui dépend de cet appel ne s'affiche pas ; si l'échec est silencieux, une personne aveugle ne sait pas qu'il manque quelque chose.", criteria: ["7.5"] },
      priority: 1,
    },
  },
  {
    test: text(/Mixed Content/i),
    guide: {
      id: "mixed-content",
      title: "Contenu mixte (HTTP dans une page HTTPS)",
      cause: "La page en HTTPS charge une ressource en http:// : le navigateur la bloque (scripts, iframes) ou la signale (images).",
      where: ["Le message donne l'URL en http://. Cherchez-la dans le code, la base de données du CMS ou la configuration (URL du site enregistrée en http)."],
      fix: ["Remplacez http:// par https:// (ou par une URL relative) ; vérifiez que la ressource existe bien en HTTPS.", "Dans un CMS, faites un rechercher-remplacer de l'ancienne URL du site."],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Si la ressource bloquée est un script ou un cadre, la fonctionnalité correspondante ne marche plus.", criteria: ["7.1"] },
      priority: 1,
    },
  },
  {
    test: text(/Content Security Policy|Refused to (load|execute|apply|connect|frame|evaluate)/i),
    guide: {
      id: "csp",
      title: "Ressource bloquée par la politique de sécurité (CSP)",
      cause: "L'en-tête Content-Security-Policy du site n'autorise pas cette ressource : script inline, domaine tiers non listé, style inline…",
      where: ["L'en-tête Content-Security-Policy de la page (onglet Réseau > le document > Headers) ou la balise <meta http-equiv=\"Content-Security-Policy\">.", "Le message cite la directive en cause (script-src, style-src, img-src, connect-src…)."],
      fix: ["Ajoutez le domaine légitime à la directive citée, ou utilisez un nonce/hash pour un script inline.", "Si la ressource n'est pas censée être là (script injecté, ancien traceur), retirez-la plutôt que d'assouplir la politique."],
      check: RELOAD_STEP,
      a11y: { level: "possible", why: "Si un script ou un style est bloqué, des fonctions (menus, formulaires) ou la mise en forme (focus visible, contrastes) peuvent manquer.", criteria: ["7.1", "10.7"] },
      priority: 1,
    },
  },
  // --- Erreurs JavaScript ---
  {
    test: text(/ChunkLoadError|Loading (CSS )?chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i),
    guide: {
      id: "js-chunk",
      title: "Morceau de l'application non chargé (chunk)",
      cause: "L'application charge une partie de son code à la demande, mais le fichier n'existe plus : un nouveau déploiement a remplacé les fichiers alors que la page ouverte référence encore les anciens, ou le chemin public est mal configuré.",
      where: ["L'onglet Réseau, filtré sur .js : la requête du chunk en 404.", "La configuration publicPath / base / assetPrefix du bundler."],
      fix: ["Conservez les fichiers de la version précédente quelques jours après un déploiement, ou rechargez la page automatiquement sur cette erreur.", "Vérifiez le chemin public configuré pour l'environnement."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1"] },
      priority: 0,
    },
  },
  {
    test: text(/Hydration|hydrat|did not match|Minified React error #(418|423|425)/i),
    guide: {
      id: "js-hydration",
      title: "Erreur d'hydratation (rendu serveur différent du rendu navigateur)",
      cause: "Le HTML généré par le serveur ne correspond pas à ce que le framework (React, Vue, Nuxt, Next…) produit dans le navigateur : date ou heure, valeur aléatoire, test sur window, HTML invalide (<div> dans un <p>), extension qui modifie la page.",
      where: ["Le message (en mode développement) indique le composant et l'écart.", "Cherchez dans ce composant Date.now(), Math.random(), typeof window, localStorage utilisés pendant le rendu."],
      fix: ["Calculez les valeurs propres au navigateur après le montage (useEffect, onMounted).", "Corrigez l'imbrication HTML invalide.", "Donnez des id stables (useId) plutôt que générés au hasard."],
      check: "Relancez en mode développement : l'avertissement d'hydratation disparaît.",
      a11y: { level: "possible", why: "Le framework peut recréer toute la page : le focus est perdu et les associations par id (étiquettes, aria-describedby) peuvent ne plus correspondre.", criteria: ["8.2", "11.1"] },
      priority: 1,
    },
  },
  {
    test: text(/Cannot read propert(y|ies) of (null|undefined)|Cannot set propert(y|ies) of (null|undefined)|is (null|undefined)\b|null is not an object|undefined is not an object/i),
    guide: {
      id: "js-null",
      title: "Script en erreur : élément ou donnée absent (null / undefined)",
      cause: "Le code utilise un élément ou une donnée qui n'existe pas à ce moment-là : document.querySelector() qui ne trouve rien (sélecteur faux, élément absent de cet écran), script exécuté avant que la page soit construite, ou réponse d'API différente de celle attendue.",
      where: ["Le fichier et la ligne indiqués ci-dessus : regardez quelle variable vaut null ou undefined.", "Si c'est un querySelector / getElementById, vérifiez que l'élément existe sur cet écran."],
      fix: [
        "Testez l'existence avant de l'utiliser (if (el) … ou el?.addEventListener(…)), surtout dans un script commun à tous les écrans.",
        "Chargez le script avec defer, ou exécutez-le après DOMContentLoaded.",
        "Pour une donnée d'API, prévoyez le cas vide ou en erreur.",
      ],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1", "7.3"] },
      priority: 0,
    },
  },
  {
    test: text(/is not a function/i),
    guide: {
      id: "js-not-function",
      title: "Script en erreur : fonction inexistante",
      cause: "Le code appelle une fonction qui n'existe pas : bibliothèque pas encore chargée, mauvaise version (méthode renommée), conflit entre deux versions de jQuery, ou faute de frappe.",
      where: ["Le fichier et la ligne indiqués ci-dessus.", "L'ordre des balises <script> et la version des bibliothèques chargées (onglet Réseau)."],
      fix: ["Chargez la bibliothèque avant le code qui l'utilise.", "Vérifiez le nom de la méthode dans la documentation de la version installée.", "Supprimez les doublons de bibliothèque."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1"] },
      priority: 0,
    },
  },
  {
    test: text(/is not defined|ReferenceError/i),
    guide: {
      id: "js-not-defined",
      title: "Script en erreur : variable ou bibliothèque non définie",
      cause: "Le code utilise une variable qui n'existe pas : bibliothèque non chargée ($, jQuery, gtag…), script chargé dans le mauvais ordre ou bloqué, faute de frappe.",
      where: ["Le fichier et la ligne indiqués ci-dessus.", "L'onglet Réseau : la bibliothèque est-elle chargée ? En erreur ? Après le code qui l'utilise ?"],
      fix: ["Chargez la bibliothèque avant le code qui l'utilise (ou importez-la).", "Si c'est un service tiers (statistiques, chat), vérifiez qu'il n'est pas bloqué et protégez l'appel (if (window.gtag) …)."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1"] },
      priority: 0,
    },
  },
  {
    test: text(/SyntaxError|Unexpected token|JSON\.parse|is not valid JSON/i),
    guide: {
      id: "js-syntax",
      title: "Script en erreur : syntaxe ou JSON invalide",
      cause: "Souvent, le code attend du JSON et reçoit une page HTML (« Unexpected token '<' ») : l'API renvoie une page d'erreur 404 ou de connexion. Sinon, le fichier JS est cassé (build incomplet) ou utilise une syntaxe trop récente.",
      where: ["L'onglet Réseau : la requête juste avant l'erreur, onglet Response (HTML au lieu de JSON ?).", "Le fichier et la ligne indiqués ci-dessus."],
      fix: ["Corrigez l'URL d'API ou la réponse du serveur.", "Testez response.ok avant response.json().", "Si le fichier JS est cassé, relancez un build complet."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1"] },
      priority: 0,
    },
  },
  {
    test: (e) => e.source === "exception",
    guide: {
      id: "js-error",
      title: "Erreur JavaScript non interceptée",
      cause: "Une erreur a interrompu un script sans être gérée (ni try/catch, ni .catch() sur une promesse).",
      where: ["Le fichier, la ligne et la pile d'appels indiqués ci-dessus."],
      fix: ["Corrigez la cause de l'erreur à la ligne indiquée.", "Pour une promesse (fetch, async), ajoutez un .catch() ou un try/catch qui affiche un message d'erreur compréhensible."],
      check: RELOAD_STEP,
      a11y: { level: "fort", why: SCRIPT_BROKEN, criteria: ["7.1"] },
      priority: 0,
    },
  },
  // --- Avertissements ---
  {
    test: (e) => e.code === "QuirksModeIssue",
    guide: {
      id: "quirks",
      title: "Page en mode de compatibilité (DOCTYPE absent)",
      cause: "La page ne commence pas par <!DOCTYPE html> : le navigateur applique d'anciennes règles d'affichage.",
      where: ["La toute première ligne du gabarit HTML (rien, même pas un espace ou un commentaire, avant le doctype)."],
      fix: ["Ajoutez <!DOCTYPE html> en première ligne."],
      check: "Dans la console, document.compatMode vaut « CSS1Compat ».",
      a11y: { level: "possible", why: "Le RGAA demande un type de document déclaré ; le mode de compatibilité peut aussi casser l'agrandissement et le reflow.", criteria: ["8.1"] },
      priority: 1,
    },
  },
  {
    test: (e) => e.code === "DeprecationIssue" || text(/\[Deprecation\]|is deprecated|deprecated/i)(e),
    guide: {
      id: "deprecation",
      title: "Fonctionnalité obsolète",
      cause: "Le code (souvent une bibliothèque ou un script tiers) utilise une fonctionnalité que les navigateurs vont retirer.",
      where: ["Le fichier indiqué ; s'il s'agit d'une bibliothèque, sa version dans package.json."],
      fix: ["Mettez à jour la bibliothèque concernée, ou remplacez l'appel par l'alternative indiquée dans le message."],
      check: RELOAD_STEP,
      priority: 3,
    },
  },
  {
    test: (e) => e.code === "CookieIssue" || text(/cookie/i)(e),
    guide: {
      id: "cookie",
      title: "Cookie mal configuré",
      cause: "Un cookie n'a pas les attributs attendus (SameSite, Secure) ou sera bloqué en contexte tiers.",
      where: ["Onglet Application > Cookies, et l'en-tête Set-Cookie de la réponse qui le crée (souvent un service tiers)."],
      fix: ["Ajoutez SameSite=Lax (ou None; Secure s'il doit fonctionner en contexte tiers) côté serveur.", "Pour un cookie tiers, vérifiez la configuration ou la version du service."],
      check: RELOAD_STEP,
      priority: 3,
    },
  },
  {
    test: text(/preload/i),
    guide: {
      id: "preload",
      title: "Ressource préchargée mais pas utilisée",
      cause: "Une balise <link rel=\"preload\"> charge une ressource qui n'est pas utilisée rapidement, ou avec un attribut as incorrect.",
      where: ["Les balises <link rel=\"preload\"> du <head>."],
      fix: ["Retirez le preload inutile, ou corrigez as (font, style, script, image) et crossorigin pour les polices."],
      check: RELOAD_STEP,
      priority: 3,
    },
  },
  {
    test: (e) => e.source === "issue",
    guide: {
      id: "issue-other",
      title: "Problème signalé par Chrome",
      cause: "Chrome a détecté un problème de configuration ou de compatibilité.",
      where: ["L'onglet Problèmes : le détail du problème et le lien « Learn more »."],
      fix: ["Suivez la recommandation affichée dans l'onglet Problèmes."],
      check: RELOAD_STEP,
      priority: 2,
    },
  },
  {
    test: (e) => e.level === "error",
    guide: {
      id: "console-error",
      title: "Erreur écrite dans la console",
      cause: "Le code du site (ou d'un service tiers) signale lui-même un problème avec console.error : le texte du message en donne la nature.",
      where: ["Cliquez sur le lien fichier:ligne du message pour trouver le code qui l'écrit, puis remontez à la condition qui le déclenche."],
      fix: ["Corrigez la cause décrite par le message.", "Si c'est un message de débogage laissé par erreur, retirez-le."],
      check: RELOAD_STEP,
      priority: 1,
    },
  },
  {
    test: () => true,
    guide: {
      id: "console-warning",
      title: "Avertissement dans la console",
      cause: "Le navigateur ou le code signale un point à surveiller, sans blocage immédiat.",
      where: ["Cliquez sur le lien fichier:ligne du message pour trouver le code concerné."],
      fix: ["Lisez le message : il indique en général la correction attendue."],
      check: RELOAD_STEP,
      priority: 3,
    },
  },
];

export function guideFor(e: DevtoolsEntry): DevtoolsGuide {
  return RULES.find((r) => r.test(e))!.guide;
}

export const SOURCE_LABEL: Record<DevtoolsSource, string> = {
  console: "Console",
  exception: "Console (erreur non interceptée)",
  network: "Réseau (Network)",
  issue: "Problèmes (Issues)",
};

/** Une même erreur, regroupée sur l'ensemble des écrans. */
export interface DevtoolsGroup {
  key: string;
  entry: DevtoolsEntry;
  guide: DevtoolsGuide;
  /** Index des écrans où elle apparaît. */
  pages: number[];
  /** Nombre total d'apparitions. */
  count: number;
  /** Éléments HTML en cause (onglet Problèmes), sans doublon. */
  elements: string[];
  /** Vient d'un autre domaine que l'écran scanné (service tiers, CDN). */
  thirdParty?: string;
}

/**
 * Clé de regroupement : même message au même endroit, d'un écran à l'autre.
 * Les paramètres d'URL (cache-busting, identifiants) sont ignorés.
 */
function groupKey(e: DevtoolsEntry): string {
  const strip = (u?: string) => (u ?? "").replace(/[?#].*$/, "");
  return [e.source, e.message.replace(/https?:\/\/\S+/g, (u) => strip(u)), strip(e.resource), strip(e.location)].join("|");
}

function host(u?: string): string | undefined {
  try {
    return u ? new URL(u).host || undefined : undefined;
  } catch {
    return undefined;
  }
}

function originUrl(e: DevtoolsEntry): string | undefined {
  return e.resource ?? e.location?.replace(/:\d+:\d+$/, "");
}

export function groupDevtools(pages: Array<{ url: string; devtools?: DevtoolsEntry[] }>): DevtoolsGroup[] {
  const map = new Map<string, DevtoolsGroup>();
  pages.forEach((p, i) => {
    for (const e of p.devtools ?? []) {
      const key = groupKey(e);
      const g = map.get(key);
      if (g) {
        if (!g.pages.includes(i)) g.pages.push(i);
        if (e.html && !g.elements.includes(e.html)) g.elements.push(e.html);
        g.count += e.count;
        continue;
      }
      const h = host(originUrl(e));
      const pageHost = host(p.url);
      map.set(key, { key, entry: e, guide: guideFor(e), pages: [i], count: e.count, elements: e.html ? [e.html] : [], ...(h && pageHost && h !== pageHost ? { thirdParty: h } : {}) });
    }
  });
  const a11yRank = (g: DevtoolsGroup) => (g.guide.a11y?.level === "fort" ? 0 : g.guide.a11y ? 1 : 2);
  return [...map.values()].sort(
    (a, b) =>
      a.guide.priority - b.guide.priority ||
      a11yRank(a) - a11yRank(b) ||
      (a.entry.level === "error" ? 0 : 1) - (b.entry.level === "error" ? 0 : 1) ||
      (a.thirdParty ? 1 : 0) - (b.thirdParty ? 1 : 0) ||
      b.pages.length - a.pages.length ||
      b.count - a.count,
  );
}

/** Étapes complètes du pas à pas pour un groupe, de la reproduction à la vérification. */
export function stepsFor(g: DevtoolsGroup): string[] {
  const where = [...g.guide.where];
  if (g.thirdParty) {
    where.unshift(`Cette erreur vient de ${g.thirdParty}, un service tiers ou un autre domaine : vérifiez sa configuration (clé, domaine autorisé, version) ou contactez son éditeur. S'il ne sert plus, retirez son script.`);
  }
  return [reproduceStep(g.entry), ...where, ...g.guide.fix, `Vérifier : ${g.guide.check}`];
}
