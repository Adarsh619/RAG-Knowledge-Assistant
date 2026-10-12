import { PageHeader } from "@/components/page-header";
import { SettingsWorkspace } from "@/components/account-settings";
export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return <><PageHeader eyebrow="MAKE IT YOURS" title="Settings" description="Appearance, local AI and privacy." /><SettingsWorkspace /></>;
}
