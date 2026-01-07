/**
 * AuthGuard Component
 * 
 * Route guard component that protects routes based on authentication status
 * Redirects to login if user is not authenticated
 */

'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * AuthGuard - Protects routes requiring authentication
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @param {Array<string>} props.allowedRoles - Optional array of allowed roles
 * @returns {React.ReactNode}
 */
export default function AuthGuard({ children, allowedRoles = [] }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return; // Still loading

    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    // Check role restrictions if provided
    if (allowedRoles.length > 0 && session?.user?.role) {
      if (!allowedRoles.includes(session.user.role)) {
        router.push('/unauthorized');
        return;
      }
    }
  }, [status, session, router, allowedRoles]);

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (status === 'unauthenticated') {
    return null;
  }

  // Check role restrictions
  if (allowedRoles.length > 0 && session?.user?.role) {
    if (!allowedRoles.includes(session.user.role)) {
      return null;
    }
  }

  return <>{children}</>;
}

/**
 * RoleGuard - Protects routes based on user role
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @param {Array<string>} props.allowedRoles - Array of allowed roles
 * @returns {React.ReactNode}
 */
export function RoleGuard({ children, allowedRoles = [] }) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

