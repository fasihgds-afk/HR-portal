// app/page.jsx  (SERVER component – NO "use client")
import { redirect } from "next/navigation";

export default function Home() {
  // always send user to the login screen first
  redirect("/login");
}
