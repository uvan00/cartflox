"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionSdksFlutter({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="blue">SDK</SectionBadge>
            <H1>SDK Flutter</H1>
            <P>Le SDK officiel Cartflox pour Flutter (iOS & Android). Intègre la page de paiement native ou via WebView.</P>

            <H2>Installation</H2>
            <CodeBlock lang="yaml" title="pubspec.yaml" code={`dependencies:
  afriflow_flutter: ^2.0.0`} />
            <CodeBlock lang="bash" code={`flutter pub get`} />

            <H2>Configuration Android</H2>
            <CodeBlock lang="xml" title="android/app/src/main/AndroidManifest.xml" code={`<activity android:name=".MainActivity"
    android:launchMode="singleTop">
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="afriflow" android:host="callback"/>
  </intent-filter>
</activity>`} />

            <H2>Initialisation</H2>
            <CodeBlock lang="dart" title="main.dart" code={`import 'package:afriflow_flutter/afriflow_flutter.dart';

void main() {
  Cartflox.initialize(
    publicKey: const String.fromEnvironment('AFRIFLOW_PUBLIC_KEY'),
    environment: CartfloxEnvironment.production, // ou .sandbox
  );
  runApp(const MyApp());
}`} />

            <H2>Lancer un paiement</H2>
            <CodeBlock lang="dart" code={`import 'package:afriflow_flutter/afriflow_flutter.dart';

class PaymentScreen extends StatelessWidget {
  Future<void> _startPayment(BuildContext context) async {
    final result = await CartfloxCheckout.present(
      context: context,
      params: PaymentParams(
        amount: 25000,
        currency: 'XOF',
        method: PaymentMethod.auto, // Affiche toutes les méthodes
        customer: Customer(
          phone: '+22507070707',
          email: 'client@example.com',
          name: 'Kouassi Jean',
        ),
        metadata: {'orderId': 'ORD-2026-001'},
      ),
    );

    switch (result.status) {
      case PaymentStatus.completed:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Paiement réussi !')),
        );
        // Valider la commande côté serveur via webhook
        break;
      case PaymentStatus.failed:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('❌ Échec : \${result.errorMessage}')),
        );
        break;
      case PaymentStatus.cancelled:
        // Le client a annulé
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: () => _startPayment(context),
      child: const Text('Payer maintenant'),
    );
  }
}`} />

            <H2>Personnalisation du thème</H2>
            <CodeBlock lang="dart" code={`CartfloxCheckout.present(
  context: context,
  params: PaymentParams( ... ),
  theme: CartfloxTheme(
    primaryColor: const Color(0xFF10B981),  // Votre couleur de marque
    backgroundColor: const Color(0xFF1A1A1A),
    textColor: Colors.white,
    borderRadius: 16.0,
    logoUrl: 'https://monsite.com/logo.png',
    businessName: 'Ma Boutique',
  ),
);`} />

            <AlertBox type="warning">
                N'utilisez jamais votre <strong>clé secrète</strong> dans votre application mobile.
                Utilisez uniquement la <strong>clé publique</strong> côté client.
                La création de paiement doit se faire côté serveur.
            </AlertBox>

            <H2>Architecture recommandée</H2>
            <CodeBlock lang="dart" code={`// 1. Votre backend crée le paiement
// POST https://votre-api.com/create-payment
// → Retourne { checkoutToken: "pi_01HXYZ...", checkoutUrl: "..." }

// 2. Le SDK Flutter utilise le token
final paymentIntent = await api.createPayment(amount: 25000);

final result = await CartfloxCheckout.presentWithToken(
  context: context,
  checkoutToken: paymentIntent.checkoutToken,
);`} />

            <NavButtons
                prev={{ id: "sdks-php",    label: "SDK PHP" }}
                next={{ id: "plugins-woo", label: "Plugin WooCommerce" }}
                setSection={setSection}
            />
        </>
    );
}
