import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import Debts from './views/Debts';
import Budget from './views/Budget';
import Plan from './views/Plan';
import Advisor from './views/Advisor';
import Progress from './views/Progress';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-navy-900">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/debts"    element={<Debts />} />
            <Route path="/budget"   element={<Budget />} />
            <Route path="/plan"     element={<Plan />} />
            <Route path="/advisor"  element={<Advisor />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
