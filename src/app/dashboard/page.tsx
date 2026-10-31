import { requireTeam } from "@/lib/auth";
import { AdminHome } from "./admin-home";
import { StaffHome } from "./staff-home";

// Admin and staff share /dashboard; each role gets its own home.
export default async function DashboardPage() {
  const user = await requireTeam();
  return user.role === "ADMIN" ? <AdminHome user={user} /> : <StaffHome user={user} />;
}
