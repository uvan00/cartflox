"use client";

import { CodeBlock } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionSdksPython({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="blue">SDK</SectionBadge>
            <H1>SDK Python</H1>
            <P>Le SDK officiel Cartflox pour Python 3.8+. Compatible avec Django, FastAPI, Flask.</P>

            <H2>Installation</H2>
            <CodeBlock lang="bash" code={`pip install afriflow-python`} />

            <H2>Configuration</H2>
            <CodeBlock lang="python" title="afriflow_client.py" code={`import os
from afriflow import Cartflox

afriflow = Cartflox(
    api_key=os.environ["AFRIFLOW_SECRET_KEY"],
    timeout=30,
    max_retries=3
)`} />

            <H2>Paiements</H2>
            <CodeBlock lang="python" code={`# Créer un paiement
payment = afriflow.payments.create(
    amount=25000,
    currency="XOF",
    method="wave",
    customer={
        "phone": "+22507070707",
        "email": "client@example.com",
        "name": "Kouassi Jean"
    },
    redirect_url="https://monsite.com/success",
    metadata={"order_id": "ORD-2026-001"}
)

print(payment.checkout_url)  # Rediriger le client

# Récupérer
payment = afriflow.payments.retrieve("pi_01HXYZ...")

# Lister avec filtres
payments = afriflow.payments.list(
    status="completed",
    currency="XOF",
    limit=50
)
for p in payments.data:
    print(p.id, p.amount, p.status)

# Rembourser
refund = afriflow.payments.refund(
    payment_id="pi_01HXYZ...",
    amount=5000,
    reason="requested_by_customer"
)`} />

            <H2>Webhooks avec FastAPI</H2>
            <CodeBlock lang="python" title="main.py" code={`from fastapi import FastAPI, Request, HTTPException
from afriflow import Cartflox, WebhookVerificationError

app = FastAPI()
afriflow = Cartflox(api_key=os.environ["AFRIFLOW_SECRET_KEY"])

@app.post("/webhook/afriflow")
async def handle_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("afriflow-signature", "")

    try:
        event = afriflow.webhooks.construct_event(
            payload=body.decode("utf-8"),
            sig_header=signature,
            secret=os.environ["AFRIFLOW_WEBHOOK_SECRET"]
        )
    except WebhookVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event.type == "payment.completed":
        payment = event.data
        await fulfill_order(payment.metadata["order_id"])

    return {"received": True}`} />

            <H2>Webhooks avec Django</H2>
            <CodeBlock lang="python" title="views.py" code={`from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from afriflow import Cartflox

afriflow = Cartflox(api_key=settings.AFRIFLOW_SECRET_KEY)

@csrf_exempt
@require_POST
def afriflow_webhook(request):
    try:
        event = afriflow.webhooks.construct_event(
            payload=request.body.decode("utf-8"),
            sig_header=request.META.get("HTTP_AFRIFLOW_SIGNATURE", ""),
            secret=settings.AFRIFLOW_WEBHOOK_SECRET
        )
    except Exception:
        return JsonResponse({"error": "Invalid signature"}, status=400)

    if event.type == "payment.completed":
        Order.objects.filter(
            id=event.data.metadata["order_id"]
        ).update(status="paid")

    return JsonResponse({"received": True})`} />

            <H2>Gestion des erreurs</H2>
            <CodeBlock lang="python" code={`from afriflow import Cartflox, CartfloxError

try:
    payment = afriflow.payments.create(...)
except CartfloxError as e:
    print(f"Code: {e.code}")          # INSUFFICIENT_FUNDS
    print(f"Message: {e.message}")    # "Solde insuffisant"
    print(f"Status: {e.http_status}") # 400
except Exception as e:
    print(f"Erreur réseau: {e}")`} />

            <NavButtons
                prev={{ id: "sdks-node",    label: "SDK Node.js" }}
                next={{ id: "sdks-php",     label: "SDK PHP" }}
                setSection={setSection}
            />
        </>
    );
}
