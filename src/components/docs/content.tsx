"use client";

import { CodeBlock, ApiEndpoint, ParamTable, AlertBox } from "./code-block";
import type { SectionId } from "@/app/docs/page";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { SectionIntro } from "./sections/intro";
import { SectionQuickstart } from "./sections/quickstart";
import { SectionAuth } from "./sections/auth";
import { SectionPaymentsCreate } from "./sections/payments-create";
import { SectionPaymentsVerify } from "./sections/payments-verify";
import { SectionPaymentsList } from "./sections/payments-list";
import { SectionPaymentsRefund } from "./sections/payments-refund";
import { SectionTransfers } from "./sections/transfers";
import { SectionSmartRouting } from "./sections/smart-routing";
import { SectionWebhooksSetup } from "./sections/webhooks-setup";
import { SectionWebhooksEvents } from "./sections/webhooks-events";
import { SectionWebhooksSecurity } from "./sections/webhooks-security";
import { SectionSdksNode } from "./sections/sdks-node";
import { SectionSdksPython } from "./sections/sdks-python";
import { SectionSdksPhp } from "./sections/sdks-php";
import { SectionSdksFlutter } from "./sections/sdks-flutter";
import { SectionPluginsWoo } from "./sections/plugins-woo";
import { SectionErrors } from "./sections/errors";
import { SectionRateLimits } from "./sections/rate-limits";
import { SectionChangelog } from "./sections/changelog";

interface Props {
    section: SectionId;
    setSection: (s: SectionId) => void;
}

export function DocsContent({ section, setSection }: Props) {
    const props = { setSection };
    switch (section) {
        case "introduction":      return <SectionIntro {...props} />;
        case "quickstart":        return <SectionQuickstart {...props} />;
        case "authentication":    return <SectionAuth {...props} />;
        case "payments-create":   return <SectionPaymentsCreate {...props} />;
        case "payments-verify":   return <SectionPaymentsVerify {...props} />;
        case "payments-list":     return <SectionPaymentsList {...props} />;
        case "payments-refund":   return <SectionPaymentsRefund {...props} />;
        case "transfers":         return <SectionTransfers {...props} />;
        case "smart-routing":     return <SectionSmartRouting {...props} />;
        case "webhooks-setup":    return <SectionWebhooksSetup {...props} />;
        case "webhooks-events":   return <SectionWebhooksEvents {...props} />;
        case "webhooks-security": return <SectionWebhooksSecurity {...props} />;
        case "sdks-node":         return <SectionSdksNode {...props} />;
        case "sdks-python":       return <SectionSdksPython {...props} />;
        case "sdks-php":          return <SectionSdksPhp {...props} />;
        case "sdks-flutter":      return <SectionSdksFlutter {...props} />;
        case "plugins-woo":       return <SectionPluginsWoo {...props} />;
        case "errors":            return <SectionErrors {...props} />;
        case "rate-limits":       return <SectionRateLimits {...props} />;
        case "changelog":         return <SectionChangelog {...props} />;
        default:                  return <SectionIntro {...props} />;
    }
}
