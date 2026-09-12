# STMGArenix — projet arrêté

> **STMGArenix est arrêté et n’est plus maintenu.**
> Le code source est conservé à titre d’archive sur [GitHub](https://github.com/MysticSaba-max/STMGArenix).
> Aucune nouvelle fonctionnalité, correction ou assistance n’est prévue.

Le site affiche uniquement une page d’arrêt, sans appel à l’API ni chargement du CAPTCHA. Le code de l’ancienne plateforme reste conservé dans ce dépôt à titre historique.

Merci à toutes les personnes qui ont contribué au projet, voté et participé à la communauté.

## À propos du projet

STMGArenix était une plateforme communautaire de classement et de comparaison de sites de streaming. Elle proposait :

- Un classement alimenté par les votes de la communauté.
- Une notation selon cinq critères : publicités, facilité d’utilisation, fiabilité des liens, catalogue et qualité vidéo.
- Un système de proposition de sites et une interface d’administration.
- Des protections contre les votes automatisés et les abus.

Les données et liens de l’ancienne plateforme peuvent être obsolètes. La disponibilité des services associés n’est plus garantie.

## Sécurité de l’historique

Trois anciennes clés API VPNAPI.io figurent dans l’historique Git. **Ces clés ont été révoquées** et retirées du code actuel. Elles ne doivent pas être réutilisées.

## Contenu de l’archive

| Dossier | Contenu |
| --- | --- |
| `src/` | Interface React et TypeScript, construite avec Vite et Tailwind CSS |
| `server/` | API Node.js / Express et accès à la base MySQL |
| `public/` | Ressources statiques du site |
| `docs/` | Documents de conception et plans historiques |

Les documents conservés décrivent le développement passé et ne constituent pas une feuille de route active :

- [Conception des protections anti-bot](docs/superpowers/specs/2026-05-04-anti-bot-hardening-design.md)
- [Plan historique d’implémentation](docs/superpowers/plans/2026-05-04-anti-bot-hardening.md)

## Auteurs

Projet créé par **MysticSaba** et **VillagersYT** (ancien administrateur de Movix et développeur).
