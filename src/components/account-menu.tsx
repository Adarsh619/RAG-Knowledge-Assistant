"use client";
import Link from "next/link";
import { ActionMenu } from "./ui/action-menu";
import { Icon } from "./ui/icon";
import { SignOutButton } from "./auth/sign-out-button";

export function AccountMenu({ email, verified, sidebar = false }: { email: string; verified: boolean; sidebar?: boolean }) {
  return <ActionMenu label="Account options" className={sidebar ? "sidebar-account" : "header-account"} trigger={<>
    <span className="avatar">{email.slice(0, 2).toUpperCase()}</span>
    {sidebar && <span className="sidebar-label account-copy"><strong>My account</strong><span>{email}</span></span>}
  </>}>
    <div className="account-menu-profile"><span className="avatar">{email.slice(0, 2).toUpperCase()}</span><div><strong className="wrap-anywhere">{email}</strong><p>{verified ? "Email verified" : "Email not verified"}</p></div></div>
    <Link href="/account"><Icon name="account" />My Account</Link>
    <Link href="/settings"><Icon name="settings" />Settings</Link>
    <Link href="/settings#appearance"><Icon name="sun" />Appearance</Link>
    <Link href="/settings#local-ai"><Icon name="spark" />Local AI</Link>
    <Link href="/documents"><Icon name="file" />Documents</Link>
    <Link href="/chat"><Icon name="chat" />Conversation History</Link>
    <Link href="/settings#privacy"><Icon name="shield" />Privacy</Link>
    <div className="account-signout"><SignOutButton /></div>
  </ActionMenu>;
}
