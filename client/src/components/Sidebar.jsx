import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Wallet, BarChart3, MessageSquare, TrendingUp } from 'lucide-react';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/debts',     icon: CreditCard,      label: 'Debts'     },
  { to: '/budget',    icon: Wallet,          label: 'Budget'    },
  { to: '/plan',      icon: BarChart3,       label: 'Plan'      },
  { to: '/advisor',   icon: MessageSquare,   label: 'Advisor'   },
  { to: '/progress',  icon: TrendingUp,      label: 'Progress'  },
];

export default function Sidebar() {
  return (
    <aside className="no-print flex flex-col w-56 shrink-0 bg-navy-800 border-r border-slate-700 min-h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <h1 className="text-base font-semibold text-teal-400 leading-tight">
          Liam's Wicked<br />Financial Planner Tool
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-teal-500/10 text-teal-400'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/50'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">Personal use only</p>
      </div>
    </aside>
  );
}
