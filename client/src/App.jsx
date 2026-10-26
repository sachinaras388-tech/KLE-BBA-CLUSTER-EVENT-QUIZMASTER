import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { AdminLayout, StudentLayout } from './components/Layouts.jsx';
import { Button, PageLoader } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const Participants = lazy(() => import('./pages/admin/Participants.jsx'));
const Competitions = lazy(() => import('./pages/admin/Competitions.jsx'));
const CompetitionForm = lazy(() => import('./pages/admin/CompetitionForm.jsx'));
const CompetitionManage = lazy(() => import('./pages/admin/CompetitionManage.jsx'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog.jsx'));

const StudentDashboard = lazy(() => import('./pages/student/Dashboard.jsx'));
const Lobby = lazy(() => import('./pages/student/Lobby.jsx'));
const Quiz = lazy(() => import('./pages/student/Quiz.jsx'));
const Submitted = lazy(() => import('./pages/student/Submitted.jsx'));
const Result = lazy(() => import('./pages/student/Result.jsx'));
const Review = lazy(() => import('./pages/student/Review.jsx'));
const Leaderboard = lazy(() => import('./pages/student/Leaderboard.jsx'));

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}

function AuthOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader label="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-extrabold text-brand-600">404</p>
        <h1 className="mt-3 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-slate-500">The page you are looking for does not exist.</p>
        <Link to="/" className="mt-6 inline-block">
          <Button>Go home</Button>
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<AuthOnly><ChangePassword /></AuthOnly>} />

        <Route path="/admin" element={<Guard role="admin"><AdminLayout /></Guard>}>
          <Route index element={<AdminDashboard />} />
          <Route path="participants" element={<Participants />} />
          <Route path="competitions" element={<Competitions />} />
          <Route path="competitions/new" element={<CompetitionForm />} />
          <Route path="competitions/:id" element={<CompetitionManage />} />
          <Route path="competitions/:id/edit" element={<CompetitionForm />} />
          <Route path="audit" element={<AuditLog />} />
        </Route>

        <Route path="/attempt/:attemptId" element={<Guard role="student"><Quiz /></Guard>} />

        <Route path="/" element={<Guard role="student"><StudentLayout /></Guard>}>
          <Route index element={<StudentDashboard />} />
          <Route path="competitions/:id" element={<Lobby />} />
          <Route path="competitions/:id/submitted" element={<Submitted />} />
          <Route path="competitions/:id/result" element={<Result />} />
          <Route path="competitions/:id/review" element={<Review />} />
          <Route path="competitions/:id/leaderboard" element={<Leaderboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
