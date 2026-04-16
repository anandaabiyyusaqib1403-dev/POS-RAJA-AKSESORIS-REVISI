import {
  BarChart3,
  Calculator,
  ChevronRight,
  Clock3,
  Coins,
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

const icons = {
  dashboard: LayoutDashboard,
  wallet: Wallet,
  pos: ShoppingCart,
  users: Users,
  coins: Coins,
  box: Package,
  receipt: FileText,
  debt: Clock3,
  history: Clock3,
  chart: BarChart3,
  trend: TrendingUp,
  calculator: Calculator,
  help: HelpCircle,
  logout: LogOut,
  search: Search,
  spark: Sparkles,
  truck: Truck,
  chevron: ChevronRight,
  credit: CreditCard,
};

export default function AppIcon({ name, className = "h-4 w-4" }) {
  const Icon = icons[name] || Sparkles;
  return <Icon className={className} strokeWidth={1.8} aria-hidden="true" />;
}
