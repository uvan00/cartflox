import { redirect } from "next/navigation";
import { getApplications } from "@/lib/actions/applications";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const apps = await getApplications();

    if (!apps || apps.length === 0) {
        redirect("/applications/new");
    }

    return (
        <DashboardShell>
            {children}
        </DashboardShell>
    );
}
