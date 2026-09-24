/**
 * Catalogue des moyens de paiement par fournisseur, et les quelques fonctions
 * qui le lisent.
 *
 * Ce module etait dans `lib/actions/methods.ts`, qui porte "use server" et ne
 * peut donc exporter que des fonctions asynchrones. Il en est sorti pour que
 * la route d'initiation du paiement puisse elle aussi savoir quels moyens une
 * passerelle sert reellement, sans recopier le catalogue : deux copies
 * finiraient par se contredire.
 */


// Comprehensive mapping of what each provider supports
// Using official logos from the PayDunya catalog
export const PROVIDER_METHODS: Record<string, any[]> = {
    'paydunya': [
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-money-senegal", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-senegal", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-money-senegal", logo: "/icons/methods/freemoney_sn.svg" },
        { name: "Wizall Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wizall-senegal", logo: "/icons/methods/wizall_sn.svg" },
        { name: "Expresso Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "expresso-sn", logo: "/icons/methods/expresso.svg" },

        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-money-ci", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci", logo: "/icons/methods/wave.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci", logo: "/icons/methods/momo.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci", logo: "/icons/methods/moov_money.svg" },

        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-benin", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-benin", logo: "/icons/methods/moov_money.svg" },

        // Mali
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-money-mali", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "moov-ml", logo: "/icons/methods/moov_money.svg" },

        // Togo
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "t-money-togo", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-togo", logo: "/icons/methods/togocel.svg" },
        { name: "Moov Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "moov-togo", logo: "/icons/methods/moov_money.svg" },

        // Burkina Faso
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-money-burkina", logo: "/icons/methods/orange_money.svg" },
        { name: "Coris Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "coris-money-burkina", logo: "/icons/methods/coris_money.svg" },
        { name: "Moov Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-burkina-faso", logo: "/icons/methods/moov_money.svg" },

        // Cartes (single entry — PayDunya processes both via 'card' endpoint)
        { name: "Carte Bancaire", country: "UEMOA", flag: "", type: "CARD", code: "card", logo: "/icons/methods/credit_card.svg" },
    ],
    'fedapay': [
        // Bénin (direct charge)
        { name: "MTN MoMo Benin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-benin", logo: "/icons/methods/momo.svg" },
        { name: "MOOV Money Benin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-benin", logo: "/icons/methods/moov_money.svg" },
        { name: "Celtiis Benin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "celtiis-benin", logo: "/icons/methods/celtiis_bj.svg" },
        // Togo (direct charge)
        { name: "Moov Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "moov-togo", logo: "/icons/methods/moov_money.svg" },
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "togocom-togo", logo: "/icons/methods/togocel.svg" },
        // Guinée (direct charge)
        { name: "MTN Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "mtn-guinea", logo: "/icons/methods/momo.svg" },
        // Côte d'Ivoire (direct charge)
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-fedapay", logo: "/icons/methods/momo.svg" },
        // Niger (direct charge)
        { name: "Airtel Niger", country: "Niger", flag: "NE", type: "MOBILE_MONEY", code: "airtel-niger", logo: "/icons/methods/airtel.svg" },
        // Sénégal (direct charge)
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-senegal", logo: "/icons/methods/freemoney_sn.svg" },
    ],
    'pawapay': [
        // Bénin
        { name: "MTN MoMo Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "MTN_MOMO_BEN", logo: "/icons/methods/momo.svg" },
        { name: "Moov Money Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "MOOV_BEN", logo: "/icons/methods/moov_money.svg" },
        // Burkina Faso
        { name: "Moov Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "MOOV_BFA", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "ORANGE_BFA", logo: "/icons/methods/orange_money.svg" },
        // Cameroun
        { name: "MTN MoMo Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "MTN_MOMO_CMR", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "ORANGE_CMR", logo: "/icons/methods/orange_money.svg" },
        // Côte d'Ivoire
        { name: "MTN MoMo CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "MTN_MOMO_CIV", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "ORANGE_CIV", logo: "/icons/methods/orange_money.svg" },
        // RD Congo
        { name: "Vodacom M-Pesa RDC", country: "RD Congo", flag: "CD", type: "MOBILE_MONEY", code: "VODACOM_MPESA_COD", logo: "/icons/methods/mpesa.svg" },
        { name: "Airtel Money RDC", country: "RD Congo", flag: "CD", type: "MOBILE_MONEY", code: "AIRTEL_COD", logo: "/icons/methods/airtel.svg" },
        { name: "Orange Money RDC", country: "RD Congo", flag: "CD", type: "MOBILE_MONEY", code: "ORANGE_COD", logo: "/icons/methods/orange_money.svg" },
        // Éthiopie
        { name: "Safaricom M-Pesa Éthiopie", country: "Éthiopie", flag: "ET", type: "MOBILE_MONEY", code: "MPESA_ETH", logo: "/icons/methods/mpesa.svg" },
        // Gabon
        { name: "Airtel Money Gabon", country: "Gabon", flag: "GA", type: "MOBILE_MONEY", code: "AIRTEL_GAB", logo: "/icons/methods/airtel.svg" },
        // Ghana
        { name: "MTN MoMo Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "MTN_MOMO_GHA", logo: "/icons/methods/momo.svg" },
        { name: "AirtelTigo Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "AIRTELTIGO_GHA", logo: "/icons/methods/airtel.svg" },
        { name: "Vodafone Cash Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "VODAFONE_GHA", logo: "/icons/methods/vodafone_gh.svg" },
        // Kenya
        { name: "M-Pesa Kenya", country: "Kenya", flag: "KE", type: "MOBILE_MONEY", code: "MPESA_KEN", logo: "/icons/methods/mpesa.svg" },
        // Lesotho
        { name: "M-Pesa Lesotho", country: "Lesotho", flag: "LS", type: "MOBILE_MONEY", code: "MPESA_LSO", logo: "/icons/methods/mpesa.svg" },
        // Malawi
        { name: "Airtel Money Malawi", country: "Malawi", flag: "MW", type: "MOBILE_MONEY", code: "AIRTEL_MWI", logo: "/icons/methods/airtel.svg" },
        { name: "TNM Mpamba Malawi", country: "Malawi", flag: "MW", type: "MOBILE_MONEY", code: "TNM_MWI", logo: "/icons/methods/momo.svg" },
        // Mozambique
        { name: "Movitel Mozambique", country: "Mozambique", flag: "MZ", type: "MOBILE_MONEY", code: "MOVITEL_MOZ", logo: "/icons/methods/momo.svg" },
        // Nigeria
        { name: "Airtel Money Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "AIRTEL_NGA", logo: "/icons/methods/airtel.svg" },
        { name: "MTN MoMo Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "MTN_MOMO_NGA", logo: "/icons/methods/momo.svg" },
        // République du Congo
        { name: "Airtel Money Congo", country: "Congo", flag: "CG", type: "MOBILE_MONEY", code: "AIRTEL_COG", logo: "/icons/methods/airtel.svg" },
        { name: "MTN MoMo Congo", country: "Congo", flag: "CG", type: "MOBILE_MONEY", code: "MTN_MOMO_COG", logo: "/icons/methods/momo.svg" },
        // Rwanda
        { name: "Airtel Money Rwanda", country: "Rwanda", flag: "RW", type: "MOBILE_MONEY", code: "AIRTEL_RWA", logo: "/icons/methods/airtel.svg" },
        { name: "MTN MoMo Rwanda", country: "Rwanda", flag: "RW", type: "MOBILE_MONEY", code: "MTN_MOMO_RWA", logo: "/icons/methods/momo.svg" },
        // Sénégal
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "FREE_SEN", logo: "/icons/methods/freemoney_sn.svg" },
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "ORANGE_SEN", logo: "/icons/methods/orange_money.svg" },
        // Sierra Leone
        { name: "Orange Money Sierra Leone", country: "Sierra Leone", flag: "SL", type: "MOBILE_MONEY", code: "ORANGE_SLE", logo: "/icons/methods/orange_money.svg" },
        // Tanzanie
        { name: "Airtel Money Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "AIRTEL_TZA", logo: "/icons/methods/airtel.svg" },
        { name: "Vodacom M-Pesa Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "VODACOM_TZA", logo: "/icons/methods/mpesa.svg" },
        { name: "Tigo Pesa Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "TIGO_TZA", logo: "/icons/methods/tigo.svg" },
        { name: "Halotel Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "HALOTEL_TZA", logo: "/icons/methods/momo.svg" },
        // Ouganda
        { name: "Airtel Money Ouganda", country: "Ouganda", flag: "UG", type: "MOBILE_MONEY", code: "AIRTEL_OAPI_UGA", logo: "/icons/methods/airtel.svg" },
        { name: "MTN MoMo Ouganda", country: "Ouganda", flag: "UG", type: "MOBILE_MONEY", code: "MTN_MOMO_UGA", logo: "/icons/methods/momo.svg" },
        // Zambie
        { name: "Airtel Money Zambie", country: "Zambie", flag: "ZM", type: "MOBILE_MONEY", code: "AIRTEL_OAPI_ZMB", logo: "/icons/methods/airtel.svg" },
        { name: "MTN MoMo Zambie", country: "Zambie", flag: "ZM", type: "MOBILE_MONEY", code: "MTN_MOMO_ZMB", logo: "/icons/methods/momo.svg" },
        { name: "Zamtel Money Zambie", country: "Zambie", flag: "ZM", type: "MOBILE_MONEY", code: "ZAMTEL_ZMB", logo: "/icons/methods/momo.svg" },
    ],
    'paystack': [
        // Nigeria
        { name: "Visa / MasterCard", country: "Nigeria", flag: "NG", type: "CARD", code: "card-ng-paystack", logo: "/icons/methods/credit_card.svg" },
        { name: "Verve", country: "Nigeria", flag: "NG", type: "CARD", code: "verve-ng-paystack", logo: "/icons/methods/credit_card.svg" },
        { name: "American Express", country: "Nigeria", flag: "NG", type: "CARD", code: "amex-ng-paystack", logo: "/icons/methods/credit_card.svg" },
        { name: "Bank Transfer Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "bank-transfer-ng", logo: "/icons/methods/bank_transfer.svg" },
        { name: "USSD Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "ussd-ng-paystack", logo: "/icons/methods/ussd.svg" },
        { name: "MTN MoMo Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "mtn-ng-paystack", logo: "/icons/methods/momo.svg" },
        { name: "Airtel Money Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "airtel-ng-paystack", logo: "/icons/methods/airtel.svg" },
        // Ghana
        { name: "MTN MoMo Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "mtn-gh-paystack", logo: "/icons/methods/momo.svg" },
        { name: "Vodafone Cash Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "vodafone-gh-paystack", logo: "/icons/methods/vodafone_gh.svg" },
        { name: "AirtelTigo Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "airteltigo-gh-paystack", logo: "/icons/methods/airtel.svg" },
        // Kenya
        { name: "M-Pesa Kenya", country: "Kenya", flag: "KE", type: "MOBILE_MONEY", code: "mpesa-ke-paystack", logo: "/icons/methods/mpesa.svg" },
        // Afrique du Sud
        { name: "EFT Afrique du Sud", country: "Afrique du Sud", flag: "ZA", type: "MOBILE_MONEY", code: "eft-za-paystack", logo: "/icons/methods/bank_transfer.svg" },
        // Égypte
        { name: "Visa / MasterCard Égypte", country: "Égypte", flag: "EG", type: "CARD", code: "card-eg-paystack", logo: "/icons/methods/credit_card.svg" },
    ],
    'paypal': [
        { name: "PayPal", country: "Global", flag: "", type: "CARD", code: "paypal", logo: "/icons/methods/paypal.svg" },
    ],
    'stripe': [
        { name: "Visa / MasterCard", country: "Global", flag: "", type: "CARD", code: "card-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "American Express", country: "Global", flag: "", type: "CARD", code: "amex-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "Apple Pay", country: "Global", flag: "", type: "CARD", code: "apple-pay-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "Google Pay", country: "Global", flag: "", type: "CARD", code: "google-pay-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "SEPA Direct Debit", country: "Europe", flag: "EU", type: "CARD", code: "sepa-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "iDEAL", country: "Pays-Bas", flag: "NL", type: "CARD", code: "ideal-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "Bancontact", country: "Belgique", flag: "BE", type: "CARD", code: "bancontact-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "Giropay", country: "Allemagne", flag: "DE", type: "CARD", code: "giropay-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "Sofort", country: "Europe", flag: "EU", type: "CARD", code: "sofort-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "Klarna", country: "Global", flag: "", type: "CARD", code: "klarna-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "Afterpay / Clearpay", country: "Global", flag: "", type: "CARD", code: "afterpay-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "Alipay", country: "Chine", flag: "CN", type: "CARD", code: "alipay-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "WeChat Pay", country: "Chine", flag: "CN", type: "CARD", code: "wechatpay-stripe", logo: "/icons/methods/credit_card.svg" },
        { name: "ACH Bank Transfer", country: "États-Unis", flag: "US", type: "CARD", code: "ach-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "EPS", country: "Autriche", flag: "AT", type: "CARD", code: "eps-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "P24", country: "Pologne", flag: "PL", type: "CARD", code: "p24-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "PayNow", country: "Singapour", flag: "SG", type: "CARD", code: "paynow-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "PromptPay", country: "Thaïlande", flag: "TH", type: "CARD", code: "promptpay-stripe", logo: "/icons/methods/bank_transfer.svg" },
        { name: "BACS Débit", country: "Royaume-Uni", flag: "GB", type: "CARD", code: "bacs-stripe", logo: "/icons/methods/bank_transfer.svg" },
    ],
    'kkiapay': [
        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-kkiapay", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-kkiapay", logo: "/icons/methods/moov_money.svg" },
        // Togo
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-kkiapay", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-tg-kkiapay", logo: "/icons/methods/moov_money.svg" },
        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-kkiapay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-kkiapay", logo: "/icons/methods/momo.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-kkiapay", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-kkiapay", logo: "/icons/methods/wave.svg" },
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-kkiapay", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-kkiapay", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-kkiapay", logo: "/icons/methods/freemoney_sn.svg" },
        // Guinée
        { name: "Orange Money Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "orange-gn-kkiapay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "mtn-gn-kkiapay", logo: "/icons/methods/momo.svg" },
        // Cartes
        { name: "Visa / MasterCard", country: "UEMOA", flag: "", type: "CARD", code: "card-kkiapay", logo: "/icons/methods/credit_card.svg" },
    ],
    'flutterwave': [
        // Nigeria
        { name: "MTN MoMo Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "mtn-ng-fw", logo: "/icons/methods/momo.svg" },
        { name: "Airtel Money Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "airtel-ng-fw", logo: "/icons/methods/airtel.svg" },
        { name: "Visa / MasterCard", country: "Nigeria", flag: "NG", type: "CARD", code: "card-ng-fw", logo: "/icons/methods/credit_card.svg" },
        { name: "Verve", country: "Nigeria", flag: "NG", type: "CARD", code: "verve-ng-fw", logo: "/icons/methods/credit_card.svg" },
        { name: "Bank Transfer Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "bank-ng-fw", logo: "/icons/methods/bank_transfer.svg" },
        { name: "USSD Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "ussd-ng-fw", logo: "/icons/methods/ussd.svg" },
        // Ghana
        { name: "MTN MoMo Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "mtn-gh-fw", logo: "/icons/methods/momo.svg" },
        { name: "Vodafone Cash Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "vodafone-gh-fw", logo: "/icons/methods/vodafone_gh.svg" },
        { name: "AirtelTigo Ghana", country: "Ghana", flag: "GH", type: "MOBILE_MONEY", code: "airteltigo-gh-fw", logo: "/icons/methods/airtel.svg" },
        // Kenya
        { name: "M-Pesa Kenya", country: "Kenya", flag: "KE", type: "MOBILE_MONEY", code: "mpesa-ke-fw", logo: "/icons/methods/mpesa.svg" },
        { name: "Airtel Money Kenya", country: "Kenya", flag: "KE", type: "MOBILE_MONEY", code: "airtel-ke-fw", logo: "/icons/methods/airtel.svg" },
        // Ouganda
        { name: "MTN MoMo Ouganda", country: "Ouganda", flag: "UG", type: "MOBILE_MONEY", code: "mtn-ug-fw", logo: "/icons/methods/momo.svg" },
        { name: "Airtel Money Ouganda", country: "Ouganda", flag: "UG", type: "MOBILE_MONEY", code: "airtel-ug-fw", logo: "/icons/methods/airtel.svg" },
        // Tanzanie
        { name: "Airtel Money Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "airtel-tz-fw", logo: "/icons/methods/airtel.svg" },
        { name: "Vodacom M-Pesa Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "mpesa-tz-fw", logo: "/icons/methods/mpesa.svg" },
        { name: "Tigo Pesa Tanzanie", country: "Tanzanie", flag: "TZ", type: "MOBILE_MONEY", code: "tigo-tz-fw", logo: "/icons/methods/tigo.svg" },
        // Rwanda
        { name: "MTN MoMo Rwanda", country: "Rwanda", flag: "RW", type: "MOBILE_MONEY", code: "mtn-rw-fw", logo: "/icons/methods/momo.svg" },
        { name: "Airtel Money Rwanda", country: "Rwanda", flag: "RW", type: "MOBILE_MONEY", code: "airtel-rw-fw", logo: "/icons/methods/airtel.svg" },
        // Zambie
        { name: "MTN MoMo Zambie", country: "Zambie", flag: "ZM", type: "MOBILE_MONEY", code: "mtn-zm-fw", logo: "/icons/methods/momo.svg" },
        { name: "Airtel Money Zambie", country: "Zambie", flag: "ZM", type: "MOBILE_MONEY", code: "airtel-zm-fw", logo: "/icons/methods/airtel.svg" },
        { name: "Zamtel Money Zambie", country: "Zambie", flag: "ZM", type: "MOBILE_MONEY", code: "zamtel-zm-fw", logo: "/icons/methods/momo.svg" },
        // Afrique du Sud
        { name: "EFT Afrique du Sud", country: "Afrique du Sud", flag: "ZA", type: "CARD", code: "eft-za-fw", logo: "/icons/methods/bank_transfer.svg" },
        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-fw", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-fw", logo: "/icons/methods/momo.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-fw", logo: "/icons/methods/wave.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-fw", logo: "/icons/methods/moov_money.svg" },
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-fw", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-fw", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-fw", logo: "/icons/methods/freemoney_sn.svg" },
        // Cameroun
        { name: "MTN MoMo Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "mtn-cm-fw", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "orange-cm-fw", logo: "/icons/methods/orange_money.svg" },
        // Malawi
        { name: "Airtel Money Malawi", country: "Malawi", flag: "MW", type: "MOBILE_MONEY", code: "airtel-mw-fw", logo: "/icons/methods/airtel.svg" },
        { name: "TNM Mpamba Malawi", country: "Malawi", flag: "MW", type: "MOBILE_MONEY", code: "tnm-mw-fw", logo: "/icons/methods/momo.svg" },
        // Zimbabwe
        { name: "EcoCash Zimbabwe", country: "Zimbabwe", flag: "ZW", type: "MOBILE_MONEY", code: "ecocash-zw-fw", logo: "/icons/methods/momo.svg" },
        // Égypte
        { name: "Visa / MasterCard Égypte", country: "Égypte", flag: "EG", type: "CARD", code: "card-eg-fw", logo: "/icons/methods/credit_card.svg" },
        // Maroc
        { name: "Visa / MasterCard Maroc", country: "Maroc", flag: "MA", type: "CARD", code: "card-ma-fw", logo: "/icons/methods/credit_card.svg" },
    ],
    'cinetpay': [
        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-cinetpay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-cinetpay", logo: "/icons/methods/momo.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-cinetpay", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-cinetpay", logo: "/icons/methods/wave.svg" },
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-cinetpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-cinetpay", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-cinetpay", logo: "/icons/methods/freemoney_sn.svg" },
        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-cinetpay", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-cinetpay", logo: "/icons/methods/moov_money.svg" },
        // Togo
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-cinetpay", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-tg-cinetpay", logo: "/icons/methods/moov_money.svg" },
        // Mali
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-cinetpay", logo: "/icons/methods/orange_money.svg" },
        // Burkina Faso
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-cinetpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-bf-cinetpay", logo: "/icons/methods/moov_money.svg" },
        // Cameroun
        { name: "MTN MoMo Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "mtn-cm-cinetpay", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "orange-cm-cinetpay", logo: "/icons/methods/orange_money.svg" },
        // RD Congo
        { name: "Airtel Money RDC", country: "RD Congo", flag: "CD", type: "MOBILE_MONEY", code: "airtel-cd-cinetpay", logo: "/icons/methods/airtel.svg" },
        { name: "Orange Money RDC", country: "RD Congo", flag: "CD", type: "MOBILE_MONEY", code: "orange-cd-cinetpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Vodacom M-Pesa RDC", country: "RD Congo", flag: "CD", type: "MOBILE_MONEY", code: "mpesa-cd-cinetpay", logo: "/icons/methods/mpesa.svg" },
        // Guinée
        { name: "Orange Money Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "orange-gn-cinetpay", logo: "/icons/methods/orange_money.svg" },
        // Niger
        { name: "Airtel Money Niger", country: "Niger", flag: "NE", type: "MOBILE_MONEY", code: "airtel-ne-cinetpay", logo: "/icons/methods/airtel.svg" },
        // Cartes
        { name: "Visa / MasterCard", country: "UEMOA", flag: "", type: "CARD", code: "card-cinetpay", logo: "/icons/methods/credit_card.svg" },
    ],
    'feexpay': [
        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-feexpay", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-feexpay", logo: "/icons/methods/moov_money.svg" },
        { name: "Celtiis Money Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "celtiis-bj-feexpay", logo: "/icons/methods/celtiis_bj.svg" },
        { name: "Coris Money Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "coris-bj-feexpay", logo: "/icons/methods/coris_money.svg" },
        // Togo
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-feexpay", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-tg-feexpay", logo: "/icons/methods/moov_money.svg" },
        { name: "Moov Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "moov-tg-feexpay", logo: "/icons/methods/moov_money.svg" },
        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-feexpay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-feexpay", logo: "/icons/methods/momo.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-feexpay", logo: "/icons/methods/wave.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-feexpay", logo: "/icons/methods/moov_money.svg" },
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-feexpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-feexpay", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-feexpay", logo: "/icons/methods/freemoney_sn.svg" },
        // Burkina Faso
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-feexpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-bf-feexpay", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "wave-bf-feexpay", logo: "/icons/methods/wave.svg" },
        // Mali
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-feexpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Mobicash Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "mobicash-ml-feexpay", logo: "/icons/methods/momo.svg" },
        // Guinée
        // Congo
        { name: "MTN MoMo Congo", country: "Congo", flag: "CG", type: "MOBILE_MONEY", code: "mtn-cg-feexpay", logo: "/icons/methods/momo.svg" },
        // Cartes
        { name: "Visa / MasterCard", country: "UEMOA", flag: "", type: "CARD", code: "card-feexpay", logo: "/icons/methods/credit_card.svg" },
    ],
    'notchpay': [
        { name: "MTN MoMo Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "mtn-cameroon", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "orange-money-cameroon", logo: "/icons/methods/orange_money.svg" },
        { name: "Express Union Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "express-union-cm", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-money-ci-notchpay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-notchpay", logo: "/icons/methods/momo.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-notchpay", logo: "/icons/methods/wave.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-notchpay", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-notchpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-notchpay", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-notchpay", logo: "/icons/methods/freemoney_sn.svg" },
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-notchpay", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-notchpay", logo: "/icons/methods/moov_money.svg" },
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-notchpay", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-tg-notchpay", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-notchpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-notchpay", logo: "/icons/methods/orange_money.svg" },
        { name: "Orange Money Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "orange-gn-notchpay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN MoMo Nigeria", country: "Nigeria", flag: "NG", type: "MOBILE_MONEY", code: "mtn-ng-notchpay", logo: "/icons/methods/momo.svg" },
        { name: "Visa / MasterCard", country: "CEMAC", flag: "", type: "CARD", code: "card-notchpay", logo: "/icons/methods/credit_card.svg" },
    ],
    'qosic': [
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-benin-qosic", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-benin-qosic", logo: "/icons/methods/moov_money.svg" },
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-togo-qosic", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-tg-qosic", logo: "/icons/methods/moov_money.svg" },
        { name: "Moov Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "moov-togo-qosic", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-qosic", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-qosic", logo: "/icons/methods/momo.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-qosic", logo: "/icons/methods/wave.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-qosic", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-qosic", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-qosic", logo: "/icons/methods/wave.svg" },
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-qosic", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-bf-qosic", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "orange-gn-qosic", logo: "/icons/methods/orange_money.svg" },
        { name: "Visa / MasterCard", country: "UEMOA", flag: "", type: "CARD", code: "card-qosic", logo: "/icons/methods/credit_card.svg" },
    ],
    'monetbill': [
        { name: "MTN MoMo Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "mtn-cm-monetbill", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "orange-cm-monetbill", logo: "/icons/methods/orange_money.svg" },
        { name: "Express Union Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "eu-cm-monetbill", logo: "/icons/methods/momo.svg" },
        { name: "Visa / MasterCard", country: "Cameroun", flag: "CM", type: "CARD", code: "card-cm-monetbill", logo: "/icons/methods/credit_card.svg" },
    ],
    'payplus': [
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-payplus", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-payplus", logo: "/icons/methods/momo.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-payplus", logo: "/icons/methods/wave.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-payplus", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-payplus", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-payplus", logo: "/icons/methods/wave.svg" },
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-payplus", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "moov-ml-payplus", logo: "/icons/methods/moov_money.svg" },
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-payplus", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-payplus", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-payplus", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-bf-payplus", logo: "/icons/methods/moov_money.svg" },
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-payplus", logo: "/icons/methods/togocel.svg" },
        { name: "Flooz Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "flooz-tg-payplus", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "orange-gn-payplus", logo: "/icons/methods/orange_money.svg" },
        { name: "Visa / MasterCard", country: "UEMOA", flag: "", type: "CARD", code: "card-payplus", logo: "/icons/methods/credit_card.svg" },
    ],
    'hub2': [
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-hub2", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-hub2", logo: "/icons/methods/momo.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-hub2", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-hub2", logo: "/icons/methods/wave.svg" },
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-hub2", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-hub2", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-hub2", logo: "/icons/methods/freemoney_sn.svg" },
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-hub2", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-hub2", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-hub2", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "moov-ml-hub2", logo: "/icons/methods/moov_money.svg" },
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-hub2", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-bf-hub2", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "wave-bf-hub2", logo: "/icons/methods/wave.svg" },
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-hub2", logo: "/icons/methods/togocel.svg" },
        { name: "Moov Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "moov-tg-hub2", logo: "/icons/methods/moov_money.svg" },
        { name: "MTN Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "mtn-cm-hub2", logo: "/icons/methods/momo.svg" },
    ],
    'lengopay': [
        { name: "Orange Money Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "orange-gn-lengopay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN Guinée", country: "Guinée", flag: "GN", type: "MOBILE_MONEY", code: "mtn-gn-lengopay", logo: "/icons/methods/momo.svg" },
        { name: "Visa / MasterCard", country: "Guinée", flag: "GN", type: "CARD", code: "card-gn-lengopay", logo: "/icons/methods/credit_card.svg" },
    ],
    'cryptomus': [
        { name: "Bitcoin (BTC)", country: "Global", flag: "", type: "CARD", code: "btc-cryptomus", logo: "/icons/methods/crypto.svg" },
        { name: "Ethereum (ETH)", country: "Global", flag: "", type: "CARD", code: "eth-cryptomus", logo: "/icons/methods/crypto.svg" },
        { name: "USDT (Tether)", country: "Global", flag: "", type: "CARD", code: "usdt-cryptomus", logo: "/icons/methods/crypto.svg" },
        { name: "USDC", country: "Global", flag: "", type: "CARD", code: "usdc-cryptomus", logo: "/icons/methods/crypto.svg" },
        { name: "Litecoin (LTC)", country: "Global", flag: "", type: "CARD", code: "ltc-cryptomus", logo: "/icons/methods/crypto.svg" },
    ],
    // ─── PayTech (Intech) : page hebergee, operateur preselectionne ───
    'paytech': [
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-paytech", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-paytech", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-paytech", logo: "/icons/methods/freemoney_sn.svg" },
        { name: "Wizall Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wizall-sn-paytech", logo: "/icons/methods/wizall_sn.svg" },
        { name: "E-Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "emoney-sn-paytech", logo: "/icons/methods/e_money_sn.svg" },
        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-paytech", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-paytech", logo: "/icons/methods/momo.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-paytech", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-paytech", logo: "/icons/methods/wave.svg" },
        // Mali
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-paytech", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "moov-ml-paytech", logo: "/icons/methods/moov_money.svg" },
        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-paytech", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-paytech", logo: "/icons/methods/moov_money.svg" },
        // Cartes
        { name: "Visa / MasterCard", country: "International", flag: "", type: "CARD", code: "card-paytech", logo: "/icons/methods/credit_card.svg" },
    ],

    // ─── Magma OnePay : page hebergee ───
    'onepay': [
        // Côte d'Ivoire
        { name: "Orange Money CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "orange-ci-onepay", logo: "/icons/methods/orange_money.svg" },
        { name: "MTN CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "mtn-ci-onepay", logo: "/icons/methods/momo.svg" },
        { name: "Moov CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "moov-ci-onepay", logo: "/icons/methods/moov_money.svg" },
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-onepay", logo: "/icons/methods/wave.svg" },
        // Sénégal
        { name: "Orange Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "orange-sn-onepay", logo: "/icons/methods/orange_money.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-onepay", logo: "/icons/methods/wave.svg" },
        { name: "Free Money Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "free-sn-onepay", logo: "/icons/methods/freemoney_sn.svg" },
        { name: "Expresso Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "expresso-sn-onepay", logo: "/icons/methods/expresso.svg" },
        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-onepay", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-onepay", logo: "/icons/methods/moov_money.svg" },
        // Togo
        { name: "T-Money Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "tmoney-tg-onepay", logo: "/icons/methods/togocel.svg" },
        { name: "Moov Togo", country: "Togo", flag: "TG", type: "MOBILE_MONEY", code: "moov-tg-onepay", logo: "/icons/methods/moov_money.svg" },
        // Mali
        { name: "Orange Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "orange-ml-onepay", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Money Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "moov-ml-onepay", logo: "/icons/methods/moov_money.svg" },
        // Burkina Faso
        { name: "Orange Money Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "orange-bf-onepay", logo: "/icons/methods/orange_money.svg" },
        { name: "Moov Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "moov-bf-onepay", logo: "/icons/methods/moov_money.svg" },
        // Cameroun
        { name: "MTN MoMo Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "mtn-cm-onepay", logo: "/icons/methods/momo.svg" },
        { name: "Orange Money Cameroun", country: "Cameroun", flag: "CM", type: "MOBILE_MONEY", code: "orange-cm-onepay", logo: "/icons/methods/orange_money.svg" },
        // Cartes
        { name: "Visa / MasterCard", country: "International", flag: "", type: "CARD", code: "card-onepay", logo: "/icons/methods/credit_card.svg" },
    ],

    // ─── Djamo Business : de compte Djamo a compte Djamo, un pays par passerelle ───
    'djamo': [
        { name: "Djamo CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "djamo-ci", logo: "/icons/methods/djamo.svg" },
        { name: "Djamo Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "djamo-sn", logo: "/icons/methods/djamo.svg" },
    ],

    // ─── iPay Money : poussee directe sur le numero, cartes par page hebergee ───
    'ipay': [
        // Niger
        { name: "Airtel Money Niger", country: "Niger", flag: "NE", type: "MOBILE_MONEY", code: "airtel-ne-ipay", logo: "/icons/methods/airtel.svg" },
        { name: "Moov Money Niger", country: "Niger", flag: "NE", type: "MOBILE_MONEY", code: "moov-ne-ipay", logo: "/icons/methods/moov_money.svg" },
        { name: "Zamani Niger", country: "Niger", flag: "NE", type: "MOBILE_MONEY", code: "zamani-ne-ipay", logo: "" },
        // Bénin
        { name: "MTN Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "mtn-bj-ipay", logo: "/icons/methods/momo.svg" },
        { name: "Moov Bénin", country: "Bénin", flag: "BJ", type: "MOBILE_MONEY", code: "moov-bj-ipay", logo: "/icons/methods/moov_money.svg" },
        // Cartes
        { name: "Visa / MasterCard", country: "International", flag: "", type: "CARD", code: "card-ipay", logo: "/icons/methods/credit_card.svg" },
    ],

    // ─── Wave Business : EN DERNIER, « flutterwave » contient « wave » ───
    'wave': [
        { name: "Wave CI", country: "Côte d'Ivoire", flag: "CI", type: "MOBILE_MONEY", code: "wave-ci-business", logo: "/icons/methods/wave.svg" },
        { name: "Wave Sénégal", country: "Sénégal", flag: "SN", type: "MOBILE_MONEY", code: "wave-sn-business", logo: "/icons/methods/wave.svg" },
        { name: "Wave Mali", country: "Mali", flag: "ML", type: "MOBILE_MONEY", code: "wave-ml-business", logo: "/icons/methods/wave.svg" },
        { name: "Wave Burkina", country: "Burkina Faso", flag: "BF", type: "MOBILE_MONEY", code: "wave-bf-business", logo: "/icons/methods/wave.svg" },
    ],
};

/**
 * Familles ouvertes PAR PAYS (un compte marchand par pays, donc une passerelle
 * par pays, comme Hub2 ou Djamo) : la passerelle ne propose que les moyens de
 * SES pays. Les autres fournisseurs gardent toute leur liste.
 */
const FAMILLES_PAR_PAYS = new Set(['hub2', 'djamo']);
export function moyensDeLaPasserelle(gateway: { countries?: string[] | null }, providerKey?: string): any[] {
    const tous = providerKey ? PROVIDER_METHODS[providerKey] : [];
    const pays = Array.isArray(gateway.countries) ? gateway.countries : [];
    if (!providerKey || !FAMILLES_PAR_PAYS.has(providerKey) || pays.length === 0) return tous;
    return tous.filter((m: any) => pays.includes(m.flag));
}

export const normalizeMethodToken = (value: string = "") =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

/**
 * Normalize a method name to a canonical operator key for deduplication.
 * Different gateways may name the same operator differently:
 *   "MTN CI" vs "MTN MoMo CI" vs "MTN MoMo Côte d'Ivoire" → all "mtn"
 *   "MOOV Money Benin" vs "Moov Bénin" → all "moov"
 *   "Visa / MasterCard" vs "Carte Bancaire" vs "Visa International" → all "card"
 *   "Vodacom M-Pesa" vs "M-Pesa" → all "mpesa"
 */
const OPERATOR_PATTERNS: [RegExp, string][] = [
    [/orange/i, 'orange-money'],
    [/wave/i, 'wave'],
    [/mtn|momo/i, 'mtn'],
    [/moov|flooz/i, 'moov'],
    [/free.?money|free.?sn|free.?senegal/i, 'free-money'],
    [/t-?money|togocom|togocel/i, 't-money'],
    [/airtel/i, 'airtel'],
    [/vodacom|m-?pesa|mpesa/i, 'mpesa'],
    [/vodafone/i, 'vodafone'],
    [/visa|master|carte|card|amex|verve/i, 'card'],
    [/expresso/i, 'expresso'],
    [/wizall/i, 'wizall'],
    [/coris/i, 'coris'],
    [/celtiis/i, 'celtiis'],
    [/bitcoin|btc/i, 'btc'],
    [/ethereum|eth/i, 'eth'],
    [/usdt|tether/i, 'usdt'],
    [/usdc/i, 'usdc'],
    [/litecoin|ltc/i, 'ltc'],
    [/bank.?transfer|eft|ussd/i, 'bank-transfer'],
    [/tnm|mpamba/i, 'tnm'],
    [/ecocash/i, 'ecocash'],
    [/zamtel/i, 'zamtel'],
    [/halotel/i, 'halotel'],
    [/tigo/i, 'tigo'],
    [/express.?union/i, 'express-union'],
    [/paynow/i, 'paynow'],
];

/** Returns a canonical operator key like "mtn" from any method name variant */
export function getOperatorKey(methodName: string): string {
    for (const [pattern, key] of OPERATOR_PATTERNS) {
        if (pattern.test(methodName)) return key;
    }
    return methodName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Normalize country name for dedup: handles accented chars, abbreviations, etc.
 * "Côte d'Ivoire" → "cote divoire", "Bénin" → "benin", "UEMOA" → "uemoa"
 */
export function normalizeCountry(country: string): string {
    return country
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Le fournisseur d'une passerelle, deduit de son NOM (« Hub2 Cote d'Ivoire »
 * donne « hub2 »). Meme regle que partout ailleurs : le nom fait foi, jamais
 * le champ `provider` d'une transaction.
 */
export function cleFournisseurDuNom(nom?: string | null): string | undefined {
    const n = String(nom || "").toLowerCase();
    return Object.keys(PROVIDER_METHODS).find((k) => n.includes(k));
}

/** L'operateur et le pays d'un code de moyen, cherches dans TOUT le catalogue. */
export function identifierMoyen(code: string): { operateur: string; pays: string } | null {
    const cherche = String(code || "").toLowerCase().trim();
    if (!cherche) return null;
    for (const moyens of Object.values(PROVIDER_METHODS)) {
        for (const m of moyens as any[]) {
            if (String(m.code || "").toLowerCase() === cherche) {
                return { operateur: getOperatorKey(m.name), pays: normalizeCountry(m.country || "") };
            }
        }
    }
    return null;
}

/** Etiquettes de « pays » qui n'en sont pas : un moyen valable partout. */
const PAYS_GLOBAUX = new Set(["uemoa", "cemac", "international", "global"]);

/**
 * Cette passerelle sert-elle ce moyen de paiement ?
 *
 * On compare sur l'OPERATEUR et le PAYS, pas sur le code : le meme Orange
 * Money CI s'appelle `orange-money-ci` chez PayDunya et autrement ailleurs, et
 * le secours d'une passerelle vers une autre doit continuer de marcher.
 *
 * Prudence volontaire : un code inconnu du catalogue laisse passer (`true`).
 * Mieux vaut essayer que refuser un paiement a cause d'une liste incomplete.
 *
 * ⚠️ C'est ce controle qui manquait : un paiement Airtel Money RDC en francs
 * congolais partait chez PayDunya (Senegal, Cote d'Ivoire, Benin, Togo, Mali,
 * Burkina), qui creait une facture SANS lien de paiement. L'acheteur attendait
 * une demande qui n'arrivait jamais, puis l'abandon automatique tombait au
 * bout de trente minutes. Sept fois de suite pour le meme marchand.
 */
export function passerelleSertLeMoyen(gateway: { name?: string | null; countries?: string[] | null } | null | undefined, code: string): boolean {
    if (!gateway) return false;
    const vise = identifierMoyen(code);
    if (!vise) return true;
    const cle = cleFournisseurDuNom(gateway.name);
    if (!cle) return true;
    // La carte n'a pas de pays : le catalogue l'etiquette « UEMOA » chez
    // PayDunya, « Global » chez Stripe, « International » ailleurs. Comparer
    // le pays ecarterait Stripe du secours carte. Meme regle que la liste des
    // moyens du checkout, qui garde ces etiquettes partout.
    const partout = vise.operateur === "card" || PAYS_GLOBAUX.has(vise.pays);
    return moyensDeLaPasserelle(gateway, cle).some((m: any) => {
        if (getOperatorKey(m.name) !== vise.operateur) return false;
        const pays = normalizeCountry(m.country || "");
        return partout || PAYS_GLOBAUX.has(pays) || pays === vise.pays;
    });
}
