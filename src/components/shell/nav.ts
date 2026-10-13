import { LayoutDashboard, TrendingUp, Users, Boxes, ArrowLeftRight, ListChecks, Target, Table2, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Which roadmap phase delivers the real page. */
  phase: number;
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Command Center', icon: LayoutDashboard, phase: 1 },
  { href: '/sales', label: 'Sales', icon: TrendingUp, phase: 2 },
  { href: '/projects', label: 'Projects & Tenure', icon: Boxes, phase: 2 },
  { href: '/investors', label: 'Investors', icon: Users, phase: 3 },
  { href: '/money-flow', label: 'Money Flow', icon: ArrowLeftRight, phase: 4 },
  { href: '/actions', label: 'Action Lists', icon: ListChecks, phase: 4 },
  { href: '/targets', label: 'Targets', icon: Target, phase: 4 },
  { href: '/explorer', label: 'Data Explorer', icon: Table2, phase: 5 },
];

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
