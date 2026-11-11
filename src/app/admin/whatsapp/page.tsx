import { WhatsAppScreen } from "@/components/admin/screens/WhatsAppScreen";
import { exigirPaginaAdmin } from "@/server/auth/admin-page-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal ADM — WhatsApp & QR Code" };

export default async function WhatsAppAdminPage() {
  await exigirPaginaAdmin("whatsapp");
  return <WhatsAppScreen />;
}

