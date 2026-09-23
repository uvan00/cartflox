/**
 * Catalogue des agregateurs pris en charge par Cartflox : logos des
 * operateurs, fournisseurs (pays, moyens, champs de cles) et aide pour
 * trouver ses cles. Partage par la page Passerelles et son panneau.
 */

export type Fournisseur = {
    id: string; name: string; logo: string; countries: string[]; description: string;
    methods: string[];
    apiFields: { key: string; label: string; placeholder: string; configKey?: boolean; optionnel?: boolean }[];
    /**
     * Le fournisseur ouvre un compte marchand PAR PAYS, chacun avec ses propres
     * identifiants. Les champs `apiFields` restent le compte par defaut, et un
     * bloc supplementaire permet d'ajouter un compte pour chaque pays servi.
     */
    comptesParPays?: { idLabel: string; cleLabel: string };
    /**
     * Carte d'une FAMILLE ouverte par pays (Hub2, Djamo) : `id` distingue la
     * carte, `famille.id` est la cle de l'orchestrateur (adaptateur, webhooks).
     */
    famille?: { id: string; nom: string };
    /** Le fournisseur ne delivre que des cles de production : pas de mode test. */
    sansSandbox?: boolean;
    /** Le webhook se declare chez le fournisseur : consigne affichee avec notre adresse. */
    webhook?: string;
};

const METHOD_LOGOS: Record<string, string> = {
    // Orange Money
    'orange money': '/icons/methods/orange_money.svg',
    'orange': '/icons/methods/orange_money.svg',
    // Wave
    'wave': '/icons/methods/wave.svg',
    // Djamo (portefeuille)
    'djamo': '/icons/methods/djamo.svg',
    // MTN / MoMo
    'mtn': '/icons/methods/momo.svg',
    'momo': '/icons/methods/momo.svg',
    // Moov
    'moov': '/icons/methods/moov_money.svg',
    // Airtel
    'airtel': '/icons/methods/airtel.svg',
    // M-Pesa
    'm-pesa': '/icons/methods/mpesa.svg',
    'mpesa': '/icons/methods/mpesa.svg',
    // Vodafone / Vodacom
    'vodafone': '/icons/methods/vodafone_gh.svg',
    'vodacom': '/icons/methods/vodafone.svg',
    // Tigo
    'tigo': '/icons/methods/tigo.svg',
    'airteltigo': '/icons/methods/tigo.svg',
    // Free Money
    'free money': '/icons/methods/freemoney_sn.svg',
    'free': '/icons/methods/freemoney_sn.svg',
    // T-Money / Togocel
    't-money': '/icons/methods/togocel.svg',
    'togocel': '/icons/methods/togocel.svg',
    // Cards
    'visa': '/icons/methods/credit_card.svg',
    'mastercard': '/icons/methods/credit_card.svg',
    'amex': '/icons/methods/credit_card.svg',
    'verve': '/icons/methods/credit_card.svg',
    'card': '/icons/methods/credit_card.svg',
    // Digital wallets
    'apple pay': '/icons/methods/credit_card.svg',
    'google pay': '/icons/methods/credit_card.svg',
    'sepa': '/icons/methods/bank_transfer.svg',
    'ideal': '/icons/methods/bank_transfer.svg',
    'bancontact': '/icons/methods/bank_transfer.svg',
    'bank transfer': '/icons/methods/bank_transfer.svg',
    'ussd': '/icons/methods/ussd.svg',
    // Crypto
    'bitcoin': '/icons/methods/crypto.svg',
    'btc': '/icons/methods/crypto.svg',
    'ethereum': '/icons/methods/crypto.svg',
    'eth': '/icons/methods/crypto.svg',
    'usdc': '/icons/methods/crypto.svg',
    'litecoin': '/icons/methods/crypto.svg',
    'dogecoin': '/icons/methods/crypto.svg',
    // Flooz
    'flooz': '/icons/methods/togocel.svg',
    // Coris Money
    'coris': '/icons/methods/coris_money.svg',
    // Expresso
    'expresso': '/icons/methods/expresso.svg',
    // PawaPay extras
    'safaricom': '/icons/methods/mpesa.svg',
    'halotel': '/icons/methods/momo.svg',
    'movitel': '/icons/methods/momo.svg',
    'zamtel': '/icons/methods/momo.svg',
    'tnm': '/icons/methods/momo.svg',
};

export function getMethodLogo(methodName: string): string | null {
    const lower = methodName.toLowerCase();
    // Try exact substring matches, longest first
    const keys = Object.keys(METHOD_LOGOS).sort((a, b) => b.length - a.length);
    for (const key of keys) {
        if (lower.includes(key)) return METHOD_LOGOS[key];
    }
    return null;
}

