import { DataExport, DeleteAccount, EmailForm, PasswordForm, UsernameForm } from "@/components/settings/account-forms";
import { requireViewer } from "@/lib/viewer";

export const metadata = { title: "Account settings" };

export default async function AccountSettingsPage() {
  await requireViewer("/settings/account");
  return (
    <>
      <UsernameForm />
      <EmailForm />
      <PasswordForm />
      <DataExport />
      <DeleteAccount />
    </>
  );
}
