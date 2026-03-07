import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransactionList } from './components/TransactionList';
import { PaymentForm } from './components/PaymentForm';
import { TransactionDetail } from './components/TransactionDetail';
import { FxTicker } from './components/FxTicker';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

function Navigation() {
    const location = useLocation();
    const isDetail = location.pathname.startsWith('/transactions/');

    return (
        <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex items-center gap-8">
                        <Link to="/" className="flex items-center gap-2 group">
                            <div className="bg-blue-600 p-1.5 rounded-lg transform group-hover:rotate-12 transition-transform shadow-md shadow-blue-100">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <span className="text-xl font-black text-gray-900 tracking-tighter">PayRoute</span>
                        </Link>

                        <div className="hidden md:flex items-center gap-1">
                            <Link
                                to="/"
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${location.pathname === '/' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Operations
                            </Link>
                            <Link
                                to="/new"
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${location.pathname === '/new' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                Send Money
                            </Link>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end mr-4">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Admin View</span>
                            <span className="text-xs font-black text-gray-800">Operations Console</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center font-bold text-gray-600 shadow-inner">
                            OP
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}

function Dashboard() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Financial Operations</h1>
                    <p className="text-gray-500 font-medium mt-1">Real-time cross-border bridge monitoring</p>
                </div>
                <Link
                    to="/new"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-blue-100 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 justify-center"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    Initiate Batch Payment
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Active Pipeline', value: '4', color: 'blue' },
                    { label: 'Settled 24h', value: '$142k', color: 'emerald' },
                    { label: 'Fail Rate', value: '0.2%', color: 'rose' },
                    { label: 'System Health', value: '100%', color: 'indigo' }
                ].map(stat => (
                    <div key={stat.label} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</div>
                        <div className={`text-2xl font-black text-${stat.color}-600`}>{stat.value}</div>
                    </div>
                ))}
            </div>

            <TransactionList />
        </div>
    );
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <div className="min-h-screen bg-[#FDFDFD] selection:bg-blue-100 selection:text-blue-900 text-gray-900 font-sans">
                    <Navigation />
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/new" element={
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 pt-8 flex flex-col md:flex-row gap-6 items-start">
                                    <div className="flex-1 w-full">
                                        <PaymentForm />
                                    </div>
                                    <FxTicker />
                                </div>
                            } />
                            <Route path="/transactions/:id" element={<TransactionDetail />} />
                        </Routes>
                    </main>

                    <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-gray-100 mt-12 flex justify-between items-center opacity-50">
                        <div className="text-[10px] font-black uppercase tracking-widest">PayRoute Bridge Engine v1.0.4</div>
                        <div className="flex gap-6">
                            <span className="text-[10px] font-bold">API STATUS: OPERATIONAL</span>
                            <span className="text-[10px] font-bold">LEDGER ENFORCED: YES</span>
                        </div>
                    </footer>
                </div>
            </Router>
        </QueryClientProvider>
    );
}

export default App;
