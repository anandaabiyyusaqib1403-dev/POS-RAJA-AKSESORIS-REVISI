import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, authState } = useAuth();
  const location = useLocation();

  if (!user || authState === "signed_out" || authState === "profile_error") {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "pemilik" ? "/dashboard" : "/kasir"} replace />;
  }

  return children;
}

