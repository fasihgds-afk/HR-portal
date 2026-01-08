// next-app/proxy.ts (Next.js 16 uses proxy.ts instead of middleware.ts)
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const { pathname } = req.nextUrl;

    // Clone URL so we can safely mutate pathname/searchParams
    const url = req.nextUrl.clone();

    // ---------------- HR AREA ----------------
    if (pathname.startsWith('/hr')) {
      // 1) Not logged in at all  -> send to HR login
      if (!token) {
        console.log('[Middleware] No token found, redirecting to login');
        url.pathname = '/login';
        url.searchParams.set('role', 'hr');
        return NextResponse.redirect(url);
      }

      // 2) Logged in but not HR or ADMIN role -> also send to HR login
      // Allow both HR and ADMIN roles (as per auth route)
      if (token.role !== 'HR' && token.role !== 'ADMIN') {
        console.log('[Middleware] Invalid role:', token.role, 'expected HR or ADMIN');
        url.pathname = '/login';
        url.searchParams.set('role', 'hr');
        return NextResponse.redirect(url);
      }

      // 3) token.role === 'HR' or 'ADMIN' -> let request continue
      console.log('[Middleware] Access granted for role:', token.role);
      return NextResponse.next();
    }

    // -------------- EMPLOYEE AREA --------------
    if (pathname.startsWith('/employee')) {
      // 1) Not logged in -> employee login
      if (!token) {
        url.pathname = '/login';
        url.searchParams.set('role', 'employee');
        return NextResponse.redirect(url);
      }

      // 2) OPTIONAL strict employee role check
      // If you ONLY want EMPLOYEE role here, uncomment this block:
      //
      // if (token.role && token.role !== 'EMPLOYEE') {
      //   url.pathname = '/';
      //   url.searchParams.delete('role');
      //   return NextResponse.redirect(url);
      // }

      // user is logged in -> allow
      return NextResponse.next();
    }

    // For any other matched path (if you add more in matcher later)
    return NextResponse.next();
  },
  {
    // IMPORTANT:
    // We always return true here so our custom logic above
    // runs even when there is no token. We handle redirects ourselves.
    callbacks: {
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: ['/hr/:path*', '/employee/:path*'],
};
