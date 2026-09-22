# Contribuer

Merci de votre intérêt. Quelques règles, courtes, qui évitent les allers-retours.

**Avant de coder** : ouvrez une issue pour tout changement qui touche au chemin de paiement (initiation, vérification, webhooks, routage). Un agrégateur qui change de comportement en production coûte de l'argent à de vrais marchands ; on discute d'abord.

**Un adaptateur** doit venir avec : la documentation officielle de l'API en lien dans l'en-tête du fichier, les moyens de paiement déclarés dans `src/lib/catalogue-moyens.ts`, et une note sur la façon de le tester sans argent (bac à sable du fournisseur, ou appel à montant nul quand le fournisseur le permet).

**Le code** est en TypeScript strict, `npm run typecheck` doit passer, et le style est celui du fichier que vous modifiez : commentaires en français, sans tiret long ni point médian dans les textes visibles, une devise toujours à côté de son montant.

**Jamais** de clé d'API, de numéro de téléphone réel ni d'adresse e-mail personnelle dans le code, les tests ou les captures. Le dépôt est passé au détecteur de secrets à chaque proposition.

**Une proposition** = un sujet. Décrivez ce que vous avez vérifié et comment, pas seulement ce que vous avez changé.

## Droits sur vos contributions

Cartflox est publié sous AGPL-3.0. Son éditeur en vend aussi des licences commerciales aux organisations que l'AGPL empêche de l'utiliser, et c'est ce qui finance le projet. Pour que cela reste possible, une contribution ne peut pas arriver sous un régime différent du reste du code.

**En proposant une contribution, vous déclarez** en détenir les droits ou avoir l'autorisation de la soumettre, et vous accordez à l'éditeur du projet (le détenteur du dépôt `uvan00/cartflox`) le droit non exclusif, mondial, irrévocable et sans redevance de l'utiliser, de la modifier et de la redistribuer sous AGPL-3.0 ainsi que sous toute autre licence, y compris commerciale.

Vous gardez vos droits d'auteur sur ce que vous écrivez. Vous n'y renoncez pas : vous autorisez seulement sa redistribution sous un autre régime. Si votre employeur détient les droits sur votre travail, obtenez son accord avant de proposer du code.

## Liste des domaines jetables

Les inscriptions avec une adresse temporaire sont refusées à partir de `src/lib/domaines-jetables.json`, copie de la liste publique du projet disposable-email-domains (CC0). Pour la rafraîchir, remplacez le fichier par la dernière version publiée :

```bash
curl -fsSL https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf | python3 -c "import json,sys; json.dump(sorted({l.strip().lower() for l in sys.stdin if l.strip()}), open('src/lib/domaines-jetables.json','w'))"
```
