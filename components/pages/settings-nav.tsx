"use client";

import { LayoutGrid, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "../../lib/local-navigation";
import { useAuth, useT } from "../providers";

export function SettingsNav() {
  const t = useT();
  const pathname = usePathname();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const tabs = [
    { href: "/settings/profile", label: t.profile, icon: <User size={15} aria-hidden="true" /> },
    ...(isAdmin
      ? [
          { href: "/settings/people", label: t.people, icon: <Users size={15} aria-hidden="true" /> },
          { href: "/settings/apps", label: t.appsTitle, icon: <LayoutGrid size={15} aria-hidden="true" /> },
        ]
      : []),
  ];

  return (
    <nav className="settings-nav" aria-label={t.settingsTitle}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="settings-tab"
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
