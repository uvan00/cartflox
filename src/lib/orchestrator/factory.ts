import { IPaymentProvider } from "./types";
import { MockProviderAdapter } from "./adapters/mock.adapter";
import { PayDunyaAdapter } from "./adapters/paydunya.adapter";
import { PawaPayAdapter } from "./adapters/pawapay.adapter";
import { FlutterwaveAdapter } from "./adapters/flutterwave.adapter";
import { FeexPayAdapter } from "./adapters/feexpay.adapter";
import { PaystackAdapter } from "./adapters/paystack.adapter";
import { CinetPayAdapter } from "./adapters/cinetpay.adapter";
import { StripeAdapter } from "./adapters/stripe.adapter";
import { KkiapayAdapter } from "./adapters/kkiapay.adapter";
import { CoinbaseAdapter } from "./adapters/coinbase.adapter";
import { FedaPayAdapter } from "./adapters/fedapay.adapter";
import { NotchPayAdapter } from "./adapters/notchpay.adapter";
import { CryptomusAdapter } from "./adapters/cryptomus.adapter";
import { QosicAdapter } from "./adapters/qosic.adapter";
import { MonetBillAdapter } from "./adapters/monetbill.adapter";
import { PayPlusAdapter } from "./adapters/payplus.adapter";
import { Hub2Adapter } from "./adapters/hub2.adapter";
import { LengoPayAdapter } from "./adapters/lengopay.adapter";
import { WaveAdapter } from "./adapters/wave.adapter";
import { PayTechAdapter } from "./adapters/paytech.adapter";
import { OnePayAdapter } from "./adapters/onepay.adapter";
import { DjamoAdapter } from "./adapters/djamo.adapter";
import { IPayAdapter } from "./adapters/ipay.adapter";
import { PayPalAdapter } from './adapters/paypal.adapter';
import {
    routePayment,
    getAvailableMethods,
    rankProvidersForCountry,
    detectOperatorFromPhone,
    RoutingContext,
    RoutingDecision,
    PaymentMethod,
} from "./smart-router";

/**
 * Payment Orchestrator Factory
 * Dynamically creates payment provider instances with configuration
 */
