# Cartflox

Orchestrateur de paiements open source pour l'Afrique : une seule intégration pour encaisser par Mobile Money et par carte à travers 23 agrégateurs, avec routage automatique entre passerelles, page de paiement hébergée, liens de paiement, transferts d'argent sortants, API, webhooks et tableau de bord.

Cartflox est le moteur qui fait tourner [cartflox.com](https://cartflox.com). Ce dépôt en est la version auto-hébergeable : chaque marchand branche ses propres comptes d'agrégateurs (ses clés), l'argent arrive directement chez lui, et aucune commission n'est prélevée par le logiciel.

## Ce que vous obtenez

- **23 adaptateurs d'agrégateurs** : PawaPay, PayDunya, CinetPay, Hub2, Wave Business, Djamo, PayTech, OnePay, iPay, FeexPay, FedaPay, Kkiapay, Notch Pay, Monetbil, Paystack, Flutterwave, Stripe, et d'autres. Un seul contrat d'interface (`src/lib/orchestrator/types.ts`), un fichier par fournisseur.
- **Routage automatique** : quand plusieurs passerelles servent le même moyen de paiement, la commande est envoyée à la meilleure, mesurée sur les taux de réussite réels par pays, moyen et devise, avec secours automatique et mise à l'écart temporaire des passerelles en panne (`src/lib/orchestrator/`).
- **Page de paiement hébergée** (`/checkout/<id>`) : choix du moyen, push USSD ou redirection selon l'opérateur, code de confirmation quand l'opérateur l'exige, carte bancaire dans la page, suivi d'état en direct, bilingue français et anglais.
- **Liens de paiement** : montant fixe ou libre, quantité, images, expiration, QR code.
- **Transferts sortants** : envoi d'argent vers Mobile Money par API ou depuis le tableau de bord, avec idempotence et suivi.
- **API REST** (`/api/v1`) : sessions de paiement, transactions, liens, transferts, webhooks signés HMAC et rejouables, clés de test et de production.
- **Tableau de bord** : transactions, statistiques, clients, passerelles, moyens de paiement, équipe, journal d'API.
- **Multi-devises** : XOF, XAF, CDF, USD, EUR, GHS, NGN, KES et d'autres, sans jamais additionner deux devises.

## Ce que ce dépôt ne contient pas

- L'encaissement pour compte de tiers avec reversement (le mode « géré », commercialisé sous [nyole](https://nyole.com)), la vérification d'identité, l'administration de plateforme et l'application mobile. Ce sont des services, pas le moteur.
- Le site vitrine de cartflox.com, construit sur un gabarit commercial que nous n'avons pas le droit de redistribuer.

## Démarrer

Prérequis : Node 20 ou plus, PostgreSQL 14 ou plus. Redis est facultatif (limitation de débit partagée entre plusieurs instances).

```bash
git clone https://github.com/uvan00/cartflox.git
cd cartflox
cp .env.example .env        # puis renseignez DATABASE_URL, BETTER_AUTH_SECRET et le SMTP
npm install
npx prisma db push          # crée les tables
npm run dev                 # http://localhost:3000
```

Créez un compte, ouvrez un espace, branchez une passerelle avec vos clés dans **Passerelles**, et créez votre premier lien de paiement. La documentation intégrée est servie sur `/docs`.

### Les clés des agrégateurs

Les clés que les marchands saisissent sont chiffrées en base (AES-256-GCM, clé dérivée par espace) avec une clé maître qui ne quitte jamais le serveur. Générez-la une fois :

```bash
mkdir -p /etc/cartflox && openssl rand -base64 48 > /etc/cartflox/master.key && chmod 600 /etc/cartflox/master.key
```

Puis, dans `.env` : `KEY_VAULTS_SECRET="file:/etc/cartflox/master.key"`. Perdre cette clé rend toutes les clés d'agrégateurs illisibles : sauvegardez-la à part de la base.

### Tâches planifiées

Quatre appels HTTP à programmer (cron, systemd timer...), authentifiés par `CRON_SECRET` dans l'en-tête `x-cron-secret` (sans `CRON_SECRET`, ces routes refusent tout) :

| Fréquence | Appel | Rôle |
|---|---|---|
| toutes les 10 min | `GET /api/cron/sync-pending` | relit l'état des paiements en attente chez les agrégateurs, abandonne au-delà de 30 min |
| toutes les 10 min | `GET /api/cron/sync-transferts` | idem pour les transferts sortants |
| toutes les 5 min | `GET /api/cron/webhooks-retry` | rejoue les webhooks non livrés pendant 72 h |
| une fois par jour | `GET /api/cron/purge-tests` | efface les données de test anciennes |

```
*/10 * * * * curl -fsS -H "x-cron-secret: $CRON_SECRET" https://votre-domaine/api/cron/sync-pending
```

### Webhooks entrants des agrégateurs

Chaque fournisseur notifie `POST /api/webhooks/<fournisseur>` (paiements) et `POST /api/webhooks/transferts/<fournisseur>` (transferts). L'adresse exacte à déclarer chez chaque agrégateur est affichée dans **Passerelles** une fois la passerelle branchée.

## Ajouter un agrégateur

1. Un fichier dans `src/lib/orchestrator/adapters/` qui implémente `IPaymentProvider` (`initiatePayment`, `verifyPayment`, facultativement `refund`, `initiatePayout`, `verifyPayout`).
2. Sa déclaration dans `src/lib/orchestrator/factory.ts` et sa clé dans `src/lib/cle-fournisseur.ts`.
3. Ses moyens de paiement (opérateur, pays, devise, code) dans `src/lib/catalogue-moyens.ts` : c'est ce catalogue qui nourrit la page de paiement et empêche le routeur d'envoyer un paiement à une passerelle qui ne sert pas le pays.
4. Le traitement de ses webhooks dans `src/app/api/webhooks/[provider]/route.ts`.

Les règles maison : une seule fabrique d'adaptateurs, une seule dérivation de clé à partir du nom de la passerelle, jamais deux devises additionnées, jamais un montant arrondi à l'unité hors franc CFA.

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour signaler une faille. Les clés d'agrégateurs ne sortent jamais du serveur, les journaux fournisseurs sont masqués à l'écriture, les webhooks sont signés et vérifiés, et les adresses e-mail temporaires sont refusées à l'inscription.

## Licence

[GNU AGPL v3](LICENSE). Vous pouvez utiliser, modifier et héberger Cartflox librement, y compris commercialement ; si vous le proposez modifié comme service, vous publiez vos modifications sous la même licence. Pour une licence commerciale sans cette obligation, écrivez à support@cartflox.com.