// Hub2 ouvre un compte marchand par pays : une carte par pays, un seul adaptateur.
// Les colonnes sont croisees pour Hub2 : apiKey porte le Merchant ID, apiSecret la cle.
const HUB2 = { id: 'hub2', nom: 'Hub2' };
const CLES_HUB2 = [
    { key: 'apiSecret', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API Hub2' },
    { key: 'apiKey', label: 'Merchant ID', placeholder: 'Veuillez saisir votre Merchant ID Hub2' },
    { key: 'webhookSecret', label: 'Secret de webhook', placeholder: 'Facultatif : le secret affiché par Hub2 à la création du webhook', configKey: true, optionnel: true },
];
const WEBHOOK_HUB2 = "Déclarez l'adresse ci-dessous dans votre espace Hub2 (menu Webhooks, une déclaration par environnement, événements de paiement), puis reportez ici le secret que Hub2 affiche à la création : Cartflox vérifiera la signature de chaque événement. Sans secret, chaque événement est confirmé par un appel à l'API Hub2 avant d'être pris en compte.";
// Djamo Business : un compte (et un hote d'API) par pays, meme principe.
const DJAMO = { id: 'djamo', nom: 'Djamo Business' };
const CLES_DJAMO = [
    { key: 'token', label: 'Access Token', placeholder: 'at_… remis par Djamo Business', configKey: true },
    { key: 'companyId', label: 'Company ID', placeholder: 'Identifiant de votre entreprise chez Djamo', configKey: true },
    { key: 'webhookSecret', label: 'Secret de webhook', placeholder: 'Facultatif : la clé secrète de vos webhooks Djamo', configKey: true, optionnel: true },
];
const WEBHOOK_DJAMO = "Djamo envoie ses événements (sujet charge/events) à l'adresse ci-dessous : déclarez-la auprès de Djamo Business, puis reportez ici le secret de signature si vous en définissez un.";

export const ALL_PROVIDERS: Fournisseur[] = [
    {
        id: 'paydunya', name: 'PayDunya', logo: '/icons/methods/paydunya.svg',
        countries: ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF'],
        description: "Mobile Money & Cards en Afrique de l'Ouest",
        methods: [
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal', 'Wizall Money Sénégal', 'Expresso Sénégal',
            // Côte d'Ivoire
            'Orange Money CI', 'Wave CI', 'MTN CI', 'Moov CI',
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo',
            // Mali
            'Orange Money Mali', 'Moov Money Mali',
            // Burkina Faso
            'Orange Money Burkina', 'Coris Money Burkina',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'masterKey', label: 'Master Key', placeholder: 'Votre Master Key PayDunya (PAYDUNYA-MASTER-KEY)', configKey: true },
            { key: 'privateKey', label: 'Private Key', placeholder: 'Votre Private Key PayDunya (PAYDUNYA-PRIVATE-KEY)', configKey: true },
            { key: 'token', label: 'Token', placeholder: 'Votre Token PayDunya (PAYDUNYA-TOKEN)', configKey: true },
        ],
    },
    {
        id: 'paystack', name: 'Paystack', logo: '/icons/methods/paystack.svg',
        countries: ['NG', 'GH', 'ZA', 'KE', 'CI', 'EG', 'RW'],
        description: 'Le leader du paiement au Nigeria, présent dans 7 pays',
        methods: [
            // Nigeria
            'Visa / MasterCard', 'Verve', 'American Express', 'Bank Transfer Nigeria', 'USSD Nigeria',
            // Ghana
            'MTN MoMo Ghana', 'Vodafone Cash Ghana', 'AirtelTigo Ghana',
            // Kenya
            'M-Pesa Kenya', 'Airtel Money Kenya',
            // Afrique du Sud
            'EFT Afrique du Sud',
            // Côte d'Ivoire
            'MTN CI', 'Wave CI', 'Orange Money CI',
            // Égypte
            'Visa / MasterCard Égypte',
            // Rwanda
            'Visa / MasterCard Rwanda',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé Publique', placeholder: 'Veuillez saisir votre clé publique Paystack' },
            { key: 'apiSecret', label: 'Clé Secrète', placeholder: 'Veuillez saisir votre clé secrète Paystack' },
        ],
    },
    {
        id: 'stripe', name: 'Stripe', logo: '/icons/methods/stripe.svg',
        countries: ['US', 'CA', 'FR', 'UK', 'DE', 'Global'],
        description: 'La référence mondiale du paiement par carte bancaire',
        methods: [
            'Visa / MasterCard', 'American Express', 'Apple Pay', 'Google Pay',
            'SEPA Direct Debit', 'iDEAL', 'Bancontact', 'Giropay', 'Sofort',
            'EPS', 'P24', 'Alipay', 'WeChat Pay', 'Klarna', 'Afterpay / Clearpay',
            'ACH Bank Transfer', 'BACS Débit', 'PayNow', 'PromptPay',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé Publique', placeholder: 'Veuillez saisir votre clé publique Stripe' },
            { key: 'apiSecret', label: 'Clé Secrète', placeholder: 'Veuillez saisir votre clé secrète Stripe' },
        ],
    },
    {
        id: 'fedapay', name: 'FedaPay', logo: '/icons/methods/fedapay.svg',
        countries: ['BJ', 'TG', 'CI', 'SN', 'GN', 'ML', 'BF', 'NE'],
        description: 'Paiements simplifiés au Bénin et en Afrique Francophone',
        methods: [
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI', 'Moov CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Guinée
            'Orange Money Guinée', 'MTN Guinée',
            // Mali
            'Orange Money Mali',
            // Burkina Faso
            'Orange Money Burkina',
            // Niger
            'Airtel Money Niger',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API FedaPay' },
        ],
    },
    {
        id: 'coinbase', name: 'Coinbase', logo: '/icons/methods/coinbase_commerce.svg',
        countries: ['Global'],
        description: 'Acceptez les crypto-monnaies (BTC, ETH, USDC, etc.)',
        methods: [
            'Bitcoin (BTC)', 'Ethereum (ETH)', 'USDC', 'USDT (Tether)',
            'Litecoin (LTC)', 'Dogecoin (DOGE)', 'Bitcoin Cash (BCH)',
            'Dai (DAI)', 'Apecoin (APE)', 'Shiba Inu (SHIB)',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API Coinbase Commerce' },
            { key: 'apiSecret', label: 'Webhook Secret', placeholder: 'Veuillez saisir votre webhook secret' },
        ],
    },
    {
        id: 'kkiapay', name: 'Kkiapay', logo: '/icons/methods/kkiapay.svg',
        countries: ['BJ', 'TG', 'CI', 'SN'],
        description: 'Paiements simplifiés au Bénin, Togo et Afrique de l\'Ouest',
        methods: [
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Moov CI', 'Wave CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé Publique', placeholder: 'Veuillez saisir votre clé publique Kkiapay' },
            { key: 'apiSecret', label: 'Clé Privée', placeholder: 'Veuillez saisir votre clé privée Kkiapay' },
        ],
    },
    {
        id: 'flutterwave', name: 'Flutterwave', logo: '/icons/methods/flutterwave.svg',
        countries: ['NG', 'GH', 'KE', 'UG', 'TZ', 'RW', 'ZA', 'ZM', 'CI', 'SN', 'CM', 'BF', 'MW', 'EG'],
        description: 'Paiements dans 40+ pays africains',
        methods: [
            // Nigeria
            'MTN MoMo Nigeria', 'Airtel Money Nigeria', 'Visa / MasterCard', 'Verve',
            'Bank Transfer Nigeria', 'USSD Nigeria',
            // Ghana
            'MTN MoMo Ghana', 'Vodafone Cash Ghana', 'AirtelTigo Ghana',
            // Kenya
            'M-Pesa Kenya', 'Airtel Money Kenya',
            // Ouganda
            'MTN MoMo Ouganda', 'Airtel Money Ouganda',
            // Tanzanie
            'Airtel Money Tanzanie', 'Vodacom M-Pesa Tanzanie', 'Tigo Pesa Tanzanie',
            // Rwanda
            'MTN MoMo Rwanda', 'Airtel Money Rwanda',
            // Zambie
            'MTN MoMo Zambie', 'Airtel Money Zambie', 'Zamtel Money Zambie',
            // Afrique du Sud
            'EFT Afrique du Sud',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI', 'Moov CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Cameroun
            'MTN MoMo Cameroun', 'Orange Money Cameroun',
            // Burkina Faso
            'Orange Money Burkina',
            // Malawi
            'Airtel Money Malawi', 'TNM Mpamba Malawi',
            // Égypte
            'Visa / MasterCard Égypte',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé Publique', placeholder: 'Veuillez saisir votre clé publique Flutterwave' },
            { key: 'apiSecret', label: 'Clé Secrète', placeholder: 'Veuillez saisir votre clé secrète Flutterwave' },
        ],
    },
    {
        id: 'cinetpay', name: 'CinetPay', logo: '/icons/methods/cinetpay.svg',
        countries: ['CI', 'SN', 'ML', 'TG', 'BJ', 'BF', 'CM', 'CD', 'GN', 'NE'],
        description: "L'acteur historique du paiement en Afrique Francophone",
        methods: [
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Moov CI', 'Wave CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo',
            // Mali
            'Orange Money Mali',
            // Burkina Faso
            'Orange Money Burkina', 'Moov Money Burkina',
            // Cameroun
            'MTN MoMo Cameroun', 'Orange Money Cameroun',
            // RD Congo
            'Airtel Money RDC', 'Orange Money RDC', 'Vodacom M-Pesa RDC',
            // Guinée
            'Orange Money Guinée',
            // Niger
            'Airtel Money Niger',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API CinetPay' },
            { key: 'apiSecret', label: 'Site ID', placeholder: 'Veuillez saisir votre Site ID CinetPay' },
        ],
    },
    {
        id: 'feexpay', name: 'FeexPay', logo: '/icons/methods/feexpay.svg',
        countries: ['BJ', 'TG', 'CI', 'SN', 'BF', 'CG', 'ML'],
        description: "Mobile Money & Cards au Bénin et Afrique de l'Ouest",
        methods: [
            // Bénin
            'MTN Bénin', 'Moov Bénin', 'Celtiis Money Bénin', 'Coris Money Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo', 'Moov Money Togo',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI', 'Moov CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Burkina Faso
            'Orange Money Burkina', 'Moov Money Burkina', 'Wave Burkina',
            // Mali
            'Orange Money Mali', 'Mobicash Mali',
            // Congo
            'MTN MoMo Congo',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiSecret', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API FeexPay' },
            { key: 'apiKey', label: 'Shop ID', placeholder: 'Veuillez saisir votre Shop ID FeexPay' },
            { key: 'webhookSecret', label: 'Jeton de webhook (facultatif)', placeholder: 'La valeur d\'en-tête choisie dans FeexPay', configKey: true, optionnel: true },
        ],
        webhook: "Dans FeexPay, menu Webhook, « Ajouter un nouveau webhook » : Url = l'adresse ci-dessous ; événements = « Tous les événements » (ou au moins transaction.successful et transaction.failed) ; type d'en-tête = Bearer ; valeur de l'en-tête = un mot de passe de votre choix, à recopier dans le champ « Jeton de webhook » ci-dessus pour que Cartflox vérifie l'origine. Cartflox reconfirme de toute façon chaque paiement auprès de FeexPay.",
    },
    {
        id: 'pawapay', name: 'PawaPay', logo: '/icons/methods/pawapay.svg',
        countries: ['BJ', 'BF', 'CM', 'CI', 'CD', 'ET', 'GA', 'GH', 'KE', 'LS', 'MW', 'MZ', 'NG', 'CG', 'RW', 'SN', 'SL', 'TZ', 'UG', 'ZM'],
        description: 'Mobile Money : 20 pays africains',
        webhook: "Dans le tableau de bord pawaPay, menu Developers puis Callback URLs, collez l'adresse ci-dessous dans le champ Deposits (à faire pour le bac à sable et pour la production). Cartflox revérifie chaque dépôt auprès de pawaPay avant de le confirmer.",
        methods: [
            'MTN MoMo Bénin', 'Moov Money Bénin',
            'Moov Money Burkina', 'Orange Money Burkina',
            'MTN MoMo Cameroun', 'Orange Money Cameroun',
            'MTN MoMo CI', 'Orange Money CI',
            'Vodacom M-Pesa RDC', 'Airtel Money RDC', 'Orange Money RDC',
            'Safaricom M-Pesa Éthiopie',
            'Airtel Money Gabon',
            'MTN MoMo Ghana', 'AirtelTigo Ghana', 'Vodafone Cash Ghana',
            'M-Pesa Kenya',
            'M-Pesa Lesotho',
            'Airtel Money Malawi', 'TNM Mpamba Malawi',
            'Movitel Mozambique',
            'Airtel Money Nigeria', 'MTN MoMo Nigeria',
            'Airtel Money Congo', 'MTN MoMo Congo',
            'Airtel Money Rwanda', 'MTN MoMo Rwanda',
            'Free Money Sénégal', 'Orange Money Sénégal',
            'Orange Money Sierra Leone',
            'Airtel Money Tanzanie', 'Vodacom M-Pesa Tanzanie', 'Tigo Pesa Tanzanie', 'Halotel Tanzanie',
            'Airtel Money Ouganda', 'MTN MoMo Ouganda',
            'Airtel Money Zambie', 'MTN MoMo Zambie', 'Zamtel Money Zambie',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API PawaPay' },
        ],
    },
    {
        id: 'notchpay', name: 'NotchPay', logo: '/icons/methods/notchpay.svg',
        countries: ['CM', 'CI', 'SN', 'BJ', 'TG', 'BF', 'ML', 'GN', 'NG'],
        description: 'Paiements Mobile Money et Cartes en Afrique',
        methods: [
            // Cameroun
            'MTN MoMo Cameroun', 'Orange Money Cameroun', 'Express Union Cameroun',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI', 'Moov CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo',
            // Burkina Faso
            'Orange Money Burkina',
            // Mali
            'Orange Money Mali',
            // Guinée
            'Orange Money Guinée',
            // Nigeria
            'MTN MoMo Nigeria',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé Publique', placeholder: 'Veuillez saisir votre clé publique NotchPay' },
        ],
    },
    {
        id: 'qosic', name: 'Qosic', logo: '/icons/methods/qosic.svg',
        countries: ['BJ', 'TG', 'CI'],
        description: 'Mobile Money au Bénin, au Togo et en Côte d\'Ivoire',
        methods: [
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Flooz Togo', 'Moov Money Togo',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI', 'Moov CI',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Client ID', placeholder: 'Veuillez saisir votre Client ID Qosic' },
            { key: 'apiSecret', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API Qosic' },
        ],
    },
    {
        id: 'monetbill', name: 'MonetBill', logo: '/icons/methods/monetbill.svg',
        countries: ['CM', 'SN', 'CD', 'CG', 'UG'],
        description: 'Mobile Money au Cameroun, aux deux Congo, au Sénégal et en Ouganda',
        methods: [
            // Cameroun
            'MTN MoMo Cameroun', 'Orange Money Cameroun', 'Express Union Cameroun',
            // Sénégal
            'Orange Money Sénégal',
            // RD Congo
            'Orange Money RDC', 'Airtel Money RDC',
            // Congo
            'MTN MoMo Congo', 'Airtel Money Congo',
            // Ouganda
            'MTN MoMo Ouganda', 'Airtel Money Ouganda',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé de Service', placeholder: 'Veuillez saisir votre clé de service MonetBill' },
        ],
    },
    {
        id: 'payplus', name: 'PayPlus', logo: '/icons/methods/payplus.svg',
        countries: ['BJ', 'TG', 'BF', 'CI'],
        description: 'Mobile Money au Bénin, au Togo, au Burkina Faso et en Côte d\'Ivoire',
        methods: [
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI', 'Moov CI',
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Burkina Faso
            'Orange Money Burkina', 'Moov Money Burkina',
            // Togo
            'T-Money Togo', 'Flooz Togo',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé Publique', placeholder: 'Veuillez saisir votre clé publique PayPlus' },
            { key: 'apiSecret', label: 'Clé Secrète', placeholder: 'Veuillez saisir votre clé secrète PayPlus' },
        ],
    },
    // ─── Hub2 : un compte marchand par pays, donc une carte par pays. Toutes
    // partagent l'adaptateur « hub2 », qui ne connait que le pays de la carte.
    {
        id: 'hub2_ci', name: 'Hub2 Côte d\'Ivoire', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['CI'],
        description: 'Orange Money, MTN MoMo, Moov Money et Wave en Côte d\'Ivoire',
        methods: ['Orange Money CI', 'MTN CI', 'Moov CI', 'Wave CI'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'hub2_sn', name: 'Hub2 Sénégal', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['SN'],
        description: 'Orange Money, Wave et Free Money au Sénégal',
        methods: ['Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'hub2_bj', name: 'Hub2 Bénin', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['BJ'],
        description: 'MTN MoMo et Moov Money au Bénin',
        methods: ['MTN Bénin', 'Moov Bénin'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'hub2_ml', name: 'Hub2 Mali', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['ML'],
        description: 'Orange Money et Moov Money au Mali',
        methods: ['Orange Money Mali', 'Moov Mali'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'hub2_bf', name: 'Hub2 Burkina Faso', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['BF'],
        description: 'Orange Money, Moov Money et Wave au Burkina Faso',
        methods: ['Orange Money Burkina', 'Moov Burkina', 'Wave Burkina'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'hub2_tg', name: 'Hub2 Togo', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['TG'],
        description: 'T-Money et Moov Money au Togo',
        methods: ['T-Money Togo', 'Moov Togo'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'hub2_cm', name: 'Hub2 Cameroun', logo: '/icons/methods/hub2.svg', famille: HUB2,
        countries: ['CM'],
        description: 'MTN MoMo au Cameroun',
        methods: ['MTN Cameroun'],
        apiFields: CLES_HUB2,
        webhook: WEBHOOK_HUB2,
    },
    {
        id: 'lengopay', name: 'LengoPay', logo: '/icons/methods/lengopay.svg',
        countries: ['GN', 'MA', 'SN', 'CI'],
        description: 'Paiements en Guinée Conakry, Maroc et Afrique de l\'Ouest',
        methods: [
            // Guinée
            'Orange Money Guinée', 'MTN Guinée',
            // Maroc
            'Visa / MasterCard Maroc', 'Virement Bancaire Maroc',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Wave CI',
        ],
        apiFields: [
            { key: 'apiKey', label: 'License Key', placeholder: 'Veuillez saisir votre License Key LengoPay' },
            { key: 'apiSecret', label: 'Website ID', placeholder: 'Veuillez saisir votre Website ID LengoPay' },
        ],
    },
    {
        id: 'cryptomus', name: 'Cryptomus', logo: '/icons/methods/cryptomus.svg',
        countries: ['Global'],
        description: 'Crypto-monnaies (BTC, ETH, USDT, 50+ coins)',
        methods: [
            'Bitcoin (BTC)', 'Ethereum (ETH)', 'USDT (Tether)', 'USDC',
            'Litecoin (LTC)', 'Dogecoin (DOGE)', 'Bitcoin Cash (BCH)',
            'Tron (TRX)', 'BNB Smart Chain', 'Polygon (MATIC)',
            'Solana (SOL)', 'Dash (DASH)', 'Monero (XMR)',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Merchant UUID', placeholder: 'Veuillez saisir votre Merchant UUID Cryptomus' },
            { key: 'apiSecret', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API Cryptomus' },
        ],
    },
    // ─── Wave Business : encaissement direct sur le compte Wave du marchand ───
    {
        id: 'wave', name: 'Wave Business', logo: '/icons/methods/wave.svg',
        countries: ['CI', 'SN', 'ML', 'BF'],
        description: "Encaissez directement sur votre compte Wave Business, sans intermédiaire",
        methods: ['Wave CI', 'Wave Sénégal', 'Wave Mali', 'Wave Burkina'],
        apiFields: [
            { key: 'apiKey', label: 'Clé API', placeholder: 'wave_ci_prod_… ou wave_sn_prod_…', configKey: true },
            { key: 'webhookSecret', label: 'Secret de webhook', placeholder: 'Facultatif : wave_xx_WHS_…, remis à la création du webhook', configKey: true, optionnel: true },
        ],
        sansSandbox: true,
        webhook: "Dans le portail Wave Business, menu Développeurs puis Webhooks, ajoutez l'adresse ci-dessous (événements checkout.session.completed et checkout.session.payment_failed) et collez le secret de signature dans le champ prévu.",
    },
    // ─── Djamo Business : un compte et un hôte d'API par pays ─────────────────
    {
        id: 'djamo_ci', name: 'Djamo Business Côte d\'Ivoire', logo: '/icons/methods/djamo.svg', famille: DJAMO,
        countries: ['CI'],
        description: "Paiement depuis un compte Djamo en Côte d'Ivoire, confirmé dans l'application",
        methods: ['Djamo CI'],
        apiFields: CLES_DJAMO,
        webhook: WEBHOOK_DJAMO,
    },
    {
        id: 'djamo_sn', name: 'Djamo Business Sénégal', logo: '/icons/methods/djamo.svg', famille: DJAMO,
        countries: ['SN'],
        description: "Paiement depuis un compte Djamo au Sénégal, confirmé dans l'application",
        methods: ['Djamo Sénégal'],
        apiFields: CLES_DJAMO,
        webhook: WEBHOOK_DJAMO,
    },
    // ─── PayTech (Intech) ─────────────────────────────────────────────────────
    {
        id: 'paytech', name: 'PayTech', logo: '/icons/methods/paytech.svg',
        countries: ['SN', 'CI', 'ML', 'BJ'],
        description: "Orange Money, Wave, Free Money, Wizall, E-Money et cartes au Sénégal, plus la Côte d'Ivoire, le Mali et le Bénin",
        methods: [
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal', 'Wizall Money Sénégal', 'E-Money Sénégal',
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Moov CI', 'Wave CI',
            // Mali
            'Orange Money Mali', 'Moov Money Mali',
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'apiKey', label: 'Clé API', placeholder: 'Veuillez saisir votre clé API PayTech', configKey: true },
            { key: 'apiSecret', label: 'Clé secrète', placeholder: 'Veuillez saisir votre clé secrète PayTech', configKey: true },
        ],
    },
    // ─── Magma OnePay ─────────────────────────────────────────────────────────
    {
        id: 'onepay', name: 'Magma OnePay', logo: '/icons/methods/onepay.svg',
        countries: ['CI', 'SN', 'BJ', 'TG', 'ML', 'BF', 'CM'],
        description: "Mobile Money, Wave et cartes dans sept pays d'Afrique de l'Ouest et du Centre",
        methods: [
            // Côte d'Ivoire
            'Orange Money CI', 'MTN CI', 'Moov CI', 'Wave CI',
            // Sénégal
            'Orange Money Sénégal', 'Wave Sénégal', 'Free Money Sénégal', 'Expresso Sénégal',
            // Bénin
            'MTN Bénin', 'Moov Bénin',
            // Togo
            'T-Money Togo', 'Moov Togo',
            // Mali
            'Orange Money Mali', 'Moov Money Mali',
            // Burkina Faso
            'Orange Money Burkina', 'Moov Burkina',
            // Cameroun
            'MTN MoMo Cameroun', 'Orange Money Cameroun',
            // Cartes
            'Visa / MasterCard',
        ],
        apiFields: [
            { key: 'token', label: 'Token API', placeholder: 'Veuillez saisir votre token Magma OnePay', configKey: true },
            { key: 'secret', label: 'Clé secrète (X-User-Secret)', placeholder: 'Veuillez saisir votre clé secrète Magma OnePay', configKey: true },
        ],
    },
    // ─── iPay Money (iFutur) ──────────────────────────────────────────────────
    {
        id: 'ipay', name: 'iPay Money', logo: '/icons/methods/ipay.svg',
        countries: ['NE', 'BJ'],
        description: "Airtel Money, Moov Money, Zamani et cartes au Niger et au Bénin",
        methods: ['Airtel Money Niger', 'Moov Money Niger', 'Zamani Niger', 'MTN Bénin', 'Moov Bénin', 'Visa / MasterCard'],
        apiFields: [
            { key: 'secretKey', label: 'Clé API secrète', placeholder: 'Veuillez saisir votre clé secrète iPay Money', configKey: true },
            { key: 'webhookSecret', label: 'Secret de webhook (Secret-Hash)', placeholder: 'Facultatif : le secret défini dans Développeurs, Webhooks', configKey: true, optionnel: true },
        ],
        webhook: "Dans iPay Money, menu Développeurs puis Webhooks, ajoutez l'adresse ci-dessous et reportez ici le secret (Secret-Hash) que vous y définissez.",
    },
];

export const AIDE_CLES: { motif: string; url: string; ou: string }[] = [
    { motif: "paydunya", url: "https://app.paydunya.com/", ou: "menu Intégrations, puis Clés API" },
    { motif: "cinetpay", url: "https://app.cinetpay.com/", ou: "menu Intégration, rubrique API" },
    { motif: "pawapay", url: "https://dashboard.pawapay.io/", ou: "rubrique API tokens" },
    { motif: "paystack", url: "https://dashboard.paystack.com/#/settings/developers", ou: "Settings, puis API Keys & Webhooks" },
    { motif: "stripe", url: "https://dashboard.stripe.com/apikeys", ou: "Developers, puis API keys" },
    { motif: "flutterwave", url: "https://dashboard.flutterwave.com/settings/apis", ou: "Settings, puis API" },
    { motif: "fedapay", url: "https://live.fedapay.com/", ou: "Paramètres, puis Clés API" },
    { motif: "kkiapay", url: "https://app.kkiapay.me/", ou: "Développeurs, puis Clés" },
    { motif: "feexpay", url: "https://app-v2.feexpay.me/", ou: "menu Développeur : la clé API et le Shop ID de votre boutique" },
    { motif: "notchpay", url: "https://business.notchpay.co/", ou: "Développeurs, puis Clés API" },
    { motif: "coinbase", url: "https://beta.commerce.coinbase.com/settings", ou: "Settings, puis API keys" },
    { motif: "hub2", url: "https://app.hub2.io/", ou: "menu Développeurs, puis Clés API : la clé API et le Merchant ID du compte de ce pays" },
    { motif: "cryptomus", url: "https://app.cryptomus.com/", ou: "Business, puis API" },
    { motif: "lengopay", url: "https://portal.lengopay.com/", ou: "Paramètres, puis API" },
    { motif: "paytech", url: "https://paytech.sn/", ou: "Espace client, puis Clés API" },
    { motif: "onepay", url: "https://magmaonepay.com/", ou: "identifiants (Token et Secret) remis par Magma OnePay à l'ouverture de votre accès API" },
    { motif: "djamo", url: "https://docs.djamo.com/", ou: "Access Token et Company ID remis par Djamo Business après validation de votre dossier" },
    { motif: "ipay", url: "https://i-pay.money/", ou: "menu Développeurs, puis Clés API (copiez la clé secrète)" },
    // « wave » en dernier : « flutterwave » le contient.
    { motif: "wave", url: "https://business.wave.com/", ou: "menu Développeurs, puis Clés API (réservé aux administrateurs ; la clé ne s'affiche qu'une fois)" },
];
export function aideCles(nom: string) {
    const n = (nom || "").toLowerCase();
    return AIDE_CLES.find((a) => n.includes(a.motif)) || null;
}

/* ---------- Aides partagees (page, panneau de configuration) ---------- */

export const NOMS_PAYS: Record<string, string> = {
    CI: "Côte d'Ivoire", SN: "Sénégal", BJ: "Bénin", TG: "Togo", ML: "Mali", BF: "Burkina Faso", CM: "Cameroun", GN: "Guinée",
    NG: "Nigeria", GH: "Ghana", KE: "Kenya", ZA: "Afrique du Sud", EG: "Égypte", UG: "Ouganda", TZ: "Tanzanie", RW: "Rwanda",
    ZM: "Zambie", MW: "Malawi", ZW: "Zimbabwe", MA: "Maroc", CD: "RD Congo", CG: "Congo", NE: "Niger", MR: "Mauritanie",
    GA: "Gabon", ET: "Éthiopie", LS: "Lesotho", MZ: "Mozambique", SL: "Sierra Leone", US: "États-Unis", CA: "Canada",
    FR: "France", UK: "Royaume-Uni", GB: "Royaume-Uni", DE: "Allemagne", Global: "Tous les pays",
};
export const PAYS_FILTRES = ["CI", "SN", "BJ", "TG", "ML", "BF", "CM", "GN", "NE", "NG", "GH", "KE", "Global"];

/** Drapeau emoji d'un code pays ISO (ou du nom francais d'un pays). */
export function nomPays(code: string) { return NOMS_PAYS[code] || code; }

/** Cle de l'orchestrateur d'une carte du catalogue : la famille pour Hub2 et Djamo, l'id sinon. */
export function cleFournisseur(id: string) {
    const p = ALL_PROVIDERS.find((x) => x.id === id);
    return p?.famille?.id || id;
}

/**
 * Fournisseur d'une transaction, tel qu'on veut l'afficher.
 *
 * `Transaction.provider` stocke soit le nom d'un agregateur, soit « cartflox »
 * quand aucun operateur n'a encore ete choisi (lien de paiement non paye).
 * « afriflow » est l'ancien nom de cette valeur d'attente, garde pour l'historique.
 */
export function fournisseurAffiche(brut?: string | null): { nom: string; logo: string | null } {
    const valeur = String(brut || "").trim();
    // Une transaction sans fournisseur n'a pas encore atteint d'agregateur :
    // c'est une session ouverte, pas une donnee manquante.
    if (!valeur) return { nom: "Non choisi", logo: null };
    const cle = valeur.toLowerCase();
    if (cle === "cartflox" || cle === "afriflow") return { nom: "Cartflox", logo: "/cf/brand/cartflox-icon.svg" };
    const p = ALL_PROVIDERS.find((x) => x.id === cle || x.name.toLowerCase() === cle);
    if (p) return { nom: p.name, logo: p.logo };
    // Cle d'orchestrateur ou ancien nom d'une famille par pays (« hub2 », « Hub2 ») :
    // le nom et le logo de la famille valent pour toutes ses cartes.
    const f = ALL_PROVIDERS.find((x) => x.famille && (x.famille.id === cle || x.famille.nom.toLowerCase() === cle));
    return f ? { nom: f.famille!.nom, logo: f.logo } : { nom: valeur, logo: null };
}

/**
 * Moyen de paiement reellement utilise, a partir du code enregistre sur la
 * transaction (`metadata.methodCode`). Les codes n'ont aucune forme commune
 * d'un agregateur a l'autre : « wave-ci », « ORANGE_CMR », « MTN_MOMO_CIV »,
 * « orange-ci-hub2 », « card-stripe ». On reconnait donc l'operateur par
 * MOTIF contenu dans le code, pas par egalite.
 *
 * L'ordre compte : « card » avant tout, sinon « card-notchpay » serait lu
 * comme du NotchPay mobile. Un code inconnu ne renvoie pas de logo plutot
 * qu'un logo faux.
 */
const MOTIFS_MOYEN: [RegExp, string, string | null][] = [
    [/google_?pay/, "Google Pay", "/icons/methods/credit_card.svg"],
    [/apple_?pay/, "Apple Pay", "/icons/methods/credit_card.svg"],
    [/card|carte|visa|master/, "Carte bancaire", "/icons/methods/credit_card.svg"],
    [/wave/, "Wave", "/icons/methods/wave.svg"],
    [/djamo/, "Djamo", "/icons/methods/djamo.svg"],
    [/orange/, "Orange Money", "/icons/methods/orange_money.svg"],
    [/mtn|momo/, "MTN MoMo", "/icons/methods/momo.svg"],
    [/moov|flooz/, "Moov Money", "/icons/methods/moov_money.svg"],
    [/airtel_?tigo|tigo/, "AirtelTigo", "/icons/methods/tigo.svg"],
    [/airtel/, "Airtel Money", "/icons/methods/airtel.svg"],
    [/vodacom/, "Vodacom M-Pesa", "/icons/methods/vodafone.svg"],
    [/vodafone/, "Vodafone Cash", "/icons/methods/vodafone_gh.svg"],
    [/m_?pesa|mpesa/, "M-Pesa", "/icons/methods/mpesa.svg"],
    // « t-money-togo » se normalise en « t_money_togo » : le tiret bas compte.
    [/t_?money|togocom|togocel/, "T-Money", "/icons/methods/togocel.svg"],
    [/free/, "Free Money", "/icons/methods/freemoney_sn.svg"],
    [/expresso/, "Expresso", "/icons/methods/expresso.svg"],
    [/wizall/, "Wizall", "/icons/methods/wizall_sn.svg"],
    [/e_?money/, "E-Money", "/icons/methods/e_money_sn.svg"],
    [/coris/, "Coris Money", "/icons/methods/coris_money.svg"],
    [/celtiis/, "Celtiis", "/icons/methods/celtiis_bj.svg"],
    [/crypto|usdt|btc/, "Crypto", "/icons/methods/crypto.svg"],
    [/bank|virement/, "Virement", "/icons/methods/bank_transfer.svg"],
    [/ussd/, "USSD", "/icons/methods/ussd.svg"],
    // Operateurs sans logo chez nous : le nom seul vaut mieux qu'un logo faux.
    [/zamtel/, "Zamtel", null],
    [/zamani/, "Zamani", null],
    [/halopesa|halo_?pesa/, "HaloPesa", null],
];

/** Etiquette de repli quand la transaction n'a pas garde le code du moyen. */
const TYPE_GENERIQUE: Record<string, { nom: string; logo: string | null }> = {
    MOBILE_MONEY: { nom: "Mobile Money", logo: null },
    CARD: { nom: "Carte bancaire", logo: "/icons/methods/credit_card.svg" },
    BANK_TRANSFER: { nom: "Virement", logo: "/icons/methods/bank_transfer.svg" },
    CRYPTO: { nom: "Crypto", logo: "/icons/methods/crypto.svg" },
};

export function moyenAffiche(code?: string | null, type?: string | null): { nom: string; logo: string | null } {
    const c = String(code || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (c) {
        for (const [motif, nom, logo] of MOTIFS_MOYEN) {
            if (motif.test(c)) return { nom, logo };
        }
    }
    return TYPE_GENERIQUE[String(type || "").toUpperCase()] || { nom: code || "?", logo: null };
}

/** Code ISO a partir du nom francais : l'inverse de nomPays, pour les moyens de
 *  paiement dont on ne connait le pays que par leur libelle. */
const CODES_PAR_NOM: Record<string, string> = Object.fromEntries(
    Object.entries(NOMS_PAYS).filter(([c]) => c !== "UK" && c !== "Global").map(([c, n]) => [n, c])
);
export function codeDuPays(nom: string) { return CODES_PAR_NOM[nom] || ""; }

const SITES: Record<string, string> = {
    paydunya: "paydunya.com", paystack: "paystack.com", hub2: "hub2.io", wave: "wave.com", paytech: "paytech.sn",
    onepay: "magmaonepay.com", djamo: "djamo.com", ipay: "i-pay.money",
};
export function siteFournisseur(id: string) {
    const cle = cleFournisseur(id);
    return `https://${SITES[cle] || cle + ".com"}`;
}

const MOTS_CARTE = ["visa", "mastercard", "amex", "american express", "card", "verve"];
/** Carte bancaire (type CARD en base), sinon Mobile Money : meme regle que l'ancienne page. */
export function estCarte(nom: string) { const n = nom.toLowerCase(); return MOTS_CARTE.some((k) => n.includes(k)); }

const MOTS_MOBILE = ["money", "momo", "mtn", "wave", "moov", "orange", "airtel", "m-pesa", "mpesa", "tigo", "flooz", "t-money", "free ", "wizall",
    "expresso", "coris", "vodafone", "vodacom", "halotel", "movitel", "zamtel", "tnm", "ecocash", "express union", "masrvi", "safaricom", "e-money", "celtiis"];
export function estMobileMoney(nom: string) { const n = nom.toLowerCase(); return MOTS_MOBILE.some((k) => n.includes(k)); }

const PAYS_DANS_NOM: [string, string][] = [
    ["sénégal", "Sénégal"], ["senegal", "Sénégal"], ["côte d'ivoire", "Côte d'Ivoire"], ["ivoire", "Côte d'Ivoire"], [" ci", "Côte d'Ivoire"],
    ["bénin", "Bénin"], ["benin", "Bénin"], ["togo", "Togo"], ["mali", "Mali"], ["burkina", "Burkina Faso"], ["cameroun", "Cameroun"],
    ["ghana", "Ghana"], ["nigeria", "Nigeria"], ["kenya", "Kenya"], ["guinée", "Guinée"], ["guinee", "Guinée"], ["niger", "Niger"],
    ["rdc", "RD Congo"], ["congo", "Congo"], ["rwanda", "Rwanda"], ["ouganda", "Ouganda"], ["tanzanie", "Tanzanie"], ["zambie", "Zambie"],
    ["malawi", "Malawi"], ["zimbabwe", "Zimbabwe"], ["maroc", "Maroc"], ["éthiopie", "Éthiopie"], ["gabon", "Gabon"], ["lesotho", "Lesotho"],
    ["mozambique", "Mozambique"], ["sierra leone", "Sierra Leone"], ["mauritanie", "Mauritanie"], ["égypte", "Égypte"], ["afrique du sud", "Afrique du Sud"],
];
/** Pays deduit du nom affiche d'un moyen ("Orange Money CI" : Côte d'Ivoire). */
export function paysDeMethode(nom: string): string {
    const n = " " + nom.toLowerCase();
    for (const [motif, pays] of PAYS_DANS_NOM) { if (n.includes(motif)) return pays; }
    return "Global";
}