export class PaymentOrchestratorFactory {
    /**
     * Get a payment provider instance by name
     * @param name - Provider name (mock, paydunya, flutterwave, feexpay, paystack, cinetpay, stripe, kkiapay, coinbase, fedapay, etc.)
     * @param config - Optional configuration object for the provider
     */
    static getProvider(name: string, config?: any): IPaymentProvider {
        const providerName = name.toLowerCase();

        switch (providerName) {
            case 'mock':
                // SECURITY: the mock adapter always reports SUCCESS (incl. via
                // verifyPayment). It must NEVER be reachable in production, where
                // a gateway named "mock" would otherwise fabricate paid orders.
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('Mock payment provider is disabled in production');
                }
                return new MockProviderAdapter();

            case 'paydunya':
                if (!config) {
                    throw new Error('PayDunya requires configuration: { masterKey, privateKey, publicKey, token, mode }');
                }
                return new PayDunyaAdapter(config);

            case 'pawapay':
                if (!config) {
                    throw new Error('PawaPay requires configuration: { apiKey, mode }');
                }
                return new PawaPayAdapter(config);

            case 'flutterwave':
                if (!config) {
                    throw new Error('Flutterwave requires configuration: { publicKey, secretKey, mode }');
                }
                return new FlutterwaveAdapter(config);

            case 'feexpay':
                if (!config) {
                    throw new Error('FeexPay requires configuration: { shopId, apiKey, mode }');
                }
                return new FeexPayAdapter(config);

            case 'paystack':
                if (!config) {
                    throw new Error('Paystack requires configuration: { publicKey, secretKey, mode }');
                }
                return new PaystackAdapter(config);

            case 'cinetpay':
                if (!config) {
                    throw new Error('CinetPay requires configuration: { apiKey, siteId, mode }');
                }
                return new CinetPayAdapter(config);

            case 'stripe':
                if (!config) {
                    throw new Error('Stripe requires configuration: { secretKey, mode }');
                }
                return new StripeAdapter(config);

            case 'kkiapay':
                if (!config) {
                    throw new Error('Kkiapay requires configuration: { publicKey, privateKey, secret, mode }');
                }
                return new KkiapayAdapter(config);

            case 'coinbase':
                if (!config) {
                    throw new Error('Coinbase requires configuration: { apiKey, webhookSecret, mode }');
                }
                return new CoinbaseAdapter(config);

            case 'fedapay':
                if (!config) {
                    throw new Error('FedaPay requires configuration: { apiKey, mode }');
                }
                return new FedaPayAdapter(config);

            case 'notchpay':
                if (!config) {
                    throw new Error('NotchPay requires configuration: { publicKey, mode }');
                }
                return new NotchPayAdapter(config);

            case 'cryptomus':
                if (!config) {
                    throw new Error('Cryptomus requires configuration: { apiKey, merchantId, mode }');
                }
                return new CryptomusAdapter(config);

            case 'qosic':
                if (!config) {
                    throw new Error('Qosic requires configuration: { apiKey, clientId, mode }');
                }
                return new QosicAdapter(config);

            case 'monetbill':
                if (!config) {
                    throw new Error('MonetBill requires configuration: { serviceKey, mode }');
                }
                return new MonetBillAdapter(config);

            case 'payplus':
                if (!config) {
                    throw new Error('PayPlus requires configuration: { apiKey, secretKey, mode }');
                }
                return new PayPlusAdapter(config);

            case 'hub2':
                if (!config) {
                    throw new Error('Hub2 requires configuration: { apiKey, merchantId, mode }');
                }
                return new Hub2Adapter(config);

            case 'lengopay':
                if (!config) {
                    throw new Error('LengoPay requires configuration: { apiKey, secretKey, mode }');
                }
                return new LengoPayAdapter(config);

            case 'wave':
                if (!config) {
                    throw new Error('Wave requires configuration: { apiKey, mode }');
                }
                return new WaveAdapter(config);

            case 'paytech':
                if (!config) {
                    throw new Error('PayTech requires configuration: { apiKey, apiSecret, mode }');
                }
                return new PayTechAdapter(config);

            case 'onepay':
                if (!config) {
                    throw new Error('Magma OnePay requires configuration: { token, secret, mode }');
                }
                return new OnePayAdapter(config);

            case 'djamo':
                if (!config) {
                    throw new Error('Djamo requires configuration: { token, companyId, pays, mode }');
                }
                return new DjamoAdapter(config);

            case 'ipay':
                if (!config) {
                    throw new Error('iPay Money requires configuration: { secretKey, mode }');
                }
                return new IPayAdapter(config);
            case 'paypal':
                if (!config) {
                    throw new Error('PayPal requires configuration: { clientId, clientSecret, mode }');
                }
                return new PayPalAdapter(config);

            default:
                throw new Error(`Provider ${name} not found in orchestrator`);
        }
    }

    /**
     * List all available provider names
     */
    static listProviders(): string[] {
        return ['mock', 'paydunya', 'pawapay', 'flutterwave', 'feexpay', 'paystack', 'cinetpay', 'stripe', 'kkiapay', 'coinbase', 'fedapay', 'notchpay', 'cryptomus', 'qosic', 'monetbill', 'payplus', 'hub2', 'lengopay', 'paypal'];
    }

    /**
     * Get provider info for UI display
     */
    static getProviderInfo(): Array<{ id: string; name: string; logo: string; countries: string[]; description: string }> {
        return [
            {
                id: 'paydunya',
                name: 'PayDunya',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/paydunya.svg',
                countries: ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF'],
                description: 'Mobile Money & Cards en Afrique de l\'Ouest'
            },
            {
                id: 'paystack',
                name: 'Paystack',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/paystack.svg',
                countries: ['NG', 'GH', 'ZA', 'KE'],
                description: 'Le leader des paiements au Nigeria et Afrique anglophone'
            },
            {
                id: 'stripe',
                name: 'Stripe',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/stripe.svg',
                countries: ['US', 'CA', 'FR', 'UK', 'DE', 'Global'],
                description: 'La référence mondiale du paiement par carte bancaire'
            },
            {
                id: 'fedapay',
                name: 'FedaPay',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/fedapay.svg',
                countries: ['BJ', 'TG', 'CI', 'SN', 'ML', 'BF'],
                description: 'Paiements simplifiés au Bénin et en Afrique Francophone'
            },
            {
                id: 'coinbase',
                name: 'Coinbase',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/coinbase_commerce.svg',
                countries: ['Global'],
                description: 'Acceptez les crypto-monnaies (BTC, ETH, USDC, etc.)'
            },
            {
                id: 'kkiapay',
                name: 'Kkiapay',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/kkiapay.svg',
                countries: ['BJ', 'TG', 'CI'],
                description: 'Paiements simplifiés au Bénin et Togo'
            },
            {
                id: 'flutterwave',
                name: 'Flutterwave',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/flutterwave.svg',
                countries: ['NG', 'GH', 'KE', 'UG', 'TZ', 'RW', 'ZA', 'ZM', 'CI', 'SN', 'CM'],
                description: 'Paiements dans 40+ pays africains'
            },
            {
                id: 'cinetpay',
                name: 'CinetPay',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/cinetpay.svg',
                countries: ['CI', 'SN', 'ML', 'TG', 'BJ', 'BF', 'CM', 'CD'],
                description: 'L\'acteur historique du paiement en Afrique Francophone'
            },
            {
                id: 'feexpay',
                name: 'FeexPay',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/feexpay.svg',
                countries: ['BJ', 'TG', 'CI', 'SN', 'CG'],
                description: 'Mobile Money & Cards au Bénin et Afrique de l\'Ouest'
            },
            {
                id: 'pawapay',
                name: 'PawaPay',
                logo: 'https://assets.cdn.moneroo.io/icons/circle/pawapay.svg',
                countries: ['KE', 'UG', 'TZ', 'RW', 'ZM', 'GH', 'CI', 'SN', 'CM'],
                description: 'Mobile Money spécialisé'
            },
            {
                id: 'notchpay',
                name: 'NotchPay',
                logo: '/icons/methods/notchpay.svg',
                countries: ['CM', 'CI', 'SN', 'NG'],
                description: 'Paiements Mobile Money et Cartes au Cameroun'
            },
            {
                id: 'cryptomus',
                name: 'Cryptomus',
                logo: '/icons/methods/cryptomus.svg',
                countries: ['Global'],
                description: 'Crypto-monnaies (BTC, ETH, USDT, 50+ coins)'
            },
            {
                id: 'qosic',
                name: 'Qosic',
                logo: '/icons/methods/qosic.svg',
                countries: ['BJ', 'TG', 'CI'],
                description: 'Mobile Money au Bénin, Togo et Côte d\'Ivoire'
            },
            {
                id: 'monetbill',
                name: 'MonetBill',
                logo: '/icons/methods/monetbill.svg',
                countries: ['CM'],
                description: 'Paiements Mobile Money au Cameroun'
            },
            {
                id: 'payplus',
                name: 'PayPlus',
                logo: '/icons/methods/payplus.svg',
                countries: ['CI', 'SN', 'ML', 'BJ'],
                description: 'Mobile Money multi-opérateurs en Afrique de l\'Ouest'
            },
            {
                id: 'hub2',
                name: 'Hub2',
                logo: '/icons/methods/hub2.svg',
                countries: ['CI', 'SN', 'BJ', 'TG', 'ML', 'BF', 'CM', 'GH', 'NE'],
                description: 'Mobile Money et interopérabilité en Afrique'
            },
            {
                id: 'lengopay',
                name: 'LengoPay',
                logo: '/icons/methods/lengopay.svg',
                countries: ['GN', 'MA'],
                description: 'Paiements en Guinée Conakry et Maroc'
            },
            {
                id: 'paypal',
                name: 'PayPal',
                logo: '/icons/methods/paypal.svg',
                countries: ['Global'],
                description: 'Compte PayPal ou carte bancaire, dans le monde entier'
            },
        ];
    }

    /**
     * Route a payment to the best available provider using the smart router.
     * @param ctx - Routing context (country, currency, amount, method, available providers)
     * @param configs - Map of provider name → config object
     * @returns The best provider instance + routing decision metadata
     */
    static routeAndGetProvider(
        ctx: RoutingContext,
        configs: Record<string, any>
    ): { provider: IPaymentProvider; decision: RoutingDecision } {
        const available = Object.keys(configs).filter(p => ctx.availableProviders.includes(p));
        const decision = routePayment({ ...ctx, availableProviders: available });
        const provider = PaymentOrchestratorFactory.getProvider(decision.provider, configs[decision.provider]);
        return { provider, decision };
    }

    /**
     * Auto-detect best provider from phone number + country.
     * Returns a routing decision without requiring explicit payment method.
     */
    static routeFromPhone(
        phone: string,
        country: string,
        amount: number,
        availableProviders: string[],
        currency?: string
    ): RoutingDecision {
        const detectedMethod = detectOperatorFromPhone(phone, country);
        return routePayment({
            country,
            currency,
            amount,
            paymentMethod: detectedMethod ?? undefined,
            availableProviders,
        });
    }

    /**
     * Get available payment methods for a country + provider set.
     */
    static getAvailableMethods(
        country: string,
        availableProviders: string[],
        currency?: string
    ) {
        return getAvailableMethods(country, availableProviders, currency);
    }

    /**
     * Rank providers by reliability for a specific country.
     */
    static rankProvidersForCountry(
        providers: string[],
        country: string,
        currency?: string
    ) {
        return rankProvidersForCountry(providers, country, currency);
    }

}






