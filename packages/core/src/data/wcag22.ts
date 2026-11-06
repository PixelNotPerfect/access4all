/**
 * Critères de succès ajoutés par les WCAG 2.2 (recommandation W3C du 5 octobre 2023,
 * mise à jour en décembre 2024) et absents du RGAA 4.1.2, qui repose sur les WCAG 2.1.
 *
 * Ils ne sont pas (encore) opposables en France, mais la norme européenne EN 301 549
 * et la future version du RGAA s'appuieront sur les WCAG 2.2 : les respecter dès
 * maintenant évite une seconde mise en conformité.
 *
 * Note : le critère 4.1.1 (Parsing) est obsolète en WCAG 2.2 ; le RGAA 4.1.2
 * le conserve (critères 8.1 et 8.2), on le garde donc côté RGAA.
 */
import type { Wcag22Criterion } from "../types.js";

export const wcag22Additions: Wcag22Criterion[] = [
  { id: "WCAG-2.4.11", sc: "2.4.11", level: "AA", title: "Focus non masqué (minimum)",
    summary: "L'élément qui reçoit le focus n'est pas entièrement caché par un autre contenu (en-tête collant, bandeau cookies, chat).",
    owners: ["design", "dev"], impact: "bloquant", effort: 1, automation: "manuel",
    design: "Vérifier que les éléments fixes (en-tête collant, bandeau cookies, bouton de chat) ne recouvrent pas les éléments focusés.",
    dev: "Utiliser scroll-padding-top égal à la hauteur de l'en-tête collant ; fermer ou repositionner les bandeaux fixes.",
    test: "Parcourir la page avec Tab : chaque élément focusé reste au moins partiellement visible." },
  { id: "WCAG-2.4.12", sc: "2.4.12", level: "AAA", title: "Focus non masqué (amélioré)",
    summary: "Aucune partie de l'élément focusé n'est cachée par un contenu créé par l'auteur.",
    owners: ["design", "dev"], impact: "mineur", effort: 1, automation: "manuel",
    dev: "Garantir que l'élément focusé est entièrement visible.",
    test: "Parcourir la page avec Tab : chaque élément focusé est entièrement visible." },
  { id: "WCAG-2.4.13", sc: "2.4.13", level: "AAA", title: "Apparence du focus",
    summary: "L'indicateur de focus a une surface au moins égale à un contour de 2 px et un contraste de 3:1 entre états focusé et non focusé.",
    owners: ["design"], impact: "mineur", effort: 1, automation: "manuel",
    design: "Indicateur de focus d'au moins 2 px d'épaisseur autour de l'élément, contrasté à 3:1.",
    test: "Mesurer l'épaisseur et le contraste de l'indicateur de focus." },
  { id: "WCAG-2.5.7", sc: "2.5.7", level: "AA", title: "Mouvements de glissement",
    summary: "Toute fonctionnalité utilisant un glisser-déposer peut être réalisée avec un pointeur unique sans glisser.",
    owners: ["design", "dev"], impact: "majeur", effort: 2, automation: "manuel",
    design: "Prévoir une alternative au glisser-déposer : boutons monter/descendre, menu « Déplacer vers… », clic sur une position de curseur.",
    dev: "Implémenter l'alternative en clic simple pour chaque interaction de glissement (tri, curseur, carte).",
    test: "Réaliser chaque action de glissement avec de simples clics." },
  { id: "WCAG-2.5.8", sc: "2.5.8", level: "AA", title: "Taille des cibles (minimum)",
    summary: "Les cibles de pointage font au moins 24 × 24 px CSS, ou sont assez espacées.",
    owners: ["design", "dev"], impact: "majeur", effort: 1, automation: "semi",
    design: "Cibles d'au moins 24 × 24 px (44 × 44 px recommandé sur mobile), ou un espacement équivalent entre petites cibles.",
    dev: "Agrandir la zone cliquable (padding, min-width/min-height) des icônes, puces de pagination et liens rapprochés.",
    test: "Mesurer les cibles et leur espacement (règle axe target-size)." },
  { id: "WCAG-3.2.6", sc: "3.2.6", level: "A", title: "Aide cohérente",
    summary: "Les mécanismes d'aide (contact, chat, FAQ) apparaissent au même endroit relatif sur les pages.",
    owners: ["design"], impact: "mineur", effort: 1, automation: "manuel",
    design: "Placer les liens d'aide et de contact au même emplacement dans tous les gabarits.",
    test: "Comparer l'emplacement des mécanismes d'aide sur plusieurs pages." },
  { id: "WCAG-3.3.7", sc: "3.3.7", level: "A", title: "Saisie redondante",
    summary: "Une information déjà saisie dans le même parcours est pré-remplie ou sélectionnable.",
    owners: ["design", "dev"], impact: "majeur", effort: 2, automation: "manuel",
    design: "Proposer « Adresse de facturation identique » et pré-remplir les informations déjà demandées.",
    dev: "Conserver les données saisies entre les étapes et les proposer automatiquement.",
    test: "Parcourir le processus et vérifier qu'aucune information n'est redemandée sans être pré-remplie." },
  { id: "WCAG-3.3.8", sc: "3.3.8", level: "AA", title: "Authentification accessible (minimum)",
    summary: "L'authentification ne repose pas sur un test cognitif (mémoriser, transcrire, résoudre) sans alternative ou aide.",
    owners: ["design", "dev"], impact: "bloquant", effort: 2, automation: "manuel",
    design: "Autoriser le copier-coller et les gestionnaires de mots de passe ; proposer lien magique, passkey ou code envoyé.",
    dev: "Ne pas bloquer le collage dans les champs mot de passe et code ; autocomplete=\"current-password\" / \"one-time-code\".",
    test: "Se connecter avec un gestionnaire de mots de passe et en collant le code reçu." },
  { id: "WCAG-3.3.9", sc: "3.3.9", level: "AAA", title: "Authentification accessible (amélioré)",
    summary: "Pas de test cognitif, même de reconnaissance d'objets ou de contenu personnel.",
    owners: ["design", "dev"], impact: "mineur", effort: 2, automation: "manuel",
    design: "Éviter les CAPTCHA de reconnaissance d'images.",
    test: "Vérifier qu'aucune étape d'authentification ne demande de reconnaître des objets." },
];
