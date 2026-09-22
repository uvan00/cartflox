"use client";

import { CodeBlock } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionSdksPhp({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="purple">SDK</SectionBadge>
            <H1>SDK PHP</H1>
            <P>Le SDK officiel Cartflox pour PHP 8.0+. Compatible avec Laravel, Symfony, WordPress.</P>

            <H2>Installation</H2>
            <CodeBlock lang="bash" code={`composer require afriflow/afriflow-php`} />

            <H2>Configuration</H2>
            <CodeBlock lang="php" title="config/afriflow.php" code={`<?php
use Cartflox\\Cartflox;

$afriflow = new Cartflox(getenv('AFRIFLOW_SECRET_KEY'), [
    'timeout'     => 30,
    'max_retries' => 3,
]);`} />

            <H2>Paiements</H2>
            <CodeBlock lang="php" code={`<?php
// Créer un paiement
$payment = $afriflow->payments->create([
    'amount'       => 25000,
    'currency'     => 'XOF',
    'method'       => 'wave',
    'customer'     => [
        'phone' => '+22507070707',
        'email' => 'client@example.com',
        'name'  => 'Kouassi Jean',
    ],
    'redirect_url' => 'https://monsite.com/success',
    'metadata'     => ['order_id' => 'ORD-2026-001'],
]);

// Rediriger le client
header('Location: ' . $payment->checkout_url);
exit;

// Récupérer un paiement
$payment = $afriflow->payments->retrieve('pi_01HXYZ...');

// Lister
$list = $afriflow->payments->list(['status' => 'completed', 'limit' => 20]);
foreach ($list->data as $payment) {
    echo $payment->id . ' - ' . $payment->amount . ' ' . $payment->currency . PHP_EOL;
}

// Rembourser
$refund = $afriflow->payments->refund('pi_01HXYZ...', [
    'amount' => 5000,
    'reason' => 'requested_by_customer',
]);`} />

            <H2>Webhooks</H2>
            <CodeBlock lang="php" title="webhook.php" code={`<?php
use Cartflox\\Cartflox;
use Cartflox\\Exception\\WebhookSignatureException;

$afriflow = new Cartflox(getenv('AFRIFLOW_SECRET_KEY'));

$payload   = file_get_contents('php://input');
$signature = $_SERVER['HTTP_AFRIFLOW_SIGNATURE'] ?? '';

try {
    $event = $afriflow->webhooks->constructEvent(
        $payload,
        $signature,
        getenv('AFRIFLOW_WEBHOOK_SECRET')
    );
} catch (WebhookSignatureException $e) {
    http_response_code(400);
    echo json_encode(['error' => 'Signature invalide']);
    exit;
}

switch ($event->type) {
    case 'payment.completed':
        $payment = $event->data;
        // Mettre à jour la commande en base de données
        updateOrderStatus($payment->metadata['order_id'], 'paid');
        break;

    case 'payment.failed':
        notifyCustomer($event->data->customer->email);
        break;
}

http_response_code(200);
echo json_encode(['received' => true]);`} />

            <H2>Laravel : Intégration rapide</H2>
            <CodeBlock lang="php" title="app/Http/Controllers/PaymentController.php" code={`<?php
namespace App\\Http\\Controllers;

use Illuminate\\Http\\Request;
use Cartflox\\Cartflox;

class PaymentController extends Controller
{
    private Cartflox $afriflow;

    public function __construct()
    {
        $this->afriflow = new Cartflox(config('services.afriflow.secret'));
    }

    public function create(Request $request)
    {
        $payment = $this->afriflow->payments->create([
            'amount'       => $request->amount,
            'currency'     => 'XOF',
            'method'       => $request->method ?? 'auto',
            'customer'     => ['phone' => $request->phone],
            'redirect_url' => route('payment.success'),
            'metadata'     => ['order_id' => $request->order_id],
        ]);

        return redirect($payment->checkout_url);
    }

    public function webhook(Request $request)
    {
        $event = $this->afriflow->webhooks->constructEvent(
            $request->getContent(),
            $request->header('afriflow-signature'),
            config('services.afriflow.webhook_secret')
        );

        if ($event->type === 'payment.completed') {
            // Traiter le paiement
        }

        return response()->json(['received' => true]);
    }
}`} />

            <NavButtons
                prev={{ id: "sdks-python",  label: "SDK Python" }}
                next={{ id: "sdks-flutter", label: "SDK Flutter" }}
                setSection={setSection}
            />
        </>
    );
}
