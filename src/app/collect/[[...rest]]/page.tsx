import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ rest?: string[] }> }) {
    const { rest } = await params;
    redirect("/connect" + (rest && rest.length ? "/" + rest.join("/") : ""));
}
