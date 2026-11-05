import type { ReactNode } from "react";
import AdminTheme from "@/components/admin/AdminTheme";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminTheme>{children}</AdminTheme>;
}
