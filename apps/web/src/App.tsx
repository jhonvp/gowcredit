import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, RequireRole } from './auth';
import { AnalystCase, AnalystHome } from './pages/Analyst';
import { Login } from './pages/Login';
import { OwnerPage } from './pages/Owner';
import { SupplierCase, SupplierHome } from './pages/Supplier';

/** Three screens (ADR 0011): supplier, analyst, and the owner's magic-link page. */
export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/owner/:token" element={<OwnerPage />} />
          <Route
            path="/supplier"
            element={
              <RequireRole role="supplier">
                <SupplierHome />
              </RequireRole>
            }
          />
          <Route
            path="/supplier/cases/:id"
            element={
              <RequireRole role="supplier">
                <SupplierCase />
              </RequireRole>
            }
          />
          <Route
            path="/analyst"
            element={
              <RequireRole role="analyst">
                <AnalystHome />
              </RequireRole>
            }
          />
          <Route
            path="/analyst/cases/:id"
            element={
              <RequireRole role="analyst">
                <AnalystCase />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
