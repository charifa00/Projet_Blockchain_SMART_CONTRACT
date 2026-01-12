# 🏛️ Système de Suivi des Marchés Publics (Blockchain)

> **Projet de Fin de Module : Blockchain & Smart Contracts**  
> **Année Académique : 2025 - 2026**

---

## �‍💻 L'Équipe
- **Réalisé par :** Charifa Dreoui & Safae Karkach
- **Encadré par :** M. Khalid Boukhdir

---

## � Présentation du Projet
Ce projet propose une solution décentralisée pour la gestion des appels d'offres publics. En utilisant la technologie blockchain (Ethereum/EVM), nous automatisons le cycle de vie d'un marché public, de sa création à la libération des fonds, tout en garantissant une transparence absolue et une sécurité contre la fraude.

### Pourquoi la Blockchain ?
- **Transparence :** Chaque action est enregistrée de manière immuable.
- **Équité :** Les offres sont cachées jusqu'à la fin de la période de soumission.
- **Confiance :** Les paiements ne sont libérés qu'après validation par des auditeurs tiers.

---

## 🏗️ Architecture Technique
Le projet repose sur une architecture robuste composée de plusieurs couches :

### 1. Smart Contract (`Procurement.sol`)
Le cœur du système, écrit en Solidity 0.8.19. Il gère :
- La création des appels d'offres (Tenders).
- Le mécanisme de **Commit-Reveal** pour la confidentialité des offres.
- La logique de sélection automatique du vainqueur.
- La gestion des jalons (Milestones) et des paiements.

### 2. Interface CLI (`scripts/cli.js`)
Une application Node.js interactive pour interagir avec le contrat depuis le terminal. Elle est entièrement **francisée** pour une utilisation intuitive.

### 3. Dashboard Web Interactif (`dashboard.html`)
Un tableau de bord moderne et élégant servant d'interface graphique (GUI) pour la démonstration. Il permet de :
- Connecter un portefeuille (MetaMask) ou utiliser le nœud local.
- Visualiser les appels d'offres en temps réel.
- Effectuer toutes les opérations (Soumission, Révélation, Paiement) de manière visuelle et intuitive.

---

## 🛡️ Sécurité & Audit
La sécurité a été au cœur de notre développement :
- **Protection contre la Réentrance :** Utilisation du pattern *Checks-Effects-Interactions*.
- **Confidentialité par Hachage :** Les montants des offres ne sont révélés qu'après la clôture des soumissions.
- **Contrôle d'Accès :** Système de rôles (Propriétaire, Auditeur, Soumissionnaire) via des modifiers Solidity.

---

## � Documentation Détaillée
Pour une compréhension approfondie, consultez nos rapports spécialisés en français :

| Rapport | Description |
| :--- | :--- |
| 📘 **[Rapport Technique](./reports/Rapport_Technique_Detaille.md)** | Architecture logicielle, diagrammes de séquence et analyse du gas. |
| 🔍 **[Analyse Forensique](./reports/Analyse_Forensique_Detaillee.md)** | Étude de 5 transactions EVM réelles et scénarios d'attaques. |
| 🤖 **[Audit de Sécurité IA](./reports/Audit_IA_Detaille.md)** | Analyse des vulnérabilités assistée par IA et corrections humaines. |

---

## 🧪 Guide de Test

### Prérequis
- Node.js installé.
- Environnement Hardhat configuré.

### Étapes de Mise en Route
1.  **Installation des dépendances :**
    ```bash
    npm install
    ```
2.  **Lancer le nœud blockchain local :**
    ```bash
    npx hardhat node
    ```
3.  **Déployer le contrat :**
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```
4.  **Lancer l'interface CLI :**
    ```bash
    node scripts/cli.js
    ```

---

## 🏁 Conclusion
Ce système démontre comment la blockchain peut transformer la commande publique en un processus digital, automatisé et incorruptible. C'est une étape vers une gouvernance plus transparente et efficace.

---
*Optimisé pour l'excellence et la sécurité par l'équipe projet_blockchain_Dreoui_Karkach (Charifa & Safae).*