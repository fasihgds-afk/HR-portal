// app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Employee from "@/models/Employee";
import bcrypt from "bcryptjs";

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  // Add trustHost for Vercel deployment
  trustHost: true,

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        mode: { label: "Mode", type: "text" }, // "HR" or "EMPLOYEE"
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        empCode: { label: "Emp Code", type: "text" },
        cnic: { label: "CNIC", type: "text" }, // kept here but NOT used now
      },
      async authorize(credentials) {
        const startTime = Date.now();
        
        try {
          // Optimize: Check if connection already exists before calling connectDB
          // This avoids unnecessary connection attempts if already connected
          await connectDB();
        } catch (error) {
          console.error('[NextAuth] Database connection error:', error);
          return null;
        }

        const { mode, email, password, empCode } = credentials;

        // ---------- HR / ADMIN LOGIN ----------
        if (mode === "HR") {
          if (!email || !password) return null;

          try {
            // Optimize: Use lean() and select only needed fields for faster query
            // Email is indexed, so this should be fast
            const user = await User.findOne({ email })
              .select('_id email passwordHash role employeeEmpCode name')
              .lean()
              .maxTimeMS(2000); // Reduced to 2 seconds for faster failure
              
            if (!user || !["HR", "ADMIN"].includes(user.role)) {
              console.log(
                "[NextAuth] HR/ADMIN user not found or invalid role",
                email
              );
              return null;
            }

            // Bcrypt comparison is intentionally slow for security (100-500ms)
            const ok = await bcrypt.compare(password, user.passwordHash);
            if (!ok) {
              console.log("[NextAuth] HR/ADMIN invalid password", email);
              return null;
            }

            const loginTime = Date.now() - startTime;
            if (loginTime > 1000) {
              console.log(`[NextAuth] HR login took ${loginTime}ms`);
            }

            return {
              id: user._id.toString(),
              name: user.name || email,
              email: user.email,
              role: user.role, // "HR" or "ADMIN"
              empCode: user.employeeEmpCode || null,
            };
          } catch (err) {
            console.error('[NextAuth] HR login error:', err);
            return null;
          }
        }

        // ---------- EMPLOYEE LOGIN (empCode only) ----------
        if (mode === "EMPLOYEE") {
          if (!empCode) return null;

          try {
            // Optimize: Use lean() and select only needed fields
            // empCode is indexed, so this should be fast
            // Remove optional User query to speed up login - we can get user later if needed
            const employee = await Employee.findOne({ empCode })
              .select('_id name email department designation shift')
              .lean()
              .maxTimeMS(2000); // Reduced to 2 seconds
              
            if (!employee) {
              console.log("[NextAuth] Employee not found", empCode);
              return null;
            }

            const loginTime = Date.now() - startTime;
            if (loginTime > 1000) {
              console.log(`[NextAuth] Employee login took ${loginTime}ms`);
            }

            return {
              id: employee._id.toString(),
              name: employee.name || empCode,
              email: employee.email || "",
              role: "EMPLOYEE",
              empCode,
              // extra profile fields for dashboard
              department: employee.department || "",
              designation: employee.designation || "",
              shift: employee.shift || "",
            };
          } catch (err) {
            console.error('[NextAuth] Employee login error:', err);
            return null;
          }
        }

        // Unknown mode
        return null;
      },
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.empCode = user.empCode;
        // keep extra employee fields in the token
        token.department = user.department ?? token.department;
        token.designation = user.designation ?? token.designation;
        token.shift = user.shift ?? token.shift;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        session.user.role = token.role;
        session.user.empCode = token.empCode;
        session.user.department = token.department;
        session.user.designation = token.designation;
        session.user.shift = token.shift;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
