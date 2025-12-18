// app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Employee from "@/models/Employee";
import bcrypt from "bcryptjs";

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,

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
        await connectDB();

        const { mode, email, password, empCode } = credentials;

        // ---------- HR / ADMIN LOGIN ----------
        if (mode === "HR") {
          if (!email || !password) return null;

          // allow both HR and ADMIN users
          const user = await User.findOne({ email });
          if (!user || !["HR", "ADMIN"].includes(user.role)) {
            console.log(
              "[NextAuth] HR/ADMIN user not found or invalid role",
              email
            );
            return null;
          }

          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            console.log("[NextAuth] HR/ADMIN invalid password", email);
            return null;
          }

          return {
            id: user._id.toString(),
            name: user.name || email,
            email: user.email,
            role: user.role, // "HR" or "ADMIN"
            empCode: user.employeeEmpCode || null,
          };
        }

        // ---------- EMPLOYEE LOGIN (empCode only) ----------
        if (mode === "EMPLOYEE") {
          if (!empCode) return null;

          // find employee just by empCode
          const employee = await Employee.findOne({ empCode }).lean();
          if (!employee) {
            console.log("[NextAuth] Employee not found", empCode);
            return null;
          }

          // optional: if you also have a User record for employees
          const user = await User.findOne({
            employeeEmpCode: empCode,
            role: "EMPLOYEE",
          }).lean();

          return {
            id: (user?._id || employee._id).toString(),
            name: employee.name || empCode,
            email: employee.email || user?.email || "",
            role: "EMPLOYEE",
            empCode,
            // extra profile fields for dashboard
            department: employee.department || "",
            designation: employee.designation || "",
            shift: employee.shift || "",
          };
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
