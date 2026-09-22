"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getSelectedAppId } from "./utils";

export async function getCustomerStats() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [totalCustomers, customersThisMonth, newCustomers24h, allSuccessPayments] = await Promise.all([
            prisma.customer.count({ where: { applicationId: appId } }),
            prisma.customer.count({
                where: {
                    applicationId: appId,
                    createdAt: { gte: startOfMonth }
                }
            }),
            prisma.customer.count({
                where: {
                    applicationId: appId,
                    createdAt: { gte: last24h }
                }
            }),
            prisma.transaction.findMany({
                where: { applicationId: appId, status: 'SUCCESS' },
                select: { amount: true, customerEmail: true }
            })
        ]);

        const uniqueActiveEmails = new Set(allSuccessPayments.map((p: any) => p.customerEmail));
        const activeCustomers = uniqueActiveEmails.size;

        const totalAmount = allSuccessPayments.reduce((acc: number, curr: any) => acc + curr.amount, 0);
        const avgBasket = allSuccessPayments.length > 0
            ? Math.round(totalAmount / allSuccessPayments.length)
            : 0;

        const retentionRate = totalCustomers > 0
            ? ((activeCustomers / totalCustomers) * 100).toFixed(1)
            : "0";

        return {
            totalCustomers: totalCustomers.toLocaleString(),
            customersThisMonth: `+${customersThisMonth} ce mois`,
            activeCustomers: activeCustomers.toLocaleString(),
            retentionRate: `${retentionRate}% de rétention`,
            newCustomers24h: newCustomers24h.toLocaleString(),
            basketLabel: "Global",
            avgBasket: `${avgBasket.toLocaleString('fr-FR')} XOF`
        };
    } catch (error) {
        console.error("Failed to fetch customer stats:", error);
        return {
            totalCustomers: "0",
            customersThisMonth: "+0 ce mois",
            activeCustomers: "0",
            retentionRate: "0% de rétention",
            newCustomers24h: "0",
            basketLabel: "Global",
            avgBasket: "0 XOF"
        };
    }
}

export async function getCustomers(params: {
    page?: number,
    pageSize?: number,
    search?: string,
    status?: string,
    country?: string
}) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const { page = 1, pageSize = 10, search, status, country } = params;

        // Sync existing payment records to customers table for this app if not already synced
        const pendingEmails = await prisma.transaction.findMany({
            where: { applicationId: appId },
            select: { customerEmail: true, customerName: true, customerPhone: true, createdAt: true },
            distinct: ['customerEmail']
        });

        for (const p of pendingEmails) {
            await prisma.customer.upsert({
                where: { applicationId_email: { applicationId: appId, email: p.customerEmail } },
                update: {},
                create: {
                    applicationId: appId,
                    email: p.customerEmail,
                    name: p.customerName || "Client Inconnu",
                    phone: p.customerPhone,
                    country: (() => {
                        const ph = p.customerPhone?.replace(/\D/g, '') || "";
                        if (ph.startsWith('225')) return "Côte d'Ivoire";
                        if (ph.startsWith('221')) return "Sénégal";
                        if (ph.startsWith('229')) return "Bénin";
                        if (ph.startsWith('237')) return "Cameroun";
                        if (ph.startsWith('223')) return "Mali";
                        if (ph.startsWith('226')) return "Burkina Faso";
                        if (ph.startsWith('228')) return "Togo";
                        if (ph.startsWith('241')) return "Gabon";
                        if (ph.startsWith('242')) return "Congo";
                        if (ph.startsWith('243')) return "RDC";
                        return "Sénégal"; // Fallback
                    })(),
                    createdAt: p.createdAt
                }
            });
        }

        // Filtre "a paye / jamais paye" : les e-mails ayant au moins un paiement reussi.
        const payeurs = status
            ? (await prisma.transaction.findMany({ where: { applicationId: appId, status: 'SUCCESS' }, select: { customerEmail: true }, distinct: ['customerEmail'] })).map((t: any) => t.customerEmail)
            : [];
        const where: any = {
            applicationId: appId,
            ...(status === 'active' ? { email: { in: payeurs } } : status === 'inactive' ? { email: { notIn: payeurs } } : {}),
            ...(country ? { country } : {}),
            ...(search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } }
                ]
            } : {})
        };

        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize
            }),
            prisma.customer.count({ where })
        ]);

        // Fetch transaction summaries for these customers
        const emails = customers.map((c: any) => c.email);
        const payments = await prisma.transaction.findMany({
            where: {
                applicationId: appId,
                customerEmail: { in: emails }
            },
            select: {
                customerEmail: true,
                amount: true,
                status: true,
                createdAt: true,
                currency: true
            }
        });

        const customerList = customers.map((c: any) => {
            const customerPayments = payments.filter((p: any) => p.customerEmail === c.email);
            const totalSpent = customerPayments
                .filter((p: any) => p.status === 'SUCCESS')
                .reduce((acc: number, curr: any) => acc + curr.amount, 0);

            const lastActive = customerPayments.length > 0
                ? customerPayments.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt
                : c.createdAt;

            const currency = customerPayments[0]?.currency || "XOF";

            return {
                id: `CUST-${c.id.slice(-4).toUpperCase()}`,
                name: c.name,
                email: c.email,
                phone: c.phone || "N/A",
                country: c.country || "Sénégal",
                transactions: customerPayments.length,
                totalSpent: `${totalSpent.toLocaleString('fr-FR')} ${currency}`,
                lastActive: lastActive.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                status: customerPayments.some((p: any) => p.status === 'SUCCESS') ? 'active' : 'inactive'
            };
        });

        return {
            customers: customerList,
            pagination: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize)
            }
        };
    } catch (error) {
        console.error("Failed to fetch customers:", error);
        return {
            customers: [],
            pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 }
        };
    }
}

export async function createCustomer(data: {
    name: string,
    email: string,
    phone?: string,
    country?: string
}) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const customer = await prisma.customer.create({
            data: {
                ...data,
                applicationId: appId
            }
        });

        revalidatePath('/customers');
        return { success: true, customer };
    } catch (error: any) {
        console.error("Failed to create customer:", error);
        if (error.code === 'P2002') {
            return { success: false, error: "Un client avec cet email existe déjà." };
        }
        return { success: false, error: "Une erreur est survenue lors de la création du client." };
    }
}

export async function exportCustomersAction() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const customers = await prisma.customer.findMany({
            where: { applicationId: appId },
            orderBy: { createdAt: 'desc' }
        });

        // Simple CSV generation
        const headers = ["ID", "Nom", "Email", "Téléphone", "Pays", "Date de création"];
        const rows = customers.map((c: any) => [
            c.id,
            c.name,
            c.email,
            c.phone || "",
            c.country || "",
            c.createdAt.toISOString()
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        return { success: true, csvContent };
    } catch (error) {
        console.error("Export failed:", error);
        return { success: false, error: "Échec de l'exportation." };
    }
}
